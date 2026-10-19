# Gym Progress

A mobile-first workout tracker and progressive-overload coach. Start a routine, see your previous performance, log warm-up/working/failure/drop sets with RPE and notes, and finish a workout into your history. The app includes routines, an exercise library with custom exercises, progress analytics, offline session drafts, and an installable PWA. Supabase Auth and Postgres sync account data; Row Level Security keeps records private to their owner.

## Set up Supabase

1. Open the project dashboard and go to **SQL Editor**.
2. Open `supabase/schema.sql` from this repository, copy its contents into a new SQL query, and run it. This creates the app tables, workout-set fields, and owner-only RLS policies.
3. If you already ran an earlier version of the schema, run `supabase/workout-upgrade.sql` in the SQL Editor. This adds routine, session, and set-detail storage to the existing tables without deleting your current logs.
4. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:8000` and add these Redirect URLs:
   - `http://localhost:8000/**`
   - `http://127.0.0.1:8000/**`
5. If you enable email confirmation, follow the confirmation link before signing in. For a hosted deployment, add its URL to the Redirect URLs too.

The browser app is configured with the project's Supabase URL and **publishable** key. Publishable keys are intended for browser use; the RLS policies protect user data. Never put a Supabase secret or `service_role` key in this app or in GitHub.

## Run locally

Start a local server in this folder (service workers and install prompts need localhost or HTTPS):

```powershell
python -m http.server 8000
```

Then visit http://localhost:8000. After the first online load, the app shell and exercise library are cached for offline use. A workout in progress saves on the device immediately; completed exercise entries queue and sync when the connection returns. Signing in and syncing to Supabase require internet access.

## Install on a phone

Deploy the static folder to an HTTPS host such as Vercel, then open the site in your phone browser and choose **Add to Home Screen** or **Install app**. On iOS, use Safari's Share menu. The web app manifest and service worker are included in this repository.

## Existing device data

After signing in, the app offers to import existing workout logs from the old local-only version. It does not send that data until you choose **Import this device's data**. Data remains available in the browser backup until import succeeds.
