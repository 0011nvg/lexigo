# Accounts and Plus implementation checkpoint

Base: main cd20a7485f5cf5ad97dd8eaba2e909bf4acb489f.
Reused backend: PR #7, 2281d0a5d97ea299e7335cd3d0f260820f0be823 (supabase directory only).
Open PRs audited: #1–#7. None merged by this change.

Main serves local practice and local demonstration cabinets. The secure backend exists in PR #7, not in deployed main. Do not replace current game/UI files with their older PR #7 counterparts.

Added: additive subscription accounts, append-only-by-client history, fixed approved monthly/six-month prices, Auth signup trial provisioning from server creation timestamp, own-account RLS read, effective entitlement RPC. Client cannot reset trial or write subscriptions. No payment integration. SQL has not been executed in this environment (Docker and psql absent).

Not complete: signup/login/recovery UI, profile provisioning and organization model, parent-role migration with preserved historical records, consent workflow, daily activity ledger with concurrent-session enforcement, assignment exemption enforcement, teacher quotas, cross-device integration, privileged subscription lifecycle operations, backup/restore/deletion runbooks, payment-provider boundary and full HTTP E2E.

The inherited backend retains historical parent permissions. It must NOT be deployed until a separately tested migration removes those permissions while preserving records. Trial is once per Auth user, not once per person; account recreation abuse is not yet addressed. Existing users need an explicit migration policy; this change does not silently restart trials for them.

Required for integration tests: isolated Supabase Auth/Postgres/PostgREST/Edge runtime via CLI and Docker (can run in CI); no production credentials needed. Production later requires project URL/public key, server-only service role configuration, SMTP, verified redirect URLs, consent policy approved for target users and operator, backups and recovery drill. Never put service keys in frontend.

Release gate: Draft only, no main merge or production publication. Preserve 1035 words, ten modes, current crystal artwork/motion and A4 printing.
