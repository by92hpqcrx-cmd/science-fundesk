-- FunDesk RBAC v1：教師帳戶權限（獨立於既有學生資料表）
-- 必須由 Supabase SQL Editor 以資料庫管理員執行。
-- 注意：建表後仍需以最下方的「初始化管理員」SQL 另行指派唯一管理員。
-- 這個版本不改動 fundesk_teacher_data 的既有 RLS / RPC。
-- 唯一管理員尚未指派前，所有既有教師維持 legacy 權限；資料不受影響。
begin;

create table if not exists public.fundesk_access_admin (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create table if not exists public.fundesk_access_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'restricted' check (role in ('teacher','restricted','disabled')),
  feature_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(feature_overrides)='object')
);
create table if not exists public.fundesk_access_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  target_user_id uuid not null,
  old_settings jsonb,
  new_settings jsonb not null,
  changed_at timestamptz not null default now()
);

alter table public.fundesk_access_admin enable row level security;
alter table public.fundesk_access_roles enable row level security;
alter table public.fundesk_access_audit enable row level security;
revoke all on public.fundesk_access_admin from anon, authenticated;
revoke all on public.fundesk_access_roles from anon, authenticated;
revoke all on public.fundesk_access_audit from anon, authenticated;

create or replace function public.fundesk_access_is_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select auth.uid() is not null and exists (
    select 1 from public.fundesk_access_admin where user_id=auth.uid()
  );
$$;

create or replace function public.fundesk_access_features()
returns jsonb language sql stable security definer
set search_path=pg_catalog,public as $$
  select case when auth.uid() is null then
    jsonb_build_object('role','guest','features','{}'::jsonb)
  when not exists (select 1 from public.fundesk_access_admin) then
    jsonb_build_object('role','legacy','features','{}'::jsonb)
  when public.fundesk_access_is_admin() then
    jsonb_build_object('role','admin','features','{}'::jsonb)
  else
    jsonb_build_object(
      'role',coalesce((select role from public.fundesk_access_roles where user_id=auth.uid()),'restricted'),
      'features',coalesce((select feature_overrides from public.fundesk_access_roles where user_id=auth.uid()),'{}'::jsonb)
    )
  end;
$$;

-- 預設「受限教師」僅開放課堂小工具；一般教師預設開放教學功能，
-- 請由前端依 role + overrides 判斷，不能用作資料庫資料存取唯一保護。
create or replace function public.fundesk_access_list_users()
returns table(user_id uuid, email text, role text, feature_overrides jsonb, updated_at timestamptz)
language plpgsql stable security definer
set search_path=pg_catalog,public as $$
begin
  if not public.fundesk_access_is_admin() then
    raise exception 'permission denied' using errcode='42501';
  end if;
  return query
  select u.id, u.email::text,
    case when a.user_id is not null then 'admin'::text else coalesce(r.role,'restricted'::text) end,
    coalesce(r.feature_overrides,'{}'::jsonb),
    r.updated_at
  from auth.users u
  left join public.fundesk_access_roles r on r.user_id=u.id
  left join public.fundesk_access_admin a on a.user_id=u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.fundesk_access_set_user(
  p_user_id uuid, p_role text, p_overrides jsonb default '{}'::jsonb
)
returns void language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  old_value jsonb;
  allowed_keys text[] := array[
    'seats','labDuty','attendance','tasks','schedule','contact','points',
    'redemption','quiz','students','classroom','tools','tabletRules',
    'classes','settings','rps','personal','sky','socialAdventure','zodiac',
    'starLegends','learnmode','kangxuan','quizace','kahoot','monopoly',
    'petMemory','planetPpt','backup_export','student_delete'
  ];
begin
  if not public.fundesk_access_is_admin() then
    raise exception 'permission denied' using errcode='42501';
  end if;
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'unknown user';
  end if;
  if exists(select 1 from public.fundesk_access_admin where user_id=p_user_id) then
    raise exception 'cannot change administrator';
  end if;
  if p_role not in ('teacher','restricted','disabled') then
    raise exception 'invalid role';
  end if;
  if jsonb_typeof(p_overrides) is distinct from 'object' then
    raise exception 'invalid overrides';
  end if;
  if exists(select 1 from jsonb_each(p_overrides) e
    where e.key <> all(allowed_keys) or jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'invalid feature name or value';
  end if;
  select to_jsonb(r) into old_value from public.fundesk_access_roles r where r.user_id=p_user_id;
  insert into public.fundesk_access_roles(user_id,role,feature_overrides,updated_at)
    values(p_user_id,p_role,p_overrides,now())
    on conflict(user_id) do update
    set role=excluded.role,feature_overrides=excluded.feature_overrides,updated_at=now();
  insert into public.fundesk_access_audit(actor,target_user_id,old_settings,new_settings)
  values(auth.uid(),p_user_id,old_value,jsonb_build_object('role',p_role,'feature_overrides',p_overrides));
end;
$$;

create or replace function public.fundesk_access_history(p_limit int default 50)
returns table(actor uuid,target_user_id uuid,old_settings jsonb,new_settings jsonb,changed_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.fundesk_access_is_admin() then
    raise exception 'permission denied' using errcode='42501';
  end if;
  return query select a.actor,a.target_user_id,a.old_settings,a.new_settings,a.changed_at
  from public.fundesk_access_audit a order by a.id desc limit least(greatest(p_limit,1),100);
end;$$;

revoke all on function public.fundesk_access_is_admin() from public, anon;
revoke all on function public.fundesk_access_features() from public, anon;
revoke all on function public.fundesk_access_list_users() from public, anon;
revoke all on function public.fundesk_access_set_user(uuid,text,jsonb) from public, anon;
revoke all on function public.fundesk_access_history(int) from public, anon;
grant execute on function public.fundesk_access_is_admin() to authenticated;
grant execute on function public.fundesk_access_features() to authenticated;
grant execute on function public.fundesk_access_list_users() to authenticated;
grant execute on function public.fundesk_access_set_user(uuid,text,jsonb) to authenticated;
grant execute on function public.fundesk_access_history(int) to authenticated;
commit;

-- 管理員初始化（與上面建表 SQL 分開執行）：
-- 1. 先用 SELECT id,email FROM auth.users 查出你「目前登入 FunDesk 的教師帳戶」UUID。
-- 2. 核對 UUID 後，將下面的 UUID 字串換成你自己的；執行一次即可。
-- insert into public.fundesk_access_admin (singleton,user_id)
-- values (true,'此處填入你的 Supabase auth.users.id UUID'::uuid);
-- 禁止以一般老師帳號直接呼叫管理員初始化，請只在 SQL Editor 執行。
