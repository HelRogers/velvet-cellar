# The access gate (parked)

Built and tested at Checkpoint 3, then set aside on 24 November 2026 at the host's request:
guests should not have to enter a password, and the site is being deployed by manual
upload, which cannot carry edge functions. The site therefore launches as an unlisted
address with search indexing switched off. That is not access protection, and the host
knows it.

Nothing in this folder is built or deployed. It is kept so the gate can be switched on
later without being rewritten.

## What it does

- `netlify/edge-functions/gate.ts` refuses every request without a valid pass, including
  direct requests for image files. Only the entrance page, fonts and textures are open.
- `netlify/edge-functions/door.ts` checks the password, from the entrance form or from a
  private invitation link (`/enter?key=PASSWORD`), and issues a signed pass cookie. A guest
  who clicks the invitation link goes straight to the sealed envelope with nothing to type.
- `tools/gate.test.mjs` holds its 60 tests.

## To switch it on

It needs Netlify to build the site (a connected GitHub repository, or the Netlify CLI).
Drag-and-drop uploads do not deploy edge functions.

1. Move `netlify/` to the project root, `src/pages/door.astro` to `src/pages/`,
   `src/styles/door.css` to `src/styles/` and `tools/gate.test.mjs` to `tools/`.
2. In Netlify, set two secret environment variables with the Functions scope:
   `SITE_ACCESS_CODE` (8 characters or more) and `SITE_SESSION_SECRET` (32 or more).
3. Run `npm run build` and `node --experimental-strip-types tools/gate.test.mjs`.
4. Deploy a preview with dummy content first and test it from outside.

If the secrets are missing, the gate serves nothing at all. Do not move these files back
without setting them.
