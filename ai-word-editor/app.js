const CONFIG={API_BASE_URL:"https://word-dkng.onrender.com"};
const $=id=>document.getElementById(id);
const editor=$("editor"),fileInput=$("fileInput"),mediaInput=$("mediaInput"),fileName=$("fileName"),statusEl=$("status")||$("statusText"),messages=$("messages"),promptEl=$("prompt"),sendBtn=$("sendBtn"),downloadBtn=$("downloadBtn"),newBtn=$("newBtn"),topFileName=$("topFileName"),saveState=$("saveState"),dropZone=$("dropZone");
let currentFileName="Yangi AI hujjat.docx",currentDocumentId="",currentFileHandle=null;
const api=path=>String(CONFIG.API_BASE_URL||"").replace(/\/+$/g,"")+path;
function setStatus(text){if(statusEl)statusEl.textContent=text;if(saveState)saveState.textContent=text}
function say(text,role="ai"){if(!messages)return;const d=document.createElement("div");d.className=`bubble ${role}`;d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight}
async function readResponse(r){const type=r.headers.get("content-type")||"";if(type.includes("application/json")){const d=await r.json();if(!r.ok)throw new Error(d.error||`Server xatosi (${r.status})`);return d}if(!r.ok)throw new Error((await r.text().catch(()=>""))||`Server xatosi (${r.status})`);return r}
function rememberFile(name){currentFileName=name||"Yangi AI hujjat.docx";if(fileName)fileName.textContent=currentFileName;if(topFileName)topFileName.textContent=currentFileName}
function closeFiles(){const p=$("filesPanel");if(p)p.classList.remove("open")}

const DB_NAME="ai-word-studio",DB_STORE="handles";
function openHandleDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(DB_STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function putHandle(id,handle){try{const db=await openHandleDB();await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,"readwrite");tx.objectStore(DB_STORE).put(handle,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}catch{}}
async function getHandle(id){try{const db=await openHandleDB();const value=await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,"readonly");const r=tx.objectStore(DB_STORE).get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)});db.close();return value}catch{return null}}
async function requestHandlePermission(handle){if(!handle?.queryPermission)return true;let p=await handle.queryPermission({mode:"readwrite"});if(p!=="granted"&&handle.requestPermission)p=await handle.requestPermission({mode:"readwrite"});return p==="granted"}

async function loadRecents(mode="files"){
  const p=$("filesPanel"),title=$("filesTitle"),body=$("filesBody");if(!p||!title||!body)return;
  title.textContent=mode==="favorites"?"★ Sevimlilar":"📁 Mening fayllarim";body.innerHTML='<div class="file-loading">Yuklanmoqda...</div>';p.classList.add("open");
  try{const d=await readResponse(await fetch(api("/api/files"),{cache:"no-store"}));let files=Array.isArray(d.files)?d.files:[];if(mode==="favorites")files=files.filter(x=>x.favorite);body.innerHTML="";
    if(!files.length){body.innerHTML='<div class="file-empty"><b>Hozircha fayl yo‘q</b><span>Word fayl oching — shu yerda Recent sifatida paydo bo‘ladi.</span></div>';return}
    files.forEach(item=>{const row=document.createElement("div");row.className="file-card";const icon=document.createElement("div");icon.className="file-icon";icon.textContent="📄";const info=document.createElement("div");info.className="file-info";const strong=document.createElement("strong");strong.textContent=item.name;const small=document.createElement("span");small.textContent=new Date(item.updatedAt).toLocaleString("uz-UZ");info.append(strong,small);const actions=document.createElement("div");actions.className="file-actions";const fav=document.createElement("button");fav.type="button";fav.textContent=item.favorite?"★":"☆";fav.title="Sevimli";fav.onclick=async e=>{e.stopPropagation();try{await readResponse(await fetch(api(`/api/files/${encodeURIComponent(item.id)}/favorite`),{method:"POST"}));await loadRecents(mode)}catch{}};const down=document.createElement("button");down.type="button";down.textContent="↓";down.title="Yuklab olish";down.onclick=e=>{e.stopPropagation();const a=document.createElement("a");a.href=api(`/api/files/${encodeURIComponent(item.id)}/download`);a.download=item.name;document.body.appendChild(a);a.click();a.remove()};actions.append(fav,down);row.onclick=()=>openSavedFile(item);row.append(icon,info,actions);body.appendChild(row)})
  }catch{body.innerHTML='<div class="file-empty"><b>Fayllarni yuklab bo‘lmadi</b><span>Serverga ulanishni tekshiring.</span></div>'}
}
async function openSavedFile(item){
  try{setStatus("Fayl ochilmoqda...");const d=await readResponse(await fetch(api(`/api/files/${encodeURIComponent(item.id)}`),{cache:"no-store"}));currentDocumentId=d.documentId;rememberFile(d.fileName);currentFileHandle=await getHandle(item.id);if(currentFileHandle){try{if(!(await requestHandlePermission(currentFileHandle)))currentFileHandle=null}catch{currentFileHandle=null}}if(editor)editor.innerText=d.text||"";closeFiles();setStatus("Fayl ochildi");say(`📂 ${d.fileName} ochildi.`)}catch(e){setStatus("Xatolik");say(`❌ ${e.message}`)}
}

