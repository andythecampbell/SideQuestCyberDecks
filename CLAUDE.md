# SideQuest Decks

Cyberdeck configurator (open source) feeding a future store that sells printed mounting kits and, later, full decks. The business is a primary goal, not an afterthought. Deck 001 is an ongoing personal build and does not gate configurator work.

## Docs

- `docs/VISION.md`, `docs/CONFIGURATOR.md`, `docs/INITIAL_CONFIGURATOR_PLAN.md` were drafted with another LLM and may lag the current direction. Check the "Decisions and changes" section of VISION.md first.
- `docs/CONVENTIONS.md` is the source of truth for units, axes, origins, and confidence levels.

## Rules

- Millimeters, right-handed, Z-up. Orientation is stored as a unit quaternion `[x, y, z, w]`.
- `app/src/domain/` is pure TypeScript: no React, Three.js, or DOM imports. The 3D scene renders from domain state, never the other way around.
- The catalog lives in `catalog/` as JSON. Schemas are in `app/src/domain/catalog.ts`. `npm test` validates every file.
- Values marked `estimate` must never drive generated parts.

## Commands

- `npm run dev` (from repo root): dev server on :5173
- `npm test`: Vitest
- `npm run build`: typecheck and build
