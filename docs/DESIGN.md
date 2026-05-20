# Design System

Fin uses a restrained research-operations interface: dense enough for analyst work, polished enough for executive review.

## Principles

- The first screen is the usable workspace, not a marketing page.
- Reports, sources, learnings, and run events are visible product objects.
- Visual hierarchy favors clarity, source inspection, and repeated use.
- Cards are used for bounded objects only; sections stay unframed unless they are tools or records.
- The palette stays professional: graphite, white, teal, and limited orange accents.

## Visual Assets

The README hero and Open Graph images live in:

- `assets/fin-hero.png`
- `assets/og-image.png`

They were generated as project-bound raster assets and copied into the repo so docs do not depend on external image-generation output folders.

## UI Routes

- `/` research workspace
- `/sessions` history
- `/sessions/[id]` session detail
- `/reports/[id]` report reader
- `/settings` provider and model status

## Accessibility

- Buttons use real `button` elements.
- Primary navigation uses links with visible labels.
- Form controls use native text areas and clear disabled states.
- E2E tests assert core headings and disabled provider states.