async function chooseWordFile(){
  try{
    if(window.showOpenFilePicker){const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:"Word hujjati",accept:{"application/vnd.openxmlformats-officedocument.wordprocessingml.document":[".docx"]}}]});currentFileHandle=handle;const file=await handle.getFile();return file}
    fileInput?.click();return null;
  }catch(e){if(e?.name!=="AbortError")say("❌ Word faylini tanlab bo‘lmadi.");return null}
}
async function uploadWord(file){if(!file)return;try{const form=new FormData();form.append("file",file);setStatus("Word ochilmoqda...");const d=await readResponse(await fetch(api("/api/extract"),{method:"POST",body:form}));currentDocumentId=d.documentId;rememberFile(d.fileName||file.name);if(currentFileHandle)await putHandle(currentDocumentId,currentFileHandle);if(editor)editor.innerText=d.text||"";closeFiles();setStatus("Word ulandi");say(`✅ ${file.name} Word’ga kirdi.`)}catch(e){setStatus("Word xatosi");say(`❌ ${e.message}`)}}
function setupWord(){$("wordBtn")?.addEventListener("click",async e=>{e.preventDefault();const file=await chooseWordFile();if(file)await uploadWord(file)});fileInput?.addEventListener("change",async()=>{const file=fileInput.files?.[0];if(file){currentFileHandle=null;await uploadWord(file)}fileInput.value=""})}

async function saveWord(){
  if(!currentDocumentId){say("⚠️ Avval Word faylini oching.");return}
  setStatus("Saqlanmoqda...");
  try{
    const d=await readResponse(await fetch(api("/api/save"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:currentDocumentId,text:editor?.innerText||"",fileName:currentFileName})}));
    if(currentFileHandle){const ok=await requestHandlePermission(currentFileHandle);if(ok){const r=await fetch(api(`/api/files/${encodeURIComponent(currentDocumentId)}/download`),{cache:"no-store"});if(r.ok){const writable=await currentFileHandle.createWritable();await writable.write(await r.blob());await writable.close()}}}
    setStatus("Saqlandi");say(`💾 ${d.fileName} saqlandi.`);
  }catch(e){setStatus("Saqlash xatosi");say(`❌ ${e.message}`)}
}

function addMedia(file){if(!editor||!file)return;const wrap=document.createElement("div");wrap.contentEditable="false";wrap.className="inline-media-wrap";wrap.style.margin="14px 0";const url=URL.createObjectURL(file);if(file.type.startsWith("image/")){const img=document.createElement("img");img.src=url;img.alt=file.name;img.style.maxWidth="100%";img.style.borderRadius="12px";wrap.appendChild(img);say(`🖼️ ${file.name} qo‘shildi.`)}else if(file.type.startsWith("video/")){const video=document.createElement("video");video.src=url;video.controls=true;video.style.maxWidth="100%";wrap.appendChild(video);say(`🎥 ${file.name} qo‘shildi.`)}else{const chip=document.createElement("div");chip.textContent="📎 "+file.name;chip.className="file-chip";wrap.appendChild(chip);say(`📎 ${file.name} qo‘shildi.`)}editor.appendChild(wrap);setStatus("O‘zgartirildi")}
function setupMedia(){$("mediaBtn")?.addEventListener("click",e=>{e.preventDefault();mediaInput?.click()});$("chatAttach")?.addEventListener("click",e=>{e.preventDefault();mediaInput?.click()});mediaInput?.addEventListener("change",()=>{[...(mediaInput.files||[])].forEach(addMedia);mediaInput.value=""})}
newBtn?.addEventListener("click",e=>{e.preventDefault();if(editor)editor.innerHTML="";currentDocumentId="";currentFileHandle=null;rememberFile("Yangi AI hujjat.docx");closeFiles();setStatus("Yangi hujjat");say("📝 Yangi hujjat yaratildi.")});
$("saveBtn")?.addEventListener("click",e=>{e.preventDefault();saveWord()});

