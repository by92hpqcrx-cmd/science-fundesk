-- FunDesk 自訂教學快捷入口：教師私人雲端同步 v1
-- 請在 Supabase SQL Editor 中執行；不影響現有班級資料及原本捷徑。
begin;

create table if not exists public.fundesk_teacher_quicklinks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  links jsonb not null default '[]'::jsonb,
  display_order jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  constraint teacher_quicklinks_array check(jsonb_typeof(links)='array'),
  constraint teacher_quicklinks_order_array check(jsonb_typeof(display_order)='array')
);

alter table public.fundesk_teacher_quicklinks enable row level security;
revoke all on public.fundesk_teacher_quicklinks from public,anon,authenticated;

-- 所有寫入透過 auth.uid() 確定擁有者，並以 revision 防止跨裝置覆蓋。
create or replace function public.fundesk_teacher_quicklinks_get()
returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
 if v_user is null or not (
  exists(select 1 from public.fundesk_access_admin a where a.user_id=v_user)
  or exists(select 1 from public.fundesk_access_roles r where r.user_id=v_user and r.role='teacher')
 ) then
  raise exception '教師權限不足' using errcode='42501';
 end if;
 select jsonb_build_object('links',links,'display_order',display_order,'revision',revision)
 into v_result from public.fundesk_teacher_quicklinks where user_id=v_user;
 return coalesce(v_result,jsonb_build_object('links','[]'::jsonb,'display_order','[]'::jsonb,'revision',0));
end;$$;

create or replace function public.fundesk_teacher_quicklinks_save(
 p_links jsonb,
 p_display_order jsonb,
 p_expected_revision bigint
) returns bigint
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
 v_user uuid:=auth.uid();
 v_current bigint;
 v_count int;
 v_entry jsonb;
 v_id text;
 v_title text;
 v_icon text;
 v_url text;
 v_order_item jsonb;
 v_ids text[] := array[]::text[];
 v_order_ids text[] := array[]::text[];
 v_new bigint;
begin
 if v_user is null or not (
  exists(select 1 from public.fundesk_access_admin a where a.user_id=v_user)
  or exists(select 1 from public.fundesk_access_roles r where r.user_id=v_user and r.role='teacher')
 ) then
  raise exception '教師權限不足' using errcode='42501';
 end if;
 if p_links is null or jsonb_typeof(p_links)<>'array'
    or p_display_order is null or jsonb_typeof(p_display_order)<>'array'
    or p_expected_revision is null or p_expected_revision<0 then
  raise exception '資料格式錯誤' using errcode='22023';
 end if;
 v_count:=jsonb_array_length(p_links);
 if v_count>30 or jsonb_array_length(p_display_order)>80 then
  raise exception '超過自訂連結或排序容量上限' using errcode='22023';
 end if;
 for v_entry in select value from jsonb_array_elements(p_links) loop
  if jsonb_typeof(v_entry)<>'object' then raise exception '連結格式錯誤'; end if;
  v_id:=v_entry->>'id';
  v_title:=v_entry->>'title';
  v_icon:=v_entry->>'icon';
  v_url:=v_entry->>'url';
  if v_id is null or v_id !~ '^custom_[a-z0-9_-]{6,60}$'
    or v_title is null or length(btrim(v_title))=0 or length(v_title)>36
    or v_icon is null or length(v_icon)>8
    or v_url is null or length(v_url)>2048
    or v_url !~* '^https?://[^[:space:]]+$'
    or v_id=any(v_ids) then
   raise exception '連結欄位不符規定或 ID 重複' using errcode='22023';
  end if;
  v_ids:=array_append(v_ids,v_id);
 end loop;
 for v_order_item in select value from jsonb_array_elements(p_display_order) loop
  if jsonb_typeof(v_order_item)<>'string'
    or length(v_order_item #>> '{}')>90
    or length(v_order_item #>> '{}')=0
    or (v_order_item #>> '{}')=any(v_order_ids) then
   raise exception '排序格式錯誤' using errcode='22023';
  end if;
  v_order_ids:=array_append(v_order_ids,v_order_item #>> '{}');
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,910112));
 select revision into v_current from public.fundesk_teacher_quicklinks where user_id=v_user;
 if coalesce(v_current,0)<>p_expected_revision then
  raise exception '資料已由其他裝置更新，請重新載入後再操作' using errcode='40001';
 end if;
 v_new:=p_expected_revision+1;
 insert into public.fundesk_teacher_quicklinks(user_id,links,display_order,revision,updated_at)
 values(v_user,p_links,p_display_order,v_new,now())
 on conflict(user_id) do update set links=excluded.links,
 display_order=excluded.display_order, revision=excluded.revision,updated_at=excluded.updated_at;
 return v_new;
end;$$;

revoke all on function public.fundesk_teacher_quicklinks_get() from public,anon;
revoke all on function public.fundesk_teacher_quicklinks_save(jsonb,jsonb,bigint) from public,anon;
grant execute on function public.fundesk_teacher_quicklinks_get() to authenticated;
grant execute on function public.fundesk_teacher_quicklinks_save(jsonb,jsonb,bigint) to authenticated;

commit;

-- 驗證資料表存在：
-- select to_regclass('public.fundesk_teacher_quicklinks');
