-- Per creator/week/position tier break points for Weekly Rankings, mirroring
-- the tiers already supported on the main Redraft/Dynasty rankings (rankings.tiers)
-- but scoped to weekly_rankings' one-row-per-player structure instead of one
-- row per creator+format.
create table weekly_ranking_tiers (
  creator_id text not null,
  week integer not null,
  position text not null check (position in ('QB','RB','WR','TE','DST','K')),
  tiers jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (creator_id, week, position)
);

alter table weekly_ranking_tiers enable row level security;
