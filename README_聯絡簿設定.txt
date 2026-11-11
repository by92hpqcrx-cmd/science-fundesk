FunDesk 班級聯絡簿更新版（含康軒電子書、教師安全鎖、平板守則）

一、第一次設定 Supabase（只需一次）
1. 進入你原本的 Supabase 專案 https://supabase.com/dashboard
2. 選擇 SQL Editor -> New query。
3. 將 contact_setup.sql 全文貼上，按 Run；確認成功。
   請勿將這個檔案當作網頁上傳，SQL 要在 Supabase 後台執行。

二、更新 GitHub Pages
1. 備份目前的 FunDesk index.html 與班級資料。
2. 將本 ZIP 的 index.html、contact.html 上傳到同一個網站資料夾（兩個都需要）。
3. 其餘 tablet_photo_1.jpg 等檔案保持在原本同一資料夾即可。
4. 等 GitHub Pages 更新後，開啟 FunDesk，登入教師帳號。
5. 左側選「班級聯絡簿」，切換班級、選日期，填寫並發布。
6. 複製右側「專屬閱讀網址」給該班；不同班連結不同。

三、學生與家長使用
- 用老師發送的完整網址打開 contact.html?t=...
- 無須登入、不可編輯、只看該連結所屬班的聯絡簿。
- 學生網頁每 20 秒自動重新讀取；也可按「立即更新」。

安全須知
- 專屬網址屬於持有連結即可閱讀，並非學校帳號驗證；請勿公開分享連結。
- 不可在聯絡簿寫學生姓名、電話、成績、個資及敏感紀錄。
- 老師須登入原本 FunDesk 的 Supabase 才能發布；表格不允許任何人直接讀取。
- Supabase free plan 如休眠或網路中斷，更新與讀取可能暫時失敗。
- 目前聯絡簿由公開可讀的獨立表格儲存，與教師私有學生資料分開。
- 首次建立班級連結後，網址會維持固定；不提供網頁上的重新產生功能。
