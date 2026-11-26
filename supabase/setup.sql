-- 厦门纪行 V3.0。可整份重复运行。仅供项目管理员在 SQL Editor 执行。
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists xm_private;
revoke all on schema xm_private from public, anon, authenticated;

create table if not exists xm_private.launch (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into xm_private.launch(singleton) values (true) on conflict do nothing;

create table if not exists public.xm_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  updated_at timestamptz not null default now()
);
create table if not exists public.xm_trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists public.xm_members (
  trip_id uuid not null references public.xm_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','editor','viewer')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(trip_id,user_id)
);
create unique index if not exists xm_one_owner on public.xm_members(trip_id) where active and role='owner';
create index if not exists xm_members_account on public.xm_members(user_id,active,trip_id);
create table if not exists public.xm_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.xm_trips(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash)=32),
  role text not null check (role in ('editor','viewer')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users(id),
  check (expires_at > created_at and (used_at is null)=(used_by is null))
);
create index if not exists xm_invites_trip on public.xm_invites(trip_id,created_at desc);
create table if not exists public.xm_records (
  trip_id uuid not null references public.xm_trips(id) on delete cascade,
  kind text not null check (kind in ('expense','checkin','favorite','photo','gift','setting','itinerary','place','food','note')),
  record_id text not null check (record_id ~ '^[a-z0-9][a-z0-9:-]{0,115}$'),
  body jsonb check (body is null or (jsonb_typeof(body)='object' and octet_length(body::text)<=12000)),
  version integer not null check(version>0),
  actor uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(trip_id,kind,record_id)
);
create index if not exists xm_expense_import_match on public.xm_records(trip_id,md5((body-'payer_id')::text))
  where kind='expense' and body is not null;
create table if not exists public.xm_operations (
  trip_id uuid not null references public.xm_trips(id) on delete cascade,
  op_id uuid not null,
  actor uuid not null references auth.users(id),
  fingerprint bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(trip_id,op_id)
);
-- Realtime only publishes a revision or the subscriber's own membership row.
create table if not exists public.xm_signals (
  trip_id uuid primary key references public.xm_trips(id) on delete cascade,
  revision bigint not null default 0 check (revision>=0),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['xm_profiles','xm_trips','xm_members','xm_invites','xm_records','xm_operations','xm_signals']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
  end loop;
end $$;
alter table xm_private.launch enable row level security;
revoke all on xm_private.launch from public, anon, authenticated;

create or replace function xm_private.enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select enabled from xm_private.launch where singleton
$$;

create or replace function xm_private.trip_role(p_trip uuid) returns text
language sql stable security definer set search_path='' as $$
  select role from public.xm_members where trip_id=p_trip and user_id=auth.uid() and active
$$;

create or replace function xm_private.authorize(p_trip uuid,p_roles text[],p_lock boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not xm_private.enabled() or
     (p_roles is not null and (p_trip is null or not coalesce(xm_private.trip_role(p_trip)=any(p_roles),false))) then
    raise exception '旅行空间无访问权限' using errcode='42501';
  end if;
  if p_trip is not null and p_lock then
    perform 1 from public.xm_trips where id=p_trip for update;
    if not coalesce(xm_private.trip_role(p_trip)=any(p_roles),false) then
      raise exception '旅行空间无访问权限' using errcode='42501';
    end if;
  end if;
  return v_user;
end $$;

revoke all on all functions in schema xm_private from public, anon, authenticated;
-- Policies run this qualified helper, but the private schema remains inaccessible.
grant execute on function xm_private.enabled(),xm_private.trip_role(uuid) to authenticated;
grant select on public.xm_members,public.xm_signals to authenticated;
drop policy if exists xm_self_membership on public.xm_members;
create policy xm_self_membership on public.xm_members for select to authenticated
  using (user_id=(select auth.uid()) and (select xm_private.enabled()));
drop policy if exists xm_room_signal on public.xm_signals;
create policy xm_room_signal on public.xm_signals for select to authenticated
  using ((select xm_private.enabled()) and xm_private.trip_role(trip_id) is not null);

create or replace function xm_private.signal(p_trip uuid) returns void
language sql security invoker set search_path='' as $$
  update public.xm_signals set revision=revision+1, updated_at=clock_timestamp() where trip_id=p_trip
$$;

create or replace function public.xm_capabilities() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('schema',3,'enabled',xm_private.enabled())
$$;

create or replace function public.xm_profile(p_nickname text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid := xm_private.authorize(null,null);
begin
  insert into public.xm_profiles(user_id,nickname) values(v_user,btrim(p_nickname))
    on conflict(user_id) do update set nickname=excluded.nickname,updated_at=clock_timestamp();
  -- Refresh teammates through polling rather than locking every room a user belongs to.
end $$;

create or replace function public.xm_list() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid;
begin
  if auth.uid() is null or not xm_private.enabled() then raise exception '未授权' using errcode='42501'; end if;
  v_user := auth.uid();
  return jsonb_build_object('nickname',(select nickname from public.xm_profiles where user_id=v_user),
    'trips',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'role',m.role) order by t.created_at)
       from public.xm_members m join public.xm_trips t on t.id=m.trip_id
       where m.user_id=v_user and m.active),'[]'::jsonb));
