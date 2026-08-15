-- リソース確認先URL
alter table public.resources
  add column if not exists check_url text not null default '';
