-- 時間経過で回復するスタミナ・リソース管理用テーブル
-- Supabase SQL Editorで内容を確認してから一度だけ実行する。

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 100),
  current_amount integer not null default 0 check (current_amount >= 0),
  max_amount integer not null default 1 check (max_amount between 1 and 9999),
  recovery_minutes integer not null default 8 check (recovery_minutes between 1 and 10080),
  updated_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (current_amount <= max_amount)
);

alter table public.resources enable row level security;

create policy "resources: own rows" on public.resources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists resources_user_active_idx on public.resources(user_id, active);
