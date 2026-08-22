(()=>{
  const editor=document.getElementById('editor');
  if(!editor) return;
  let busy=false;
  const norm=s=>String(s||'').toLowerCase().replace(/[‘’`]/g,"'").replace(/\s+/g,' ').trim();
  function recover(){
    if(busy || editor.querySelector('.matrix-diagram') || typeof window.matrixFromData!=='function') return;
    const lines=[...editor.children].map(x=>(x.innerText||x.textContent||'').trim()).filter(Boolean);
    if(lines.length<8) return;
    const flat=lines.map(norm);
    const title=flat.find(x=>x==='odamlar')||flat.find(x=>x==='maktab')||flat.find(x=>x==='kompyuter');
    if(!title) return;
    const labels=['ishi','yoshi','puli','kasbi','lavozimi','holati','soni','joylashuv'];
    const firstLabel=flat.findIndex(x=>labels.includes(x));
    if(firstLabel<4) return;
    const names=lines.slice(1,firstLabel);
    if(names.length<2 || names.length>8) return;
    const rows=[['',...names]];
    let pos=firstLabel;
    while(pos<lines.length){
      const label=norm(lines[pos]);
      if(!labels.includes(label)){pos++;continue;}
      const vals=lines.slice(pos+1,pos+1+names.length);
      if(vals.length!==names.length) return;
      rows.push([lines[pos],...vals]);
      pos+=1+names.length;
    }
    if(rows.length<2) return;
    busy=true;
    try{
      const box=window.matrixFromData({title:title.toUpperCase(),rows});
      if(box){editor.replaceChildren(box);window.dispatchEvent(new CustomEvent('diagram:recovered'));}
    }finally{busy=false}
  }
  setTimeout(recover,900);
  setTimeout(recover,2200);
  new MutationObserver(()=>setTimeout(recover,180)).observe(editor,{childList:true,subtree:true});
})();
