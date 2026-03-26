-- ══════════════════════════════════════════════════════════════
-- Dragon Gem Chart — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables
-- ══════════════════════════════════════════════════════════════

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Children ──
create table children (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  avatar_color text default '#9b59b6',
  avatar_emoji text default '🐉',
  sort_order int default 0,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id)
);

-- ── Task Templates ──
-- Main tasks have parent_id = null, subtasks reference their parent
create table task_templates (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade,
  title text not null,
  task_type text not null check (task_type in ('daily', 'weekly')),
  parent_id uuid references task_templates(id) on delete cascade,
  gem_value int default 1,
  bonus_gems int default 0,  -- extra gems when ALL subtasks complete (main tasks only)
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id)
);

-- ── Daily Completions ──
create table daily_completions (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  task_template_id uuid references task_templates(id) on delete cascade not null,
  completion_date date not null default current_date,
  completed_by text,  -- parent name
  completed_at timestamptz default now(),
  unique(child_id, task_template_id, completion_date)
);

-- ── Weekly Completions ──
create table weekly_completions (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  task_template_id uuid references task_templates(id) on delete cascade not null,
  week_of date not null,  -- Monday of the week
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0=Sun, 6=Sat
  completed_by text,
  completed_at timestamptz default now(),
  unique(child_id, task_template_id, week_of, day_of_week)
);

-- ── Bonus Listening ──
create table bonus_listening (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  event_date date not null default current_date,
  description text not null,
  gems_awarded int not null default 1,
  awarded_by text,
  created_at timestamptz default now()
);

-- ── Gem Ledger (master record of all gem transactions) ──
create table gem_ledger (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  amount int not null,  -- positive = earned, negative = spent
  source text not null check (source in ('task', 'bonus', 'store', 'manual', 'task_bonus')),
  description text,
  reference_id uuid,  -- optional link to completion/bonus/redemption
  gems_given boolean default false,  -- physical gems handed out?
  given_date date,
  created_at timestamptz default now(),
  created_by text
);

-- ── Store Items ──
create table store_items (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  gem_cost int not null,
  description text,
  emoji text default '🎁',
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id)
);

-- ── Store Redemptions ──
create table store_redemptions (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  store_item_id uuid references store_items(id) on delete set null,
  item_name text not null,  -- snapshot in case item is deleted
  gems_spent int not null,
  redeemed_at timestamptz default now(),
  redeemed_by text
);

-- ══════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ══════════════════════════════════════════════════════════════

alter table children enable row level security;
alter table task_templates enable row level security;
alter table daily_completions enable row level security;
alter table weekly_completions enable row level security;
alter table bonus_listening enable row level security;
alter table gem_ledger enable row level security;
alter table store_items enable row level security;
alter table store_redemptions enable row level security;

-- For now, allow all authenticated users full access
-- (both parents share the same data)
create policy "Authenticated users can do everything" on children
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on task_templates
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on daily_completions
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on weekly_completions
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on bonus_listening
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on gem_ledger
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on store_items
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users can do everything" on store_redemptions
  for all using (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════
-- Indexes
-- ══════════════════════════════════════════════════════════════

create index idx_task_templates_child on task_templates(child_id);
create index idx_task_templates_parent on task_templates(parent_id);
create index idx_daily_completions_date on daily_completions(child_id, completion_date);
create index idx_weekly_completions_week on weekly_completions(child_id, week_of);
create index idx_gem_ledger_child on gem_ledger(child_id);
create index idx_bonus_listening_child on bonus_listening(child_id, event_date);

-- ══════════════════════════════════════════════════════════════
-- Default Data
-- ══════════════════════════════════════════════════════════════

-- Default children (Iona and Jude)
insert into children (name, avatar_color, avatar_emoji, sort_order) values
  ('Iona', '#e0115f', '🐉', 0),
  ('Jude', '#0f52ba', '🐲', 1);

-- Default store items
insert into store_items (name, gem_cost, emoji, sort_order) values
  ('Ice Cream Trip', 15, '🍦', 0),
  ('30min Extra Screen Time', 10, '🎮', 1),
  ('Small Toy', 50, '🧸', 2),
  ('Movie Night Pick', 25, '🎬', 3),
  ('Special Outing', 75, '⭐', 4),
  ('Stay Up 30min Late', 20, '🌙', 5),
  ('Pick Dinner', 12, '🍕', 6);
