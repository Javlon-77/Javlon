(()=>{
const E=document.getElementById('editor'),P=document.getElementById('prompt'),B=document.getElementById('sendBtn');
if(!E||!P||!B)return;
const n=s=>String(s??'').toLowerCase().replace(/[‘’ʻʼ`]/g,"'").replace(/\s+/g,' ').trim();
const box=()=>E.querySelector('.matrix-diagram');
const tab=()=>box()?.querySelector('table.matrix-table');
const say=(t,r='ai')=>window.message?.(t,r);
const stat=t=>window.status?.(t);
const flash=c=>{if(!c)return;c.classList.remove('diagram-v2-flash');void c.offsetWidth;c.classList.add('diagram-v2-flash')};
function addRows(count,label='Yangi ma’lumot'){
 const t=tab();if(!t)return 0;const cols=t.rows[0]?.cells.length||2;let made=0;
 for(let k=0;k<count;k++){const tr=document.createElement('tr');for(let c=0;c<cols;c++){const cell=document.createElement(c===0?'th':'td');cell.contentEditable='true';cell.spellcheck=true;cell.textContent=c===0?`${label} ${t.rows.length}`:'';tr.appendChild(cell)}t.appendChild(tr);made++}return made;
}
function addCols(count,label='Yangi ustun'){
 const t=tab();if(!t)return 0;for(let k=0;k<count;k++){const idx=t.rows[0].cells.length;[...t.rows].forEach((r,i)=>{const c=document.createElement(i===0?'th':'td');c.contentEditable='true';c.spellcheck=true;c.textContent=i===0?`${label} ${idx}`:'';r.appendChild(c)})}return count;
}
function allCells(){const t=tab();return t?[...t.rows].flatMap(r=>[...r.cells].slice(1)):[]}
function command(raw){
 const q=n(raw), b=box(),t=tab();if(!b||!t)return false;
 let m=q.match(/(?:o'lchami|hajmi|size|o'lcham)\s*(?:ni)?\s*(?:=|:)?\s*(\d{2,5})\s*[x×*]\s*(\d{2,5})/i)||q.match(/\b(\d{2,5})\s*[x×*]\s*(\d{2,5})\s*(?:px|piksel|o'lcham|hajm)?\b/i);
 if(m){const w=+m[1],h=+m[2];b.style.width=w+'px';b.style.minHeight=h+'px';b.style.maxWidth='none';b.dataset.diagramWidth=w;b.dataset.diagramHeight=h;b.style.overflow='auto';stat(`Diagramma ${w}×${h} ga o‘zgartirildi`);say(`✅ Diagramma aniq ${w}×${h} px hajmga o‘rnatildi.`);return true}
 if(/juda\s+katta|eng\s+katta|katta\s+diagramma|batafsil\s+diagramma|very\s+large|large\s+detailed/.test(q)){
   while(t.rows.length<41)addRows(1,'Bo‘lim');while(t.rows[0].cells.length<13)addCols(1,'Yo‘nalish');
   b.style.width='3200px';b.style.minHeight='2200px';b.style.maxWidth='none';b.style.overflow='auto';
   stat('Juda katta diagramma tayyor');say(`✅ Juda katta diagramma tayyor: ${t.rows.length-1} ta bo‘lim va ${t.rows[0].cells.length-1} ta yo‘nalish.`);return true;
 }
 m=q.match(/(?:yana\s+)?(\d+)\s*(?:ta\s+)?(?:ma['’]?lumot|element|node|bo['’]?lim|qator|satr)/i);
 if(m){const c=Math.min(300,+m[1]);addRows(c,'Yangi element');stat('Diagrammaga ma’lumotlar qo‘shildi');say(`✅ ${c} ta yangi diagramma elementi qo‘shildi.`);return true}
 if(/diagramma(?:ga|da)?/.test(q)&&/(ma['’]?lumot|element|bo['’]?lim|qator|satr)/.test(q)&&/qo['’]?sh/.test(q)){
   const m2=q.match(/(\d+)\s*(?:ta\s*)?(?:ma['’]?lumot|element|qator|satr)/);const c=m2?Math.min(300,+m2[1]):1;addRows(c,'Yangi ma’lumot');stat('Diagramma yangilandi');say(`✅ ${c} ta yangi ma’lumot diagrammaga qo‘shildi.`);return true;
 }
 if(/hammasiga|barchasiga|har\s+biriga|hamma\s+katakka|every|all/.test(q)){
   let value=q.replace(/hammasiga|barchasiga|har\s+biriga|hamma\s+katakka|every|all/g,'').replace(/diagrammaga|diagramga|diagramda/g,'').replace(/qo['’]?sh.*/,'').trim();
   if(!value)value='+ ma’lumot';const cells=allCells();cells.forEach(c=>{c.textContent=(c.textContent?c.textContent+' ':'')+value;flash(c)});stat('Barcha diagramma kataklari yangilandi');say(`✅ O‘zgarish barcha ${cells.length} ta diagramma katagiga qo‘llandi.`);return true;
 }
 return false;
}
function capture(e){
 if(e.type==='keydown'&&!(e.key==='Enter'&&!e.shiftKey))return;if(e.type==='click'&&e.target!==B)return;
 const q=P.value.trim();if(!q||!box())return;if(!command(q))return;e.preventDefault();e.stopImmediatePropagation();say(q,'user');P.value='';
}
B.addEventListener('click',capture,true);P.addEventListener('keydown',capture,true);
const s=document.createElement('style');s.textContent='.matrix-diagram{box-sizing:border-box!important}.diagram-v2-flash{animation:diagramV2Pulse .45s ease}@keyframes diagramV2Pulse{50%{outline:3px solid #6b8cff}}';document.head.appendChild(s);
})();
