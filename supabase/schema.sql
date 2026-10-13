-- Gym Progress Supabase schema
-- Run this once in the Supabase Dashboard SQL Editor for this project.

create table if not exists public.gym_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  split text not null default 'PPL',
  custom_split jsonb,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise text not null,
  muscle text not null,
  exercise_group text not null,
  weight numeric(7, 2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  sets integer not null check (sets > 0),
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists exercise_logs_user_date_idx
  on public.exercise_logs (user_id, logged_on desc);

alter table public.gym_settings enable row level security;
alter table public.exercise_logs enable row level security;

drop policy if exists "Users can read their gym settings" on public.gym_settings;
create policy "Users can read their gym settings"
  on public.gym_settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their gym settings" on public.gym_settings;
create policy "Users can create their gym settings"
  on public.gym_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their gym settings" on public.gym_settings;
create policy "Users can update their gym settings"
  on public.gym_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their exercise logs" on public.exercise_logs;
create policy "Users can read their exercise logs"
  on public.exercise_logs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their exercise logs" on public.exercise_logs;
create policy "Users can create their exercise logs"
  on public.exercise_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their exercise logs" on public.exercise_logs;
create policy "Users can update their exercise logs"
  on public.exercise_logs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their exercise logs" on public.exercise_logs;
create policy "Users can delete their exercise logs"
  on public.exercise_logs for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.gym_settings to authenticated;
grant select, insert, update, delete on public.exercise_logs to authenticated;
