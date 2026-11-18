-- Secure, multi-server Arcade Atlas chat for Supabase. Run in SQL Editor.
-- Anonymous Supabase users keep one identity per browser; server access is membership-based.

-- Remove the permissive policies from the first single-room setup, if present.
do $$
declare p record;
begin
  if to_regclass('public.community_messages') is not null then
    for p in select policyname from pg_policies where schemaname='public' and tablename='community_messages' loop
      execute format('drop policy if exists %I on public.community_messages',p.policyname);
    end loop;
    revoke all on public.community_messages from anon,authenticated;
  end if;
  if to_regclass('public.community_reports') is not null then
    for p in select policyname from pg_policies where schemaname='public' and tablename='community_reports' loop
      execute format('drop policy if exists %I on public.community_reports',p.policyname);
    end loop;
    revoke all on public.community_reports from anon,authenticated;
  end if;
end $$;

create table if not exists public.community_servers (
  id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 2 and 32),
  owner_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
create table if not exists public.community_server_members (
  server_id uuid not null references public.community_servers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(char_length(display_name) between 1 and 24),
  role text not null default 'member' check(role in ('owner','moderator','member')),
  joined_at timestamptz not null default now(), primary key(server_id,user_id)
);
create table if not exists public.community_channels (
  id uuid primary key default gen_random_uuid(), server_id uuid not null references public.community_servers(id) on delete cascade,
  name text not null check(name ~ '^[a-z0-9][a-z0-9-]{0,19}$'), description text not null default '' check(char_length(description)<=120),
  position integer not null default 0, created_at timestamptz not null default now(), unique(server_id,name)
);
create table if not exists public.community_server_messages (
  id uuid primary key default gen_random_uuid(), server_id uuid not null references public.community_servers(id) on delete cascade,
  channel_id uuid not null references public.community_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null check(char_length(author) between 1 and 24), body text not null check(char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists community_server_messages_channel_created_idx on public.community_server_messages(channel_id,created_at desc);
create table if not exists public.community_server_invites (
  id uuid primary key default gen_random_uuid(), server_id uuid not null references public.community_servers(id) on delete cascade,
  token_hash text not null unique check(char_length(token_hash)=64), created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  max_uses integer not null default 30 check(max_uses between 1 and 30), uses integer not null default 0 check(uses>=0), revoked_at timestamptz
);
create table if not exists public.community_server_reports (
  id uuid primary key default gen_random_uuid(), server_id uuid not null references public.community_servers(id) on delete cascade,
  message_id uuid not null references public.community_server_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Please review this message', created_at timestamptz not null default now(), unique(message_id,reporter_id)
);

-- Membership helpers are SECURITY DEFINER so RLS can check membership without recursion.
create or replace function public.is_server_member(s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_server_members m where m.server_id=s and m.user_id=(select auth.uid())); $$;
create or replace function public.has_server_role(s uuid, roles text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_server_members m where m.server_id=s and m.user_id=(select auth.uid()) and m.role=any(roles)); $$;
create or replace function public.server_channel_matches(c uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_channels x where x.id=c and x.server_id=s); $$;
create or replace function public.server_member_name_matches(s uuid,u uuid,n text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_server_members m where m.server_id=s and m.user_id=u and m.display_name=n); $$;
create or replace function public.server_message_matches(mid uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_server_messages m where m.id=mid and m.server_id=s); $$;

create or replace function public.create_community_server(p_name text,p_display_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; n text:=btrim(p_name); d text:=btrim(p_display_name);
begin
 if uid is null then raise exception 'Sign in first.'; end if;
 if char_length(n)<2 or char_length(n)>32 then raise exception 'Server name must be 2 to 32 characters.'; end if;
 if char_length(d)<1 or char_length(d)>24 then raise exception 'Display name must be 1 to 24 characters.'; end if;
 insert into public.community_servers(name,owner_id) values(n,uid) returning id into sid;
 insert into public.community_server_members(server_id,user_id,display_name,role) values(sid,uid,d,'owner');
 insert into public.community_channels(server_id,name,description,position) values
 (sid,'general','The place for a little bit of everything.',0),(sid,'game-talk','What are you playing?',1),(sid,'help','Friendly setup help.',2);
 return sid;
end; $$;

create or replace function public.create_community_invite(s uuid,h text,uses_limit integer default 30) returns uuid
language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
 if not public.has_server_role(s,array['owner','moderator']) then raise exception 'Only owners and moderators can create invites.'; end if;
 if char_length(h)<>64 or uses_limit<1 or uses_limit>30 then raise exception 'Invite details are invalid.'; end if;
 insert into public.community_server_invites(server_id,token_hash,created_by,expires_at,max_uses)
 values(s,h,auth.uid(),now()+interval '7 days',uses_limit) returning id into iid;
 return iid;
end; $$;

create or replace function public.join_community_server(h text,d text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); i public.community_server_invites%rowtype;
begin
 if uid is null then raise exception 'Sign in first.'; end if;
 if char_length(h)<>64 or char_length(btrim(d)) not between 1 and 24 then raise exception 'Invite or display name is invalid.'; end if;
 select * into i from public.community_server_invites where token_hash=h for update;
 if not found or i.revoked_at is not null or i.expires_at<=now() or i.uses>=i.max_uses then raise exception 'Invite is expired, full, or inactive.'; end if;
 if exists(select 1 from public.community_server_members where server_id=i.server_id and user_id=uid) then return i.server_id; end if;
 update public.community_server_invites set uses=uses+1 where id=i.id;
 insert into public.community_server_members(server_id,user_id,display_name,role) values(i.server_id,uid,btrim(d),'member');
 return i.server_id;
end; $$;

create or replace function public.set_community_member_role(s uuid,u uuid,r text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_server_role(s,array['owner']) then raise exception 'Only the owner can change roles.'; end if;
 if r not in ('moderator','member') then raise exception 'Choose Moderator or Member.'; end if;
 update public.community_server_members set role=r where server_id=s and user_id=u and role<>'owner';
 if not found or u=auth.uid() then raise exception 'Choose another member; the owner cannot change their own role.'; end if;
end; $$;

create or replace function public.remove_community_member(s uuid,u uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor text; target text;
begin
 select role into actor from public.community_server_members where server_id=s and user_id=auth.uid();
 select role into target from public.community_server_members where server_id=s and user_id=u;
 if actor not in ('owner','moderator') then raise exception 'Only staff can remove members.'; end if;
 if target is null or target='owner' or u=auth.uid() or (actor='moderator' and target<>'member') then raise exception 'You cannot remove that member.'; end if;
 delete from public.community_server_members where server_id=s and user_id=u;
end; $$;

create or replace function public.create_community_channel(s uuid,n text,d text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; safe_name text:=lower(btrim(n));
begin
 if not public.has_server_role(s,array['owner','moderator']) then raise exception 'Only staff can add channels.'; end if;
 if safe_name !~ '^[a-z0-9][a-z0-9-]{0,19}$' then raise exception 'Use 1 to 20 lowercase letters, numbers, or hyphens.'; end if;
 insert into public.community_channels(server_id,name,description,position)
 values(s,safe_name,left(btrim(d),120),coalesce((select max(position)+1 from public.community_channels where server_id=s),0)) returning id into cid;
 return cid;
end; $$;

create or replace function public.remove_community_channel(s uuid,c uuid) returns void
language plpgsql security definer set search_path='' as $$
declare channel_name text;
begin
 if not public.has_server_role(s,array['owner','moderator']) then raise exception 'Only staff can remove channels.'; end if;
 select name into channel_name from public.community_channels where id=c and server_id=s;
 if channel_name is null then raise exception 'Channel not found.'; end if;
 if channel_name='general' then raise exception 'The general channel stays in the server.'; end if;
 delete from public.community_channels where id=c and server_id=s;
end; $$;

create or replace function public.revoke_community_invite(s uuid,i uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_server_role(s,array['owner','moderator']) then raise exception 'Only staff can revoke invites.'; end if;
 update public.community_server_invites set revoked_at=now() where id=i and server_id=s;
 if not found then raise exception 'Invite not found.'; end if;
end; $$;

-- Only expose the chat RPCs to signed-in guest accounts; do not change other public functions.
revoke execute on function public.is_server_member(uuid),public.has_server_role(uuid,text[]),public.server_channel_matches(uuid,uuid),public.server_member_name_matches(uuid,uuid,text),public.server_message_matches(uuid,uuid),public.create_community_server(text,text),public.create_community_invite(uuid,text,integer),public.join_community_server(text,text),public.set_community_member_role(uuid,uuid,text),public.remove_community_member(uuid,uuid),public.create_community_channel(uuid,text,text),public.remove_community_channel(uuid,uuid),public.revoke_community_invite(uuid,uuid) from public,anon;
grant execute on function public.is_server_member(uuid),public.has_server_role(uuid,text[]),public.server_channel_matches(uuid,uuid),public.server_member_name_matches(uuid,uuid,text),public.server_message_matches(uuid,uuid) to authenticated;
grant execute on function public.create_community_server(text,text),public.create_community_invite(uuid,text,integer),public.join_community_server(text,text),public.set_community_member_role(uuid,uuid,text),public.remove_community_member(uuid,uuid),public.create_community_channel(uuid,text,text),public.remove_community_channel(uuid,uuid),public.revoke_community_invite(uuid,uuid) to authenticated;

alter table public.community_servers enable row level security;
alter table public.community_server_members enable row level security;
alter table public.community_channels enable row level security;
alter table public.community_server_messages enable row level security;
alter table public.community_server_invites enable row level security;
alter table public.community_server_reports enable row level security;

drop policy if exists "Server members read their servers" on public.community_servers;
create policy "Server members read their servers" on public.community_servers for select to authenticated using((select public.is_server_member(id)));
drop policy if exists "Server members read roster" on public.community_server_members;
create policy "Server members read roster" on public.community_server_members for select to authenticated using((select public.is_server_member(server_id)));
drop policy if exists "Server members read channels" on public.community_channels;
create policy "Server members read channels" on public.community_channels for select to authenticated using((select public.is_server_member(server_id)));
drop policy if exists "Server members read messages" on public.community_server_messages;
create policy "Server members read messages" on public.community_server_messages for select to authenticated using((select public.is_server_member(server_id)));
drop policy if exists "Members post as themselves" on public.community_server_messages;
create policy "Members post as themselves" on public.community_server_messages for insert to authenticated with check(
 user_id=(select auth.uid()) and (select public.is_server_member(server_id))
 and (select public.server_channel_matches(channel_id,server_id))
 and (select public.server_member_name_matches(server_id,user_id,author))
);
drop policy if exists "Authors and moderators delete messages" on public.community_server_messages;
create policy "Authors and moderators delete messages" on public.community_server_messages for delete to authenticated
 using(user_id=(select auth.uid()) or (select public.has_server_role(server_id,array['owner','moderator'])));
drop policy if exists "Staff read invites" on public.community_server_invites;
create policy "Staff read invites" on public.community_server_invites for select to authenticated using((select public.has_server_role(server_id,array['owner','moderator'])));
drop policy if exists "Members create reports" on public.community_server_reports;
create policy "Members create reports" on public.community_server_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and (select public.is_server_member(server_id)) and (select public.server_message_matches(message_id,server_id)));
drop policy if exists "Staff read reports" on public.community_server_reports;
create policy "Staff read reports" on public.community_server_reports for select to authenticated using((select public.has_server_role(server_id,array['owner','moderator'])));
drop policy if exists "Staff clear reports" on public.community_server_reports;
create policy "Staff clear reports" on public.community_server_reports for delete to authenticated using((select public.has_server_role(server_id,array['owner','moderator'])));

revoke all on public.community_servers,public.community_server_members,public.community_channels,public.community_server_messages,public.community_server_invites,public.community_server_reports from anon;
grant select on public.community_servers,public.community_server_members,public.community_channels,public.community_server_invites,public.community_server_reports to authenticated;
grant select,insert,delete on public.community_server_messages to authenticated;
grant insert on public.community_server_reports to authenticated;
grant delete on public.community_server_reports to authenticated;

do $$
declare t text;
begin
 foreach t in array array['community_server_messages','community_server_members','community_channels'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
     execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
 end loop;
end $$;
