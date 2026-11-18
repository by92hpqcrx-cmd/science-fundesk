/* FunDesk 內嵌 PowerPoint 播放器：領取／歸還平板 */
(() => {
  "use strict";
  const ROOT = "https://by92hpqcrx-cmd.github.io/science-fundesk/tablet-ppt/";
  const slides = {
    pickup: {name:"📥 領取平板", ppt:"fundesk-tablet-pickup.pptx", count:18},
    returns:{name:"🔌 歸還平板", ppt:"fundesk-tablet-return.pptx", count:15}
  };
  const styleId="fundeskTabletEmbeddedViewerStyle";
  if(!document.getElementById(styleId)){
    const style=document.createElement("style");
    style.id=styleId;
    style.textContent=`
      .tabletPptLauncher{display:block}
      .tabletPptTabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
      .tabletPptTabs button{border:1px solid #bad8ee;background:#fff;color:#23537f;border-radius:13px;padding:11px 18px;font-weight:850;cursor:pointer;font-size:16px}
      .tabletPptTabs button.active{background:#255b91;border-color:#255b91;color:white}
      .tabletPptStage{background:#101e34;border-radius:16px;overflow:hidden;position:relative;min-height:260px}
      .tabletPptStage iframe{display:block;width:100%;height:100%;min-height:350px;border:0;background:white}
      .tabletPptScreen{position:relative;aspect-ratio:16 / 9;min-height:280px}
      .tabletPptStage:fullscreen,.tabletPptStage:-webkit-full-screen{border-radius:0;width:100vw;height:100vh;display:flex;flex-direction:column}
      .tabletPptStage:fullscreen .tabletPptScreen,.tabletPptStage:-webkit-full-screen .tabletPptScreen{flex:1;aspect-ratio:auto;min-height:0}
      .tabletPptStage:fullscreen iframe,.tabletPptStage:-webkit-full-screen iframe{min-height:0;height:100%}
      .tabletPptControls{display:flex;gap:9px;flex-wrap:wrap;align-items:center;justify-content:space-between;background:#eef6ff;padding:12px;border-radius:12px;margin:10px 0}
      .tabletPptControls button,.tabletPptControls a{border:0;border-radius:10px;padding:9px 13px;background:#fff;color:#26547f;cursor:pointer;text-decoration:none;font-size:14px;font-weight:750;border:1px solid #c8ddec}
      .tabletPptControls button:hover,.tabletPptControls a:hover{background:#d5e9ff}
      .tabletPptMeta{color:#54718d;font-size:13px;line-height:1.6;margin:8px 0}
      .tabletPptStage:fullscreen .tabletPptFullscreenBar{display:flex}
      .tabletPptFullscreenBar{display:none;align-items:center;justify-content:space-between;gap:12px;background:#132944;color:white;padding:8px 14px}
      .tabletPptFullscreenBar button{background:#f2f7ff;color:#173855;border:0;border-radius:7px;padding:7px 11px;cursor:pointer}
      @media(max-width:680px){.tabletPptScreen{min-height:210px}.tabletPptStage iframe{min-height:210px}.tabletPptTabs button{flex:1}}
    `;
    document.head.appendChild(style);
  }
  const officeEmbed = (file) => {
    const pptUrl = ROOT + encodeURIComponent(file);
    return "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(pptUrl);
  };
  function init(){
    document.querySelectorAll(".tabletPptLauncher").forEach(panel=>{
      if(panel.dataset.initialized==="embed-v2") return;
      panel.dataset.initialized="embed-v2";
      panel.innerHTML="";
      const heading=document.createElement("strong");
      heading.textContent="📽️ 平板守則｜網頁直接播放";
      heading.style.cssText="display:block;font-size:20px;color:#194c79;margin-bottom:9px";
      const note=document.createElement("div");
      note.className="tabletPptMeta";
      note.textContent="選擇領取或歸還簡報，直接在下方播放；投影片切換請使用播放器內建控制。";
      const tabs=document.createElement("div");
      tabs.className="tabletPptTabs";
      const controls=document.createElement("div");
      controls.className="tabletPptControls";
      const label=document.createElement("span");
      label.style.cssText="font-size:14px;font-weight:800;color:#22537d";
      const right=document.createElement("div");
      right.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
      const full=document.createElement("button");
      full.type="button";
      full.textContent="⛶ 全螢幕播放";
      const dl=document.createElement("a");
      dl.textContent="⬇ 下載 PPT";
      dl.target="_blank";dl.rel="noopener noreferrer";
      const newWindow=document.createElement("a");
      newWindow.textContent="↗ 新分頁播放";
      newWindow.target="_blank";newWindow.rel="noopener noreferrer";
      right.append(full, newWindow, dl);
      controls.append(label,right);
      const stage=document.createElement("div");
      stage.className="tabletPptStage";
      const fullscreenBar=document.createElement("div");
      fullscreenBar.className="tabletPptFullscreenBar";
      const barLabel=document.createElement("span");
      barLabel.textContent="📱 FunDesk 平板使用守則";
      const exitButton=document.createElement("button");
      exitButton.type="button";exitButton.textContent="✕ 離開全螢幕";
      fullscreenBar.append(barLabel,exitButton);
      const screen=document.createElement("div");
      screen.className="tabletPptScreen";
      const iframe=document.createElement("iframe");
      iframe.title="平板使用守則 PowerPoint 播放器";
      iframe.setAttribute("allowfullscreen","");
      iframe.setAttribute("webkitallowfullscreen","");
      iframe.setAttribute("allow","fullscreen");
      iframe.referrerPolicy="no-referrer";
      iframe.loading="lazy";
      screen.appendChild(iframe);
      stage.append(fullscreenBar,screen);
      const help=document.createElement("p");
      help.className="tabletPptMeta";
      help.textContent="若無法載入線上預覽，請點「新分頁播放」或「下載 PPT」。網路預覽需能連線至 Microsoft Office。";
      const btns={};
      let current="pickup";
      const choose=(key)=>{
        current=key;
        const item=slides[key];
        const pptURL=ROOT+encodeURIComponent(item.ppt);
        const viewURL=officeEmbed(item.ppt);
        label.textContent=item.name+"（"+item.count+" 張）";
        dl.href=pptURL;
        newWindow.href=viewURL;
        iframe.src=viewURL;
        Object.entries(btns).forEach(([id,btn])=>{btn.classList.toggle("active",id===key);btn.setAttribute("aria-pressed",String(id===key));});
      };
      Object.entries(slides).forEach(([key,item])=>{
        const b=document.createElement("button");
        b.type="button";b.textContent=item.name+"（"+item.count+" 張）";
        b.addEventListener("click",()=>choose(key));
        tabs.appendChild(b);btns[key]=b;
      });
      const close=()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else if(document.webkitFullscreenElement&&document.webkitExitFullscreen)document.webkitExitFullscreen();};
      full.addEventListener("click",()=>{
        if(document.fullscreenElement===stage){close();return;}
        if(stage.requestFullscreen)stage.requestFullscreen().catch(()=>{window.open(officeEmbed(slides[current].ppt),"_blank","noopener");});
        else if(stage.webkitRequestFullscreen)stage.webkitRequestFullscreen();
        else window.open(officeEmbed(slides[current].ppt),"_blank","noopener");
      });
      exitButton.addEventListener("click",close);
      panel.append(heading,note,tabs,controls,stage,help);
      choose("pickup");
    });
  }
  let queued=false;
  new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    queueMicrotask(()=>{queued=false;init();});
  }).observe(document.body,{subtree:true,childList:true});
  init();
})();
