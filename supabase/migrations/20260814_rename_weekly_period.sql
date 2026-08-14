-- 「今週」を繰り返し周期として適切な「毎週」へ変更する移行SQL
-- Supabase SQL Editorで一度だけ実行する。

alter table public.tasks
  drop constraint if exists tasks_period_check;

update public.tasks
set period = '毎週'
where period = '今週';

alter table public.tasks
  add constraint tasks_period_check check (period in ('毎日', '毎週', '2週間ごと', '毎月', '期間限定'));
