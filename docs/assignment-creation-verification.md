# Assignment creation verification — October 30, 2026

## Live database

Before migration, the `assignments` table had three seeded rows, bigint identity IDs, nullable grade/time/description fields, RLS enabled, and only the original demo read/completion policies. Authenticated assignment insertion was denied. The live schema matched the migration's assumptions.

Applied `supabase/migrations/202610300002_assignment_creation.sql` to project `uowlwdwrqceklbqjcnmc`. Supabase reported **Success. No rows returned**.

Ran `docs/verify-assignment-creation.sql` as simulated Auth roles. It returned **PASS** for creating and reading an owned assignment, completing it, denying a name edit, and denying another identity's read and update. The verification transaction rolled back. A separate readback found three assignment rows, zero verification rows, all three new owner policies plus the two original demo policies, and authenticated insert access to the `name` column.

## Local checks

- `node test-assignment-create.cjs` passed assignment insertion, Denver date conversion, duplicate retry recovery, list membership, completion, and fallback loading against an older schema.
- `node test-local-assignments.cjs` passes direct Supabase creation, retry after a failed save, refresh loading, and the absence of device-only assignment controls.
- Existing completion, list, priority, and chat frontend suites passed. `git diff --check` passed.

The current app loads assignments from Supabase only. A failed save leaves the creation form open and does not create a device-only card. The shared demo login makes created rows visible to everyone using that account.
