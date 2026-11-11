FunDesk 第三四單元診斷版
1. 上傳 index.html 至 GitHub Pages 覆蓋原檔。
2. 進入「隨機抽籤答題」，查看每個雲端題庫來源的讀取筆數與錯誤。
3. 若仍是 0 題，於 Supabase SQL Editor 執行 diagnose_readonly.sql（唯讀）。
4. 複製 TABLE TOTAL ROWS 等輸出（不包含學生資料），即可判斷是資料表、欄位、RLS 或題目缺漏。
