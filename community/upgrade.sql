-- Additive Arcade Atlas Community upgrade. Preserves existing servers and messages.
alter table public.community_server_members
  add column if not exists bio text not null default '' check (char_length(bio) <= 160),
  add column if not exists avatar_path text not null default '',
  add column if not exists avatar_color text not null default '#c9ee8f',
  add column if not exists custom_role_id uuid;
alter table public.community_channels add column if not exists category text not null default 'TEXT';
alter table public.community_server_messages
 add column if not exists reply_to uuid references public.community_server_messages(id) on delete set null,
 add column if not exists attachment_path text not null default '',
 add column if not exists attachment_name text not null default '';
alter table public.community_server_messages replica identity full;

create table if not exists public.community_server_roles (
 id uuid primary key default gen_random_uuid(),
 server_id uuid not null references public.community_servers(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 24),
 color text not null default '#9fc98c' check(color ~ '^#[0-9a-fA-F]{6}$'),
 position integer not null check(position between 1 and 999),
 permissions jsonb not null default '{}'::jsonb check(jsonb_typeof(permissions)='object'),
 created_at timestamptz not null default now(),
 unique(server_id,name), unique(server_id,position)
);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='community_server_members_custom_role_fk') then
  alter table public.community_server_members add constraint community_server_members_custom_role_fk foreign key(custom_role_id) references public.community_server_roles(id) on delete set null;
 end if;
