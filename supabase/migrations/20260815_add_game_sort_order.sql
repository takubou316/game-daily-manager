-- ゲームフィルターの表示順
alter table public.games
  add column if not exists sort_order integer not null default 0;

update public.games
set sort_order = ordered.position
from (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as position
  from public.games
) as ordered
where public.games.id = ordered.id;

alter table public.games
  drop constraint if exists games_sort_order_check;

alter table public.games
  add constraint games_sort_order_check check (sort_order >= 0);