end $$;

create or replace function public.xm_create(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid := xm_private.authorize(null,null); v_trip uuid;
begin
  insert into public.xm_trips(name) values (btrim(p_name)) returning id into v_trip;
  insert into public.xm_members(trip_id,user_id,role) values(v_trip,v_user,'owner');
  insert into public.xm_signals(trip_id) values(v_trip);
  return v_trip;
end $$;

create or replace function public.xm_rename(p_trip uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform xm_private.authorize(p_trip,array['owner'],true);
  update public.xm_trips set name=btrim(p_name) where id=p_trip;
  perform xm_private.signal(p_trip);
end $$;

create or replace function public.xm_invite(p_trip uuid,p_role text,p_hours integer default 24) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid := xm_private.authorize(p_trip,array['owner'],true);
  v_token text := encode(extensions.gen_random_bytes(32),'hex'); v_id uuid; v_expiry timestamptz;
begin
  if p_hours is null or p_hours not between 1 and 168 or p_role is null or p_role not in ('editor','viewer') then
    raise exception '邀请设置无效' using errcode='22023';
  end if;
  v_expiry := clock_timestamp()+make_interval(hours=>p_hours);
  insert into public.xm_invites(trip_id,token_hash,role,created_by,expires_at)
    values(p_trip,extensions.digest(v_token,'sha256'),p_role,v_user,v_expiry) returning id into v_id;
  return jsonb_build_object('id',v_id,'token',v_token,'expires_at',v_expiry);
end $$;

create or replace function public.xm_invite_list(p_trip uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform xm_private.authorize(p_trip,array['owner']);
  return coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from
    (select id,role,created_at,expires_at,revoked_at,used_at from public.xm_invites
     where trip_id=p_trip order by created_at desc limit 50) i),'[]'::jsonb);
end $$;

create or replace function public.xm_revoke_invite(p_trip uuid,p_invite uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform xm_private.authorize(p_trip,array['owner'],true);
  update public.xm_invites set revoked_at=clock_timestamp()
    where trip_id=p_trip and id=p_invite and revoked_at is null and used_at is null;
end $$;

create or replace function public.xm_join(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid := xm_private.authorize(null,null);
  v_hash bytea; v_trip uuid; v_invite public.xm_invites%rowtype;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception '邀请无效或已失效' using errcode='22023'; end if;
  v_hash := extensions.digest(p_token,'sha256');
  select trip_id into v_trip from public.xm_invites where token_hash=v_hash;
  if not found then raise exception '邀请无效或已失效' using errcode='22023'; end if;
  perform 1 from public.xm_trips where id=v_trip for update;
  select * into v_invite from public.xm_invites where token_hash=v_hash for update;
  if not found or v_invite.revoked_at is not null or v_invite.used_at is not null or
    v_invite.expires_at <= clock_timestamp() then
    raise exception '邀请无效或已失效' using errcode='22023';
  end if;
  if xm_private.trip_role(v_trip) is not null then raise exception '你已是房间成员' using errcode='22023'; end if;
  if exists(select 1 from public.xm_members where trip_id=v_trip and user_id=v_user and not active
      and updated_at>=v_invite.created_at) then
    raise exception '请向房主获取新的邀请' using errcode='22023';
  end if;
  insert into public.xm_members(trip_id,user_id,role) values(v_trip,v_user,v_invite.role)
    on conflict(trip_id,user_id) do update set role=excluded.role,active=true,joined_at=clock_timestamp(),updated_at=clock_timestamp();
  update public.xm_invites set used_at=clock_timestamp(),used_by=v_user where id=v_invite.id;
  perform xm_private.signal(v_trip);
  return v_trip;
end $$;

create or replace function public.xm_member(p_trip uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare v_owner uuid := xm_private.authorize(p_trip,array['owner'],true);
begin
  if p_user is null or p_user=v_owner or (p_role is not null and p_role not in ('editor','viewer','owner')) then
    raise exception '成员操作无效' using errcode='22023';
  end if;
  if not exists(select 1 from public.xm_members where trip_id=p_trip and user_id=p_user and active) then
    raise exception '成员不存在' using errcode='22023';
  end if;
  if p_role='owner' then
    update public.xm_members set role='editor',updated_at=clock_timestamp() where trip_id=p_trip and user_id=v_owner;
  end if;
  update public.xm_members set role=coalesce(p_role,role),active=p_role is not null,updated_at=clock_timestamp()
    where trip_id=p_trip and user_id=p_user;
  perform xm_private.signal(p_trip);
end $$;

create or replace function public.xm_leave(p_trip uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid := xm_private.authorize(p_trip,array['editor','viewer'],true);
begin
  update public.xm_members set active=false,updated_at=clock_timestamp() where trip_id=p_trip and user_id=v_actor;
  perform xm_private.signal(p_trip);
end $$;

create or replace function public.xm_snapshot(p_trip uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text := xm_private.trip_role(p_trip);
begin
  if auth.uid() is null or not xm_private.enabled() or v_role is null then
    raise exception '旅行空间无访问权限' using errcode='42501';
  end if;
  return jsonb_build_object(
    'revision', (select revision from public.xm_signals where trip_id=p_trip),
    'trip', (select jsonb_build_object('id',id,'name',name,'role',v_role) from public.xm_trips where id=p_trip),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'nickname',coalesce(p.nickname,'旅行成员'),'role',m.role,'active',m.active) order by m.joined_at)
      from public.xm_members m left join public.xm_profiles p on p.user_id=m.user_id where m.trip_id=p_trip),'[]'::jsonb),
    'records',coalesce((select jsonb_agg(to_jsonb(r)-'trip_id' order by r.kind,r.record_id)
      from public.xm_records r where r.trip_id=p_trip),'[]'::jsonb));
end $$;

create or replace function xm_private.string_field(p_body jsonb,p_field text,p_max integer) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_typeof(p_body->p_field)='string' and char_length(p_body->>p_field)<=p_max,false)
$$;

create or replace function xm_private.integer_field(p_body jsonb,p_field text,p_min bigint,p_max bigint) returns boolean
language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(p_body->p_field)='number' then
    (p_body->>p_field)::numeric between p_min and p_max and trunc((p_body->>p_field)::numeric)=(p_body->>p_field)::numeric
    else false end
$$;

create or replace function xm_private.valid_record(p_kind text,p_id text,b jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare count_keys integer;
begin
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9:-]{0,115}$' or
     jsonb_typeof(b) is distinct from 'object' or octet_length(b::text)>12000 then return false; end if;
  select count(*) into count_keys from jsonb_object_keys(b);
  return coalesce(case p_kind
    when 'expense' then p_id ~ '^[a-z0-9][a-z0-9-]{0,99}$' and count_keys=8 and
      xm_private.string_field(b,'date',10) and (b->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and
      (b->>'date')::date between date '2000-01-01' and date '2100-01-01' and
      xm_private.integer_field(b,'cents',1,1000000000) and
      (b->>'category') in ('高铁','酒店','打车','地铁','轮渡','门票','正餐','小吃','奶茶与咖啡','特产','购物','纪念日','其他') and
      xm_private.string_field(b,'title',120) and char_length(btrim(b->>'title'))>0 and xm_private.string_field(b,'notes',500) and
      jsonb_typeof(b->'shared')='boolean' and xm_private.string_field(b,'payer',60) and
      (b->'payer_id'='null'::jsonb or (b->>'payer_id') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
    when 'checkin' then p_id ~ '^(places|food):[a-z0-9][a-z0-9-]{0,99}$' and count_keys=1 and
      (b->>'status') in ('pending','done','skipped')
    when 'favorite' then p_id ~ '^(places|food|photo):[a-z0-9][a-z0-9-]{0,99}$' and count_keys=1 and jsonb_typeof(b->'favorite')='boolean'
    when 'photo' then count_keys=1 and jsonb_typeof(b->'taken')='boolean'
    when 'gift' then p_id in ('sponge','toast','bread') and count_keys=2 and jsonb_typeof(b->'bought')='boolean' and
      (b->'cents'='null'::jsonb or xm_private.integer_field(b,'cents',0,1000000000))
    when 'setting' then case p_id
      when 'budget' then count_keys=1 and (b->'cents'='null'::jsonb or xm_private.integer_field(b,'cents',0,1000000000))
      when 'size' then count_keys=1 and xm_private.integer_field(b,'count',1,1000)
      when 'travel' then count_keys=8 and xm_private.string_field(b,'hotel',100) and xm_private.string_field(b,'address',200) and
        xm_private.string_field(b,'arrivalService',100) and xm_private.string_field(b,'departureService',100) and
        xm_private.string_field(b,'arrivalTime',5) and (b->>'arrivalTime') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9])?$' and
        xm_private.string_field(b,'departureTime',5) and (b->>'departureTime') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9])?$' and
        (b->>'ferryArrival') in ('','sanqiutian') and xm_private.string_field(b,'notes',1000)
      else false end
    when 'itinerary' then p_id='order' and count_keys=1 and jsonb_typeof(b->'order')='array' and
      (b->'order') @> '["jimei","coast","gulangyu"]'::jsonb and (b->'order') <@ '["jimei","coast","gulangyu"]'::jsonb and
      case when jsonb_typeof(b->'order')='array' then jsonb_array_length(b->'order')=3 else false end
    when 'place' then p_id ~ '^custom-place-[a-z0-9-]+$' and char_length(p_id)<=100 and
      count_keys=5 and xm_private.string_field(b,'name',100) and char_length(btrim(b->>'name'))>0 and xm_private.string_field(b,'region',100) and
      xm_private.string_field(b,'address',200) and (b->>'moduleId') in ('','arrival','jimei','coast','gulangyu','departure') and xm_private.string_field(b,'summary',500)
    when 'food' then p_id ~ '^custom-food-[a-z0-9-]+$' and char_length(p_id)<=100 and
      count_keys=5 and xm_private.string_field(b,'name',100) and char_length(btrim(b->>'name'))>0 and xm_private.string_field(b,'region',100) and
      xm_private.string_field(b,'address',200) and (b->>'moduleId') in ('','arrival','jimei','coast','gulangyu','departure') and xm_private.string_field(b,'recommended',500)
    when 'note' then count_keys=2 and xm_private.string_field(b,'text',1000) and xm_private.string_field(b,'place',100)
    else false end,false);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;

