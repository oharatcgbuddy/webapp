alter table public.participations add column closed_at timestamptz default now();
grant update (closed_at) on public.participations to authenticated;
create unique index one_open_track_per_user on public.participations (user_id) where closed_at is null;

alter table onepiece.matches add column won_dice boolean;
alter table onepiece.matches add constraint matches_round_uq unique (participation_id, round);
