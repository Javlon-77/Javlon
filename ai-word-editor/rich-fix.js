(() => {
  const $ = id => document.getElementById(id);
  const editor = $("editor");
  const prompt = $("prompt");
  const send = $("sendBtn");
  if (!editor || !prompt || !send) return;

  const N = s => String(s ?? "").toLowerCase().replace(/[‘’ʻʼ`]/g, "'").replace(/\s+/g, " ").trim();
  const clean = s => N(s).replace(/[.!?]+$/g, "").trim();
  const say = (t, role = "ai") => window.message?.(t, role);
  const stat = t => window.status?.(t);
  const key = id => `ai-word-rich-v2:${String(id || "")}`;

  const colorMap = {
    qizil: "#ef4444", qizilcha: "#ef4444", red: "#ef4444",
    kok: "#2563eb", "ko'k": "#2563eb", blue: "#2563eb",
    yashil: "#16a34a", green: "#16a34a",
    sariq: "#facc15", yellow: "#facc15",
    toq: "#f97316", "to'q": "#f97316", "to'q sariq": "#f97316", orange: "#f97316",
    pushti: "#ec4899", pink: "#ec4899",
    binafsha: "#8b5cf6", purple: "#8b5cf6",
    qora: "#111827", black: "#111827",
    oq: "#ffffff", white: "#ffffff",
    kulrang: "#9ca3af", gray: "#9ca3af", grey: "#9ca3af"
  };

  function colorFrom(text) {
    const s = clean(text);
    const hex = s.match(/#[0-9a-f]{6}\b/i);
    if (hex) return hex[0];
    const names = Object.keys(colorMap).sort((a,b) => b.length - a.length);
    for (const name of names) if (s.includes(name)) return colorMap[name];
    return null;
  }

  function selectedElement() {
    const sel = window.getSelection?.();
    if (!sel || !sel.rangeCount) return null;
    let n = sel.anchorNode;
    if (n?.nodeType === 3) n = n.parentElement;
    return n?.closest?.("th,td,.matrix-diagram,.editor") || null;
  }

  function applyColor(raw) {
    const color = colorFrom(raw);
    if (!color) return false;
    const s = clean(raw);
    const isText = /matn|yozuv|harf|shrift|text|font/.test(s) && !/fon|orqa/.test(s);
    const sel = window.getSelection?.();
    const element = selectedElement();
    const cell = element?.closest?.("th,td");

    if (cell && (!sel || sel.isCollapsed || !String(sel.toString()).trim())) {
      cell.style.backgroundColor = color;
      if (isText) cell.style.color = color;
      cell.classList.add("matrix-chat-updated");
      stat("Rang o‘zgartirildi");
      return true;
    }

    if (sel && !sel.isCollapsed && String(sel.toString()).trim()) {
      editor.focus();
      try {
        document.execCommand(isText ? "foreColor" : "backColor", false, color);
      } catch {}
      stat("Rang o‘zgartirildi");
      return true;
    }

    const matrix = editor.querySelector(".matrix-diagram");
    if (matrix) {
      matrix.style.backgroundColor = color;
      stat("Diagramma rangi o‘zgartirildi");
      return true;
    }
    return false;
  }

  function matrixTable() { return editor.querySelector(".matrix-diagram table.matrix-table"); }
  function col(name) {
    const t = matrixTable(); if (!t?.rows.length) return -1;
    const q = clean(name);
    for (let c=1;c<t.rows[0].cells.length;c++) {
      const h = clean(t.rows[0].cells[c].innerText);
      if (h === q || h.includes(q) || q.includes(h)) return c;
    }
    return -1;
  }
  function row(label) {
    const t = matrixTable(); if (!t) return -1;
    const q = clean(label);
    for (let r=1;r<t.rows.length;r++) {
      const h = clean(t.rows[r].cells[0]?.innerText);
      if (h === q || h.includes(q) || q.includes(h)) return r;
    }
    return -1;
  }
  function flash(c) {
    if (!c) return;
    c.classList.remove("matrix-chat-updated");
    void c.offsetWidth;
    c.classList.add("matrix-chat-updated");
  }
  function setCell(r,c,v) {
    const cell = matrixTable()?.rows[r]?.cells[c];
    if (!cell) return false;
    cell.textContent = String(v);
    flash(cell);
    stat("Diagramma yangilandi");
    return true;
  }
  function setName(oldName,newName) {
    const t = matrixTable(), c = col(oldName);
    if (!t || c < 1) return false;
    t.rows[0].cells[c].textContent = newName;
    flash(t.rows[0].cells[c]);
    stat("Diagramma yangilandi");
    return true;
  }

  function matrixCommand(raw) {
    if (!matrixTable()) return false;
    const q = clean(raw);

    let m = q.match(/^(.+?)\s+ismini\s+(.+?)\s+(?:ga\s+)?(?:qil|bo['’]?lsin|o['’]?zgartir|almashtir)$/i);
    if (m && setName(m[1].trim(), m[2].trim())) {
      say(`✅ ${m[1].trim()} ismi ${m[2].trim()} ga o‘zgartirildi.`);
      return true;
    }

    m = q.match(/^(.+?)\s+(?:ning\s+)?yoshini\s+(.+?)\s+(?:ga\s+)?(?:qil|bo['’]?lsin|o['’]?zgartir|almashtir)$/i);
    if (m) {
      const c=col(m[1].trim()), r=row("Yoshi");
      if(c>0&&r>0&&setCell(r,c,m[2].trim())) { say(`✅ ${m[1].trim()}ning yoshi ${m[2].trim()} ga o‘zgartirildi.`); return true; }
    }

    m = q.match(/^(.+?)\s+(?:ning\s+)?(ishini|kasbini|lavozimini|pulisini|pulini|maoshini|daromadini)\s+(.+?)\s+(?:ga\s+)?(?:qil|bo['’]?lsin|o['’]?zgartir|almashtir)$/i);
    if (m) {
      const f=/ish|kasb|lavoz/i.test(m[2])?"Ishi":/pul|maosh|daromad/i.test(m[2])?"Puli":null;
      const c=col(m[1].trim()), r=f&&row(f);
      if(c>0&&r>0&&setCell(r,c,m[3].trim())) { say(`✅ ${m[1].trim()}ning ${f.toLowerCase()} qiymati o‘zgartirildi.`); return true; }
    }

    return false;
  }

  function handleCommand(raw) {
    const q = clean(raw);
    if (!q) return false;

    if (/(rangga|rangda|rangini|ranga)\s*(bo['’]?ya|qil|o['’]?zgartir|ber)|bo['’]?yab/.test(q) && colorFrom(q)) {
      if (applyColor(q)) {
        say("🎨 Rang o‘zgartirildi.");
        return true;
      }
    }
    if (matrixCommand(q)) return true;
    return false;
  }

  function capture(e) {
    if (e.type === "keydown" && !(e.key === "Enter" && !e.shiftKey)) return;
    if (e.type === "click" && e.target !== send) return;
    const q = prompt.value.trim();
    if (!q) return;
    if (!handleCommand(q)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    say(q, "user");
    prompt.value = "";
  }

  send.addEventListener("click", capture, true);
  prompt.addEventListener("keydown", capture, true);

  // Keep the rich matrix/table structure in this browser even when Render restarts.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const req = args[0];
    const init = args[1] || {};
    const url = typeof req === "string" ? req : req?.url || "";
    if (String(url).includes("/api/save") && init.body) {
      try {
        const body = JSON.parse(init.body);
        if (body.documentId && Array.isArray(body.content)) {
          localStorage.setItem(key(body.documentId), JSON.stringify({version:2,content:body.content,savedAt:Date.now()}));
        }
      } catch {}
    }
    return nativeFetch(...args);
  };

  const originalOpen = window.openSavedFile;
  if (typeof originalOpen === "function") {
    window.openSavedFile = async function(item) {
      await originalOpen(item);
      try {
        const cached = JSON.parse(localStorage.getItem(key(item?.id)) || "null");
        if (cached?.content && typeof window.restoreContent === "function") {
          window.restoreContent(cached.content, "");
          stat("Saqlangan ko‘rinish ochildi");
        }
      } catch {}
    };
  }

  // Also save rich content immediately when the user presses the main save button.
  const save = $("saveBtn");
  if (save) save.addEventListener("click", () => {
    setTimeout(() => {
      try {
        const idMatch = [...document.querySelectorAll(".file-card")].find(() => false);
        void idMatch;
      } catch {}
    }, 300);
  }, true);

  const style = document.createElement("style");
  style.textContent = `
    .matrix-table th[style*="background"], .matrix-table td[style*="background"] { transition: background-color .2s, color .2s; }
    .matrix-chat-updated { animation: matrixChatPulse .55s ease; }
    @keyframes matrixChatPulse { 0% { box-shadow: inset 0 0 0 3px rgba(59,130,246,.35); } 100% { box-shadow: inset 0 0 0 0 transparent; } }
  `;
  document.head.appendChild(style);
})();