create or replace function xm_private.prior_operation(p_trip uuid,p_op uuid,p_actor uuid,p_fingerprint bytea) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.xm_operations%rowtype;
begin
  if p_op is null then raise exception '操作编号无效' using errcode='22023'; end if;
  select * into previous from public.xm_operations where trip_id=p_trip and op_id=p_op;
  if not found then return null; end if;
  if previous.actor<>p_actor or previous.fingerprint<>p_fingerprint then
    raise exception '操作编号已被使用' using errcode='22023';
  end if;
  return previous.result;
end $$;

create or replace function public.xm_apply(p_trip uuid,p_op uuid,p_kind text,p_record text,p_expected integer,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid := xm_private.authorize(p_trip,array['owner','editor'],true);
  v_fingerprint bytea := extensions.digest(jsonb_build_array('apply',p_kind,p_record,p_expected,p_body)::text,'sha256');
  v_result jsonb; v_row public.xm_records%rowtype;
begin
  if p_trip is null or p_expected is null or p_expected<0 or p_kind not in
    ('expense','checkin','favorite','photo','gift','setting','itinerary','place','food','note') or
    p_kind is null or p_record is null or p_record !~ '^[a-z0-9][a-z0-9:-]{0,115}$' or
    (p_body is not null and not xm_private.valid_record(p_kind,p_record,p_body)) then
    raise exception '旅行记录格式无效' using errcode='22023';
  end if;
  v_result:=xm_private.prior_operation(p_trip,p_op,v_actor,v_fingerprint);
  if v_result is not null then return v_result; end if;
  select * into v_row from public.xm_records where trip_id=p_trip and kind=p_kind and record_id=p_record;
  if coalesce(v_row.version,0)<>p_expected then
    return jsonb_build_object('status','conflict','record',case when v_row.version is not null then to_jsonb(v_row)-'trip_id' else null end);
  end if;
  if p_kind='expense' and p_body->>'payer_id' is not null and
     (p_body->>'payer_id') is distinct from (v_row.body->>'payer_id') and not exists(
      select 1 from public.xm_members where trip_id=p_trip and active and user_id=(p_body->>'payer_id')::uuid
     ) then raise exception '付款成员不属于此房间' using errcode='22023'; end if;
  insert into public.xm_records(trip_id,kind,record_id,body,version,actor)
    values(p_trip,p_kind,p_record,p_body,p_expected+1,v_actor)
    on conflict(trip_id,kind,record_id) do update
      set body=excluded.body,version=excluded.version,actor=excluded.actor,updated_at=clock_timestamp()
    returning * into v_row;
  v_result:=jsonb_build_object('status','applied','record',to_jsonb(v_row)-'trip_id');
  insert into public.xm_operations values(p_trip,p_op,v_actor,v_fingerprint,v_result);
  perform xm_private.signal(p_trip);
  return v_result;
end $$;

create or replace function public.xm_import(p_trip uuid,p_op uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid := xm_private.authorize(p_trip,array['owner','editor'],true);
  v_hash bytea := extensions.digest(jsonb_build_array('import',p_rows)::text,'sha256');
  v_result jsonb; row_data jsonb; k text; rid text; b jsonb; existing public.xm_records%rowtype;
  applied_count integer:=0; expense_count integer:=0; expense_cents bigint:=0;
  matched_count integer:=0; matched_cents bigint:=0;
  requested_count integer:=0; requested_cents bigint:=0; conflicts jsonb:='[]'::jsonb;
  new_expenses text[]:='{}';
begin
  if p_trip is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception '导入内容格式无效' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows)>16000 or octet_length(p_rows::text)>9500000 then
    raise exception '导入内容过大' using errcode='22023';
  end if;
  v_result:=xm_private.prior_operation(p_trip,p_op,v_actor,v_hash);
  if v_result is not null then return v_result; end if;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    k:=row_data->>'kind'; rid:=row_data->>'record_id'; b:=row_data->'body';
    if not xm_private.valid_record(k,rid,b) or (k='expense' and b->>'payer_id' is not null) then
      raise exception '导入记录格式无效' using errcode='22023';
    end if;
    if k='expense' then requested_count:=requested_count+1; requested_cents:=requested_cents+(b->>'cents')::numeric::bigint; end if;
    select * into existing from public.xm_records where trip_id=p_trip and kind=k and record_id=rid;
    if found then
      if existing.body is distinct from b and
        (k<>'expense' or (existing.body-'payer_id') is distinct from (b-'payer_id')) then
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',k,'record_id',rid));
      elsif k='expense' then
        matched_count:=matched_count+1; matched_cents:=matched_cents+(b->>'cents')::numeric::bigint;
      end if;
      continue;
    end if;
    -- Same details with a different ID are flagged for manual review, never silently collapsed.
    if k='expense' and exists(select 1 from public.xm_records where trip_id=p_trip and kind='expense' and body is not null and not (record_id=any(new_expenses))
      and md5((body-'payer_id')::text)=md5((b-'payer_id')::text) and (body-'payer_id')=(b-'payer_id')) then
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',k,'record_id',rid,'reason','same_details'));
      continue;
    end if;
    insert into public.xm_records(trip_id,kind,record_id,body,version,actor) values(p_trip,k,rid,b,1,v_actor);
    applied_count:=applied_count+1;
    if k='expense' then
      new_expenses:=array_append(new_expenses,rid);
      expense_count:=expense_count+1; expense_cents:=expense_cents+(b->>'cents')::numeric::bigint;
    end if;
  end loop;
  v_result:=jsonb_build_object('status','imported','records_added',applied_count,
    'expenses_requested',requested_count,'cents_requested',requested_cents,
    'expenses_added',expense_count,'cents_added',expense_cents,'expenses_matched',matched_count,'cents_matched',matched_cents,'conflicts',conflicts);
  insert into public.xm_operations values(p_trip,p_op,v_actor,v_hash,v_result);
  if applied_count>0 then perform xm_private.signal(p_trip); end if;
  return v_result;
end $$;

revoke all on all functions in schema xm_private from public, anon, authenticated;
grant execute on function xm_private.enabled(),xm_private.trip_role(uuid) to authenticated;
do $$
declare signature text;
begin
  foreach signature in array array[
    'xm_capabilities()', 'xm_profile(text)', 'xm_list()', 'xm_create(text)', 'xm_rename(uuid,text)',
    'xm_invite(uuid,text,integer)', 'xm_invite_list(uuid)', 'xm_revoke_invite(uuid,uuid)', 'xm_join(text)',
    'xm_member(uuid,uuid,text)', 'xm_leave(uuid)', 'xm_snapshot(uuid)',
    'xm_apply(uuid,uuid,text,text,integer,jsonb)', 'xm_import(uuid,uuid,jsonb)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public, anon, authenticated';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
-- The anonymous capability check reveals only the schema version and launch switch.
grant execute on function public.xm_capabilities() to anon;

do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime' and puballtables) then
    raise exception 'supabase_realtime must not publish all tables';
  end if;
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['xm_members','xm_signals'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
      and tablename in ('xm_profiles','xm_trips','xm_invites','xm_records','xm_operations')) then
    raise exception 'Remove private V3 tables from supabase_realtime before setup';
  end if;
  if exists(
    select 1 from pg_class c join pg_namespace n on c.relnamespace=n.oid
    where n.nspname='public' and c.relname in ('xm_profiles','xm_trips','xm_members','xm_invites','xm_records','xm_operations','xm_signals')
      and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
        or has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
        or (c.relname not in ('xm_members','xm_signals') and has_table_privilege('authenticated',c.oid,'SELECT')))
  ) then raise exception 'V3 RLS/grant verification failed'; end if;
  if has_function_privilege('anon','public.xm_snapshot(uuid)','EXECUTE') then
    raise exception 'Anonymous access verification failed';
  end if;
end $$;
commit;

-- 上线开关默认关闭。权限验证通过后由管理员在 SQL Editor 单独执行下面一行。
-- update xm_private.launch set enabled=true where singleton;
select public.xm_capabilities() as xiamen_v3_status;
