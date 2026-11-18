/* FunDesk 平板使用守則：領取／歸還 PPT 入口 */
(()=> {
  const FILES={
    pickup:{url:"./tablet-ppt/fundesk-tablet-pickup.pptx",label:"📥 領取平板 PPT（18 張）"},
    return:{url:"./tablet-ppt/fundesk-tablet-return.pptx",label:"🔌 歸還平板 PPT（15 張）"}
  };
  function init(){
    document.querySelectorAll(".tabletPptLauncher").forEach(panel=>{
      if(panel.dataset.initialized==="1") return;
      panel.dataset.initialized="1";
      for(const [key,item] of Object.entries(FILES)){
        const a=document.createElement("a");
        a.className="btn outline";
        a.textContent=item.label+"｜檢查檔案中";
        a.style.cssText="display:inline-flex;align-items:center;justify-content:center;min-height:48px;text-decoration:none;gap:8px;font-size:16px;border-radius:13px";
        a.setAttribute("aria-disabled","true");
        a.title="簡報檔尚未確認";
        panel.querySelector(".tabletPptButtons").appendChild(a);
        fetch(item.url,{method:"HEAD",cache:"no-store"}).then(r=>{
          if(!r.ok) throw new Error("not uploaded");
          a.href=item.url;
          a.download=key==="pickup"?"FunDesk_平板守則_領取.pptx":"FunDesk_平板守則_歸還.pptx";
          a.removeAttribute("aria-disabled");
          a.textContent=item.label+"｜下載";
          a.title="下載 PowerPoint 簡報";
        }).catch(()=>{
          a.textContent=item.label+"｜待上傳";
          a.title="此簡報尚未上傳至 GitHub 的 tablet-ppt 資料夾";
        });
      }
    });
  }
  let queued=false;
  new MutationObserver(()=>{
    if(queued) return;
    queued=true;
    queueMicrotask(()=>{queued=false;init();});
  }).observe(document.body,{subtree:true,childList:true});
  init();
})();
