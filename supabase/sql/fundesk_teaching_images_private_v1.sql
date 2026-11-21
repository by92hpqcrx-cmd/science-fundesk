-- FunDesk 教學圖片私人雲端庫 v1
-- 請在正式 Supabase SQL Editor 以資料庫管理員執行；依賴 fundesk_access_roles_v1.sql。
-- 每位 admin / teacher 各 20 MiB；所有儲存權限由資料庫 RLS 檢查，不依賴前端。
begin;
create extension if not exists pgcrypto;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fundesk-teaching-images','fundesk-teaching-images',false,20971520,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
set public=false,file_size_limit=20971520,
 allowed_mime_types=array['image/png','image/jpeg','image/webp','image/gif'];

create table if not exists public.fundesk_teaching_images (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 object_path text not null unique,
 filename text not null,
 size_bytes bigint not null check(size_bytes between 1 and 20971520),
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp','image/gif')),
 created_at timestamptz not null default now(),
 check(length(filename) between 1 and 180),
 check(object_path=(owner_id::text || '/' || id::text))
);
create index if not exists fundesk_teaching_images_owner_idx
 on public.fundesk_teaching_images(owner_id,created_at desc);
alter table public.fundesk_teaching_images enable row level security;
revoke all on public.fundesk_teaching_images from anon,authenticated;
grant select on public.fundesk_teaching_images to authenticated;

create or replace function public.fundesk_teaching_images_allowed()
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
 select auth.uid() is not null and (
  exists(select 1 from public.fundesk_access_admin a where a.user_id=auth.uid())
  or exists(select 1 from public.fundesk_access_roles r
   where r.user_id=auth.uid() and r.role='teacher')
 );
$$;

drop policy if exists "fundesk_images_select_own" on public.fundesk_teaching_images;
create policy "fundesk_images_select_own" on public.fundesk_teaching_images
 for select to authenticated
 using(owner_id=auth.uid() and public.fundesk_teaching_images_allowed());

create or replace function public.fundesk_teaching_images_reserve(
 p_filename text,p_size_bytes bigint,p_mime_type text
) returns table(image_id uuid,object_path text)
language plpgsql security definer
set search_path=pg_catalog,public,storage as $$
declare
 v_uid uuid := auth.uid();
 v_total bigint;
 v_id uuid := gen_random_uuid();
 v_filename text := btrim(p_filename);
begin
 if v_uid is null or not public.fundesk_teaching_images_allowed() then
  raise exception '未授權使用教師圖片庫' using errcode='42501';
 end if;
 if v_filename is null or length(v_filename)<1 or length(v_filename)>180
    or p_size_bytes is null or p_size_bytes<1 or p_size_bytes>20971520
    or p_mime_type not in ('image/png','image/jpeg','image/webp','image/gif') then
  raise exception '圖片格式、檔名或大小不符合規定';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,72614));
 select coalesce(sum(t.size_bytes),0) into v_total
 from public.fundesk_teaching_images t where t.owner_id=v_uid;
 if v_total+p_size_bytes>20971520 then
  raise exception '圖片庫已超過 20 MB 限額';
 end if;
 insert into public.fundesk_teaching_images
 (id,owner_id,object_path,filename,size_bytes,mime_type)
 values(v_id,v_uid,v_uid::text||'/'||v_id::text,v_filename,p_size_bytes,p_mime_type);
 return query select v_id,(v_uid::text||'/'||v_id::text);
end; $$;

