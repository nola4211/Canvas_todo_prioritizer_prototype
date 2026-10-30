# Assignment creation verification — October 30, 2026

## Live database

Before migration, the `assignments` table had three seeded rows, bigint identity IDs, nullable grade/time/description fields, RLS enabled, and only the original demo read/completion policies. Authenticated assignment insertion was denied. The live schema matched the migration's assumptions.

Applied `supabase/migrations/202610300002_assignment_creation.sql` to project `uowlwdwrqceklbqjcnmc`. Supabase reported **Success. No rows returned**.

Ran `docs/verify-assignment-creation.sql` as simulated Auth roles. It returned **PASS** for creating and reading an owned assignment, completing it, denying a name edit, and denying another identity's read and update. The verification transaction rolled back. A separate readback found three assignment rows, zero verification rows, all three new owner policies plus the two original demo policies, and authenticated insert access to the `name` column.

## Local checks

- `node test-assignment-create.cjs` passed assignment insertion, Denver date conversion, duplicate retry recovery, list membership, completion, and fallback loading against an older schema.
- `node test-local-assignments.cjs` passed form save/retry, refresh loading, explicit import of an older device-only assignment, and retention of a local card on a failed import.
- Existing completion, list, priority, and chat frontend suites passed. `git diff --check` passed.

After the migration, a fresh authenticated local preview loaded the three Supabase assignments and two existing device-only assignments. No persistent assignment was created in the browser during verification, so the full browser create → refresh → list → assistant path remains to be checked. The shared demo login makes created rows visible to everyone using that account.
