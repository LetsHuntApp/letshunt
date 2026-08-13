-- ============================================================================
-- LetsHunt — Accounts & HuntClubs (Batch 6, Phase 1)
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is safe to run once; it creates tables that did not exist before.
--
-- What this gives you:
--   profiles          one row per user, auto-created on signup
--   hunt_clubs        a club = a named dataset (pins, logs, cams, settings)
--   hunt_club_members who belongs to which club (owner / member)
--   hunt_club_data    the club's data bundle (the LetsHuntBackup JSON)
--   trail_cam_photos  lightweight metadata mirror for the club gallery
--
-- Every table is protected by Row Level Security: a user can only touch
-- their own profile, and clubs/data/photos they are a member of.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- hunt_clubs
-- ---------------------------------------------------------------------------
create table if not exists public.hunt_clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- hunt_club_members
-- ---------------------------------------------------------------------------
create table if not exists public.hunt_club_members (
  club_id   uuid not null references public.hunt_clubs (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- ---------------------------------------------------------------------------
-- hunt_club_data — one JSON row per club (the LetsHuntBackup payload)
-- ---------------------------------------------------------------------------
create table if not exists public.hunt_club_data (
  club_id    uuid primary key references public.hunt_clubs (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- ---------------------------------------------------------------------------
-- trail_cam_photos — metadata mirror (full images live in Backblaze B2)
-- ---------------------------------------------------------------------------
create table if not exists public.trail_cam_photos (
  id                   text primary key,
  club_id              uuid not null references public.hunt_clubs (id) on delete cascade,
  file_name            text,
  date_time            text,
  latitude             double precision,
  longitude            double precision,
  camera_location_name text,
  is_favorite          boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists trail_cam_photos_club_id_idx on public.trail_cam_photos (club_id);

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of the given club?
-- (security definer so RLS on hunt_club_members doesn't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.is_club_member(cid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.hunt_club_members
    where club_id = cid and user_id = auth.uid()
  );
$$;

-- Generate a random invite code (unambiguous alphabet, like the app UI).
create or replace function public.generate_invite_code(len int default 8)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..len loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- Create a club + owner membership atomically. Returns the new club row
-- (with its invite code) to the caller.
create or replace function public.create_club_with_membership(cname text)
returns public.hunt_clubs
language plpgsql
security definer set search_path = public
as $$
declare
  club public.hunt_clubs;
begin
  loop
    begin
      insert into public.hunt_clubs (name, invite_code, owner_id)
      values (cname, public.generate_invite_code(), auth.uid())
      returning * into club;
      exit;
    exception when unique_violation then
      -- invite_code collision; try another code
    end;
  end loop;
  insert into public.hunt_club_members (club_id, user_id, role)
  values (club.id, auth.uid(), 'owner');
  return club;
end;
$$;

-- Look up a club by invite code and add the caller as a member (idempotent).
-- Non-members have no SELECT access on hunt_clubs, so joining MUST go
-- through this function rather than a direct table query.
create or replace function public.join_club_by_code(code text)
returns public.hunt_clubs
language plpgsql
security definer set search_path = public
as $$
declare
  club public.hunt_clubs;
begin
  select * into club from public.hunt_clubs where invite_code = upper(code);
  if not found then
    raise exception 'No HuntClub found with code %', code;
  end if;
  insert into public.hunt_club_members (club_id, user_id, role)
  values (club.id, auth.uid(), 'member')
  on conflict (club_id, user_id) do nothing;
  return club;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — enable + policies
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.hunt_clubs        enable row level security;
alter table public.hunt_club_members enable row level security;
alter table public.hunt_club_data    enable row level security;
alter table public.trail_cam_photos  enable row level security;

-- profiles: users manage their own row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- hunt_clubs: members can see it; owner can update/delete
create policy "clubs_select_member" on public.hunt_clubs
  for select using (public.is_club_member(id));
create policy "clubs_insert_owner" on public.hunt_clubs
  for insert with check (auth.uid() = owner_id);
create policy "clubs_update_owner" on public.hunt_clubs
  for update using (auth.uid() = owner_id);
create policy "clubs_delete_owner" on public.hunt_clubs
  for delete using (auth.uid() = owner_id);

-- hunt_club_members: see your own memberships; join yourself; owners manage
create policy "members_select_own" on public.hunt_club_members
  for select using (auth.uid() = user_id or public.is_club_member(club_id));
create policy "members_insert_self" on public.hunt_club_members
  for insert with check (auth.uid() = user_id);
create policy "members_delete_owner" on public.hunt_club_members
  for delete using (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.hunt_club_members m
      where m.club_id = club_id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

-- hunt_club_data: any member can read/update the club bundle
create policy "data_select_member" on public.hunt_club_data
  for select using (public.is_club_member(club_id));
create policy "data_insert_member" on public.hunt_club_data
  for insert with check (public.is_club_member(club_id));
create policy "data_update_member" on public.hunt_club_data
  for update using (public.is_club_member(club_id));

-- trail_cam_photos: any member can read/insert/update metadata
create policy "photos_select_member" on public.trail_cam_photos
  for select using (public.is_club_member(club_id));
create policy "photos_insert_member" on public.trail_cam_photos
  for insert with check (public.is_club_member(club_id));
create policy "photos_update_member" on public.trail_cam_photos
  for update using (public.is_club_member(club_id));
