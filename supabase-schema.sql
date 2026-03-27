-- ══════════════════════════════════════════════════════════════
-- Dragon Gem Chart — Supabase Schema v2
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
create table task_templates (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade,
  title text not null,
  task_type text not null check (task_type in ('daily', 'weekly')),
  parent_id uuid references task_templates(id) on delete cascade,
  gem_value int default 1,
  bonus_gems int default 0,
  sort_order int default 0,
  active boolean default true,
  active_days int[] default null,
  weekly_target int default null,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id)
);

-- ── Daily Completions ──
create table daily_completions (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  task_template_id uuid references task_templates(id) on delete cascade not null,
  completion_date date not null default current_date,
  completed_by text,
  completed_at timestamptz default now(),
  unique(child_id, task_template_id, completion_date)
);

-- ── Weekly Completions ──
create table weekly_completions (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  task_template_id uuid references task_templates(id) on delete cascade not null,
  week_of date not null,
  day_of_week int not null check (day_of_week between 0 and 6),
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

-- ── Gem Ledger ──
create table gem_ledger (
  id uuid default uuid_generate_v4() primary key,
  child_id uuid references children(id) on delete cascade not null,
  amount int not null,
  source text not null check (source in ('task', 'bonus', 'store', 'manual', 'task_bonus')),
  description text,
  reference_id uuid,
  gems_given boolean default false,
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
  item_name text not null,
  gems_spent int not null,
  redeemed_at timestamptz default now(),
  redeemed_by text
);

-- ══════════════════════════════════════════════════════════════
-- Row Level Security — all authenticated users share all data
-- ══════════════════════════════════════════════════════════════

alter table children enable row level security;
alter table task_templates enable row level security;
alter table daily_completions enable row level security;
alter table weekly_completions enable row level security;
alter table bonus_listening enable row level security;
alter table gem_ledger enable row level security;
alter table store_items enable row level security;
alter table store_redemptions enable row level security;

create policy "auth_all" on children for all using (auth.role() = 'authenticated');
create policy "auth_all" on task_templates for all using (auth.role() = 'authenticated');
create policy "auth_all" on daily_completions for all using (auth.role() = 'authenticated');
create policy "auth_all" on weekly_completions for all using (auth.role() = 'authenticated');
create policy "auth_all" on bonus_listening for all using (auth.role() = 'authenticated');
create policy "auth_all" on gem_ledger for all using (auth.role() = 'authenticated');
create policy "auth_all" on store_items for all using (auth.role() = 'authenticated');
create policy "auth_all" on store_redemptions for all using (auth.role() = 'authenticated');

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

-- Children
insert into children (name, avatar_color, avatar_emoji, sort_order) values
  ('Iona', '#e0115f', '🐉', 0),
  ('Jude', '#0f52ba', '🐲', 1);

-- Store items (full catalog)
insert into store_items (name, gem_cost, emoji, description, sort_order) values
  ('Extra Bedtime Story', 3, '📖', 'Pick one extra book!', 0),
  ('Dance Party with Mom & Dad', 5, '💃', '3 songs, you pick the music!', 1),
  ('Pick the Car Music', 3, '🎵', 'DJ for the whole car ride!', 2),
  ('Pillow Fort Time', 8, '🏰', 'Build an epic fort together!', 3),
  ('Flashlight Hide & Seek', 8, '🔦', 'After-dark adventure!', 4),
  ('Choose Breakfast for Dinner', 5, '🥞', 'Pancakes? Waffles? You pick!', 5),
  ('Eat Dinner Picnic Style', 5, '🧺', 'On the floor with a blanket!', 6),
  ('PJs All Morning', 3, '🛌', 'No getting dressed till lunch (weekend)', 7),
  ('Parent Plays Your Game', 8, '🎲', 'Mom or Dad plays YOUR game for 15 min', 8),
  ('Use the Fancy Cup', 3, '🏆', 'Drink from the special cup today!', 9),
  ('Chess Game with Dad', 15, '♟️', 'One game before bedtime!', 10),
  ('Pick a YouTube Video', 5, '📺', 'One video, your choice!', 11),
  ('Face Paint / Makeup Fun', 8, '🎨', 'Get creative with colors!', 12),
  ('Stuffed Animal Sleepover', 3, '🧸', 'Extra stuffies in bed tonight!', 13),
  ('Bike Ride with Parent', 10, '🚴', 'Pick the route!', 14),
  ('30min Extra Screen Time', 10, '🎮', 'Tablet, TV, or games!', 15),
  ('Movie Night Pick', 12, '🎬', 'You choose the movie!', 16),
  ('Stay Up 30min Late', 15, '🌙', 'Extra time before bed!', 17),
  ('Hot Cocoa & Marshmallows', 6, '☕', 'With extra marshmallows!', 18),
  ('Gummy Bears Pack', 6, '🍬', 'One pack of gummies!', 19),
  ('Special Juice Box', 5, '🧃', 'The fancy kind!', 20),
  ('Glow Stick Bath', 8, '✨', 'Bath time rave!', 21),
  ('Ice Cream Trip', 15, '🍦', 'One scoop, any flavor!', 22),
  ('Cookie Decorating', 10, '🍪', 'Bake & decorate together!', 23),
  ('Pick Dinner Tonight', 12, '🍕', 'You pick what we eat!', 24),
  ('Smoothie of Your Choice', 8, '🥤', 'Pick all the ingredients!', 25),
  ('$1 Toy Fund Voucher', 10, '🎫', 'Save up for something big!', 26),
  ('Dollar Store Pick', 12, '🛍️', 'One item from the dollar store!', 27),
  ('Sticker Sheet', 8, '⭐', 'Fun stickers to collect!', 28),
  ('Temporary Tattoos', 8, '🦋', 'Cool designs!', 29),
  ('Bath Bomb', 10, '🫧', 'Fizzy colorful bath!', 30),
  ('Bubbles & Wand', 10, '🫧', 'Outdoor bubble time!', 31),
  ('Sidewalk Chalk Pack', 12, '🖍️', 'Draw on the driveway!', 32),
  ('Play-Doh (new color)', 15, '🎭', 'Pick a brand new color!', 33),
  ('Mini Lego Set', 25, '🧱', 'Polybag Lego build!', 34),
  ('$5 Toy Fund Voucher', 45, '💵', 'Goes toward any toy you want!', 35),
  ('Pick from Surprise Bag', 30, '🎒', 'Choose one mystery prize!', 36),
  ('Friend Sleepover', 50, '🏠', 'Have a friend stay over!', 37),
  ('Special Outing', 75, '🎡', 'Park, zoo, museum — you pick!', 38),
  ('Big Toy', 100, '🎁', 'Save up for something awesome!', 39);
