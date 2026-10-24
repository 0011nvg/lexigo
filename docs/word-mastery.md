# Word mastery and lesson progress (integration only)

Both cabinet entry points use `progress-controller.js`. The explorer selects grade,
module and lesson. Teachers select one RLS-visible pupil; results of different
pupils are never combined into a mastery total. Each of the ten modes distinguishes
no attempt, attempted, and completed. Completion still requires every vocabulary
word and a finished server attempt. Partial attempts cannot enter the ranking.
The best complete result is shown separately from word mastery; teachers retain
the top ten visible complete attempts for each selected lesson/mode.

## Evidence rule

The server's read-only, security-invoker `lesson_word_progress` view requires two
distinct finished attempts in the same mode with a correct server-evaluated answer
for the word, without a hint or a retry. The view explicitly checks both
`verification_source='server_evaluated'` and `verified_correct=true`; legacy client
correctness is not evidence. Finishing the same attempt again does not add evidence.
Cards/daily self-ratings never produce mastery. Self-rating counts only include
finished attempts. Existing assignment, enrollment, pupil and teacher RLS apply.

The section total counts each word once when the server marks it mastered in at
least one mode. Its explanation lists evidence per mode, so recognizing a word is
not presented as having mastered spelling in every mode. This is successful
practice, not a claim of long-term retention: there is no spaced-recall interval
or decay in this stage. The UI explicitly recommends returning on another day.
Filters show all words, words needing practice, or mastered words. Catalogue words
without evidence remain visible. Paginated reads avoid the PostgREST 1,000-row cap.

## Verification

`tests/mastery-browser.mjs` uses actual local Supabase Auth, Edge and RLS with
browser interaction. It covers the two-attempt transition, unfinished attempts,
finish idempotency, legacy unverified evidence, hints/retries, two rounds of
self-ratings, partial lessons, persisted progress, both HTML entry points, mobile
layout, two distinct pupils, a foreign pupil, another teacher, and denied writes
to the view. Synthetic fixture vocabulary is separate from the 1,035 canonical
words. Existing all-ten-mode browser journeys now check the explorer badges too.

No production deployment or real pupil pilot is enabled. Next: the optional
learning-growth companion, then complete release gates and separately approved
hosted pilot preparation.
