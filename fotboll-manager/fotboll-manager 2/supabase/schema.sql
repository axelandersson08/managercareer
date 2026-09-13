-- Fotbollsmanager Online — databasschema för Supabase (Postgres)
-- OBS: Detta ersätter det tidigare schemat helt (ligor-med-jointkod är borta,
-- ersatt av ett globalt säsongssystem med divisioner). Kör mot ett nytt/tomt
-- Supabase-projekt, eller droppa de gamla tabellerna (leagues, teams,
-- players, fixtures, match_events, match_actions) innan du kör detta.
--
-- Kör hela filen i Supabase Dashboard -> SQL Editor -> New query -> Run.

-- ============ PROFILER (tränare) ============
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null, -- tränarnamn
  is_admin boolean not null default false,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Alla kan läsa profiler" on profiles for select using (true);
create policy "Användare kan skapa sin egen profil" on profiles for insert with check (auth.uid() = id);
create policy "Användare kan uppdatera sin egen profil" on profiles for update using (auth.uid() = id);

-- Gör dig själv till admin EFTER att du skapat din profil i appen:
--   update profiles set is_admin = true where username = 'ditt-tränarnamn';

-- ============ SÄSONGER ============
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  number int not null,
  status text not null default 'registration', -- registration | active | finished
  division_size int not null default 16,
  start_date date, -- sätts när admin startar säsongen
  created_at timestamptz default now()
);

alter table seasons enable row level security;
create policy "Alla kan läsa säsonger" on seasons for select using (true);
create policy "Admin kan skapa säsonger" on seasons for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);
create policy "Admin kan uppdatera säsonger" on seasons for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);

-- ============ DIVISIONER (serienivåer inom en säsong) ============
create table if not exists divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id) on delete cascade,
  tier int not null, -- 1 = högsta serien
  name text not null, -- t.ex. "Division 1"
  created_at timestamptz default now(),
  unique (season_id, tier)
);

alter table divisions enable row level security;
create policy "Alla kan läsa divisioner" on divisions for select using (true);
create policy "Admin kan skapa divisioner" on divisions for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);

-- ============ LAG ============
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) unique, -- en tränare styr ett lag
  name text not null,
  formation text not null default '4-4-2',
  division_id uuid references divisions(id), -- null tills säsongen startat
  budget numeric not null default 5000000,
  arena_level int not null default 1,
  academy_level int not null default 1,
  primary_color text not null default '#1d4ed8', -- klubbens dräktfärger, valda av ägaren
  secondary_color text not null default '#ffffff',
  created_at timestamptz default now()
);

alter table teams enable row level security;
create policy "Alla kan läsa lag" on teams for select using (true);
create policy "Ägaren kan skapa sitt lag" on teams for insert with check (auth.uid() = owner_id);
create policy "Ägaren kan uppdatera sitt lag" on teams for update using (auth.uid() = owner_id);
create policy "Admin kan uppdatera lag (t.ex. sätta division)" on teams for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);

-- Skydda ekonomi/division från att ändras direkt av lagägaren via klienten —
-- de får bara ändras via spelfunktionerna nedan (SECURITY DEFINER) eller av admin.
create or replace function protect_team_fields() returns trigger
language plpgsql security definer as $$
begin
  if (new.budget is distinct from old.budget or new.division_id is distinct from old.division_id
      or new.arena_level is distinct from old.arena_level or new.academy_level is distinct from old.academy_level)
     and coalesce(current_setting('app.internal_write', true), '') <> 'true'
     and not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'budget/division/arena_level/academy_level kan bara ändras via en spelfunktion';
  end if;
  return new;
end;
$$;

drop trigger if exists teams_protect_fields on teams;
create trigger teams_protect_fields before update on teams
  for each row execute function protect_team_fields();

