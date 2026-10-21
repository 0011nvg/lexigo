# LEXIGO Stage 5 — server-side answer validation contract

This is an isolated **synthetic** Supabase Auth/Postgres/Edge Runtime prototype, not a production grading system.

## Trust boundary

The browser may submit `attemptId`, `index`, `wordId`, `answer`, `hinted` and `retry`. It **may not** submit `correct` or `verifiedCorrect` to `submit-answer`. Supabase Auth verifies the JWT, the Edge function derives `p_actor` from `auth.getUser`, and the service-only SQL RPC verifies that the pupil owns an active attempt in an accessible assignment. The SQL RPC locks the attempt row to serialize competing submissions.

The server chooses the expected word by `(event_index % section_word_count)` in section vocabulary order, then rejects any mismatched `wordId`. This deterministic fixture protocol prevents changing the word ID within an event, but **does not prevent a technically capable client from predicting upcoming words**. Production needs a server-issued, attempt-bound question sequence and challenge tokens that cannot be replayed or chosen by the browser.

## Objective versus subjective

- **Objective canonical text answers**: `quiz`, `spell`, `pairs`, `truefalse`, `fix`, `audio`, `crystals`, `boss` can use `submit-answer` in the *canonical text-answer test protocol*. The server compares case-insensitive, trimmed text against the stored English or Russian vocabulary form. This is **not** yet equivalent to evaluating the actual multiple-choice, matching, audio, true/false or boss interactions in the existing browser games.
- **Subjective**: `cards` and `daily` use `append-event` with `card_self_rating` and `known`/`unknown`; no `verified_correct` is set. This is a self-report, not a graded answer.
- Legacy `append-event` calls with `kind=answer` or client `correct` are rejected for newly created events. Older stored `client_unverified` records remain unverified.

Each verified event records the server-computed `verified_correct`, a `server_evaluated` source and an SHA-256 digest of the raw answer for replay consistency. The raw answer is not stored. A duplicate index with an identical payload returns the same event ID; changed answers or flags fail. Only 500 event indices are allowed per attempt. This limits event count but is **not** an anti-cheat guarantee.

## Remaining blockers

1. Implement server-owned question/challenge generation and validation for each actual game interaction; do not imply that a text-only protocol validates choices, true/false distractors, pair matching, spoken answers or boss logic.
2. Replace predictable word ordering with server-issued attempt-bound challenges, enforce sequence and question count, validate hint/retry state server-side, and define score calculations solely from verified events.
3. Preserve the immutable 1035-word vocabulary and import a verified copy into a disposable local database for a full end-to-end game integration test; current SQL/HTTP fixtures use synthetic words only.
4. Perform privacy, safeguarding, retention and independent security review before any real pupil is enrolled.

The source `data.json`, `data.js` and game modes are not modified by this stage.
