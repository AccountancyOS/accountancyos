#!/usr/bin/env python3
"""
Build the London storage bootstrap: bucket declarations + their RLS policies.

Bucket rows come from storage.buckets in the verified export (declarative configuration,
not user data). Policies are transcribed verbatim from the schema dump.

Deliberately excluded: `database_export_17_08_26`, which is not an application bucket — it
is where the 2026-08-17 export itself was staged inside the legacy project.
No storage OBJECT (file) or object metadata is read or emitted.
"""
import re, json, hashlib, pathlib

SCHEMA = pathlib.Path("export-schema-with-acl.sql")
DATA = pathlib.Path("buckets-data.sql")
OUT = pathlib.Path("london-storage.sql")

EXCLUDE = {"database_export_17_08_26"}

# --- buckets -------------------------------------------------------------------------
rows = []
for line in DATA.read_text().splitlines():
    if line.startswith("\\") or line.startswith("COPY ") or not line.strip():
        continue
    f = line.split("\t")
    if len(f) < 11:
        continue
    bid, name, _owner, _c, _u, public, avif, size_limit, mimes, _oid, btype = f[:11]
    if bid in EXCLUDE:
        continue
    rows.append({
        "id": bid, "name": name,
        "public": public == "t",
        "file_size_limit": None if size_limit == "\\N" else int(size_limit),
        "allowed_mime_types": None if mimes == "\\N" else mimes,
    })
rows.sort(key=lambda r: r["id"])

def lit(v):
    return "NULL" if v is None else (str(v) if isinstance(v, int) else f"'{v}'")

bucket_sql = []
for r in rows:
    bucket_sql.append(
        "INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\n"
        f"VALUES ('{r['id']}', '{r['name']}', {str(r['public']).lower()}, "
        f"{lit(r['file_size_limit'])}, {lit(r['allowed_mime_types'])})\n"
        "ON CONFLICT (id) DO NOTHING;"
    )

# --- policies ------------------------------------------------------------------------
blocks = re.split(r'(?m)^--\n(?=-- Name:)', SCHEMA.read_text())[1:]
pol = [b for b in blocks if re.match(r'-- Name: (.*?); Type: POLICY; Schema: storage;', b)]
pol.sort(key=lambda b: re.match(r'-- Name: (.*?);', b).group(1))

referenced = set()
for b in pol:
    referenced |= set(re.findall(r"bucket_id = '([a-z0-9_-]+)'", b))
declared = {r["id"] for r in rows}

header = f"""--
-- AccountancyOS — London storage bootstrap.
--
-- Apply AFTER london-baseline.sql. Buckets are declarative configuration read from
-- storage.buckets in the verified export (sha256 28420b17…3c5321); the {len(pol)} policies are
-- transcribed verbatim from the same export.
--
-- NO storage object, file, or object metadata is read or created by this file.
--
-- Bucket set resolved 2026-08-18 and it contradicts BOTH earlier sources:
--   * infra/supabase-manifest.json names email-assets, documents, filings, kyc — NONE of
--     which exist on the source. That manifest section is fiction and must not be trusted.
--   * `client-documents` appears in migration-authored policies but exists on neither the
--     live bucket list nor any live storage policy.
--   The real set is the {len(rows)} buckets below. Only `branding` is public.
--
-- EXCLUDED: `database_export_17_08_26` — not an application bucket. It is where the
-- 2026-08-17 export was staged inside the legacy project, which also means a copy of that
-- archive (containing plaintext mailbox and bank tokens) is sitting in legacy storage and
-- should be removed once the migration completes.
--
-- Buckets referenced by policies : {', '.join(sorted(referenced))}
-- Buckets declared here          : {', '.join(sorted(declared))}
-- Reconciled                     : {'YES — every policy bucket is declared' if referenced <= declared else 'NO — MISMATCH, DO NOT APPLY'}
--

BEGIN;

-- ---------------------------------------------------------------------------------------
-- 1. Buckets ({len(rows)})
-- ---------------------------------------------------------------------------------------

"""

body = "\n\n".join(bucket_sql)
body += "\n\n-- " + "-" * 87 + f"\n-- 2. Storage RLS policies ({len(pol)})\n-- " + "-" * 87 + "\n\n"
body += "--\n" + "--\n".join(pol)

footer = """
-- ---------------------------------------------------------------------------------------
-- 3. Post-assertions
-- ---------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_buckets int;
  v_public  int;
BEGIN
  SELECT count(*) INTO v_buckets FROM storage.buckets
   WHERE id <> 'database_export_17_08_26';
  IF v_buckets < %d THEN
    RAISE EXCEPTION 'storage bootstrap failed: expected at least %% application buckets, found %%.', %d, v_buckets;
  END IF;

  SELECT count(*) INTO v_public FROM storage.buckets WHERE public IS TRUE;
  IF v_public <> 1 THEN
    RAISE EXCEPTION 'storage bootstrap failed: expected exactly 1 public bucket (branding), found %%.', v_public;
  END IF;

  RAISE NOTICE 'storage bootstrap: %% buckets, 1 public.', v_buckets;
END $mig$;

COMMIT;
""" % (len(rows), len(rows))

OUT.write_text(header + body + footer)
print(json.dumps({
    "buckets": len(rows),
    "public_buckets": [r["id"] for r in rows if r["public"]],
    "policies": len(pol),
    "policy_buckets_all_declared": referenced <= declared,
    "unreferenced_buckets": sorted(declared - referenced),
    "bytes": OUT.stat().st_size,
    "sha256": hashlib.sha256(OUT.read_bytes()).hexdigest(),
}, indent=2))
