-- 期間限定タスクの開始・終了時刻
alter table public.tasks
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz;

update public.tasks
set
  start_at = coalesce(start_at, start_date::timestamptz),
  end_at = coalesce(end_at, (end_date + 1)::timestamptz)
where period = '期間限定'
  and (start_date is not null or end_date is not null);
