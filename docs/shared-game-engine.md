# Shared game interface

Both HTML entry points load `game-engine.js` and `game-components.js`. Neither
HTML file contains gameplay implementations. The cabinet is mounted once from
`cabinet-controller.js`, into either the main-page ShadowRoot or the standalone
Document. There is no iframe or page navigation when opening server games.

The shared engine renders public question models and owns pair selection,
matched-tile interaction and crystal selection. The common components provide
answer entry, choices, accessible cards, pair tiles and crystal pointer gestures.
Question models describe presentation; action callbacks supply evaluation.

| Mode | Common interaction | Local policy | Protected policy |
| --- | --- | --- | --- |
| quiz | choices / answer entry | vocabulary distractors | issued challenge and answer-question |
| spell | answer entry | normalized comparison | answer-question |
| truefalse | boolean choices | proposed translation | answer-question |
| fix | answer entry | generated spelling error | issued correction question |
| audio | speech control and answer entry | device voice, text fallback | issued speechText and answer-question |
| cards | accessible card and ratings | device-only self-rating | append-event, separate from correctness |
| daily | common questions/cards | existing mixed daily practice | existing self-rating policy |
| pairs | selection and matched-tile controller | local pair comparison | play-round with opaque tile IDs |
| crystals | crystal selection and pointer gestures | existing cascades and scores | server board returned by play-round |
| boss | shared question interactions | existing final-test policy | server-issued staged encounter |

`local-game-adapter.js` supplies device-only question models and evaluations.
`server-game-adapter.js` converts issued questions and round responses to those
same engine models, and uses the server APIs for every protected action.
Practice scheduling, the local retry queue, timing and existing scene decorations
remain in `practice-controller.js`; cabinet navigation and RLS reads remain in
`cabinet-controller.js`. These application controllers do not implement separate
question widgets, pair-selection controllers or crystal gestures.

Storage has separate capabilities. `local-storage.js` validates known practice
keys, tolerates malformed JSON and always writes local attempts as unverified.
It has no network capability. `server-storage.js` keeps Auth credentials in memory,
restricts the API to loopback HTTP, rejects privileged keys, rejects redirects and
invalidates pending responses on session change. It has no browser-storage
capability. The shared engine never turns a local comparison into a server score.

Database migration `202610220001_cover_lesson_before_repeats.sql` preserves the
attempt lock and server-issued challenge identity while prioritising words not
yet covered in that attempt. This fixes a regression exposed by full-lesson E2E:
random repeats could prevent completion after all expected lesson questions.

`tests/shared-modes-browser.mjs` completes all ten modes through `index.html`,
using real local Supabase Auth, Edge and PostgreSQL. It checks saved results,
complete word coverage, ranking eligibility, teacher visibility and foreign-pupil
isolation. Existing browser journeys cover local practice, mobile views, retries,
self-ratings, cabinets and A4 PDFs with 5/10/20/25/30 questions. HTTP tests cover
forged identities, answer/sequence tampering and concurrent writes.

This remains an integration-only draft. No production deployment or merge is
part of this change. The next product stage is the teacher cabinet: class and
assignment workflows, pupil progress and result review using the existing
server authority and shared game interface.
