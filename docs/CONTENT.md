# Updating the content

Everything a host is likely to change lives in `src/content/` (text and settings) or
`src/assets/` (images). Layout and styling are kept elsewhere, so changing a name or a
link never means rewriting a page. After any change, the site is rebuilt and previewed
before it is published.

| To change | Edit | Notes |
| --- | --- | --- |
| Date, time, address, attire, RSVP date | `src/content/site.json` → `event` | Used by the particulars, countdown and calendar links. `startsAtUtc` is the countdown's target (7 pm London on 18 December is `19:00:00Z`). `endsAt` is empty because no end time has been supplied. |
| Invitation artwork | `src/assets/invitation/invitation-front.png`, `invitation-back.png` | Replace the files, keeping the names. Update the alt text in `site.json` → `invitation` if the wording changed. |
| Guest register and dossiers | `src/content/guests.json` | One entry per guest: `guest`, `character`, `occupation`, `introduction` (approved, spoiler-free text only), `portrait` (file name in `src/assets/portraits/`), `booklet` (`sealed` or `released`). `registerSize` controls how many blank places are shown until the list is complete. |
| Mood board photographs | `src/content/moodboards.json` + `src/assets/moodboards/<board>/` | Add the image file to the board's folder (`cellar`, `ladies` or `gentlemen`) and list it under `images` with `file`, `alt` and an optional `caption`. Order in the list is the order on the page. Any number, any proportions. |
| Spotify playlists | `src/content/site.json` → `playlists` | Paste each playlist's link. Until then the buttons show as awaiting a link. |
| Announcements | `src/content/notices.json` | `title`, `date` (YYYY-MM-DD), `body`, `style` (`note` or `telegram`), `important`, optional `link` (`{ "label": "", "url": "" }`), `published`. Unpublished notices are left out of the built page entirely. |
| Remove the specimen notices | `src/content/site.json` → `showSpecimens: false` | Do this before launch. |
| Questions and answers | `src/content/faqs.json` | Add, remove or reorder freely. |
| Hide the countdown after the party | `src/content/site.json` → `countdown.visible: false` | |
| Open the voting | `src/content/site.json` → `voting.active: true`, `voting.formUrl` | The link is not in the page at all until both are set. Results are never shown on the site. |
| Open the photo gallery | `src/content/site.json` → `gallery` | `active`, `albumUrl`, optional `contributeUrl` and `thankYou`. |

## What is never added

- The murder mystery kit, the solution, the final narration, or any combined booklet.
- Private character material in `guests.json`. Introductions are public and spoiler-free.
- Booklet PDFs in this repository. They go to private storage at Release Two.

## Later

At present every change above means a rebuild and a deploy. The small host page planned
for after launch will let announcements, booklet releases, voting and the gallery be
switched without one.
