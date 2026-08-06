# Executor instruction contract

**Status:** binding · **Set by:** owner ruling, 2026-08-06
**Supersedes:** the ad-hoc prose instructions used up to 2026-08-05.

## 1. Roles

**Claude is the main developer.** Design, authoring, migrations, tests, receipts and
verification design all originate here, in git.

**Lovable is a production executor only.** It is invoked when — and only when — something
must be applied to or read from the production database. It receives a bounded instruction,
executes exactly that, and returns raw output.

**The executor does not design.** It must not redesign a fix, edit a migration, author SQL,
substitute a different approach, or "make it work". If something does not apply cleanly it
**stops and reports**. The correction comes back through git.

This is not a judgement on the executor — through 2026-08-05/06 it behaved correctly, held
rather than hand-patching, flagged unverified branches as unverified rather than claiming
them, and withdrew its own request when the evidence went against it. The boundary exists
because *under-specified instructions* cost several round-trips and because an executor that
cannot edit a migration cannot quietly make one pass. It removes judgement calls it should
never have had to make.

## 2. The instruction template

Every invocation states all eight fields. No field is optional; "n/a" is an acceptable value
but omission is not.

```
main commit:            <sha> (<branch>, merged to main)
target production project: moxpdejnucjjcplleefn   ← ALWAYS confirm before executing
exact migration filename: supabase/migrations/<file>.sql
expected SHA-256:       <sha256 of that file>
permitted actions:      <the exhaustive list>
prohibited actions:     <the explicit list, always including: do not edit, do not redesign>
required raw output:    <the exact queries/results to return, unedited>
stop conditions:        <what must halt execution immediately>
```

### Field notes

**target production project** — there are two Supabase projects visible from this workspace.
Production is `moxpdejnucjjcplleefn`, confirmed from the live `cron.job` command bodies.
`vazeqolkxinsjvgzqrgj` is a different project and some tooling defaults to it. A migration
applied there succeeds, changes nothing in production, and reports success. The target ref is
stated in every instruction and confirmed before execution.

**expected SHA-256** — the executor confirms the file it is about to apply matches this before
running it. A mismatch is a stop condition, not something to reconcile.

**permitted / prohibited actions** — exhaustive, not indicative. Prohibited always includes:
editing the migration, authoring SQL, redesigning the fix, applying anything not named, and
hand-patching in the console.

**required raw output** — name the exact queries. "Confirm it worked" is not an instruction;
"return the output of `SELECT …`, unedited" is. A bare "pass" is not acceptable under
convention §6, and paraphrased output has already produced one false alarm (a `prosrc` hash
reported against a `pg_get_functiondef` hash).

**stop conditions** — always include: checksum mismatch, wrong project ref, a precondition
raising, and *any* result the instruction did not anticipate. The executor stops on surprise
rather than improvising.

## 3. Read-only investigation variant

Investigations use the same discipline with the migration fields set to `n/a`:

```
main commit:            <sha>
target production project: moxpdejnucjjcplleefn
exact migration filename: n/a — READ ONLY, apply nothing
expected SHA-256:       n/a
permitted actions:      run the queries below; return raw output
prohibited actions:     any write; any DDL; any migration; editing anything;
                        drawing conclusions beyond the data
required raw output:    <the exact queries>
stop conditions:        any query erroring — report the error verbatim, do not work around it
```

**Anticipate expected failures.** If a query is likely to fail for a known reason, say so in
the instruction. `supabase_migrations.schema_migrations` is unreadable by both parties
(convention §1a) — an error there is expected and is *not* evidence a migration did not run.
Without that warning an error reads as a finding, and the executor cannot know the difference.

**Confirm the capability before depending on it.** Several stalls on 2026-08-05 came from
instructions that assumed the executor could read `cron.job_run_details` or the vault. It
could not. Where a needed relation is out of reach, the fix is a narrow `SECURITY DEFINER`
projection in `public` (the DEF-019 pattern) — not a broader grant.

## 4. What the executor returns

Raw output, unedited, for every item under `required raw output`. Plus, for an apply:

- the executor's own applied version (it re-timestamps every migration);
- the pre-apply reproduction where the release asked for one (Gate 6);
- any check it could **not** perform, stated as such rather than omitted.

That last point matters more than it looks. The DEF-028 verification was materially more
trustworthy because the executor reported two branches as PARTIAL and NOT EXERCISED instead
of quietly passing them. An executor that reports its own gaps is worth more than one that
always returns green.

## 5. Relationship to the release convention

This document governs *how the executor is instructed*.
`docs/releases/production-release-convention.md` governs *what a release is* — receipts,
checksums, expected objects, post-publish verification, and the gate policy in §3. Both apply
to every production change. Where they overlap, the convention's evidence requirements win.
