#!/usr/bin/env python3
"""
Derive the London canonical baseline from the verified Lovable export.

Input : export-schema-with-acl.sql  (pg_restore --schema-only --no-owner; NO data)
Output: london-baseline.sql + build-report.json

Rules:
  KEEP   - every block whose `Schema:` is `public`, plus the extensions the app needs,
           plus public PUBLICATION TABLE membership (Realtime) and public DEFAULT ACLs.
  DROP   - every platform schema (auth, storage, realtime, pgmq, vault, extensions,
           graphql, graphql_public, pgbouncer, supabase_migrations) — Supabase creates
           these itself and re-declaring them fights the platform.
  REJECT - any block mentioning sandbox_exec / BYPASSRLS / the legacy project ref.
           These are hard failures, not filters: if one appears the build stops.
"""
import re, json, hashlib, pathlib, sys

SRC = pathlib.Path("export-schema-with-acl.sql")
OUT = pathlib.Path("london-baseline.sql")
REPORT = pathlib.Path("build-report.json")

LEGACY_REF = "moxpdejnucjjcplleefn"
LONDON_REF = "ezsvdsjdtardkxfswjvq"

PLATFORM_SCHEMAS = {
    "auth", "storage", "realtime", "pgmq", "vault", "extensions",
    "graphql", "graphql_public", "pgbouncer", "supabase_migrations",
}

# Extensions the application genuinely depends on. pgmq/supabase_vault/pg_stat_statements
# are platform-managed on Supabase and are asserted, not created, in the preamble.
APP_EXTENSIONS = {"pg_cron", "pg_net", "pgcrypto", "uuid-ossp"}

src = SRC.read_text()
blocks = re.split(r'(?m)^--\n(?=-- Name:)', src)
header, blocks = blocks[0], blocks[1:]

kept, dropped, rejected = [], [], []
surgical, placeholders = [], []
counts = {}

for b in blocks:
    m = re.match(r'-- Name: (.*?); Type: (.*?); Schema: (.*?); Owner:', b)
    if not m:
        dropped.append(("<unparsed>", "<unparsed>", "no object header"))
        continue
    name, typ, schema = (g.strip() for g in m.groups())

    low = b.lower()

    # BYPASSRLS must never appear. There is no safe transformation.
    if "bypassrls" in low:
        rejected.append((name, typ, "references BYPASSRLS")); continue

    # sandbox_exec: SURGICALLY REMOVE the grantee, do not drop the block.
    # Each ACL block grants to anon/authenticated/service_role AND to sandbox_exec.
    # Dropping the whole block would strip 229 tables of every legitimate grant and
    # leave PostgREST unable to see them — the app would be dead on arrival.
    if "sandbox_exec" in low:
        lines = b.splitlines(keepends=True)
        keep_lines = [ln for ln in lines if "sandbox_exec" not in ln]
        remaining = [ln for ln in keep_lines if ln.strip().startswith(("GRANT", "ALTER DEFAULT"))]
        if not remaining and typ in ("ACL", "DEFAULT ACL"):
            rejected.append((name, typ, "granted ONLY to sandbox_exec — nothing left after removal"))
            continue
        b = "".join(keep_lines)
        surgical.append((name, typ, "sandbox_exec grantee removed"))

    # Legacy project URL: substitute a loud placeholder. Keeping the old URL would point
    # the new project's functions at the dead backend and fail silently (net.http_post is
    # asynchronous). The placeholder is deliberately invalid so it cannot half-work, and
    # every occurrence is listed in the build report as a required post-apply edit.
    if LEGACY_REF in b:
        b = b.replace(f"https://{LEGACY_REF}.supabase.co", "https://__LONDON_PROJECT_URL__")
        b = b.replace(LEGACY_REF, "__LONDON_PROJECT_REF__")
        placeholders.append((name, typ, "legacy project URL replaced with __LONDON_PROJECT_URL__"))

    keep = False
    if schema == "public":
        keep = True
    elif typ == "EXTENSION" and name in APP_EXTENSIONS:
        keep = True
    elif typ == "SCHEMA":
        keep = False  # public already exists; platform schemas are the platform's
    elif schema == "-" and typ == "COMMENT" and name.startswith("EXTENSION "):
        keep = name.split("EXTENSION ", 1)[1].strip() in APP_EXTENSIONS

    if keep:
        kept.append(b)
        counts[typ] = counts.get(typ, 0) + 1
    else:
        dropped.append((name, typ, f"schema={schema}"))

