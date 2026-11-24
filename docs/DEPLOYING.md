# Deploying by manual upload

While no GitHub repository is connected, the site reaches Netlify as a ZIP of the built
files, uploaded by the host. Nothing is published unless the host uploads it.

## Making the ZIP

```sh
npm run check          # build and run every test
npm run deploy:pack    # writes deploy/the-velvet-cellar-site-v<version>.zip
```

The ZIP holds the finished site with `index.html` at its top level. The packaging step
refuses to run if the no-index rules are missing or if anything resembling the murder
mystery kit is present.

## Uploading it

1. Sign in to Netlify and open the project **the-velvet-cellar**.
2. Open **Deploys** and scroll to the dotted upload area at the foot of the page.
3. Drop the ZIP there (or choose it with the browse option). If the uploader will not
   take a ZIP on a tablet, unzip it first and upload the folder, or use a laptop.
4. The upload becomes the live version of `https://the-velvet-cellar.netlify.app`
   straight away. Each upload replaces the whole site, so always upload the complete ZIP.

To go back to an earlier version, open it in the Deploys list and choose to publish it.

## Who can see it

The project was created as private to the Netlify team: visitors must be signed in to
that Netlify account. While that is on, an upload is a private rehearsal. Guests can only
see the site once the host changes the project's visibility to public (Project
configuration, Access and security). That switch is the real moment of publication.

## What manual upload does and does not support

| Feature | With manual upload |
| --- | --- |
| The site itself, invitation, countdown, archive, mood boards | Works |
| RSVP (Netlify Forms) | Works. Form detection must be enabled once for the project; responses appear under Forms in the Netlify dashboard. |
| Calendar file (`the-velvet-cellar.ics`) and Google Calendar link | Work |
| No-index headers (`public/_headers`) | Work |
| The parked access gate, private invitation link, a secured host page | Do not work. These need edge or serverless functions, which Netlify only deploys from a connected repository or the command-line tool. |

## Connecting GitHub later

Link the repository to this same Netlify project (Project configuration, Build and deploy,
Link repository). The address does not change and nothing is rebuilt by hand:
`netlify.toml` already tells Netlify how to build. Set the production branch to `main` and
lock publishing so that a new build only goes live when the host publishes it.

## Cost

Free plan. Each upload that goes live counts as one production deploy (15 of the 300
monthly credits), so avoid uploading more often than needed.
