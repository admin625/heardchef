# /spike/

Sandboxed proof-of-concept pages and supporting Netlify Functions used to validate
infrastructure decisions before they touch production code in `src/`.

## Why this directory exists

This is intentional infrastructure, not dead code. Spikes live here when:

- An architecture decision (third-party SDK, audio pipeline, streaming protocol) needs
  end-to-end validation across multiple platforms (iOS Safari tab, iOS PWA, desktop) before
  we commit production code paths.
- A bug repro needs a clean isolated page that doesn't drag in the full app's state.
- A performance characteristic needs measurement under realistic conditions.

Each spike is a single static HTML page in this directory plus, optionally, Netlify
Functions that share the spike's name prefix. Pages are served as static files by Netlify
(static-file lookup wins over the SPA catch-all redirect in `netlify.toml`), so they
don't need React Router entries.

Spikes are kept small. If a spike outgrows a single page, it should graduate into a
production module under `src/` or be torn down once its findings are recorded.

## Operating principles

- **Cost gating.** Every spike that consumes paid API credit has a click-to-start gate
  on the page. No mic capture, network calls, or paid-API hits before the user clicks.
- **No silent errors.** Spike pages surface every error to a visible log div. They are
  for diagnosis; nothing should fail invisibly.
- **No production coupling.** Spikes import nothing from `src/`. They may call existing
  Netlify Functions (`/api/chat`, `/api/tts`) read-only as endpoints, but never the
  React components that wrap them.
- **Findings live in commits and Obsidian, not here.** Once a spike's findings are
  written up, this directory keeps only the page itself for future re-runs.

## Current spikes

| Page | Function(s) | Decision under test |
|---|---|---|
| [`deepgram.html`](deepgram.html) | `netlify/functions/deepgram-token.mjs` | Path B: replace Web Speech API with Deepgram streaming STT (validate iOS Safari + iOS PWA + desktop Chrome end-to-end loop). |

## Adding a new spike

1. Drop `<spike-name>.html` and `<spike-name>.js` here.
2. If a server-side helper is needed, add `netlify/functions/<spike-name>-<helper>.mjs`
   with `export const config = { path: '/api/<spike-name>-<helper>' }`.
3. Append a row to the table above.
4. Open via `https://heardchef-app.netlify.app/spike/<spike-name>.html`.

## Cleanup policy

A spike stays in `/spike/` as long as its decision remains relevant or might need
re-running on new platforms. When a spike's underlying technology is shipped to
production or definitively rejected, the spike can be deleted in a separate cleanup PR.
