-- 筋トレショートカット機能: 全体管理画面から「ウォーキング」等の特定種目へワンタップで
-- 遷移できるタスクをユーザーが自由に登録できるようにするテーブル。
-- ゲームタスク(games/tasks)と同じ「定義と実績を分離する」考え方に沿い、このテーブルは
-- ショートカットの「定義」だけを持つ。「達成したかどうか」は保存せず、既存の
-- training_session_exercisesを都度クエリして判定する(exercise_idで正確に区別するため、
-- 別の種目を記録しても無関係なショートカットが誤って達成扱いにならない)。
--
-- link_typeは将来「自分で作る画面へのリンク」等、種目に紐づかないショートカットにも
-- 対応できるよう汎用的な名前にしているが、今回は'exercise'のみサポートする。

create table if not exists public.training_shortcuts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 100),
  link_type text not null default 'exercise' check (link_type in ('exercise')),
  exercise_id text not null check (char_length(exercise_id) between 1 and 100),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_shortcuts enable row level security;

drop policy if exists "training_shortcuts: own rows" on public.training_shortcuts;
create policy "training_shortcuts: own rows" on public.training_shortcuts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists training_shortcuts_user_active_idx on public.training_shortcuts(user_id, active, sort_order);
