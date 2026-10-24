# LEXIGO integration: assignments, A4 printing, mastery, growth

Status: integration-only branch based on Stage 7 closed pilot. Not deployed. Do not change main or production. PR #5 and #6 remain unmerged.

## Dependencies

- Stage 7: Supabase Auth, RLS, server-generated assignments, attempt-bound challenges, server-validated answers, teacher reports, two-context real browser E2E.
- PR #6: print layout, mode leaderboards, shareable lesson selector, teacher/student UI. Port selectively; never expose localStorage demo as authenticated server cabinet.
- Preserve 1,035 vocabulary entries and existing games.

## Mandatory A4 print acceptance

- At 100% print scale, A4 portrait, 20 vocabulary questions **exactly one student PDF page**, with **two columns of exactly 10 questions**. Do not count the separate teacher answer key as the student page.
- For 5 and 10 questions, also one student page; for 21–40, at most two student pages, split in stable reading order (up to 20 per page). For 25–30, page 2 may contain 5–10.
- Compact legible typography, answer space, no clipped questions; show LEXIGO, grade, module, lesson, name/date, footer and page number. Avoid browser default headers/footers in automated PDF.
- Regression: real Chromium print-to-PDF + pdf-lib assert student page count and column distribution for 5, 10, 20, 25, 30; use synthetic extra vocabulary only in print fixtures, never alter canonical vocabulary.

## Assignment links and identity

- Share only opaque server assignment ID, no JWT, user ID, or private key in URL.
- Authentication required; RLS and backend check pupil enrollment and teacher class ownership. Link alone is not an authorization grant.
- Server stores answers, results, time and mastery. Teacher sees only own class; pupil sees own progress. Deny unauthorized, expired and revoked assignments.
- Separate teacher/pupil browser contexts and different devices; verify completion and teacher report after refresh.

## Mastery checklist

- Completion by section and mode is server-derived, not user-settable. Distinguish attempted, completed, and mastered.
- A word is mastered only by documented accuracy/review criteria, not a single self-assessment. Cards/daily remain explicitly self-rated.
- Render checkmarks for completed modes and separately mastered words in grade → module → section.
- Report to teacher by pupil/section/word; honor privacy and role permissions.

## 3D plant

- Optional 3D-realistic visual companion with reduced-motion and low-end-device fallback.
- Earn daily growth from server-verified **active** learning, e.g. 10 minutes, capped daily and anti-idle. Do not grant by merely opening a tab.
- Stage progression: sprout → leaves → buds → blossom. After 3 inactive days, slight reversible wilt; no permanent death or loss of learned progress. Grace days and catch-up.
- Avoid shaming and unhealthy streak pressure. Do not let plant state affect grades or access.
- Store growth milestones server-side with idempotent daily updates; test timezones, concurrency, clock spoofing, and offline behavior.

## Release gates

1. Port PR #6 changes into integration branch without overwriting Stage 7 security.
2. Implement teacher/pupil server cabinet and assignment link E2E with negative JWT/RLS tests.
3. Print PDF tests 5/10/20/25/30 and inspect mobile/desktop UI.
4. Implement mastery, then plant (first deterministic state machine, then 3D visual).
5. Verify all workflows SUCCESS on the same SHA; obtain explicit user approval before any production deployment or merge.
