# Gym Progress

A mobile-friendly workout logger that makes it easy to start a routine, record your sets, and compare progress over time. The app runs locally without an account and can sync to Supabase when you sign in.

## Tech stack

- React, TypeScript, Vite
- Tailwind CSS and accessible shadcn-style UI primitives
- TanStack Query for Supabase data and Zustand for interface/session state
- Dexie IndexedDB for workouts, routines, drafts, and the sync outbox
- Supabase Auth, Postgres, and Row Level Security
- Vite PWA with Workbox precaching and Background Sync wakeups
- Recharts for exercise progression charts

## Open the app on Windows

1. Make sure Node.js is installed (Node.js 20.19+ or 22.12+).
2. Double-click **Start Gym Progress.bat** in this folder.
3. The first run installs the app's required files. Wait for your browser to open.
4. Keep the black window open while you use the app. Close it when you are finished.

If Windows asks which app to use, right-click the file and choose **Open**. If the browser does not open automatically, copy the `Local` address shown in the black window (usually http://localhost:5173) into your browser.

The app works locally without Supabase sign-in. To use account sync, create `.env.local` from `.env.example` and fill in your Supabase project URL and publishable key before starting.

### Start from a terminal (optional)

Open this folder in Terminal or PowerShell and run `npm install` once, then `npm run dev`. Open the `Local` address printed in the terminal.

To create a production build, run `npm run build`. Vite writes the deployable app to `dist/`; Vercel and Cloudflare Pages can use `npm run build` and `dist` as the output directory.

## Supabase

Run `supabase/schema.sql` for a new project. If the older Gym Progress schema is already installed, run `supabase/workout-upgrade.sql` first to add routine, active-session, and set-detail fields. Set the Supabase Auth Site URL for your deployment and add redirect URLs for http://localhost:5173/**, http://127.0.0.1:5173/**, and your hosted app.

The browser uses a Supabase publishable key. Never add a Supabase secret or `service_role` key to the frontend or commit it to GitHub. Row Level Security policies in the schema keep each user's records private.

## Local data and offline use

Workout logs, routines, and active drafts save to IndexedDB on this browser. They remain available offline. Signed-in changes enter a local outbox and sync when the app is online. Background Sync nudges an open app where supported; if the browser has closed, queued changes sync the next time you open the app. Data does not sync between devices until you sign in. Export workout history from the Progress tab as CSV.

## Deploy

For Vercel, import this GitHub repository, set the build command to `npm run build`, the output directory to `dist`, and add `VITE_SUPABASE_URL` plus `VITE_SUPABASE_PUBLISHABLE_KEY` as project environment variables. Configure the deployed URL in Supabase Auth redirects. Cloudflare Pages uses the same build command and output directory.

PostHog and Plausible are intentionally not wired in; add one only if you decide that usage analytics are useful for your privacy-first app.