-- ============ SPELARE ============
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete set null, -- null = fri agent
  name text not null,
  position text not null, -- GK | DEF | MID | FWD
  age int not null default (18 + floor(random() * 16))::int,
  rating int not null default 60 check (rating between 1 and 99),
  stamina int not null default 100 check (stamina between 0 and 100),
  is_starting boolean not null default false,
  slot int,
  goals int not null default 0,
  appearances int not null default 0,
  asking_price numeric, -- satt när det är en fri agent till salu
  created_at timestamptz default now()
);

alter table players enable row level security;
create policy "Alla kan läsa spelare" on players for select using (true);

-- Lagägaren får bara pilla på laguppställning (is_starting/slot) och namn/formation-relaterat,
-- INTE rating/goals/appearances/team_id (transfers) — de skyddas av triggern nedan.
create policy "Lagägaren kan hantera sina spelare" on players for all using (
  team_id is not null and auth.uid() = (select owner_id from teams where teams.id = players.team_id)
);
create policy "Admin kan skapa spelare (t.ex. fria agenter)" on players for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);

create or replace function protect_player_fields() returns trigger
language plpgsql security definer as $$
begin
  if (new.rating is distinct from old.rating or new.team_id is distinct from old.team_id
      or new.goals is distinct from old.goals or new.appearances is distinct from old.appearances
      or new.asking_price is distinct from old.asking_price or new.age is distinct from old.age)
     and coalesce(current_setting('app.internal_write', true), '') <> 'true'
     and not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'rating/team_id/goals/appearances/asking_price kan bara ändras via en spelfunktion';
  end if;
  return new;
end;
$$;

drop trigger if exists players_protect_fields on players;
create trigger players_protect_fields before update on players
  for each row execute function protect_player_fields();

-- ============ MATCHER (liga + cup i samma tabell) ============
create table if not exists fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id) on delete cascade,
  competition text not null, -- 'league' | 'cup'
  division_id uuid references divisions(id), -- satt för ligamatcher
  matchday int, -- satt för ligamatcher (1, 2, 3, ...)
  cup_round int, -- satt för cupmatcher (1 = första omgången, osv.)
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id), -- null = frilott (bye) i cupen
  kickoff_at timestamptz not null,
  status text not null default 'scheduled', -- scheduled | live | finished
  minute int not null default 0,
  home_score int not null default 0,
  away_score int not null default 0,
  engine_state jsonb, -- matchmotorns interna tillstånd mellan tick-anrop (se tick-matches)
  created_at timestamptz default now()
);

alter table fixtures enable row level security;
create policy "Alla kan läsa matcher" on fixtures for select using (true);
create policy "Admin kan skapa matcher" on fixtures for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);
-- OBS: ingen update-policy för klienter. Matchresultat/minut/status skrivs
-- bara av tick-matches-funktionen (körs med service role, se
-- supabase/functions/tick-matches) eller admin — aldrig av en vanlig
-- spelares webbläsare. Det är det som gör att matchen går kl 15/18 GMT
-- oavsett om någon tittar.
create policy "Admin kan uppdatera matcher" on fixtures for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);

-- ============ MATCHHÄNDELSER (live-feed) ============
create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references fixtures(id) on delete cascade,
  minute int not null,
  type text not null, -- kickoff | chance | goal | yellow | red | sub | tactic | fulltime | bye
  team_id uuid references teams(id),
  description text not null,
  created_at timestamptz default now()
);

alter table match_events enable row level security;
create policy "Alla kan läsa matchhändelser" on match_events for select using (true);
-- OBS: ingen insert-policy för klienter — matchhändelser skrivs bara av
-- tick-matches-funktionen (service role) eller admin. En vanlig spelare kan
-- alltså inte fejka mål i sin egen match.
create policy "Admin kan skriva matchhändelser" on match_events for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin)
);

