-- FunDesk 系統管理員初始化（僅在完成 fundesk_access_roles_v1.sql 後執行）
-- 在 Supabase Dashboard -> SQL Editor 以管理員權限執行。
-- 把 YOUR_CURRENT_FUNDesk_LOGIN_EMAIL 替換成你目前登入 FunDesk 的教師 Email。
-- 不要填其他老師的 Email。此動作只需執行一次。
do $$
declare
  v_email text := lower(trim('YOUR_CURRENT_FUNDesk_LOGIN_EMAIL'));
  v_uid uuid;
  v_count integer;
begin
  if v_email='your_current_fundesk_login_email' or v_email='' then
    raise exception '請先將 v_email 換成你在 FunDesk 的教師登入 Email';
  end if;
  select count(*) into v_count from auth.users where lower(email)=v_email;
  if v_count<>1 then
    raise exception '找不到唯一的 Supabase 教師帳戶：%',v_email;
  end if;
  select id into v_uid from auth.users where lower(email)=v_email;
  if exists(select 1 from public.fundesk_access_admin) then
    raise exception '管理員已存在，為避免誤轉移權限，已中止。';
  end if;
  insert into public.fundesk_access_admin(singleton,user_id)
  values(true,v_uid);
  raise notice 'FunDesk 唯一管理員已設定：%（%）',v_email,v_uid;
end $$;

-- 驗證：應看到唯一一筆 admin 教師。
select u.email,a.user_id
from public.fundesk_access_admin a
join auth.users u on u.id=a.user_id;