end $$;
create table if not exists public.community_server_reactions (
 message_id uuid not null references public.community_server_messages(id) on delete cascade,
 server_id uuid not null references public.community_servers(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 emoji text not null check(char_length(emoji) between 1 and 16),
 created_at timestamptz not null default now(), primary key(message_id,user_id,emoji)
);
create table if not exists public.community_server_pins (
 message_id uuid not null references public.community_server_messages(id) on delete cascade,
 server_id uuid not null references public.community_servers(id) on delete cascade,
 channel_id uuid not null references public.community_channels(id) on delete cascade,
 pinned_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(channel_id,message_id)
);

create or replace function public.community_has_permission(s uuid,p text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.community_server_members m
  left join public.community_server_roles r on r.id=m.custom_role_id and r.server_id=m.server_id
  where m.server_id=s and m.user_id=(select auth.uid()) and (
   m.role='owner' or (m.role='moderator' and p=any(array['manage_channels','create_invite','manage_members','manage_messages','pin_messages']))
   or coalesce((r.permissions->>p)::boolean,false)
  )
 ); $$;
create or replace function public.community_reply_matches(mid uuid,c uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_server_messages m where m.id=mid and m.channel_id=c and m.server_id=s); $$;

create or replace function public.upsert_community_role(s uuid,rid uuid,n text,c text,pos integer,perms jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid; key text;
begin
 if not public.has_server_role(s,array['owner']) then raise exception 'Only the server owner can manage roles.'; end if;
 if char_length(btrim(n)) not between 2 and 24 or c !~ '^#[0-9a-fA-F]{6}$' or pos not between 1 and 999 or jsonb_typeof(perms)<>'object' then raise exception 'Role settings are invalid.'; end if;
 for key in select jsonb_object_keys(perms) loop
  if key not in ('manage_channels','create_invite','manage_members','manage_messages','pin_messages') then raise exception 'Unknown permission.'; end if;
  if jsonb_typeof(perms->key)<>'boolean' then raise exception 'Permissions must be on or off.'; end if;
 end loop;
 if rid is null then
  insert into public.community_server_roles(server_id,name,color,position,permissions) values(s,btrim(n),c,pos,perms) returning id into result_id;
 else
  update public.community_server_roles set name=btrim(n),color=c,position=pos,permissions=perms where id=rid and server_id=s returning id into result_id;
  if result_id is null then raise exception 'Role not found in this server.'; end if;
 end if;
 return result_id;
end; $$;
create or replace function public.delete_community_role(s uuid,rid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_server_role(s,array['owner']) then raise exception 'Only the server owner can manage roles.'; end if;
 delete from public.community_server_roles where id=rid and server_id=s;
 if not found then raise exception 'Role not found.'; end if;
end; $$;
create or replace function public.assign_community_role(s uuid,u uuid,rid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_server_role(s,array['owner']) then raise exception 'Only the server owner can assign roles.'; end if;
 if u=auth.uid() or exists(select 1 from public.community_server_members where server_id=s and user_id=u and role='owner') then raise exception 'The owner role cannot be changed.'; end if;
 if rid is not null and not exists(select 1 from public.community_server_roles where id=rid and server_id=s) then raise exception 'Role not found in this server.'; end if;
 update public.community_server_members set custom_role_id=rid where server_id=s and user_id=u and role<>'owner';
 if not found then raise exception 'Member not found.'; end if;
end; $$;
create or replace function public.set_community_member_role(s uuid,u uuid,r text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_server_role(s,array['owner']) then raise exception 'Only the owner can assign the built-in moderator role.'; end if;
 if r not in ('moderator','member') or u=auth.uid() then raise exception 'Choose another member and a supported role.'; end if;
 update public.community_server_members set role=r,custom_role_id=null where server_id=s and user_id=u and role<>'owner';
 if not found then raise exception 'Member not found.'; end if;
end; $$;
create or replace function public.remove_community_member(s uuid,u uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor_rank integer; target_rank integer;
begin
 if not public.community_has_permission(s,'manage_members') then raise exception 'You do not have permission to manage members.'; end if;
 select case when m.role='owner' then 10000 when m.role='moderator' then 1000 else coalesce(r.position,0) end into actor_rank
 from public.community_server_members m left join public.community_server_roles r on r.id=m.custom_role_id where m.server_id=s and m.user_id=auth.uid();
 select case when m.role='owner' then 10000 when m.role='moderator' then 1000 else coalesce(r.position,0) end into target_rank
 from public.community_server_members m left join public.community_server_roles r on r.id=m.custom_role_id where m.server_id=s and m.user_id=u;
 if target_rank is null or u=auth.uid() or target_rank>=actor_rank then raise exception 'You can only remove members with a lower role than yours.'; end if;
 delete from public.community_server_members where server_id=s and user_id=u;
end; $$;

create or replace function public.create_community_invite(s uuid,h text,uses_limit integer default 30) returns uuid
language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
 if not public.community_has_permission(s,'create_invite') then raise exception 'You do not have permission to create invites.'; end if;
 if char_length(h)<>64 or uses_limit<1 or uses_limit>30 then raise exception 'Invite details are invalid.'; end if;
 insert into public.community_server_invites(server_id,token_hash,created_by,expires_at,max_uses) values(s,h,auth.uid(),now()+interval '7 days',uses_limit) returning id into iid;
 return iid;
end; $$;
drop function if exists public.create_community_channel(uuid,text,text);
drop function if exists public.create_community_channel(uuid,text,text,text);
create function public.create_community_channel(s uuid,n text,d text default '',cat text default 'TEXT') returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; safe_name text:=lower(btrim(n)); safe_category text:=upper(btrim(cat));
begin
 if not public.community_has_permission(s,'manage_channels') then raise exception 'You do not have permission to manage channels.'; end if;
 if safe_name !~ '^[a-z0-9][a-z0-9-]{0,19}$' then raise exception 'Use lowercase letters, numbers, or hyphens.'; end if;
 if safe_category !~ '^[A-Z][A-Z0-9 -]{1,19}$' then raise exception 'Use a category name between 2 and 20 letters.'; end if;
 insert into public.community_channels(server_id,name,description,category,position) values(s,safe_name,left(btrim(d),120),safe_category,coalesce((select max(position)+1 from public.community_channels where server_id=s),0)) returning id into cid;
 return cid;
end; $$;
create or replace function public.remove_community_channel(s uuid,c uuid) returns void
language plpgsql security definer set search_path='' as $$
declare channel_name text;
begin
 if not public.community_has_permission(s,'manage_channels') then raise exception 'You do not have permission to manage channels.'; end if;
 select name into channel_name from public.community_channels where id=c and server_id=s;
 if channel_name is null or channel_name='general' then raise exception 'This channel cannot be removed.'; end if;
 delete from public.community_channels where id=c and server_id=s;
end; $$;

revoke execute on function public.community_has_permission(uuid,text),public.community_reply_matches(uuid,uuid,uuid),public.upsert_community_role(uuid,uuid,text,text,integer,jsonb),public.delete_community_role(uuid,uuid),public.assign_community_role(uuid,uuid,uuid),public.remove_community_member(uuid,uuid),public.create_community_channel(uuid,text,text,text),public.set_community_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.community_has_permission(uuid,text),public.community_reply_matches(uuid,uuid,uuid),public.upsert_community_role(uuid,uuid,text,text,integer,jsonb),public.delete_community_role(uuid,uuid),public.assign_community_role(uuid,uuid,uuid),public.remove_community_member(uuid,uuid),public.create_community_channel(uuid,text,text,text),public.set_community_member_role(uuid,uuid,text) to authenticated;

alter table public.community_server_roles enable row level security;
alter table public.community_server_reactions enable row level security;
alter table public.community_server_pins enable row level security;
drop policy if exists "Members read custom roles" on public.community_server_roles;
create policy "Members read custom roles" on public.community_server_roles for select to authenticated using((select public.is_server_member(server_id)));
drop policy if exists "Members read reactions" on public.community_server_reactions;
create policy "Members read reactions" on public.community_server_reactions for select to authenticated using((select public.is_server_member(server_id)));
drop policy if exists "Members add own reactions" on public.community_server_reactions;
create policy "Members add own reactions" on public.community_server_reactions for insert to authenticated with check(user_id=(select auth.uid()) and (select public.is_server_member(server_id)) and (select public.server_message_matches(message_id,server_id)));
drop policy if exists "Members remove own reactions" on public.community_server_reactions;
create policy "Members remove own reactions" on public.community_server_reactions for delete to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Members read pins" on public.community_server_pins;
create policy "Members read pins" on public.community_server_pins for select to authenticated using((select public.is_server_member(server_id)));
drop policy if exists "Authorized members pin messages" on public.community_server_pins;
create policy "Authorized members pin messages" on public.community_server_pins for insert to authenticated with check(pinned_by=(select auth.uid()) and (select public.community_has_permission(server_id,'pin_messages')) and (select public.community_reply_matches(message_id,channel_id,server_id)));
drop policy if exists "Authorized members unpin messages" on public.community_server_pins;
create policy "Authorized members unpin messages" on public.community_server_pins for delete to authenticated using((select public.community_has_permission(server_id,'pin_messages')));
drop policy if exists "Members post as themselves" on public.community_server_messages;
create policy "Members post as themselves" on public.community_server_messages for insert to authenticated with check(
 user_id=(select auth.uid()) and (select public.is_server_member(server_id))
 and (select public.server_channel_matches(channel_id,server_id))
 and (select public.server_member_name_matches(server_id,user_id,author))
 and (reply_to is null or (select public.community_reply_matches(reply_to,channel_id,server_id)))
 and (attachment_path='' or (split_part(attachment_path,'/',1)=server_id::text and split_part(attachment_path,'/',2)=user_id::text))
);
drop policy if exists "Members update own profile" on public.community_server_members;
create policy "Members update own profile" on public.community_server_members for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and char_length(bio)<=160 and (avatar_path='' or split_part(avatar_path,'/',1)=(select auth.uid()::text)));
drop policy if exists "Authors and permitted moderators delete messages" on public.community_server_messages;
create policy "Authors and permitted moderators delete messages" on public.community_server_messages for delete to authenticated using(user_id=(select auth.uid()) or (select public.community_has_permission(server_id,'manage_messages')));
drop policy if exists "Staff read invites" on public.community_server_invites;
create policy "Staff read invites" on public.community_server_invites for select to authenticated using((select public.community_has_permission(server_id,'create_invite')));

revoke all on public.community_servers,public.community_server_members,public.community_channels,public.community_server_messages,public.community_server_invites,public.community_server_reports,public.community_server_roles,public.community_server_reactions,public.community_server_pins from anon,authenticated;
grant select on public.community_servers,public.community_server_members,public.community_channels,public.community_server_invites,public.community_server_reports to authenticated;
grant select,insert,delete on public.community_server_messages to authenticated;
grant insert,delete on public.community_server_reports to authenticated;
grant select on public.community_server_roles,public.community_server_reactions,public.community_server_pins to authenticated;
grant insert,delete on public.community_server_reactions to authenticated;
grant insert,delete on public.community_server_pins to authenticated;
grant update(display_name,bio,avatar_path,avatar_color) on public.community_server_members to authenticated;

-- Public avatar reads; each guest can upload/delete only inside their own folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community-avatars','community-avatars',true,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
drop policy if exists "Public can view community avatars" on storage.objects;
create policy "Public can view community avatars" on storage.objects for select to public using(bucket_id='community-avatars');
drop policy if exists "Guests upload own community avatar" on storage.objects;
create policy "Guests upload own community avatar" on storage.objects for insert to authenticated with check(bucket_id='community-avatars' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists "Guests delete own community avatar" on storage.objects;
create policy "Guests delete own community avatar" on storage.objects for delete to authenticated using(bucket_id='community-avatars' and (storage.foldername(name))[1]=(select auth.uid()::text));

-- Private server attachments, limited to 5 MB and accessible only to server members.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community-media','community-media',false,5242880,array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain']) on conflict(id) do nothing;
drop policy if exists "Members read server media" on storage.objects;
create policy "Members read server media" on storage.objects for select to authenticated using(bucket_id='community-media' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and public.is_server_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "Members upload own server media" on storage.objects;
create policy "Members upload own server media" on storage.objects for insert to authenticated with check(bucket_id='community-media' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and (storage.foldername(name))[2]=(select auth.uid()::text) and public.is_server_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "Members delete own server media" on storage.objects;
create policy "Members delete own server media" on storage.objects for delete to authenticated using(bucket_id='community-media' and (storage.foldername(name))[2]=(select auth.uid()::text));

do $$ declare t text; begin
 foreach t in array array['community_server_reactions','community_server_pins'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop;
end $$;
notify pgrst, 'reload schema';
