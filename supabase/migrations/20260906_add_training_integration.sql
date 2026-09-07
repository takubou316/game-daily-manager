-- 筋トレ統合: training-menu(別リポジトリ、ビルドレスvanilla JS)の記録データを
-- Supabaseへ正規化して複製するための3テーブル。
-- ローカル(training-menu側のlocalStorage)が常に正であり、これはクラウド複製・
-- 全体管理画面の「今日やったか」表示用。既存のgames/tasks等は無変更。
-- 詳細な設計方針はCLAUDE.mdの「データ設計」節を参照。
--
-- 2026-09-07、Codexによる設計レビューを受けて以下を反映済み:
-- - 子テーブルは(親id, user_id)の複合外部キーで、親子が同一ユーザーであることをDB制約で保証する
--   （user_id単独のRLSだけでは、他人のidを親として指定した紐付けを防げないため）
-- - 各階層にtraining-menu端末発行のlocal_idを持たせ、親スコープでユニーク制約をかけることで
--   再送時の重複登録を防ぐ（冪等性の確保）
-- - policyは`drop policy if exists`を先に置き、再実行してもエラーにならないようにする
-- - 数値カラムに範囲チェックを追加
-- - session_dateはtraining-menu側の`localDateKey`相当のロジック(ユーザーのローカル日付)で
--   計算した日付をそのまま保存する。タイムゾーン変換はクライアント側の責務とし、DB側では
--   date型としてそのまま扱う

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 100), -- training-menu端末側で発行したID。再送時の重複防止に使う
  session_date date not null, -- 全体管理画面の「今日やったか」判定に使うローカル日付(taining-menuのlocalDateKey相当)
  started_at timestamptz not null,
  goal text check (goal is null or char_length(goal) <= 100),
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  body_weight_kg numeric(5,1) check (body_weight_kg is null or body_weight_kg > 0),
  created_at timestamptz not null default now(),
  unique (user_id, local_id),
  unique (id, user_id) -- 子テーブルからの複合外部キー参照用
);

create table if not exists public.training_session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  local_id text not null check (char_length(local_id) between 1 and 100), -- セッション内でこの種目を一意に識別する端末発行ID
  exercise_id text not null check (char_length(exercise_id) between 1 and 100), -- training-menuのexercises-data.js側の種目ID
  name text not null check (char_length(name) between 1 and 200), -- 種目名(表示用のフォールバック保存。マスターデータが変わっても記録が読めるように)
  order_index integer not null default 0 check (order_index >= 0),
  exercise_type text not null default 'strength' check (exercise_type in ('strength', 'cardio')),
  distance_km numeric(5,2) check (distance_km is null or distance_km >= 0),
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, local_id),
  unique (id, user_id), -- 孫テーブルからの複合外部キー参照用
  foreign key (session_id, user_id) references public.training_sessions (id, user_id) on delete cascade
);

create table if not exists public.training_session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_exercise_id uuid not null,
  local_id text not null check (char_length(local_id) between 1 and 100), -- 種目内でこのセットを一意に識別する端末発行ID
  set_index integer not null check (set_index >= 0),
  weight numeric(6,2) check (weight is null or weight >= 0),
  reps integer check (reps is null or reps >= 0),
  hold_sec integer check (hold_sec is null or hold_sec >= 0),
  rpe numeric(3,1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  is_warmup boolean not null default false,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_exercise_id, local_id),
  foreign key (session_exercise_id, user_id) references public.training_session_exercises (id, user_id) on delete cascade
);

alter table public.training_sessions enable row level security;
alter table public.training_session_exercises enable row level security;
alter table public.training_session_sets enable row level security;

drop policy if exists "training_sessions: own rows" on public.training_sessions;
create policy "training_sessions: own rows" on public.training_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "training_session_exercises: own rows" on public.training_session_exercises;
create policy "training_session_exercises: own rows" on public.training_session_exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "training_session_sets: own rows" on public.training_session_sets;
create policy "training_session_sets: own rows" on public.training_session_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists training_sessions_user_date_idx on public.training_sessions(user_id, session_date desc);
create index if not exists training_session_exercises_session_idx on public.training_session_exercises(user_id, session_id, order_index);
create index if not exists training_session_sets_exercise_idx on public.training_session_sets(user_id, session_exercise_id, set_index);
