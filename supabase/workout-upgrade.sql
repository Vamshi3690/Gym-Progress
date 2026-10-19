-- Gym Progress: routines, fast sessions, offline drafts and set-level notes.
-- Run in the Supabase SQL Editor after applying schema.sql.

alter table public.gym_settings
  add column if not exists routines jsonb not null default '[]'::jsonb,
  add column if not exists active_routine_id text,
  add column if not exists workout_history jsonb not null default '[]'::jsonb,
  add column if not exists active_session jsonb,
  add column if not exists custom_exercises jsonb not null default '[]'::jsonb;

alter table public.exercise_logs
  add column if not exists session_id uuid,
  add column if not exists routine_name text,
  add column if not exists set_details jsonb not null default '[]'::jsonb,
  add column if not exists notes text not null default '';

create index if not exists exercise_logs_user_session_idx
  on public.exercise_logs (user_id, session_id);
