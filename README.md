# Gym Progress

A mobile-friendly workout planner and progress logger. Supabase Auth handles accounts, while Supabase Postgres stores each user's workout plan and exercise logs. Row Level Security keeps records private to their owner.

## Set up Supabase

1. Open the project dashboard and go to **SQL Editor**.
2. Open `supabase/schema.sql` from this repository, copy its contents into a new SQL query, and run it. This creates the app tables and owner-only RLS policies.
3. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:8000` and add these Redirect URLs:
   - `http://localhost:8000/**`
   - `http://127.0.0.1:8000/**`
4. If you enable email confirmation, follow the confirmation link before signing in. For a hosted deployment, add its URL to the Redirect URLs too.

The browser app is configured with the project's Supabase URL and **publishable** key. Publishable keys are intended for browser use; the RLS policies protect user data. Never put a Supabase secret or `service_role` key in this app or in GitHub.

## Run locally

Open `index.html` in a browser, or start a local server in this folder:

```powershell
python -m http.server 8000
```

Then visit http://localhost:8000. The app loads the Supabase JavaScript client from jsDelivr, so sign-in and cloud sync require an internet connection.

## Existing device data

After signing in, the app offers to import existing workout logs from the old local-only version. It does not send that data until you choose **Import this device's data**. Data remains available in the browser backup until import succeeds.