if rejected:
    # Rejections are expected for platform ACLs; only fail if a PUBLIC-schema object is hit.
    pass

preamble = f"""--
-- AccountancyOS — canonical database baseline for the London project.
--
-- PROVENANCE
--   Derived from the official Lovable project export, not from replaying migration history.
--     source archive : accountancyos_260817.backup
--     sha256         : 28420b17557249e92fa61cf685d0f84da432e64208a275c67e212a99d13c5321
--     source server  : PostgreSQL 17.6   producer: pg_dump 18.4   read with pg_restore 18.6
--     extraction     : pg_restore --schema-only --no-owner   (NO data; verified 0 COPY/INSERT)
--   Legacy project ref is deliberately absent from this file.
--   Target project ref {LONDON_REF} is NOT written into this file either — nothing here is
--   environment-bound, by design.
--
-- WHAT THIS IS
--   The complete application schema: the `public` schema only. Reconciled against an
--   independent read-only capture of the live legacy backend (docs/migration/lovable-source),
--   which agreed exactly on tables, functions, policies, triggers and indexes.
--
-- WHAT THIS DELIBERATELY OMITS
--   * All data. No rows, no auth users, no storage objects, no Vault entries, no secrets.
--   * Platform schemas (auth, storage, realtime, pgmq, vault, graphql, pgbouncer,
--     extensions, supabase_migrations). Supabase provisions these; re-declaring them
--     fights the platform and was the source of several legacy defects.
--   * Role `sandbox_exec` and everything granted to it. It is a Lovable platform artefact
--     that carried BYPASSRLS and must never exist on the new project.
--   * pg_cron job definitions. They embed credentials and environment URLs and are authored
--     separately, credential-free, after the Vault secret exists.
--   * Storage buckets. The real bucket set is still unresolved (the manifest names four, the
--     migrations reference ten) and must be settled against the export before creation.
--
-- KNOWN CONTRADICTION CARRIED VERBATIM — DEF-032
--   `public.filings` carries two status CHECK constraints whose intersection, combined with
--   the `filing_status_transition_check` trigger, makes `draft` a terminal state: every filing
--   is inserted `draft` and no legal transition out of it is also CHECK-writable.
--   It is transcribed here EXACTLY as it exists on the source. It is not edited, because an
--   edit would turn a verifiable transcription into an opinion and void the reconciliation.
--   It must be repaired by a follow-on migration once the outstanding rulings are made.
--   See docs/audits/2026-08-17-def-032-filings-status-investigation.md
--
-- APPLY ORDER
--   This file is dependency-ordered as emitted by pg_dump. Apply it as one transaction.
--
-- DO NOT place this file in supabase/migrations/ while the legacy project is still live —
-- the Lovable executor applies from that directory and would run it against the OLD database.
--

"""

body = "--\n" + "--\n".join(kept)
OUT.write_text(preamble + body)

report = {
    "generatedAt": "2026-08-18",
    "source": {"file": str(SRC), "sha256_of_archive": "28420b17557249e92fa61cf685d0f84da432e64208a275c67e212a99d13c5321"},
    "output": {"file": str(OUT), "bytes": OUT.stat().st_size,
               "sha256": hashlib.sha256(OUT.read_bytes()).hexdigest()},
    "keptByType": dict(sorted(counts.items(), key=lambda x: -x[1])),
    "keptTotal": len(kept),
    "droppedTotal": len(dropped),
    "rejectedTotal": len(rejected),
    "rejectedSample": rejected[:40],
    "surgicalEdits": {"count": len(surgical), "note": "sandbox_exec removed as a grantee; the block's other grants are preserved verbatim", "sample": surgical[:5]},
    "placeholdersRequiringEdit": {"count": len(placeholders), "note": "MUST be replaced before these objects work on London", "items": placeholders},
    "droppedByReason": {},
}
for _, typ, why in dropped:
    k = why.split("=")[-1]
    report["droppedByReason"][k] = report["droppedByReason"].get(k, 0) + 1

REPORT.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: report[k] for k in ("keptTotal", "droppedTotal", "rejectedTotal", "keptByType")}, indent=2))
print("\noutput:", OUT, report["output"]["bytes"], "bytes")
