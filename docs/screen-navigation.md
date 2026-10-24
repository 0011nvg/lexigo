# LEXIGO screen navigation

The public practice interface now follows book → module → lesson → mode → game.
Only the current screen is visible. Spotlight 2, 3 and 4 have separate course
addresses and tabs. The original source module/lesson order and 1,035 entries are
unchanged. Word selection and teacher print/report tools have dedicated screens.

Routes use the fragment so static hosting needs no rewrite rules:

- `#/home`: book selection.
- `#/course/3/0`: Spotlight 3, first source module.
- `#/lesson/3/2`: source section index 2, mode selection.
- `#/lesson/3/m0`: all words of the first source module.
- `#/lesson/3/2/words`: optional word selection.
- `#/lesson/3/2/teacher`: A4 preparation and local report.
- `#/lesson/3/2/play/spell`: focused practice screen.
- `#/cabinet`: existing authenticated local Supabase cabinet.

Navigation uses browser history with links, breadcrumbs, back/forward, document
titles and heading focus. Reloading a practice-game URL starts a new local game;
aggregate local progress remains in the existing validated storage. Selection
is preserved when moving between screens within the same lesson. Changing lessons
selects the new lesson's words. Invalid lesson/game parameters cannot select
arbitrary data. Auth credentials never enter a URL; assignment links and server
authorization are unchanged. The protected game adapter still controls its own
in-memory cabinet screen and server-resumable attempts.

`navigation-controller.js` is a screen coordinator, not a second game engine.
All ten modes still invoke the existing practice controller and shared components.
`navigation.css` applies only to screen rendering, leaving A4 rules in charge of
printing. The visual system uses restrained green, cream, simple book covers,
consistent spacing, keyboard focus and reduced motion, without copied branding.

`tests/navigation.mjs` exercises every book and all ten game routes, screen
isolation, word selection, history, reloads, invalid links, cabinet transitions,
and 360/390/1440px layouts. Existing gameplay, visual, A4 and real Supabase E2E
remain release gates. Screenshots are included in the browser CI artifact.

Changes are integration-only in PR #7. Publishing to the existing public site
requires a separately authorized release; this change does not enable real pupil
accounts or alter the local-only pilot boundary.
