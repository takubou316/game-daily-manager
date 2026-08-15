-- ゲーム日課管理アプリの初期スキーマ
-- Supabase SQL Editorで、内容を確認してから一度だけ実行する。

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 200),
  type text not null default 'single' check (type in ('single', 'count', 'stock')),
  period text not null default '毎日' check (period in ('毎日', '毎週', '2週間ごと', '毎月', '期間限定')),
  priority smallint not null default 2 check (priority between 1 and 3),
  minutes integer check (minutes is null or minutes between 1 and 999),
  target integer not null default 1 check (target between 1 and 999),
  stock_interval_hours integer not null default 24 check (stock_interval_hours between 1 and 8760),
  stock_capacity integer not null default 7 check (stock_capacity between 1 and 999),
  stock_amount integer not null default 0 check (stock_amount between 0 and stock_capacity),
  stock_updated_at timestamptz not null default now(),
  memo text not null default '',
  start_date date,
  end_date date,
  start_at timestamptz,
  end_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.task_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  period_key text not null,
  progress integer not null default 0 check (progress >= 0),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, period_key)
);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  task_period_id uuid references public.task_periods(id) on delete set null,
  amount integer not null default 1 check (amount >= 1),
  completed_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 100),
  current_amount integer not null default 0 check (current_amount >= 0),
  max_amount integer not null default 1 check (max_amount between 1 and 9999),
  recovery_minutes integer not null default 8 check (recovery_minutes between 1 and 10080),
  check_url text not null default '',
  updated_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (current_amount <= max_amount)
);

alter table public.games enable row level security;
alter table public.tasks enable row level security;
alter table public.task_periods enable row level security;
alter table public.task_completions enable row level security;
alter table public.resources enable row level security;

create policy "games: own rows" on public.games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks: own rows" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "task_periods: own rows" on public.task_periods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "task_completions: own rows" on public.task_completions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "resources: own rows" on public.resources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists games_user_active_idx on public.games(user_id, active);
create index if not exists tasks_user_active_idx on public.tasks(user_id, active);
create index if not exists task_periods_task_period_idx on public.task_periods(task_id, period_key);
create index if not exists task_completions_task_date_idx on public.task_completions(task_id, completed_at desc);
create index if not exists resources_user_active_idx on public.resources(user_id, active);