-- 只允許撤回「尚未上傳檔案」的預留記錄。
create or replace function public.fundesk_teaching_images_cancel(p_image_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,storage as $$
declare v_path text;
begin
 if auth.uid() is null or not public.fundesk_teaching_images_allowed() then
  raise exception '未授權' using errcode='42501';
 end if;
 select t.object_path into v_path from public.fundesk_teaching_images t
 where t.id=p_image_id and t.owner_id=auth.uid();
 if v_path is null then return; end if;
 if exists(select 1 from storage.objects s
  where s.bucket_id='fundesk-teaching-images' and s.name=v_path) then
  raise exception '請先刪除 Storage 中的圖片';
 end if;
 delete from public.fundesk_teaching_images
 where id=p_image_id and owner_id=auth.uid();
end; $$;

-- Storage 的 RLS 再次核對預留檔案的真實大小；拒絕直接繞過配額上傳。
create or replace function public.fundesk_teaching_images_can_upload(
 p_path text,p_size bigint,p_mime text
) returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
 select auth.uid() is not null
  and public.fundesk_teaching_images_allowed()
  and exists(
   select 1 from public.fundesk_teaching_images t
   where t.owner_id=auth.uid() and t.object_path=p_path
    and t.size_bytes=p_size and t.mime_type=p_mime
  );
$$;

drop policy if exists "fundesk_images_storage_read" on storage.objects;
create policy "fundesk_images_storage_read" on storage.objects
for select to authenticated
using(bucket_id='fundesk-teaching-images'
 and public.fundesk_teaching_images_allowed()
 and exists(select 1 from public.fundesk_teaching_images t
  where t.owner_id=auth.uid() and t.object_path=name));

drop policy if exists "fundesk_images_storage_upload" on storage.objects;
create policy "fundesk_images_storage_upload" on storage.objects
for insert to authenticated
with check(bucket_id='fundesk-teaching-images'
 and public.fundesk_teaching_images_can_upload(
  name,
  case
   when (metadata->>'size') ~ '^[0-9]+
  metadata->>'mimetype'
 ));

drop policy if exists "fundesk_images_storage_delete" on storage.objects;
create policy "fundesk_images_storage_delete" on storage.objects
for delete to authenticated
using(bucket_id='fundesk-teaching-images'
 and public.fundesk_teaching_images_allowed()
 and exists(select 1 from public.fundesk_teaching_images t
  where t.owner_id=auth.uid() and t.object_path=name));

-- 不允許用 overwrite/upsert 覆蓋檔案，避免繞過真實大小核對。
revoke all on function public.fundesk_teaching_images_allowed() from public,anon;
revoke all on function public.fundesk_teaching_images_reserve(text,bigint,text) from public,anon;
revoke all on function public.fundesk_teaching_images_cancel(uuid) from public,anon;
revoke all on function public.fundesk_teaching_images_can_upload(text,bigint,text) from public,anon;
grant execute on function public.fundesk_teaching_images_allowed() to authenticated;
grant execute on function public.fundesk_teaching_images_reserve(text,bigint,text) to authenticated;
grant execute on function public.fundesk_teaching_images_cancel(uuid) to authenticated;
grant execute on function public.fundesk_teaching_images_can_upload(text,bigint,text) to authenticated;
commit;

-- 檢查 bucket 必須 public=false：
-- select id,public,file_size_limit from storage.buckets where id='fundesk-teaching-images';
 then (metadata->>'size')::bigint
   when (metadata->>'contentLength') ~ '^[0-9]+
  metadata->>'mimetype'
 ));

drop policy if exists "fundesk_images_storage_delete" on storage.objects;
create policy "fundesk_images_storage_delete" on storage.objects
for delete to authenticated
using(bucket_id='fundesk-teaching-images'
 and public.fundesk_teaching_images_allowed()
 and exists(select 1 from public.fundesk_teaching_images t
  where t.owner_id=auth.uid() and t.object_path=name));

-- 不允許用 overwrite/upsert 覆蓋檔案，避免繞過真實大小核對。
revoke all on function public.fundesk_teaching_images_allowed() from public,anon;
revoke all on function public.fundesk_teaching_images_reserve(text,bigint,text) from public,anon;
revoke all on function public.fundesk_teaching_images_cancel(uuid) from public,anon;
revoke all on function public.fundesk_teaching_images_can_upload(text,bigint,text) from public,anon;
grant execute on function public.fundesk_teaching_images_allowed() to authenticated;
grant execute on function public.fundesk_teaching_images_reserve(text,bigint,text) to authenticated;
grant execute on function public.fundesk_teaching_images_cancel(uuid) to authenticated;
grant execute on function public.fundesk_teaching_images_can_upload(text,bigint,text) to authenticated;
commit;

-- 檢查 bucket 必須 public=false：
-- select id,public,file_size_limit from storage.buckets where id='fundesk-teaching-images';
 then (metadata->>'contentLength')::bigint
   else -1 end,
  metadata->>'mimetype'
 ));

drop policy if exists "fundesk_images_storage_delete" on storage.objects;
create policy "fundesk_images_storage_delete" on storage.objects
for delete to authenticated
using(bucket_id='fundesk-teaching-images'
 and public.fundesk_teaching_images_allowed()
 and exists(select 1 from public.fundesk_teaching_images t
  where t.owner_id=auth.uid() and t.object_path=name));

-- 不允許用 overwrite/upsert 覆蓋檔案，避免繞過真實大小核對。
revoke all on function public.fundesk_teaching_images_allowed() from public,anon;
revoke all on function public.fundesk_teaching_images_reserve(text,bigint,text) from public,anon;
revoke all on function public.fundesk_teaching_images_cancel(uuid) from public,anon;
revoke all on function public.fundesk_teaching_images_can_upload(text,bigint,text) from public,anon;
grant execute on function public.fundesk_teaching_images_allowed() to authenticated;
grant execute on function public.fundesk_teaching_images_reserve(text,bigint,text) to authenticated;
grant execute on function public.fundesk_teaching_images_cancel(uuid) to authenticated;
grant execute on function public.fundesk_teaching_images_can_upload(text,bigint,text) to authenticated;
commit;

-- 檢查 bucket 必須 public=false：
-- select id,public,file_size_limit from storage.buckets where id='fundesk-teaching-images';