async function sendPrompt(text=promptEl?.value){const instruction=String(text||"").trim();if(!instruction)return;say(instruction,"user");if(promptEl)promptEl.value="";if(sendBtn)sendBtn.disabled=true;setStatus("AI ishlayapti...");try{const d=await readResponse(await fetch(api("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:currentDocumentId,documentText:editor?.innerText||"",instruction})}));if(d.changed){if(editor)editor.innerText=d.editedDocument||editor.innerText;setStatus("AI tahrirladi");say("✅ O‘zgarishlar tayyor. Saqlash tugmasini bossangiz Word fayliga yoziladi.")}if(d.answer)say(d.answer)}catch(e){setStatus("AI xatosi");say(`❌ ${e.message}`)}finally{if(sendBtn)sendBtn.disabled=false}}
sendBtn?.addEventListener("click",e=>{e.preventDefault();sendPrompt()});promptEl?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendPrompt()}});document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>sendPrompt(b.dataset.prompt)));

downloadBtn?.addEventListener("click",async e=>{e.preventDefault();if(!currentDocumentId){say("⚠️ Avval Word faylini oching.");return}try{const r=await readResponse(await fetch(api("/api/export"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:currentDocumentId,text:editor?.innerText||""})}));const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=currentFileName;a.click();URL.revokeObjectURL(url);say(`✅ ${currentFileName} yuklab olindi.`)}catch(e2){say(`❌ ${e2.message}`)}});
$("imageBtn")?.addEventListener("click",e=>{e.preventDefault();if(promptEl){promptEl.value="AI rasm yarat: ";promptEl.focus()}});
function setupToolbar(){const tools=[...document.querySelectorAll(".toolbar-left .tool")],actions=["undo","redo","bold","italic","underline","justifyLeft","justifyCenter","justifyRight"],names=["Bekor qilindi.","Qayta tiklandi.","Qalin yozuv yoqildi.","Kursiv yozuv yoqildi.","Tagiga chizish yoqildi.","Chapga tekislandi.","Markazga tekislandi.","O‘ngga tekislandi."];tools.forEach((b,i)=>b.addEventListener("click",e=>{e.preventDefault();editor?.focus();document.execCommand(actions[i],false,null);setStatus("O‘zgartirildi");say(`✅ ${names[i]}`)}))}
function setupEditor(){editor?.addEventListener("input",()=>setStatus("O‘zgartirildi"));if(dropZone&&editor){editor.addEventListener("dragover",e=>{e.preventDefault();dropZone.style.display="grid"});editor.addEventListener("dragleave",()=>dropZone.style.display="none");editor.addEventListener("drop",e=>{e.preventDefault();dropZone.style.display="none";[...(e.dataTransfer?.files||[])].forEach(addMedia)})}}
function setupNavigation(){const buttons=[...document.querySelectorAll(".nav button")];buttons.forEach((b,i)=>b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();buttons.forEach(x=>x.classList.remove("active"));b.classList.add("active");const t=b.textContent||"";if(/Mening fayllarim|Yaqinda/i.test(t))loadRecents("files");else if(/Sevimlilar/i.test(t))loadRecents("favorites");else if(/Bosh sahifa/i.test(t))closeFiles()}));$("filesTopBtn")?.addEventListener("click",e=>{e.preventDefault();loadRecents("files")});$("closeFiles")?.addEventListener("click",e=>{e.preventDefault();closeFiles()})}
async function checkBackend(){try{const d=await readResponse(await fetch(api("/health"),{cache:"no-store"}));setStatus(d.aiConfigured?"AI ulangan":"AI kalit sozlanmagan")}catch{setStatus("Backend ulanmagan")}}
function init(){setupNavigation();setupWord();setupMedia();setupToolbar();setupEditor();checkBackend()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();