-- ============ LIVE-ÅTGÄRDER (byten / taktik under match) ============
create table if not exists match_actions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references fixtures(id) on delete cascade,
  team_id uuid references teams(id),
  type text not null, -- substitution | tactic_change
  payload jsonb not null default '{}'::jsonb,
  minute int,
  processed boolean not null default false, -- satt av tick-matches när åtgärden applicerats
  created_at timestamptz default now()
);

alter table match_actions enable row level security;
create policy "Alla kan läsa live-åtgärder" on match_actions for select using (true);
create policy "Lagägaren kan skicka in åtgärder för sitt eget lag" on match_actions for insert with check (
  auth.uid() = (select owner_id from teams where teams.id = match_actions.team_id)
);

-- ============ EKONOMI ============
create table if not exists finance_transactions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  amount numeric not null, -- positivt = intäkt, negativt = utgift
  reason text not null,
  created_at timestamptz default now()
);

alter table finance_transactions enable row level security;
create policy "Alla kan läsa ekonomihändelser" on finance_transactions for select using (true);
-- Inga direkta insert/update-policyer för klienter — allt skrivs av
-- SECURITY DEFINER-funktionerna nedan, som därmed är enda vägen in.

-- credit_team: lägger till/drar av pengar och loggar det atomiskt.
create or replace function credit_team(p_team_id uuid, p_amount numeric, p_reason text)
returns void language plpgsql security definer as $$
begin
  perform set_config('app.internal_write', 'true', true);
  update teams set budget = budget + p_amount where id = p_team_id;
  insert into finance_transactions (team_id, amount, reason) values (p_team_id, p_amount, p_reason);
end;
$$;

-- upgrade_arena: höjer arenanivå mot en kostnad som skalar med nivån.
create or replace function upgrade_arena(p_team_id uuid)
returns void language plpgsql security definer as $$
declare
  v_level int;
  v_cost numeric;
begin
  if auth.uid() <> (select owner_id from teams where id = p_team_id) then
    raise exception 'Du äger inte det här laget';
  end if;
  select arena_level into v_level from teams where id = p_team_id;
  v_cost := v_level * 2000000;
  if (select budget from teams where id = p_team_id) < v_cost then
    raise exception 'Inte tillräckligt med pengar (kostar % kr)', v_cost;
  end if;
  perform set_config('app.internal_write', 'true', true);
  update teams set budget = budget - v_cost, arena_level = arena_level + 1 where id = p_team_id;
  insert into finance_transactions (team_id, amount, reason)
    values (p_team_id, -v_cost, 'Arenauppgradering till nivå ' || (v_level + 1));
end;
$$;

-- upgrade_academy: höjer akademinivå mot en kostnad, och ger direkt en ny ungdomsspelare.
create or replace function upgrade_academy(p_team_id uuid)
returns void language plpgsql security definer as $$
declare
  v_level int;
  v_cost numeric;
  v_positions text[] := array['GK','DEF','MID','FWD'];
  v_pos text;
begin
  if auth.uid() <> (select owner_id from teams where id = p_team_id) then
    raise exception 'Du äger inte det här laget';
  end if;
  select academy_level into v_level from teams where id = p_team_id;
  v_cost := v_level * 1500000;
  if (select budget from teams where id = p_team_id) < v_cost then
    raise exception 'Inte tillräckligt med pengar (kostar % kr)', v_cost;
  end if;
  v_pos := v_positions[1 + floor(random() * 4)::int];
  perform set_config('app.internal_write', 'true', true);
  update teams set budget = budget - v_cost, academy_level = academy_level + 1 where id = p_team_id;
  insert into finance_transactions (team_id, amount, reason)
    values (p_team_id, -v_cost, 'Akademiuppgradering till nivå ' || (v_level + 1));
  insert into players (team_id, name, position, age, rating, is_starting)
    values (
      p_team_id,
      (array['Alexander','Emil','Isak','Melker','Magnus','Mikkel','Onni','Sander','Frederik','Aleksi'])[1 + floor(random()*10)::int]
        || ' ' || (array['Björk','Åberg','Holm','Ek','Hansen','Nielsen','Korhonen','Larsen','Møller','Virtanen'])[1 + floor(random()*10)::int],
      v_pos,
      16 + floor(random() * 3)::int,
      45 + v_level + floor(random() * 10)::int,
      false
    );
