-- 完了・回収日を起点に再表示するタスクを既存のSupabaseへ追加するための移行SQL
-- Supabase SQL Editorで一度だけ実行する。

alter table public.tasks
  drop constraint if exists tasks_period_check;

alter table public.tasks
  add constraint tasks_period_check check (period in ('毎日', '毎週', '2週間ごと', '毎月', '期間限定', '完了から'));

alter table public.tasks
  add column if not exists repeat_days integer not null default 3,
  add column if not exists last_completed_at timestamptz;

alter table public.tasks
  add constraint tasks_repeat_days_check check (repeat_days between 1 and 3650);
