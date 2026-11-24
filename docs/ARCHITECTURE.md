# Architecture, hosting and security

Approved by the host on 24 November 2026 (Checkpoint 1). Items marked *planned* are not built yet.

## Shape

- **Astro static site.** Content sits in simple files under `src/content/`, separate from layout.
- **GitHub (private repository)** holds the single codebase and its history.
- **Netlify (free plan)** hosts it. Development happens in Claude; Netlify only builds and serves.
- **No Supabase.** Its free projects pause after a week of low activity, which is a poor fit for a site with quiet spells.

## Netlify plan

A dedicated free Netlify account is expected to be enough for about 24 guests:

- New free accounts have 300 credits a month as a hard limit. A production deploy costs 15;
  preview deploys and form submissions cost nothing; bandwidth and requests for a party of
  this size amount to a few credits.
- The budget that matters is production deploys: no more than about ten a month.
- For that reason announcements and the release switches (booklets, voting, gallery) are
  designed to change **without** a new deploy (*planned*, see Administration).
- If the allowance ever looked tight in December, the fallback is one month of the Personal
  plan. That needs the host's approval and is not expected.

## Access protection (built and logic-tested at Checkpoint 3; platform test pending)

Requirement: nothing sensitive (invitation images, address, guest names, APIs, documents)
is served to anyone without the invitation link or password, on previews and production alike.

How it works:

- `netlify/edge-functions/gate.ts` runs in front of every request, including image files.
  Without a valid pass, a browser is shown the entrance page (`/door/`) and every other
  request is refused with 401. The only open files are the entrance, the fonts and the four
  material textures, none of which hold anything private.
- `netlify/edge-functions/door.ts` checks the password, from the entrance form
  (`POST /enter`) or from the private invitation link (`/enter?key=PASSWORD`). It is rate
  limited to 10 attempts a minute per visitor.
- A correct password sets a pass cookie: signed (HMAC-SHA256), HTTP-only, Secure,
  SameSite=Lax, valid for 120 days. It never contains the password.
- Two Netlify environment variables (Functions scope, marked secret) hold the password
  (`SITE_ACCESS_CODE`, 8 characters or more) and the signing key (`SITE_SESSION_SECRET`,
  32 or more). Neither is in the repository. If either is missing the site serves nothing.
- Changing `SITE_SESSION_SECRET` and redeploying revokes every pass already issued.

Tested (`npm run test:gate`, 60 checks): every built file requested directly without a
pass; forged, expired and mis-signed passes; wrong, empty and nearly-right passwords; the
invitation link; missing or weak secrets; and that the open files contain nothing private.

Still to test on Netlify itself, before any guest information is deployed there: that the
functions are attached to every path, the rate limit, and cookies over HTTPS. The plan is a
first preview with dummy content only, tested from outside, then the real build.

## The Netlify project

- Project `the-velvet-cellar` (free plan), created 24 Nov 2026 on a new account. It is empty.
  Intended address: `https://the-velvet-cellar.netlify.app` (the name can still be changed
  before launch, not after).
- New projects on this plan start as private to the Netlify team (visitors must sign in to
  Netlify). That is an extra layer while previewing. Before launch the project is made
  public, leaving the site's own gate as the protection guests meet.
- Form detection must be enabled once (Forms, in the Netlify dashboard) for the RSVP.
- Deploys are meant to come from the GitHub repository: `develop` to previews, `main` to
  production with auto-publishing locked. Claude sessions cannot upload a build to Netlify
  directly from their workspace.

## RSVP (built; live submission test pending)

A styled form on the site (the reservation slip), submitted to **Netlify Forms**. The host
reads responses in the Netlify dashboard or by email notification. No account for guests,
no public list of replies. The page shows a confirmation only when Netlify accepts the
submission; in the private preview it says that nothing was sent.

## Character booklets (*planned*, Release Two)

- Individual PDFs only, stored in **Netlify Blobs** (private storage), never in the
  repository and never in the public site files.
- A serverless function checks a per-guest access code (stored hashed), limits repeated
  attempts, and streams only that guest's file.
- Booklets are treated as opaque files. They are uploaded without being opened or read.
- The combined kit and anything containing the solution are never uploaded anywhere.

## Administration (*planned*, after launch)

A small host-only page, authenticated on the server, to publish announcements, release
booklets and switch on voting and the gallery without a deploy. The full dashboard in the
brief is deferred. Until then content is edited in `src/content/`.

## Workflow

- `develop` branch: day-to-day work, Netlify preview deploys (free, gated).
- `main` branch: approved work only. Production publishes from `main` only on the host's
  explicit approval, with auto-publishing locked in Netlify.
- Each approved checkpoint is tagged in git.

## Spoiler protection

The Claude project that holds this work also holds the murder mystery kit. Development
reads only the invitation artwork and the two briefs. The narration script, host's guide,
clues, main game file and character booklets are not opened.
