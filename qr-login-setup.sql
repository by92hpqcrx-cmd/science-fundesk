-- FunDesk iPhone 掃碼登入：在 Supabase SQL Editor 執行一次
-- 一次性授權；QR 僅含手機核准代碼，桌面專用密鑰不出現在 QR 中。
create extension if not exists pgcrypto;
create table if not exists public.fundesk_qr_login_requests (
 id uuid primary key,
 phone_secret_hash text not null,
 desktop_secret_hash text not null,
 expires_at timestamptz not null default (now() + interval '90 seconds'),
 status text not null default 'pending' check (status in ('pending','approved','consumed')),
 token_hash text,
 approved_user uuid,
 created_at timestamptz not null default now()
);
alter table public.fundesk_qr_login_requests enable row level security;
revoke all on public.fundesk_qr_login_requests from anon, authenticated;
create or replace function public.fundesk_qr_create(p_id uuid,p_phone_secret text,p_desktop_secret text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if length(p_phone_secret)<32 or length(p_desktop_secret)<32 then raise exception 'Invalid challenge'; end if;
 delete from public.fundesk_qr_login_requests where expires_at<now()-interval '1 hour';
 insert into public.fundesk_qr_login_requests(id,phone_secret_hash,desktop_secret_hash)
 values(p_id,encode(digest(p_phone_secret,'sha256'),'hex'),encode(digest(p_desktop_secret,'sha256'),'hex'));
 return true;
end $$;
create or replace function public.fundesk_qr_poll(p_id uuid,p_desktop_secret text)
returns table(state text,auth_token_hash text) language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.fundesk_qr_login_requests%rowtype;
begin
 select * into r from public.fundesk_qr_login_requests where id=p_id
  and desktop_secret_hash=encode(digest(p_desktop_secret,'sha256'),'hex') for update;
 if not found then return query select 'invalid'::text,null::text;return;end if;
 if r.expires_at<now() then return query select 'expired'::text,null::text;return;end if;
 if r.status='approved' then
  update public.fundesk_qr_login_requests set status='consumed',token_hash=null where id=p_id;
  return query select 'approved'::text,r.token_hash;return;
 end if;
 return query select r.status,null::text;
end $$;
revoke all on function public.fundesk_qr_create(uuid,text,text) from public;
revoke all on function public.fundesk_qr_poll(uuid,text) from public;
grant execute on function public.fundesk_qr_create(uuid,text,text) to anon;
grant execute on function public.fundesk_qr_poll(uuid,text) to anon;
-- 注意：服務端核准由 Edge Function 使用 service_role 執行，不向瀏覽器公開。
