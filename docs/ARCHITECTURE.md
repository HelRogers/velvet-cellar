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

## Access protection (*planned*, Checkpoint 3)

Requirement: nothing sensitive (invitation images, address, guest names, APIs, documents)
is served to anyone without the invitation link or code, on previews and production alike.

- A Netlify **Edge Function** runs in front of every request, including image files.
- Guests arrive by a private link that carries a key, or type a shared code at a themed
  entrance. A correct key sets a signed, HTTP-only cookie.
- Without a valid cookie the only thing served is the entrance itself, which contains no
  private content.
- The key is held as a Netlify environment variable, never in the repository or in page code.
- Tested before any real personal information is deployed: direct asset URLs, missing and
  forged cookies, wrong codes.

Until that exists, the only preview is a private Claude artifact that only the host's own
account can open.

## RSVP (*planned*)

A styled form on the site, submitted to **Netlify Forms**. The host reads responses in the
Netlify dashboard or by email notification. No account for guests, no public list of replies.

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