end;
$$;

-- ============ TRANSFERMARKNAD (lag-till-lag) ============
create table if not exists transfer_listings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  seller_team_id uuid references teams(id),
  asking_price numeric not null,
  status text not null default 'open', -- open | completed | withdrawn
  created_at timestamptz default now()
);

alter table transfer_listings enable row level security;
create policy "Alla kan läsa listningar" on transfer_listings for select using (true);
create policy "Lagägaren kan lista sina spelare" on transfer_listings for insert with check (
  auth.uid() = (select owner_id from teams where teams.id = transfer_listings.seller_team_id)
  and seller_team_id = (select team_id from players where players.id = transfer_listings.player_id)
);
create policy "Lagägaren kan dra tillbaka sin listning" on transfer_listings for update using (
  auth.uid() = (select owner_id from teams where teams.id = transfer_listings.seller_team_id)
);

create table if not exists transfer_bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references transfer_listings(id) on delete cascade,
  bidder_team_id uuid references teams(id),
  amount numeric not null,
  status text not null default 'pending', -- pending | accepted | rejected | withdrawn
  created_at timestamptz default now()
);

alter table transfer_bids enable row level security;
create policy "Alla kan läsa bud" on transfer_bids for select using (true);
create policy "Lag kan lägga bud" on transfer_bids for insert with check (
  auth.uid() = (select owner_id from teams where teams.id = transfer_bids.bidder_team_id)
);

-- accept_transfer_bid: genomför övergången atomiskt (pengar + spelare byter ägare).
create or replace function accept_transfer_bid(p_bid_id uuid)
returns void language plpgsql security definer as $$
declare
  v_listing transfer_listings%rowtype;
  v_bid transfer_bids%rowtype;
begin
  select * into v_bid from transfer_bids where id = p_bid_id;
  select * into v_listing from transfer_listings where id = v_bid.listing_id;

  if auth.uid() <> (select owner_id from teams where id = v_listing.seller_team_id) then
    raise exception 'Bara det säljande laget kan acceptera bud';
  end if;
  if v_listing.status <> 'open' then
    raise exception 'Listningen är redan avslutad';
  end if;
  if (select budget from teams where id = v_bid.bidder_team_id) < v_bid.amount then
    raise exception 'Köparen har inte tillräckligt med pengar längre';
  end if;

  perform set_config('app.internal_write', 'true', true);
  perform 1 from players where id = v_listing.player_id for update;
  update players set team_id = v_bid.bidder_team_id, is_starting = false, slot = null
    where id = v_listing.player_id;
  update teams set budget = budget - v_bid.amount where id = v_bid.bidder_team_id;
  update teams set budget = budget + v_bid.amount where id = v_listing.seller_team_id;
  insert into finance_transactions (team_id, amount, reason)
    values (v_bid.bidder_team_id, -v_bid.amount, 'Köpte spelare');
  insert into finance_transactions (team_id, amount, reason)
    values (v_listing.seller_team_id, v_bid.amount, 'Sålde spelare');

  update transfer_listings set status = 'completed' where id = v_listing.id;
  update transfer_bids set status = 'accepted' where id = p_bid_id;
  update transfer_bids set status = 'rejected' where listing_id = v_listing.id and id <> p_bid_id and status = 'pending';
end;
$$;

-- free_agent_prices: dagens direktköpspris och lägsta bud för en given
-- spelarkvalitet. Priserna skalar med hur mycket pengar som finns i spelet
-- totalt (snittkassan jämfört med startkassan 5 000 000 kr) — det gör att
-- man inte kan värva hur billigt som helst när ekonomin väl har växt.
create or replace function free_agent_prices(p_rating int)
returns table(buy_now numeric, min_bid numeric)
language sql stable as $$
  select
    round(p_rating * 30000 * greatest(1, (select coalesce(avg(budget), 5000000) from teams) / 5000000.0)),
    round(p_rating * 18000 * greatest(1, (select coalesce(avg(budget), 5000000) from teams) / 5000000.0));
