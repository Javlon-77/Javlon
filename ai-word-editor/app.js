const CONFIG = {
  API_BASE_URL: "https://word-dkng.onrender.com",
};

const editor = document.getElementById("editor");
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const statusEl = document.getElementById("status");
const messages = document.getElementById("messages");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const downloadBtn = document.getElementById("downloadBtn");
const newBtn = document.getElementById("newBtn");

let currentFileName = "AI-Word-Hujjat.docx";
let currentDocumentId = "";
let originalWordFileLoaded = false;

function api(path) {
  const base = String(CONFIG.API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base || base.includes("PASTE_YOUR")) throw new Error("Backend URL hali sozlanmagan.");
  return `${base}${path}`;
}

async function readResponse(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Server xatosi (${response.status}).`);
    return data;
  }
  if (!response.ok) throw new Error((await response.text().catch(() => "")) || `Server xatosi (${response.status}).`);
  return response;
}

function setStatus(text) { statusEl.textContent = text; }

function addMessage(text, role = "ai") {
  const d = document.createElement("div");
  d.className = `bubble ${role}`;
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function loading(on) {
  let el = document.getElementById("loading");
  if (on && !el) {
    el = document.createElement("div");
    el.id = "loading";
    el.className = "bubble ai";
    el.textContent = "AI yozmoqda...";
    messages.appendChild(el);
  }
  if (!on) el?.remove();
  messages.scrollTop = messages.scrollHeight;
}

async function checkBackend() {
  try {
    const response = await fetch(api("/health"), { method: "GET", cache: "no-store" });
    const data = await readResponse(response);
    if (!data.aiConfigured) {
      setStatus("AI kalit sozlanmagan");
      addMessage("⚠️ Backend ishlayapti, lekin GROQ_API_KEY Render’da sozlanmagan.");
      return false;
    }
    setStatus("AI ulangan");
    return true;
  } catch (error) {
    setStatus("Backend ulanmagan");
    addMessage(`❌ Backendga ulanib bo‘lmadi: ${error.message}`);
    return false;
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".docx")) {
    setStatus("Xatolik");
    addMessage("❌ Hozircha Word uchun faqat .docx faylni tanlang.");
    fileInput.value = "";
    return;
  }

  try {
    setStatus("Word strukturasi o‘qilmoqda...");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(api("/api/extract"), { method: "POST", body: form });
    const data = await readResponse(response);

    currentDocumentId = data.documentId || "";
    originalWordFileLoaded = Boolean(currentDocumentId);
    editor.value = data.text || "";
    currentFileName = file.name;
    fileName.textContent = file.name;
    setStatus("Ulandi — Word format saqlanadi");
    addMessage(`✅ "${file.name}" ulandi. Rasm, diagramma, jadval va Word obyektlari asl faylda saqlanadi.`);
  } catch (error) {
    setStatus("Xatolik");
    addMessage(`❌ ${error.message}`);
  }
});

newBtn.addEventListener("click", () => {
  editor.value = "";
  currentDocumentId = "";
  originalWordFileLoaded = false;
  currentFileName = "Yangi-AI-Hujjat.docx";
  fileName.textContent = "Yangi AI hujjat.docx";
  setStatus("Yangi hujjat");
  addMessage("📝 Yangi bo‘sh hujjat yaratildi.");
});

async function sendPrompt(text = promptEl.value) {
  const instruction = String(text || "").trim();
  if (!instruction) return;

  addMessage(instruction, "user");
  promptEl.value = "";
  sendBtn.disabled = true;
  setStatus("AI ishlayapti...");
  loading(true);

  try {
    const response = await fetch(api("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: currentDocumentId, documentText: editor.value, instruction }),
    });
    const data = await readResponse(response);
    loading(false);

    if (data.changed) {
      editor.value = data.editedDocument || editor.value;
      currentDocumentId = data.documentId || currentDocumentId;
      setStatus(originalWordFileLoaded ? "Tahrirlandi — obyektlar saqlanadi" : "Hujjat yangilandi");
      addMessage(`✅ ${data.answer || "Hujjat yangilandi."}`);
    } else {
      addMessage(data.answer || "Javob tayyor.");
      setStatus("Tayyor");
    }
  } catch (error) {
    loading(false);
    addMessage(`❌ ${error.message}`);
    setStatus("Xatolik");
  } finally {
    sendBtn.disabled = false;
    promptEl.focus();
  }
}

sendBtn.addEventListener("click", () => sendPrompt());
promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => sendPrompt(button.dataset.prompt)));

downloadBtn.addEventListener("click", async () => {
  try {
    if (!originalWordFileLoaded || !currentDocumentId) throw new Error("Avval asl .docx Word faylni ulang. Shunda rasm, diagramma va formatlar saqlanadi.");
    setStatus("Asl Word fayl saqlangan holda tayyorlanmoqda...");
    const response = await fetch(api("/api/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: currentDocumentId, text: editor.value, fileName: currentFileName }),
    });
    await readResponse(response);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFileName.replace(/\.docx$/i, "") + "-AI.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Word yuklandi — obyektlar saqlangan");
  } catch (error) {
    addMessage(`❌ ${error.message}`);
    setStatus("Xatolik");
  }
});

checkBackend();
const CONFIG={API_BASE_URL:"https://word-dkng.onrender.com"};
const editor=document.getElementById("editor"),fileInput=document.getElementById("fileInput"),mediaInput=document.getElementById("mediaInput"),fileName=document.getElementById("fileName"),statusEl=document.getElementById("status"),messages=document.getElementById("messages"),promptEl=document.getElementById("prompt"),sendBtn=document.getElementById("sendBtn"),downloadBtn=document.getElementById("downloadBtn"),newBtn=document.getElementById("newBtn"),imageBtn=document.getElementById("imageBtn"),saveBtn=document.getElementById("saveBtn"),filesList=document.getElementById("filesList"),historyList=document.getElementById("historyList");
let currentFileName="Yangi-AI-Hujjat.docx",currentFileId=null,attachments=[],savedRange=null,authMode="login";
const tokenKey="ai_word_token",historyKey="ai_word_history";
function api(p){return CONFIG.API_BASE_URL.replace(/\/+$/ ,"")+p}
function headers(json=true){const h={};const t=localStorage.getItem(tokenKey);if(t)h.Authorization=`Bearer ${t}`;if(json)h["Content-Type"]="application/json";return h}
function setStatus(t){statusEl.textContent=t}
function addMessage(text,role="ai"){const d=document.createElement("div");d.className=`bubble ${role}`;d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight;if(role!=="ai"||text!=="Salom!")saveHistory(text,role)}
function saveHistory(text,role){const h=JSON.parse(localStorage.getItem(historyKey)||"[]");h.push({text,role,time:new Date().toLocaleString()});localStorage.setItem(historyKey,JSON.stringify(h.slice(-100)));renderHistory()}
function renderHistory(){const h=JSON.parse(localStorage.getItem(historyKey)||"[]");historyList.innerHTML=h.length?h.slice().reverse().map(x=>`<div class="history-row"><span class="history-role">${x.role==="user"?"Siz":"AI"}</span><div><b>${escapeHtml(x.text.slice(0,120))}</b><small>${x.time}</small></div></div>`).join(""):"<div class='empty'>Hali suhbat yo‘q.</div>"}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]))}
function loading(on){let x=document.getElementById("loading");if(on&&!x){x=document.createElement("div");x.id="loading";x.className="bubble ai";x.textContent="AI ishlayapti...";messages.appendChild(x)}if(!on)x?.remove()}
function formatSize(n){if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;return`${(n/1048576).toFixed(1)} MB`}
function saveSelection(){const s=window.getSelection();if(s&&s.rangeCount&&editor.contains(s.commonAncestorContainer))return s.getRangeAt(0).cloneRange();const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);return r}
function restoreSelection(){editor.focus();const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange||saveSelection())}
function insertNode(node){restoreSelection();const r=window.getSelection().getRangeAt(0);r.deleteContents();r.insertNode(node);r.setStartAfter(node);r.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(r)}
function insertText(t){const p=document.createElement("p");p.textContent=t;insertNode(p)}
function addInlineMedia(file){const url=URL.createObjectURL(file),wrap=document.createElement("div");wrap.className="inline-media-wrap";wrap.contentEditable="false";wrap.dataset.name=file.name;if(file.type.startsWith("image/")){const i=document.createElement("img");i.src=url;i.className="inline-media";wrap.appendChild(i)}else if(file.type.startsWith("video/")){const v=document.createElement("video");v.src=url;v.controls=true;v.className="inline-media";wrap.appendChild(v)}else return false;const c=document.createElement("div");c.className="media-caption";c.textContent=file.name;wrap.appendChild(c);insertNode(wrap);attachments.push({name:file.name,size:file.size,type:file.type,url,element:wrap});return true}
function currentText(){return editor.innerText||""}
async function readTextFile(file){if(!/^(text\/|application\/json$)/i.test(file.type)&&!/\.(txt|md|csv|json)$/i.test(file.name))return"";try{return await file.text()}catch{return""}}
async function requireLogin(){if(localStorage.getItem(tokenKey))return true;openAuth("login");addMessage("🔐 Avval hisobingizga kiring.");return false}
fileInput.addEventListener("change",async()=>{if(!await requireLogin())return;const file=fileInput.files?.[0];if(!file)return;try{setStatus("Word o‘qilmoqda...");const fd=new FormData();fd.append("file",file);const r=await fetch(api("/api/extract"),{method:"POST",headers:headers(false),body:fd});const d=await r.json();if(!r.ok)throw Error(d.error||"Fayl o‘qilmadi");editor.innerHTML="";insertText(d.text||"");currentFileId=d.fileId;currentFileName=d.name;fileName.textContent=d.name;setStatus("Ulandi");addMessage(`✅ ${d.name} ulandi. Endi o‘zgartiring va “💾 O‘zgarishlarni saqlash”ni bosing.`);loadFiles()}catch(e){setStatus("Xatolik");addMessage("❌ "+e.message)}finally{fileInput.value=""}});
mediaInput.addEventListener("change",async()=>{if(!await requireLogin())return;const files=[...mediaInput.files||[]];for(const file of files){savedRange=saveSelection();if(file.size>50*1024*1024){addMessage(`⚠️ ${file.name} 50 MB dan katta.`);continue}if(file.type.startsWith("image/")||file.type.startsWith("video/")){addInlineMedia(file)}else{const p=document.createElement("div");p.className="file-chip";p.contentEditable="false";p.textContent=`📎 ${file.name}`;insertNode(p);attachments.push({name:file.name,size:file.size,type:file.type,text:await readTextFile(file)})}}setStatus(`${files.length} ta fayl hujjatga qo‘shildi`);mediaInput.value=""});
editor.addEventListener("click",()=>savedRange=saveSelection());editor.addEventListener("keyup",()=>savedRange=saveSelection());editor.addEventListener("input",()=>savedRange=saveSelection());
editor.addEventListener("dragover",e=>{e.preventDefault();editor.classList.add("dragging")});editor.addEventListener("dragleave",()=>editor.classList.remove("dragging"));editor.addEventListener("drop",async e=>{e.preventDefault();editor.classList.remove("dragging");savedRange=saveSelection();for(const f of [...e.dataTransfer.files||[]]){if(f.type.startsWith("image/")||f.type.startsWith("video/"))addInlineMedia(f);else{const p=document.createElement("div");p.className="file-chip";p.contentEditable="false";p.textContent=`📎 ${f.name}`;insertNode(p);attachments.push({name:f.name,size:f.size,type:f.type,text:await readTextFile(f)})}}});
editor.addEventListener("paste",e=>{const item=[...e.clipboardData.items||[]].find(x=>x.kind==="file"&&(x.type.startsWith("image/")||x.type.startsWith("video/")));if(item){e.preventDefault();const f=item.getAsFile();if(f){savedRange=saveSelection();addInlineMedia(f)}}});
async function createImage(p){if(!await requireLogin())return;savedRange=saveSelection();imageBtn.disabled=true;sendBtn.disabled=true;setStatus("AI rasm yaratyapti...");loading(true);try{const r=await fetch(api("/api/generate-image"),{method:"POST",headers:headers(),body:JSON.stringify({prompt:p})});const d=await r.json();if(!r.ok)throw Error(d.error);loading(false);const w=document.createElement("div");w.className="inline-media-wrap generated-media";w.contentEditable="false";const i=document.createElement("img");i.src=d.dataUrl;i.className="inline-media";w.appendChild(i);const c=document.createElement("div");c.className="media-caption";c.textContent="✨ AI yaratgan rasm";w.appendChild(c);insertNode(w);attachments.push({name:"AI-generated-image.png",size:0,type:"image/png",url:d.dataUrl});setStatus("AI rasm qo‘shildi");addMessage("✅ AI rasmi hujjatga qo‘shildi.")}catch(e){loading(false);addMessage("❌ "+e.message);setStatus("Xatolik")}finally{imageBtn.disabled=false;sendBtn.disabled=false}}
imageBtn.addEventListener("click",()=>{const p=prompt("Qanday rasm yaratilsin?",promptEl.value||"");if(p)createImage(p)});
async function sendPrompt(text=promptEl.value){const instruction=String(text).trim();if(!instruction)return;if(!await requireLogin())return;addMessage(instruction,"user");promptEl.value="";if(/^(ai\s*)?(rasm|surat)\s*(yarat|chiz)|rasm yarat|surat yarat/i.test(instruction))return createImage(instruction.replace(/^(ai\s*)?(rasm|surat)\s*(yarat|chiz)[:\-]?\s*/i,""));sendBtn.disabled=true;setStatus("AI ishlayapti...");loading(true);try{const r=await fetch(api("/api/chat"),{method:"POST",headers:headers(),body:JSON.stringify({documentText:currentText(),instruction,attachments:attachments.map(x=>({name:x.name,type:x.type,size:x.size,text:x.text||""}))})});const d=await r.json();if(!r.ok)throw Error(d.error);loading(false);if(d.changed){editor.innerHTML="";insertText(d.editedDocument||"");setStatus("Tahrir tayyor — saqlashga tayyor");addMessage("✅ Hujjat o‘zgartirildi. Endi yuqoridagi “💾 O‘zgarishlarni saqlash” tugmasini bosing.")}else{addMessage(d.answer||"Javob tayyor.");setStatus("Tayyor")}}catch(e){loading(false);addMessage("❌ "+e.message);setStatus("Xatolik")}finally{sendBtn.disabled=false}}
sendBtn.addEventListener("click",()=>sendPrompt());promptEl.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendPrompt()}});document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>sendPrompt(b.dataset.prompt)));
saveBtn.addEventListener("click",async()=>{if(!await requireLogin())return;if(!currentFileId){addMessage("⚠️ Avval Word faylni ulang.");return}saveBtn.disabled=true;setStatus("Asl Word fayliga saqlanmoqda...");try{const r=await fetch(api("/api/save-original"),{method:"POST",headers:headers(),body:JSON.stringify({fileId:currentFileId,text:currentText()})});const d=await r.json();if(!r.ok)throw Error(d.error);setStatus("Saqlangan");addMessage("✅ O‘zgarishlar ulangan Word faylining o‘ziga saqlandi.");loadFiles()}catch(e){addMessage("❌ "+e.message);setStatus("Xatolik")}finally{saveBtn.disabled=false}});
downloadBtn.addEventListener("click",async()=>{if(!await requireLogin())return;try{setStatus("Word tayyorlanmoqda...");const r=await fetch(api("/api/export"),{method:"POST",headers:headers(),body:JSON.stringify({text:currentText(),fileName:currentFileName})});if(!r.ok){const d=await r.json();throw Error(d.error)}const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=currentFileName.replace(/\.docx$/i,"")+"-AI.docx";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);setStatus("Yuklandi")}catch(e){addMessage("❌ "+e.message);setStatus("Xatolik")}});
newBtn.addEventListener("click",()=>{editor.innerHTML="";currentFileId=null;currentFileName="Yangi-AI-Hujjat.docx";fileName.textContent=currentFileName;attachments=[];setStatus("Yangi hujjat");addMessage("📝 Yangi hujjat yaratildi.")});
async function loadFiles(){if(!localStorage.getItem(tokenKey)){filesList.innerHTML="<div class='empty'>Kirishdan keyin fayllaringiz shu yerda chiqadi.</div>";return}try{const r=await fetch(api("/api/files"),{headers:headers(false)});const d=await r.json();if(!r.ok)throw Error(d.error);filesList.innerHTML=d.files?.length?d.files.map(f=>`<div class="file-card"><div class="file-icon">📄</div><div class="file-meta"><b>${escapeHtml(f.name)}</b><span>${formatSize(f.size||0)}</span><small>${new Date(f.updatedAt).toLocaleString()}</small></div><button data-download="${f.id}" class="outline">Yuklab olish</button></div>`).join(""):"<div class='empty'>Hali Word fayl ulanmagan.</div>";document.querySelectorAll("[data-download]").forEach(b=>b.onclick=()=>{window.location.href=api(`/api/files/${b.dataset.download}/download`)+`?t=${Date.now()}`})}catch(e){filesList.innerHTML=`<div class='empty'>${escapeHtml(e.message)}</div>`}}
document.getElementById("refreshFiles").onclick=loadFiles;
function openAuth(mode){authMode=mode;document.getElementById("authModal").classList.remove("hidden");document.getElementById("authTitle").textContent=mode==="login"?"Kirish":"Ro‘yxatdan o‘tish";document.getElementById("authDesc").textContent=mode==="login"?"AI Word Studio hisobingizga kiring.":"Yangi hisob yarating.";document.getElementById("authSubmit").textContent=mode==="login"?"Kirish":"Hisob yaratish";document.getElementById("authSwitch").textContent=mode==="login"?"Hisobingiz yo‘qmi? Ro‘yxatdan o‘ting":"Hisobingiz bormi? Kirish"}
document.getElementById("loginBtn").onclick=()=>openAuth("login");document.getElementById("registerBtn").onclick=()=>openAuth("register");document.getElementById("closeModal").onclick=()=>document.getElementById("authModal").classList.add("hidden");document.getElementById("authSwitch").onclick=()=>openAuth(authMode==="login"?"register":"login");document.getElementById("authSubmit").onclick=async()=>{const email=document.getElementById("authEmail").value.trim(),password=document.getElementById("authPassword").value;if(!email||!password)return alert("Email va parolni kiriting.");try{const r=await fetch(api(`/api/auth/${authMode}`),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw Error(d.error);localStorage.setItem(tokenKey,d.token);document.getElementById("authModal").classList.add("hidden");document.querySelector(".user-area #loginBtn").classList.add("hidden");document.querySelector(".user-area #registerBtn").classList.add("hidden");document.getElementById("profile").classList.remove("hidden");document.getElementById("profileEmail").textContent=d.email;document.getElementById("chatSub").textContent=`${d.email} — shaxsiy AI workspace`;loadFiles()}catch(e){alert(e.message)}};
document.getElementById("logoutBtn").onclick=()=>{localStorage.removeItem(tokenKey);document.getElementById("profile").classList.add("hidden");document.getElementById("loginBtn").classList.remove("hidden");document.getElementById("registerBtn").classList.remove("hidden");loadFiles()};
document.querySelectorAll(".side-item").forEach(b=>b.onclick=()=>{document.querySelectorAll(".side-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active-panel"));document.getElementById(b.dataset.panel).classList.add("active-panel");if(b.dataset.panel==="filesPanel")loadFiles();});
renderHistory();loadFiles();
