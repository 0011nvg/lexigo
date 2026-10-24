# LEXIGO visual redesign — implementation contract (2026-10-24)

Branch: design/lexigo-illustrated-experience. This is an unmerged design/development branch. Production must not be modified without explicit approval.

## Approved mascot
Use the user-provided London kitten reference, not a generic kitten or emoji: gray-blue fur, white muzzle/chest, turquoise eyes, pink nose, blue hoodie, expressive proportional ears and paws, polished 3D animation quality. **BOTH EYES OPEN IN EVERY FRAME** (including rewards, mistakes, victory, travel, and small course cards). No winks. Consistent identity across all variants. Illustrations are required production assets, not CSS emoji replacements.

## Approved UI
- Logo LEXI in blue and GO in lime, no decorative sparks.
- Home: illustrated travel hero, genuine progress, rewards, Spotlight 2/3/4 illustrated covers, 4-tab bottom navigation.
- Modules: persistent compact LEFT vertical module rail even on iPhone; actual module names from dataset; vocabulary/audio/favorites/selection/sort, sticky practice CTA.
- Modes: 10 original working games with bespoke coherent illustrated tiles, not mock screens.
- Travel themes: London for Spotlight 2, New York for Spotlight 3, Sydney/Australia for Spotlight 4.
- Responsive and accessible touch targets; avoid horizontal scrolling; optimize asset loading.

## Functional invariants
- Keep all 1035 original entries, with grade totals 236/423/376 derived from source data, never hardcoded as display truth.
- Preserve existing 10 game mechanics, progress, server/local adapters, teacher/student/parent role separation.
- Crystals must reward genuine learning and be resistant to repeated trivial clicks. No payment gating yet.

## Teacher print acceptance
- Two designs: Classic and Adventure.
- Both must fit 20 legible questions on ONE portrait A4 page; 2 columns x 10, margins 10–12 mm, approx. 10–11 pt type.
- Support English→Russian, Russian→English, mixed; optional A/B variants and separate teacher key; never print answers on student sheet.
- Browser-to-PDF test on long strings: exactly one A4 page, no clipping/overlap, optional grayscale.
- Show sample PDFs for user approval before merging.

## Release gates
1. Audit actual UI, existing code and CI.
2. Implement real illustrations and components in this branch only.
3. Browser E2E for every mode, data counts, roles and mobile widths.
4. PDF print checks for both templates.
5. CI success and preview link; obtain explicit user approval before main/production merge.

## Initial audit evidence
README documents 1035 entries and unusual source module order; do not silently normalize the dataset. The current index.html still contains legacy dark-theme CSS at the top, and a mobile breakpoint hides #catalogAside behind a catalog toggle; this contradicts the approved always-visible module rail. No package.json at repo root. These are audit findings, not proof of completed redesign.