$$;

-- buy_free_agent_now: garanterat direktköp till dagens direktköpspris.
create or replace function buy_free_agent_now(p_player_id uuid, p_team_id uuid)
returns void language plpgsql security definer as $$
declare
  v_rating int;
  v_current_team uuid;
  v_price numeric;
begin
  if auth.uid() <> (select owner_id from teams where id = p_team_id) then
    raise exception 'Du äger inte det här laget';
  end if;
  select rating, team_id into v_rating, v_current_team from players where id = p_player_id for update;
  if v_current_team is not null then
    raise exception 'Spelaren är redan värvad';
  end if;
  select buy_now into v_price from free_agent_prices(v_rating);
  if (select budget from teams where id = p_team_id) < v_price then
    raise exception 'Inte tillräckligt med pengar (kostar % kr)', v_price;
  end if;
  perform set_config('app.internal_write', 'true', true);
  update players set team_id = p_team_id, asking_price = null where id = p_player_id;
  update teams set budget = budget - v_price where id = p_team_id;
  insert into finance_transactions (team_id, amount, reason) values (p_team_id, -v_price, 'Direktköp av fri agent');
end;
$$;

-- bid_on_free_agent: lägg ett bud på minst dagens lägstanivå. Fria agenter
-- har ingen motpart att förhandla med, så ett giltigt bud går igenom direkt
-- om spelaren fortfarande är ledig (annars: "redan värvad").
create or replace function bid_on_free_agent(p_player_id uuid, p_team_id uuid, p_amount numeric)
returns void language plpgsql security definer as $$
declare
  v_rating int;
  v_current_team uuid;
  v_floor numeric;
begin
  if auth.uid() <> (select owner_id from teams where id = p_team_id) then
    raise exception 'Du äger inte det här laget';
  end if;
  select rating, team_id into v_rating, v_current_team from players where id = p_player_id for update;
  if v_current_team is not null then
    raise exception 'Spelaren är redan värvad';
  end if;
  select min_bid into v_floor from free_agent_prices(v_rating);
  if p_amount < v_floor then
    raise exception 'Budet är för lågt — minst % kr krävs för den här spelaren', v_floor;
  end if;
  if (select budget from teams where id = p_team_id) < p_amount then
    raise exception 'Inte tillräckligt med pengar';
  end if;
  perform set_config('app.internal_write', 'true', true);
  update players set team_id = p_team_id, asking_price = null where id = p_player_id;
  update teams set budget = budget - p_amount where id = p_team_id;
  insert into finance_transactions (team_id, amount, reason) values (p_team_id, -p_amount, 'Vann budgivning om fri agent');
end;
$$;

-- release_player: lagägaren släpper en spelare till marknaden som fri agent
-- (prissätts sedan dynamiskt precis som andra fria agenter).
create or replace function release_player(p_player_id uuid)
returns void language plpgsql security definer as $$
declare
  v_team uuid;
begin
  select team_id into v_team from players where id = p_player_id;
  if v_team is null or auth.uid() <> (select owner_id from teams where id = v_team) then
    raise exception 'Du äger inte den här spelaren';
  end if;
  perform set_config('app.internal_write', 'true', true);
  update players set team_id = null, is_starting = false, slot = null, asking_price = null
    where id = p_player_id;
end;
$$;

-- record_player_stats: uppdaterar mål/matcher spelade — anropas av matchmotorn (klienten som kör matchen).
create or replace function record_player_stat(p_player_id uuid, p_goals int, p_appearance boolean)
returns void language plpgsql security definer as $$
begin
  perform set_config('app.internal_write', 'true', true);
  update players set
    goals = goals + p_goals,
    appearances = appearances + (case when p_appearance then 1 else 0 end)
  where id = p_player_id;
