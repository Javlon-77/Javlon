const CONFIG={API_BASE_URL:"https://word-dkng.onrender.com"};
const $=id=>document.getElementById(id);
const editor=$("editor"),fileInput=$("fileInput"),mediaInput=$("mediaInput"),fileName=$("fileName"),statusEl=$("status")||$("statusText"),messages=$("messages"),promptEl=$("prompt"),sendBtn=$("sendBtn"),downloadBtn=$("downloadBtn"),newBtn=$("newBtn"),topFileName=$("topFileName"),saveState=$("saveState"),dropZone=$("dropZone");
let currentFileName="Yangi AI hujjat.docx",currentDocumentId="",currentFileHandle=null;
function api(path){return String(CONFIG.API_BASE_URL||"").replace(/\/+$/g,"")+path}
function setStatus(text){if(statusEl)statusEl.textContent=text;if(saveState)saveState.textContent=text}
function addMessage(text,role="ai"){if(!messages)return;const d=document.createElement("div");d.className=`bubble ${role}`;d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight}
const say=addMessage;
async function readResponse(r){const type=r.headers.get("content-type")||"";if(type.includes("application/json")){const d=await r.json();if(!r.ok)throw new Error(d.error||`Server xatosi (${r.status})`);return d}if(!r.ok)throw new Error((await r.text().catch(()=>""))||`Server xatosi (${r.status})`);return r}
function rememberFile(name){currentFileName=name||"Yangi AI hujjat.docx";if(fileName)fileName.textContent=currentFileName;if(topFileName)topFileName.textContent=currentFileName}
function closeFiles(){const p=$("filesPanel");if(p)p.classList.remove("open")}
async function loadRecents(mode="files"){
  const p=$("filesPanel"),title=$("filesTitle"),body=$("filesBody");if(!p||!title||!body)return;
  title.textContent=mode==="favorites"?"★ Mening fayllarim · Sevimlilar":"📁 Mening fayllarim · Recents";
  body.innerHTML='<div style="padding:14px;color:#91a0ba;font-size:11px">Yuklanmoqda...</div>';p.classList.add("open");
  try{
    const d=await readResponse(await fetch(api("/api/files"),{cache:"no-store"}));
    let files=Array.isArray(d.files)?d.files:[];if(mode==="favorites")files=files.filter(x=>x.favorite);files.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    body.innerHTML="";
    if(!files.length){body.innerHTML='<div style="padding:14px;color:#91a0ba;font-size:11px">Hozircha fayl yo‘q.</div>';return}
    files.forEach(item=>{const row=document.createElement("div");row.className="file-card";const icon=document.createElement("div");icon.className="file-icon";icon.textContent="📄";const info=document.createElement("div");info.style.flex="1";const strong=document.createElement("strong");strong.textContent=item.name;const small=document.createElement("span");small.textContent=new Date(item.updatedAt).toLocaleString("uz-UZ");small.style.display="block";small.style.color="#91a0ba";small.style.fontSize="8px";info.append(strong,small);const actions=document.createElement("div");actions.className="file-actions";const fav=document.createElement("button");fav.type="button";fav.textContent=item.favorite?"★":"☆";fav.title="Sevimli";fav.addEventListener("click",async e=>{e.stopPropagation();try{await readResponse(await fetch(api(`/api/files/${encodeURIComponent(item.id)}/favorite`),{method:"POST"}));await loadRecents(mode)}catch(err){say(`❌ ${err.message}`)}});const down=document.createElement("button");down.type="button";down.textContent="⬇";down.title="Yuklab olish";down.addEventListener("click",e=>{e.stopPropagation();window.open(api(`/api/files/${encodeURIComponent(item.id)}/download`),"_blank")});actions.append(fav,down);row.addEventListener("click",()=>openSavedFile(item.id));row.append(icon,info,actions);body.appendChild(row)})
  }catch(e){body.innerHTML=`<div style="padding:14px;color:#ff8b8b;font-size:11px">${e.message}</div>`}
}
async function openSavedFile(id){
  try{setStatus("Fayl ochilmoqda...");say("📂 Saqlangan Word fayli ochilmoqda...");const d=await readResponse(await fetch(api(`/api/files/${encodeURIComponent(id)}`),{cache:"no-store"}));currentDocumentId=d.documentId;currentFileHandle=null;rememberFile(d.fileName);if(editor)editor.innerText=d.text||"";closeFiles();setStatus("Fayl ochildi");say(`✅ ${d.fileName} saqlangan o‘zgarishlari bilan ochildi.`)}catch(e){say(`❌ Faylni ochib bo‘lmadi: ${e.message}`);setStatus("Xatolik")}
}
function setupNavigation(){
  const buttons=[...document.querySelectorAll(".nav button")];buttons.forEach((b,i)=>b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();buttons.forEach(x=>x.classList.remove("active"));b.classList.add("active");const t=b.textContent||"";if(i===0){closeFiles();say("🏠 Bosh sahifa ochildi.")}else if(/Mening fayllarim|Yaqinda/i.test(t)){loadRecents("files");say("📁 Recents ochildi.")}else if(/Sevimlilar/i.test(t)){loadRecents("favorites");say("★ Sevimlilar ochildi.")}else if(/Sozlamalar/i.test(t)){closeFiles();say("⚙️ Sozlamalar ochildi.")}}));
  $("filesTopBtn")?.addEventListener("click",e=>{e.preventDefault();loadRecents("files");say("📁 Mening fayllarim ochildi.")});
  $("closeFiles")?.addEventListener("click",e=>{e.preventDefault();closeFiles()})
}
async function chooseWordFile(){
  try{
    if(window.showOpenFilePicker){
      const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:"Word hujjati",accept:{"application/vnd.openxmlformats-officedocument.wordprocessingml.document":[".docx"]}}]});
      currentFileHandle=handle;const file=await handle.getFile();return file;
    }
    fileInput?.click();return null;
  }catch(e){if(e?.name!=="AbortError")say(`❌ Word tanlashda xato: ${e.message}`);return null}
}
async function uploadWord(file){
  if(!file)return;
  say(`📄 ${file.name} tanlandi. Word fayl ochilmoqda...`);setStatus("Word ochilmoqda...");
  try{const form=new FormData();form.append("file",file);const d=await readResponse(await fetch(api("/api/extract"),{method:"POST",body:form}));currentDocumentId=d.documentId;rememberFile(d.fileName||file.name);if(editor)editor.innerText=d.text||"";closeFiles();setStatus("Word ulandi");say(`✅ ${file.name} Word’ga kirdi. Endi tahrirlash mumkin.`)}catch(err){setStatus("Word xatosi");say(`❌ Word faylini ochib bo‘lmadi: ${err.message}`)}
}
function setupWord(){
  $("wordBtn")?.addEventListener("click",async e=>{e.preventDefault();const file=await chooseWordFile();if(file)await uploadWord(file)});
  fileInput?.addEventListener("change",async()=>{const file=fileInput.files?.[0];if(file){currentFileHandle=null;await uploadWord(file)}fileInput.value=""})
}
async function saveWord(){
  if(!currentDocumentId){say("⚠️ Saqlash uchun avval Word faylini oching.");return}
  setStatus("Saqlanmoqda...");say(`💾 ${currentFileName} Word faylining o‘ziga saqlanmoqda...`);
  try{
    const text=editor?.innerText||"";
    const d=await readResponse(await fetch(api("/api/save"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:currentDocumentId,text})}));
    if(currentFileHandle && "createWritable" in currentFileHandle){
      try{const writable=await currentFileHandle.createWritable();const blob=await (await fetch(api(`/api/files/${encodeURIComponent(currentDocumentId)}/download`),{cache:"no-store"})).blob();await writable.write(blob);await writable.close();say("📌 Kompyuteringizdagi tanlangan Word fayli ham yangilandi.")}catch(localErr){say(`⚠️ Serverga saqlandi, lekin kompyuterdagi original faylni yangilashga ruxsat berilmadi: ${localErr.message}`)}}
    setStatus("Saqlangan");say(`✅ ${d.fileName} saqlandi. Endi shu faylni Word’da ochsangiz, o‘zgarishlar ham bo‘ladi.`);await loadRecents("files");closeFiles();
  }catch(e){setStatus("Saqlash xatosi");say(`❌ Saqlashda xato: ${e.message}`)}
}
function addMedia(file){if(!editor||!file)return;const wrap=document.createElement("div");wrap.contentEditable="false";wrap.className="inline-media-wrap";wrap.style.margin="14px 0";const url=URL.createObjectURL(file);if(file.type.startsWith("image/")){const img=document.createElement("img");img.src=url;img.alt=file.name;img.style.maxWidth="100%";img.style.borderRadius="10px";wrap.appendChild(img);say(`🖼️ ${file.name} rasm sifatida qo‘shildi.`)}else if(file.type.startsWith("video/")){const video=document.createElement("video");video.src=url;video.controls=true;video.style.maxWidth="100%";wrap.appendChild(video);say(`🎥 ${file.name} video sifatida qo‘shildi.`)}else{const chip=document.createElement("div");chip.textContent="📎 "+file.name;chip.style.padding="10px";chip.style.border="1px solid rgba(255,255,255,.1)";chip.style.borderRadius="10px";wrap.appendChild(chip);say(`📎 ${file.name} fayl sifatida qo‘shildi.`)}editor.appendChild(wrap);setStatus("Media qo‘shildi")}
function setupMedia(){
  $("mediaBtn")?.addEventListener("click",e=>{e.preventDefault();mediaInput?.click();say("📎 Media tanlash oynasi ochildi.")});$("chatAttach")?.addEventListener("click",e=>{e.preventDefault();mediaInput?.click();say("📎 Media tanlash oynasi ochildi.")});
  mediaInput?.addEventListener("change",()=>{[...(mediaInput.files||[])].forEach(addMedia);mediaInput.value=""});
}
newBtn?.addEventListener("click",e=>{e.preventDefault();if(editor)editor.innerHTML="";currentDocumentId="";currentFileHandle=null;rememberFile("Yangi AI hujjat.docx");closeFiles();setStatus("Yangi hujjat");say("📝 Yangi hujjat yaratildi.")});
$("saveBtn")?.addEventListener("click",e=>{e.preventDefault();saveWord()});
async function sendPrompt(text=promptEl?.value){const instruction=String(text||"").trim();if(!instruction){say("✍️ Avval AI uchun topshiriq yozing.");return}addMessage(instruction,"user");if(promptEl)promptEl.value="";if(sendBtn)sendBtn.disabled=true;setStatus("AI ishlayapti...");say(`🤖 AI ishlayapti: “${instruction}”`);try{const d=await readResponse(await fetch(api("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:currentDocumentId,documentText:editor?.innerText||"",instruction})}));if(d.changed){if(editor)editor.innerText=d.editedDocument||editor.innerText;setStatus("AI tahrirladi");say("✅ AI hujjatni tahrirladi. Saqlash tugmasini bosib Word fayliga yozing.")}else say("✅ AI javobi tayyor.");if(d.answer)addMessage(d.answer,"ai")}catch(err){setStatus("AI xatosi");say(`❌ AI xatosi: ${err.message}`)}finally{if(sendBtn)sendBtn.disabled=false}}
sendBtn?.addEventListener("click",e=>{e.preventDefault();sendPrompt()});promptEl?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendPrompt()}});document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();sendPrompt(b.dataset.prompt)}));
downloadBtn?.addEventListener("click",async e=>{e.preventDefault();if(!currentDocumentId){say("⚠️ Avval Word faylini oching.");return}try{say(`📥 ${currentFileName} tayyorlanmoqda...`);const r=await readResponse(await fetch(api("/api/export"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:currentDocumentId,text:editor?.innerText||""})}));const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=currentFileName;a.click();URL.revokeObjectURL(url);say(`✅ ${currentFileName} yuklab olindi.`)}catch(e2){say(`❌ Yuklab olishda xato: ${e2.message}`)}});
$("imageBtn")?.addEventListener("click",e=>{e.preventDefault();if(promptEl){promptEl.value="AI rasm yarat: ";promptEl.focus()}say("✨ AI rasm rejimi tayyor. Tavsif yozing.")});
function setupToolbar(){const tools=[...document.querySelectorAll(".toolbar-left .tool")];const actions=["undo","redo","bold","italic","underline","justifyLeft","justifyCenter","justifyRight"];const names={undo:"↶ Bekor qilindi.",redo:"↷ Qayta tiklandi.",bold:"B Qalin yozuv yoqildi.",italic:"I Kursiv yozuv yoqildi.",underline:"U Tagiga chizish yoqildi.",justifyLeft:"⬅ Chapga tekislandi.",justifyCenter:"↔ Markazga tekislandi.",justifyRight:"➡ O‘ngga tekislandi."};tools.forEach((b,i)=>b.addEventListener("click",e=>{e.preventDefault();editor?.focus();document.execCommand(actions[i],false,null);setStatus("O‘zgartirildi");say(`✅ ${names[actions[i]]}`)}))}
function setupEditor(){editor?.addEventListener("input",()=>setStatus("O‘zgarishlar kiritildi"));if(dropZone&&editor){editor.addEventListener("dragover",e=>{e.preventDefault();dropZone.style.display="grid"});editor.addEventListener("dragleave",()=>dropZone.style.display="none");editor.addEventListener("drop",e=>{e.preventDefault();dropZone.style.display="none";[...(e.dataTransfer?.files||[])].forEach(addMedia);say("📥 Fayl editorga tashlandi.")})}}
async function checkBackend(){try{const d=await readResponse(await fetch(api("/health"),{cache:"no-store"}));setStatus(d.aiConfigured?"AI ulangan":"AI kalit sozlanmagan");say(d.aiConfigured?"🟢 AI backend ulangan.":"🟡 Backend ulangan, AI kaliti sozlanmagan.")}catch{setStatus("Backend ulanmagan");say("🔴 Backend ulanmagan.")}}
function init(){setupNavigation();setupWord();setupMedia();setupToolbar();setupEditor();checkBackend();say("✅ Tayyor. Word faylni oching — o‘zgarishlar uning o‘ziga saqlanadi.")}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();