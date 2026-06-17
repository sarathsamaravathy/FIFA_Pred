# FIFA Predictions (Vercel)

Minimal Next.js app to run on Vercel. Features:

- Google Sign-In via NextAuth
- Fetches matches from worldcupjson.net
- Predict upcoming 1-2 matches, predictions close at match start
- Simple scoring rules and leaderboard scaffold

Required environment variables (set in Vercel project settings):

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (create OAuth credentials at Google Cloud)
- `NEXTAUTH_SECRET` (random string)
- `UPSTASH_REST_URL` and `UPSTASH_REST_TOKEN` (create a free Upstash Redis instance to store predictions)

Deployment:

1. Push this repository to GitHub (you already have a public repo).
2. Import the repo in Vercel and set the environment variables above.
3. Deploy. The app uses Next.js API routes and serverless functions.

Notes:

- This is a minimal scaffold. The leaderboard and robust storage require enhancing the API to scan prediction keys and compute totals from Upstash. For a small friends group (100 users) Upstash free tier or Supabase is recommended.

Syncing match data to Upstash (when upstream blocks automated requests)
---------------------------------------------------------------

If the upstream API blocks automated requests, you can populate the Upstash cache from your machine (or any server/IP not blocked) with the included script:

```bash
# from the repo root
node scripts/syncMatches.js
```

The script reads `.env.local` for `UPSTASH_REST_URL` and `UPSTASH_REST_TOKEN` (or uses environment variables) and stores the latest matches into Upstash under the key `matches`. After running it once, the site will serve cached matches even if the upstream blocks requests.

Local-file fallback
-------------------

If you can't fetch from the upstream API or can't run the sync script from an allowed IP, you can create a local file `data/matches.json` in the repo root with the matches JSON and the app will serve that file. Example steps:

1. Create a `data` folder in the project root.
2. Save a matches JSON into `data/matches.json`. It must be an array of match objects (the same shape as `https://worldcupjson.net/v1/matches`).
3. Restart the dev server and open the app — it will use the local file when upstream is unavailable.

This is the simplest way to get the app running without relying on the upstream API.

Admin editing
-------------

The app includes a basic admin page at `/admin` where a signed-in user can edit match datetime, teams, and stage. Changes are saved to `data/matches.json` and will also update the Upstash cache if configured.

To use:

1. Sign in with Google in the app.
2. Visit `/admin` and edit matches.

This is a lightweight editor suitable for small groups; if you want role-based access or more features I can extend it.

