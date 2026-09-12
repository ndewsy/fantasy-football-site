-- Free-text disclaimer a creator can attach to their Weekly Rankings for a
-- given week — e.g. "TEN, GB on bye. Justin Jefferson excluded, game had
-- already started when rankings were posted." Week-level (not scoped to a
-- position like weekly_rankings/weekly_ranking_tiers), so it's its own
-- small table rather than an embedded column.
create table weekly_rankings_notes (
  creator_id text not null,
  week integer not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (creator_id, week)
);

alter table weekly_rankings_notes enable row level security;
