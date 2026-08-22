(()=>{
  const editor=document.getElementById('editor');
  if(!editor) return;
  const key=()=>`ai-word-studio:diagram:${(document.getElementById('fileName')?.textContent||document.getElementById('topFileName')?.textContent||'Yangi AI hujjat.docx').trim().toLowerCase()}`;
  let restoring=false, timer=0;
  const read=()=>{
    const box=editor.querySelector('.matrix-diagram');
    const table=box?.querySelector('.matrix-table');
    if(!box||!table) return null;
    return {type:'matrix',id:box.dataset.matrixId||'',title:box.querySelector('.matrix-title')?.innerText||'DIAGRAMMA',subtitle:box.querySelector('.matrix-subtitle')?.innerText||'',width:box.dataset.diagramWidth||'',height:box.dataset.diagramHeight||'',rows:[...table.rows].map(r=>[...r.cells].map(c=>(c.innerText||'').trim()))};
  };
  const store=()=>{if(restoring)return;const d=read();if(!d?.rows?.length)return;try{localStorage.setItem(key(),JSON.stringify(d))}catch(e){}};
  const restore=()=>{if(restoring||editor.querySelector('.matrix-diagram'))return;let d=null;try{d=JSON.parse(localStorage.getItem(key())||'null')}catch(e){}if(!d?.rows?.length||typeof window.matrixFromData!=='function')return;restoring=true;try{const box=window.matrixFromData(d);if(!box)return;if(d.width&&d.height){box.dataset.diagramWidth=d.width;box.dataset.diagramHeight=d.height;box.style.width=d.width+'px';box.style.minHeight=d.height+'px';box.style.maxWidth='none';box.style.overflow='auto'}editor.replaceChildren(box)}finally{restoring=false}};
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{store();restore()},120)};
  new MutationObserver(schedule).observe(editor,{childList:true,subtree:true,characterData:true});
  editor.addEventListener('input',schedule,true);
  document.getElementById('saveBtn')?.addEventListener('click',()=>{store();setTimeout(store,300)},true);
  setTimeout(restore,500);setTimeout(restore,1500);
})();