end;
$$;

-- advance_cup_round: kollar om en cupomgång är helt spelad och lottar i så
-- fall nästa omgång automatiskt (oavsett vem som anropar — måste vara en
-- SECURITY DEFINER-funktion eftersom det är en vanlig inloggad spelares
-- webbläsare som "kör" den sista matchen i omgången, inte admin).
create or replace function advance_cup_round(p_season_id uuid, p_round int)
returns void language plpgsql security definer as $$
declare
  v_unfinished int;
  v_next_exists int;
  v_fixture record;
  v_winner uuid;
  v_winners uuid[] := '{}';
  v_kickoff timestamptz;
  v_shuffled uuid[];
  v_i int;
begin
  select count(*) into v_unfinished from fixtures
    where season_id = p_season_id and competition = 'cup' and cup_round = p_round and status <> 'finished';
  if v_unfinished > 0 then
    return;
  end if;

  select count(*) into v_next_exists from fixtures
    where season_id = p_season_id and competition = 'cup' and cup_round = p_round + 1;
  if v_next_exists > 0 then
    return;
  end if;

  perform set_config('app.internal_write', 'true', true);

  for v_fixture in
    select * from fixtures where season_id = p_season_id and competition = 'cup' and cup_round = p_round
  loop
    if v_fixture.away_team_id is null then
      v_winner := v_fixture.home_team_id;
    elsif v_fixture.home_score > v_fixture.away_score then
      v_winner := v_fixture.home_team_id;
    elsif v_fixture.away_score > v_fixture.home_score then
      v_winner := v_fixture.away_team_id;
    else
      v_winner := case when random() < 0.5 then v_fixture.home_team_id else v_fixture.away_team_id end;
      insert into match_events (fixture_id, minute, type, team_id, description)
        values (v_fixture.id, 90, 'fulltime', v_winner, 'Matchen slutade lika och avgjordes på straffar.');
    end if;
    v_winners := array_append(v_winners, v_winner);
  end loop;

  if array_length(v_winners, 1) <= 1 then
    if array_length(v_winners, 1) = 1 then
      insert into match_events (fixture_id, minute, type, team_id, description)
        select id, 90, 'fulltime', v_winners[1],
               '🏆 ' || (select name from teams where id = v_winners[1]) || ' vinner cupen!'
        from fixtures
        where season_id = p_season_id and competition = 'cup' and cup_round = p_round
        limit 1;
    end if;
    return;
  end if;

  select array_agg(x order by random()) into v_shuffled from unnest(v_winners) as x;

  select kickoff_at into v_kickoff from fixtures
    where season_id = p_season_id and competition = 'cup' and cup_round = p_round limit 1;
  v_kickoff := v_kickoff + interval '7 days';

  v_i := 1;
  while v_i <= array_length(v_shuffled, 1) loop
    insert into fixtures (season_id, competition, cup_round, home_team_id, away_team_id, kickoff_at)
      values (p_season_id, 'cup', p_round + 1, v_shuffled[v_i], v_shuffled[v_i + 1], v_kickoff);
    v_i := v_i + 2;
  end loop;
end;
$$;

-- ============ MIGRERING (om du kör detta mot ett projekt som redan finns) ============
-- Om du redan har kört ett äldre schema.sql och bara vill lägga till
-- klubbfärgerna utan att nollställa allt, kör bara de här två raderna i
-- SQL Editor istället för hela filen ovanför:
--   alter table teams add column if not exists primary_color text not null default '#1d4ed8';
--   alter table teams add column if not exists secondary_color text not null default '#ffffff';

-- ============ REALTIME ============
-- Slå på i Supabase Dashboard -> Database -> Replication för:
--   fixtures, match_events, match_actions, transfer_listings, transfer_bids
