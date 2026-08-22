(() => {
  const get=id=>document.getElementById(id);
  const editorEl=get("editor"),promptEl=get("prompt"),sendBtn=get("sendBtn");
  if(!editorEl||!promptEl||!sendBtn)return;
  const N=s=>String(s??"").toLowerCase().replace(/[‘’ʻʼ`]/g,"'").replace(/\s+/g," ").trim();
  const say=(t,r="ai")=>window.message?.(t,r);
  const setStatus=t=>window.status?.(t);
  const st=document.createElement("style");st.id="matrix-fix-style";st.textContent=`
    .matrix-diagram{max-width:100%!important;width:100%!important;box-sizing:border-box!important;padding:22px!important;border-radius:24px!important}
    .matrix-table{width:100%!important;min-width:0!important;table-layout:fixed!important}
    .matrix-table th,.matrix-table td{padding:11px 8px!important;font-size:13px!important;line-height:1.3!important}
    .matrix-table tbody th{width:105px!important;min-width:82px!important}
    .matrix-title{font-size:25px!important}
    .matrix-chat-updated{animation:matrixChatPulse .6s ease}
    @keyframes matrixChatPulse{0%{background:#dfe8ff!important}100%{background:transparent!important}}
  `;document.head.appendChild(st);
  const matrix=()=>editorEl.querySelector(".matrix-diagram"),table=()=>matrix()?.querySelector("table.matrix-table"),T=s=>N(s).replace(/[.!?]+$/g,"");
  function col(name){const t=table();if(!t||!t.rows.length)return-1;const q=T(name);for(let c=1;c<t.rows[0].cells.length;c++){const h=T(t.rows[0].cells[c].innerText);if(h===q||h.includes(q)||q.includes(h))return c}return-1}
  function row(label){const t=table();if(!t)return-1;const q=T(label);for(let r=1;r<t.rows.length;r++){const h=T(t.rows[r].cells[0]?.innerText);if(h===q||h.includes(q)||q.includes(h))return r}return-1}
  function flash(c){if(!c)return;c.classList.remove("matrix-chat-updated");void c.offsetWidth;c.classList.add("matrix-chat-updated")}
  function setCell(r,c,v){const cell=table()?.rows[r]?.cells[c];if(!cell)return false;cell.textContent=String(v);flash(cell);setStatus("Diagramma yangilandi");return true}
  function addCol(name="Yangi odam"){const t=table();if(!t)return false;for(const tr of [...t.rows]){const f=T(tr.cells[0]?.innerText),cell=document.createElement(tr===t.rows[0]?"th":"td");cell.contentEditable="true";cell.spellcheck=true;cell.textContent=tr===t.rows[0]?name:f.includes("yosh")?"":f.includes("ish")||f.includes("kasb")?"":f.includes("pul")||f.includes("daromad")?"":"";tr.appendChild(cell)}setStatus("Diagramma yangilandi");return true}
  function delCol(name){const t=table(),c=col(name);if(!t||c<1)return false;[...t.rows].forEach(tr=>tr.deleteCell(c));setStatus("Diagramma yangilandi");return true}
  function addRow(label="Yangi ma’lumot"){const t=table();if(!t)return false;const n=t.rows[0]?.cells.length||2,tr=document.createElement("tr");for(let c=0;c<n;c++){const cell=document.createElement(c===0?"th":"td");cell.contentEditable="true";cell.spellcheck=true;cell.textContent=c===0?label:"";tr.appendChild(cell)}t.appendChild(tr);setStatus("Diagramma yangilandi");return true}
  function delRow(label){const t=table(),r=row(label);if(!t||r<1||t.rows.length<=2)return false;t.deleteRow(r);setStatus("Diagramma yangilandi");return true}
  function field(s){const q=T(s);if(q.includes("yosh"))return"Yoshi";if(q.includes("ish")||q.includes("kasb")||q.includes("lavoz"))return"Ishi";if(q.includes("pul")||q.includes("daromad")||q.includes("maosh"))return"Puli";return null}
  function command(raw){if(!matrix())return false;const q=T(raw);
    let m=q.match(/^(.+?)\s*(?:ning)?\s*(yoshi|ishi|kasbi|puli|maoshi|daromadi|lavozimi)\s*(?:necha|qancha|nima|qanday)?$/i);
    if(m){const person=m[1].trim(),f=field(m[2]),c=col(person),r=row(f);if(c>0&&r>0){say(`ℹ️ ${person} — ${f}: ${table().rows[r].cells[c].innerText.trim()||"kiritilmagan"}`);return true}}
    m=q.match(/^(.+?)ni\s+(\d+)\s*(?:yosh)?\s*(?:qil|bo['’]?lsin|o['’]?zgartir|almashtir)$/i);
    if(m){const p=m[1].trim(),c=col(p),r=row("Yoshi");if(c>0&&r>0&&setCell(r,c,m[2])){say(`✅ ${p}ning yoshi ${m[2]} ga o‘zgartirildi.`);return true}}
    m=q.match(/^(.+?)ning\s+(yoshini|yoshi|ishini|ishi|kasbini|kasbi|pulini|puli|maoshini|daromadini|lavozimini)\s+(.+?)\s*(?:ga|qil|bo['’]?lsin|o['’]?zgartir|almashtir)?$/i);
    if(m){const p=m[1].trim(),f=field(m[2]),v=m[3].trim().replace(/\s+(?:ga|qil|bo['’]?lsin|o['’]?zgartir|almashtir)$/i,""),c=col(p),r=row(f);if(c>0&&r>0&&v){setCell(r,c,v);say(`✅ ${p}ning ${f.toLowerCase()} qiymati “${v}” qilindi.`);return true}}
    m=q.match(/^(.+?)ning\s+ismini\s+(.+?)\s*(?:ga)?\s*(?:qil|bo['’]?lsin|o['’]?zgartir|almashtir)$/i);
    if(m){const c=col(m[1].trim()),newName=m[2].trim().replace(/\s+(?:qil|bo['’]?lsin|o['’]?zgartir|almashtir)$/i,"");if(c>0){table().rows[0].cells[c].textContent=newName;flash(table().rows[0].cells[c]);setStatus("Diagramma yangilandi");say(`✅ Ism “${newName}” qilindi.`);return true}}
    if(/^(?:yana\s+bir|yangi)\s+(?:odam|inson|shaxs)(?:\s+qo['’]?sh)?$/.test(q)){addCol();say("✅ Yangi odam uchun ustun qo‘shildi.");return true}
    m=q.match(/^(?:yana\s+bir|yangi)\s+(?:odam|inson|shaxs)\s+(.+?)\s+qo['’]?sh/i);if(m){addCol(m[1]);say(`✅ “${m[1]}” uchun ustun qo‘shildi.`);return true}
    m=q.match(/^(.+?)\s*(?:ni)?\s*(?:o['’]?chir|delete|remove)$/i);if(m&&delCol(m[1].trim())){say(`✅ “${m[1].trim()}” ustuni o‘chirildi.`);return true}
    if(/^(?:yana|yangi|shu)\s+(?:bir\s+)?(?:ma['’]?lumot|satr|qator)(?:ni)?\s+qo['’]?sh/.test(q)){addRow();say("✅ Yangi ma’lumot satri qo‘shildi.");return true}
    m=q.match(/^(.+?)\s+(?:satr|qator)(?:ni)?\s*(?:o['’]?chir|delete|remove)$/i);if(m&&delRow(m[1].trim())){say(`✅ “${m[1].trim()}” satri o‘chirildi.`);return true}
    if(/^(?:shu\s+)?satrni\s+o['’]?chir/.test(q)){const t=table();if(t&&t.rows.length>2){t.deleteRow(t.rows.length-1);setStatus("Diagramma yangilandi");say("✅ Oxirgi satr o‘chirildi.");return true}}
    return false;
  }
  function capture(e){if(e.type==="keydown"&&!(e.key==="Enter"&&!e.shiftKey))return;if(e.type==="click"&&e.target!==sendBtn)return;const q=promptEl.value.trim();if(!q)return;if(!command(q))return;e.preventDefault();e.stopImmediatePropagation();say(q,"user");promptEl.value=""}
  sendBtn.addEventListener("click",capture,true);promptEl.addEventListener("keydown",capture,true);
  function fit(){const t=table();if(t){t.style.minWidth="0";t.style.width="100%";t.style.tableLayout="fixed"}}
  new MutationObserver(fit).observe(editorEl,{childList:true,subtree:true});fit();
})();