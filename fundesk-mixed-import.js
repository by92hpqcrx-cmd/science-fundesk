/* FunDesk browser-side import: no original document is uploaded. */
(() => {
 const marks='①②③④';
 const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
 function parse(text){
  const lines=text.replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
  let mode='',points=6,manual=0,current=null;const questions=[],warnings=[];
  function flush(){
   if(!current)return;
   const raw=clean(current.parts.join(' '));
   if(current.type==='tf'){if(raw)questions.push({type:'tf',text:raw,options:['○ 正確','× 錯誤'],answer:-1,points:current.points});}
   else{const m=[...raw.matchAll(/[①②③④]/g)];if(m.length===4&&m.every((x,i)=>x[0]===marks[i])){const opts=m.map((x,i)=>clean(raw.slice(x.index+1,m[i+1]?.index??raw.length)));const stem=clean(raw.slice(0,m[0].index));if(stem&&opts.every(Boolean))questions.push({type:'choice',text:stem,options:opts,answer:-1,points:current.points});else warnings.push('選擇題 '+current.no+' 內容不完整');}else warnings.push('選擇題 '+current.no+' 選項未完整辨識，請手動補入');}
   current=null;
  }
  for(const line of lines){
   const section=line.match(/^(?:[一二三四五六七八九十0-9①②③④⑤⑥⑦⑧⑨⑩、.．\s]*)?(是非題|選擇題|配合題|連連看|做一做|作圖題|填充題|簡答題|問答題|手寫題)/);
   if(section){flush();mode=section[1]==='是非題'?'tf':section[1]==='選擇題'?'choice':'manual';const p=line.match(/每題\s*(\d+)\s*分/);if(p)points=Number(p[1]);else if(mode!=='manual'){points=6;warnings.push(section[1]+' 未辨識每題分數，暫設6分，請確認');}if(mode==='manual'){const t=line.match(/共\s*(\d+)\s*分/);if(t)manual+=Number(t[1]);}continue}
   if(mode!=='tf'&&mode!=='choice')continue;
   const q=line.match(/^(?:[（(]\s*[）)]\s*)?(\d{1,2})\s*[.．、]\s*(.*)$/);
   if(q){flush();current={type:mode,no:q[1],points,parts:[q[2]]};}
   else if(current)current.parts.push(line);
  }
  flush();
  if(questions.length>40){warnings.push('超過40題，只帶入前40題');questions.length=40}
  if(!questions.length)warnings.push('未辨識選答題，請參照原文手動建立。');
  return {questions,manual,warnings};
 }
 async function load(file){
  if(!file||file.size>20*1024*1024)throw Error('請選擇20MB以下的試卷');
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='doc')throw Error('舊版 .doc 請先使用 Word 另存為 .docx 或 PDF');
  const data=await file.arrayBuffer();let text='',pages=[],pictures=[];
  if(ext==='docx'){
   if(!globalThis.JSZip){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Word 解析元件載入失敗'));document.head.append(s)})}
   const zip=await JSZip.loadAsync(data),doc=zip.file('word/document.xml');if(!doc)throw Error('無法讀取 Word 內容');
   const xml=new DOMParser().parseFromString(await doc.async('string'),'application/xml');if(xml.querySelector('parsererror'))throw Error('Word XML 格式錯誤');
   const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
   text=[...xml.getElementsByTagNameNS(ns,'p')].map(p=>[...p.getElementsByTagNameNS(ns,'t')].map(t=>t.textContent).join('')).join('\n');
   for(const path of Object.keys(zip.files).filter(p=>/^word\/media\/[^/]+\.(png|jpe?g|webp)$/i.test(p)).slice(0,30)){const entry=zip.file(path);if(!entry)continue;const bytes=await entry.async('uint8array');if(bytes.length>10*1024*1024)continue;const name=path.split('/').pop(),type=/\.png$/i.test(name)?'image/png':/\.webp$/i.test(name)?'image/webp':'image/jpeg';pictures.push(new File([bytes],name,{type}));}
  }else if(ext==='pdf'){
   const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
   const pdf=await pdfjs.getDocument({data}).promise;
   try{if(pdf.numPages>20)throw Error('目前最多支援20頁 PDF');for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);const tc=await page.getTextContent();let prevY=null,line='';const lines=[];for(const it of tc.items){if(typeof it.str!=='string')continue;const y=it.transform[5];if(prevY!==null&&Math.abs(y-prevY)>4&&line){lines.push(line);line=''}line+=(line?' ':'')+it.str;prevY=y;if(it.hasEOL){lines.push(line);line='';prevY=null}}if(line)lines.push(line);text+=lines.join('\n')+'\n';const v=page.getViewport({scale:1.5}),cv=document.createElement('canvas');cv.width=Math.ceil(v.width);cv.height=Math.ceil(v.height);await page.render({canvasContext:cv.getContext('2d'),viewport:v}).promise;const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.85));if(blob)pages.push(new File([blob],'PDF 第'+n+'頁.jpg',{type:'image/jpeg'}));page.cleanup()}}finally{await pdf.destroy()}
  }else throw Error('請選擇 .docx 或 .pdf');
  const result=parse(text);if(ext==='pdf'&&!text.trim())result.warnings.push('此 PDF 可能為掃描版，尚未支援 OCR；可選取頁面作為手寫圖片。');return {...result,text,pictures,pages};
 }
 globalThis.FDMixedImport={load,parse};
})();
