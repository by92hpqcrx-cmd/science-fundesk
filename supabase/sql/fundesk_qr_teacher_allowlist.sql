-- FunDesk 教師 iPhone QR 掃碼授權名單
-- 僅專案管理者在 Supabase SQL Editor 執行本檔。
-- 保留已存在的教師資料，絕不修改學生資料或原有登入帳號。
BEGIN;

CREATE TABLE IF NOT EXISTS public.fundesk_qr_allowed_teachers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fundesk_qr_allowed_teachers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fundesk_qr_allowed_teachers
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.fundesk_qr_allowed_teachers TO service_role;

COMMIT;

-- 以下請在管理者 SQL Editor 另外執行。
-- 將 YOUR_TEACHER_EMAIL@example.com 改成真實 Supabase Auth 教師登入電子郵件。
-- 不要把密碼或私密金鑰放進 SQL。
--
-- INSERT INTO public.fundesk_qr_allowed_teachers (user_id, active)
-- SELECT id, true FROM auth.users
-- WHERE lower(email)=lower('YOUR_TEACHER_EMAIL@example.com')
-- ON CONFLICT (user_id) DO UPDATE SET active=EXCLUDED.active;
--
-- 查詢是否已核准（僅在 SQL Editor 使用）：
-- SELECT u.email, a.active FROM public.fundesk_qr_allowed_teachers a
-- JOIN auth.users u ON u.id=a.user_id ORDER BY u.email;
