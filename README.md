# The Velvet Cellar

Private event website for Carys & Thomas' joint 21st birthday and 1920s murder mystery
(Friday 18th December 2026). One codebase, one permanent address, released in stages.

The approved specification is kept in `docs/specification/`. Read it before changing anything.

## Status

| Checkpoint | Scope | State |
| --- | --- | --- |
| 1 | Methodology and architecture | Approved 24 Nov 2026 |
| 2 | Visual design system, sealed-envelope opening, invitation viewer | Approved 24 Nov 2026 (tag `checkpoint-2-approved`) |
| 3 | Full homepage framework, example dossier | Approved 24 Nov 2026 with a more prominent RSVP (tag `checkpoint-3-approved`) |
| 4 | Launch content, reviewed by the host before publication | In progress: awaiting content |
| 5 | Production launch (Release One) | Not started |

Nothing has been deployed to Netlify. The Netlify project `the-velvet-cellar` exists and is empty.
The site is deployed by manual upload for now: see `docs/DEPLOYING.md`.

## Absolute rules

1. **No spoilers.** The murder mystery kit, its solution, the final narration and private
   character material never enter this repository, the hosting storage or any preview.
   Character booklets are delivered as opaque files; nobody building the site reads them.
2. **Nothing invented.** Guest names, character text, mood board images, links and party
   arrangements come only from the host.
3. **Nothing published or paid for without the host's explicit approval.**
4. **Approved work is preserved** unless the host asks for a change.

## Working on it

```sh
npm install
npm run dev            # local development server
npm run build          # static site in dist/
npm run check          # build, then every test: invitation and homepage
npm run shots          # screenshots at the brief's representative sizes (scratch/shots)
npm run preview:pack   # package dist/ as a private review copy in preview/
npm run deploy:pack    # package dist/ as a ZIP to upload to Netlify by hand
node tools/preview.test.mjs   # check that review copy
```

The tests use the Chrome already installed on the machine (`/usr/bin/google-chrome`).

## Branches and publishing

- `main` holds approved work only. `develop` is where work happens.
- Each approved checkpoint is tagged (`checkpoint-2-approved`, `checkpoint-3-approved`),
  so any approved version can be restored with `git checkout <tag>`.
- No GitHub repository is connected yet. The history travels between sessions as a git
  bundle inside each source ZIP (`git clone velvet-cellar.bundle velvet-cellar`).
- Nothing reaches guests unless the host uploads it and makes the project public.

## Where things live

| What | Where |
| --- | --- |
| How to update any content | `docs/CONTENT.md` |
| Event details, links and section switches | `src/content/site.json` |
| Guests, questions, notices, mood boards | `src/content/*.json` |
| Original invitation artwork (used as supplied, never redrawn) | `src/assets/invitation/` |
| Colours, type, spacing, motion | `src/styles/tokens.css` (described in `DESIGN.md`) |
| The sealed invitation | `src/components/Threshold.astro`, `src/styles/threshold.css`, `src/scripts/invitation.ts` |
| Homepage sections | `src/components/*.astro`, `src/styles/sections-*.css`, `src/scripts/site.ts` |
| Access gate (parked, not deployed) | `parked/access-gate/` |
| How the site is deployed | `docs/DEPLOYING.md` |
| Material textures and how they are made | `src/assets/textures/`, `tools/make_textures.py` |
| Tests | `tools/interactions.mjs`, `tools/site.test.mjs`, `tools/preview.test.mjs` |
| Architecture, hosting and security | `docs/ARCHITECTURE.md` |

To replace the invitation artwork, save the new files over
`src/assets/invitation/invitation-front.png` and `invitation-back.png` (same names) and
update the alt text in `src/content/site.json` if the wording changed.
