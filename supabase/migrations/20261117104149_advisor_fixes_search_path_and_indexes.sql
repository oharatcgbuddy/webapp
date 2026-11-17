alter function public.set_updated_at() set search_path = '';

create index on public.shops (created_by);
create index on public.tournaments (created_by);
create index on public.shop_requests (reviewed_by);
