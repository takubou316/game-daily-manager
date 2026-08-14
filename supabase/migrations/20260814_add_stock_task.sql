-- 蓄積型タスクを既存のSupabaseプロジェクトへ追加するための移行SQL
-- Supabase SQL Editorで一度だけ実行する。

alter table public.tasks
  drop constraint if exists tasks_type_check;

alter table public.tasks
  add constraint tasks_type_check check (type in ('single', 'count', 'stock'));

alter table public.tasks
  add column if not exists stock_interval_hours integer not null default 24,
  add column if not exists stock_capacity integer not null default 7,
  add column if not exists stock_amount integer not null default 0,
  add column if not exists stock_updated_at timestamptz not null default now();

alter table public.tasks
  add constraint tasks_stock_interval_hours_check check (stock_interval_hours between 1 and 8760),
  add constraint tasks_stock_capacity_check check (stock_capacity between 1 and 999),
  add constraint tasks_stock_amount_check check (stock_amount between 0 and stock_capacity);
