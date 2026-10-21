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


## Challenge-bound local prototype (migration 009)

The new `next-question` endpoint issues a random server-owned challenge tied to an authenticated pupil's active attempt and event index; `answer-question` validates the challenge UUID, word ID, actor, sequence, expiry and the server-stored expected answer. Concurrent duplicate answers return the same event only when the answer digest matches. The former predictable `submit-answer` HTTP route returns 410 and its RPC is no longer granted to `service_role`. Challenge rows and expected answers are not readable by `authenticated`.

The separate `stage5-local-demo.html` is a localhost-only interface for synthetic accounts. It does not modify the original game code, persist JWTs or connect to production. The challenge question payload supports a two-choice quiz and pair-identification exercise when there are multiple words, a true/false translation prompt, spelling, typo correction, audio dictation via browser TTS, and word challenges inside crystals and boss modes. **These are deliberately simplified server-backed exercises, not full server validation of the existing drag-and-drop pairs board, gem match-three board or boss round orchestration.** The test vocabulary fixture currently contains one word, so multi-choice distractors are not exercised in the HTTP suite. The existing browser games remain unchanged and their local results must not be represented as server-verified.

**Important:** An attacker who knows the published vocabulary can still derive a correct answer from a revealed word or prompt. Random server issuance prevents choosing a different `wordId` or event index but cannot guarantee the learner answered without help. Server-side grading is not an anti-cheat guarantee; challenge limits, answer exposure, assessment policy, accessibility and privacy require further design.


### Running the synthetic browser UI locally

With the local Supabase CLI stack and Edge Function running, serve the repository only on loopback: `python3 -m http.server 3000 --bind 127.0.0.1`, then open `http://127.0.0.1:3000/stage5-local-demo.html`. Use a **synthetic pupil's local Auth JWT** and an assignment UUID created by the synthetic teacher. No JWT is persisted by the page. Do not host this test UI publicly or paste production tokens. The Edge function accepts the local browser origin; the Supabase gateway may handle preflight requests before the function sees them.
