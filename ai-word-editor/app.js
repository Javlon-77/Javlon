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

function api(path) {
  const base = String(CONFIG.API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!base || base.includes("PASTE_YOUR")) {
    throw new Error("Backend URL hali sozlanmagan.");
  }

  return `${base}${path}`;
}

async function readResponse(response) {
  const type = response.headers.get("content-type") || "";

  if (type.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Server xatosi (${response.status}).`);
    }
    return data;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Server xatosi (${response.status}).`);
  }

  return response;
}

function setStatus(text) {
  statusEl.textContent = text;
}

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
    const response = await fetch(api("/health"), {
      method: "GET",
      cache: "no-store",
    });
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
    addMessage("❌ Faqat .docx Word fayl yuklang.");
    fileInput.value = "";
    return;
  }

  try {
    setStatus("O‘qilmoqda...");

    const form = new FormData();
    form.append("file", file);

    const response = await fetch(api("/api/extract"), {
      method: "POST",
      body: form,
    });

    const data = await readResponse(response);

    editor.value = data.text || "";
    currentFileName = file.name;
    fileName.textContent = file.name;
    setStatus("Ulandi");
    addMessage(`✅ "${file.name}" ulandi.`);
  } catch (error) {
    setStatus("Xatolik");
    addMessage(`❌ ${error.message}`);
  }
});

newBtn.addEventListener("click", () => {
  editor.value = "";
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentText: editor.value,
        instruction,
      }),
    });

    const data = await readResponse(response);
    loading(false);

    if (data.changed) {
      editor.value = data.editedDocument || editor.value;
      setStatus("Hujjat yangilandi");
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

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendPrompt(button.dataset.prompt));
});

downloadBtn.addEventListener("click", async () => {
  try {
    if (!editor.value.trim()) {
      throw new Error("Yuklash uchun hujjat matni bo‘sh.");
    }

    setStatus("Word tayyorlanmoqda...");

    const response = await fetch(api("/api/export"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: editor.value,
        fileName: currentFileName,
      }),
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

    setStatus("Yuklandi");
  } catch (error) {
    addMessage(`❌ ${error.message}`);
    setStatus("Xatolik");
  }
});

checkBackend();
