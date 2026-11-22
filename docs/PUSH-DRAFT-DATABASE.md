# Push: database draft — not ready to deploy

The additive SQL and accompanying checks are for design review and isolated tests only. The script deliberately fails unless a test session explicitly sets `lexi.push_isolated_test_only = 'YES'`; this setting is not permission to deploy. Do not run it against the live database or any database containing real pupils' information. No browser permission prompt, scheduler, server sender, VAPID keys, delivery or reminder UI is provided by this SQL.

## Contract

- `push_save_subscription(p_expected_user, p_device_id, p_endpoint, p_p256dh, p_auth)` stores one subscription per user and device. A UUID identifies the installation, not a person; a device may be removed with `push_remove_subscription(p_expected_user, p_device_id)`. Account changes between queuing and saving are rejected. The same endpoint cannot belong to two accounts, to avoid cross-account delivery; switching accounts may require the prior account to remove its subscription first. The device limit is 20.
- Subscription data and preferences belong to the profile and cascade on account deletion. No anon/authenticated direct table access is granted. `push_my_settings` returns only consent flags, a device status and the time, not the endpoint or key material. Deletion on the server does not itself call the browser's `PushSubscription.unsubscribe()`; future client code must do both.
- `push_save_preferences(p_expected_user, p_assignments, p_daily, p_time)` stores assignment consent; daily reminders are **hard blocked**, even if requested. Defaults are disabled, 19:00 and Europe/Moscow. No permission for push delivery is implied by visiting the site, logging in or installing the PWA. Browser OS permission and appropriate consent are separate.
- `push_assignment_recipients(assignment_id)` is a server-only *candidate* query; it joins the actual assignment, owning group, current membership, targeted student where applicable, role, and opted-in devices. Only `service_role` can call it; no client can call it. The future sender must recheck current membership and consent immediately before delivery. The existing join-code and self-selected teacher-role model also needs a separate authorization review. This query neither schedules nor sends notifications.

## Reminder blocker

At 19:00 Moscow time, a daily reminder is appropriate only when there is reliable evidence that the student has made no qualifying answer or completed assignment during that local calendar day. Self-ratings are not objective answers. An open page or a visit is not study activity. Existing `sessions` can omit answers from interrupted or offline games, and events may arrive late. The separate answer-history work in PR #19 is unfinished and is not merged into this branch; it must not be assumed operational. Even a server-side check of received events can miss offline work. Do not activate reminders or build a sender that interprets absence of server records as proof of inactivity. Resolve coverage, trusted timestamps, time-zone semantics, late arrivals and stale-device/offline cases; test with two devices and delayed synchronisation before enabling. A missing proof of activity is not proof of inactivity.

## Security and deployment requirements

The endpoint allowlist blocks obvious arbitrary hosts and non-HTTPS URLs; it is not sufficient SSRF protection. The future sender must use exact push-provider hosts, validate DNS/IP and TLS, reject private/link-local/loopback/reserved addresses, block redirects, revalidate before use, and enforce outbound network policy. Review supported Apple/Google/Mozilla endpoint formats before launch; this restrictive draft can reject legitimate formats. Never log full endpoints, subscription keys, credentials, payloads or pupil data. Keep encryption-in-transit, access controls, retention, revocation, credential rotation and Russian data location/legal requirements under review before processing actual data. Keep payloads generic to avoid displaying pupil details on locked screens.

A verified backup and restore test, real Supabase/Postgres integration and RLS tests, a reviewed rollback, explicit rollout, actual browser/iOS/Android delivery tests, permission/consent and abuse controls remain prerequisites. There is currently no automatic sender and no delivered-push guarantee. No cloud schema or production records were modified by preparing these files.

## Isolated SQL test procedure

In a disposable PostgreSQL database only, create the Supabase shim role `service_role` with BYPASSRLS and load `tests/sql/supabase-shim.sql` then `supabase/schema.sql`. With `psql` connected to that database, run the following in **one session**:

```sql
SET lexi.push_isolated_test_only = 'YES';
\i supabase/drafts/20261104_push_draft.sql
\i supabase/drafts/20261104_push_draft.sql
\i tests/sql/push-draft-test.sql
```

Creating roles and database setup require the appropriate local test administrator. The second migration run tests rerun behavior. These SQL tests are prepared but were not run here; the shim does not replace real Supabase Auth/PostgREST/RLS tests.
