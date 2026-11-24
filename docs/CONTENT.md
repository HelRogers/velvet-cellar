# Updating the content

Everything a host is likely to change lives in `src/content/` (text and settings) or
`src/assets/` (images). Layout and styling are kept elsewhere, so changing a name or a
link never means rewriting a page. After any change, the site is rebuilt and previewed
before it is published.

| To change | Edit | Notes |
| --- | --- | --- |
| Date, time, address, attire, RSVP date | `src/content/site.json` → `event` | Used by the particulars, countdown and calendar links. `startsAtUtc` is the countdown's target (7 pm London on 18 December is `19:00:00Z`). `endsAt` is empty because no end time has been supplied. |
| Invitation artwork | `src/assets/invitation/invitation-front.png`, `invitation-back.png` | Replace the files, keeping the names. Update the alt text in `site.json` → `invitation` if the wording changed. |
| Guest register and dossiers | `src/content/guests.json` | One entry per guest, in alphabetical order of guest name: `guest`, `character`, `occupation` (the original character heading), `publicRole` (what is shown openly; shorter than `occupation`, or empty, where the heading gives away something the Public Story does not), `publicStory`, `privateBackstory`, `portrait` (file name in `src/assets/portraits/`), `booklet` (`sealed` or `released`). See `docs/CHARACTERS.md` for the corrections applied and the points awaiting the host. |
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
- Anything in `guests.json` beyond the Public Story and Private Backstory the host supplied for each character. The Private Backstory is obscured in the built page and shown only after the guest confirms the dossier is theirs. This is a courtesy barrier, not protection: never describe it as secure, and never add booklet text, clues or solution material to this file.
- Booklet PDFs in this repository. They go to private storage at Release Two.

## Later

At present every change above means a rebuild and a deploy. The small host page planned
for after launch will let announcements, booklet releases, voting and the gallery be
switched without one.

## Character portraits

The host's portraits are kept as supplied in `originals/portraits/` (named after the guest). They are
cropped to one upright 4:5 frame centred on the face, converted to black and white and saved to
`src/assets/portraits/<dossier address>.jpg` by:

    python3 tools/portraits.py originals/portraits src/content/guests.json src/assets/portraits /tmp/sheet.png

Faces are marked by eye in `tools/portraits-faces.json` (x, y, width, height in the original's pixels).
To move a crop, adjust that guest's entry and run the command again. To replace a portrait, put the new
file in `originals/portraits/` under the guest's name and update their entry.

## Background music

Settings are under `music` in `src/content/site.json`; the file itself is in `public/audio/`. The track
starts when a guest breaks the seal on the invitation, loops, and is switched on and off with the round
sound button, whose state is remembered on that guest's device. Opening a Spotify playlist pauses it.

- To change the track: put the new MP3 in `public/audio/` (192 kbps is plenty; the original as supplied
  is kept in `originals/music/`), then update `file`, `title`, `artist`, the credit link and the licence.
- The footer credit is a condition of the current track's free licence (CC BY 4.0). Keep it while that
  track is used, and change it with the track.
- To switch the music off altogether, set `file` to an empty string.

