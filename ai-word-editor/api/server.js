import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import OpenAI from "openai";
import cors from "cors";
import dotenv from "dotenv";
import JSZip from "jszip";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
const client = apiKey ? new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" }) : null;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => String(file.originalname || "").toLowerCase().endsWith(".docx")
    ? cb(null, true)
    : cb(new Error("Faqat .docx Word fayl yuklash mumkin.")),
});

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const filesDir = path.join(dataDir, "files");
const indexFile = path.join(dataDir, "index.json");
fs.mkdirSync(filesDir, { recursive: true });

function loadIndex() {
  try {
    const value = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function saveIndex(items) {
  fs.writeFileSync(indexFile, JSON.stringify(items.slice(0, 200), null, 2), "utf8");
}
let files = loadIndex();

function safeBaseName(name) {
  return String(name || "AI-Word-Hujjat.docx").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.docx$/i, "") || "AI-Word-Hujjat";
}
function filePath(id) { return path.join(filesDir, `${id}.docx`); }
function upsertMeta(meta) {
  files = files.filter(x => x.id !== meta.id);
  files.unshift(meta);
  saveIndex(files);
}
function getMeta(id) {
  return files.find(x => x.id === String(id || "")) || null;
}

app.get("/", (_req, res) => res.json({ ok: true, service: "AI Word Editor API", provider: "Groq", model, aiConfigured: Boolean(client), authRequired: false }));
app.get("/health", (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client), provider: "Groq", model, authRequired: false }));

app.get("/api/files", (_req, res) => {
  const result = files.filter(x => fs.existsSync(filePath(x.id))).map(x => ({ ...x }));
  res.json({ files: result });
});

app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Word fayl yuborilmadi." });
    const id = crypto.randomUUID();
    fs.writeFileSync(filePath(id), req.file.buffer);
    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    const now = new Date().toISOString();
    upsertMeta({ id, name: req.file.originalname, favorite: false, updatedAt: now });
    res.json({ documentId: id, text: result.value || "", fileName: req.file.originalname });
  } catch (e) {
    console.error("EXTRACT ERROR", e);
    res.status(500).json({ error: e?.message || "Word faylni o‘qib bo‘lmadi." });
  }
});

async function readCurrentText(id) {
  const meta = getMeta(id);
  if (!meta) return null;
  const p = filePath(meta.id);
  if (!fs.existsSync(p)) return null;
  const buffer = fs.readFileSync(p);
  const result = await mammoth.extractRawText({ buffer });
  return { meta, buffer, text: result.value || "" };
}

app.get("/api/files/:id", async (req, res) => {
  try {
    const item = await readCurrentText(req.params.id);
    if (!item) return res.status(404).json({ error: "Fayl topilmadi." });
    res.json({ documentId: item.meta.id, fileName: item.meta.name, text: item.text, updatedAt: item.meta.updatedAt });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Faylni ochib bo‘lmadi." });
  }
});

app.get("/api/files/:id/download", (req, res) => {
  try {
    const meta = getMeta(req.params.id);
    if (!meta || !fs.existsSync(filePath(meta.id))) return res.status(404).json({ error: "Fayl topilmadi." });
    res.download(filePath(meta.id), meta.name);
  } catch (e) {
    res.status(500).json({ error: e?.message || "Faylni yuklab bo‘lmadi." });
  }
});

function cleanJson(text) {
  const value = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = value.indexOf("{");
  const b = value.lastIndexOf("}");
  return a >= 0 && b > a ? value.slice(a, b + 1) : value;
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: "GROQ_API_KEY Render Environment Variables ichida sozlanmagan." });
    const documentId = String(req.body?.documentId || "");
    const documentText = String(req.body?.documentText || "");
    const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) return res.status(400).json({ error: "Buyruq yoki savol yuboring." });
    const system = `Siz professional AI Word Editor yordamchisisiz. Faqat JSON qaytaring: {"changed":true,"answer":"...","editedDocument":"..."}. Tahrirlash so‘ralsa changed=true va editedDocument to‘liq tahrirlangan matn bo‘lsin. Savol bo‘lsa changed=false. Javob o‘zbek tilida, qisqa va aniq bo‘lsin.`;
    const response = await client.chat.completions.create({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `HUJJAT MATNI:\n${documentText}\n\nBUYRUQ:\n${instruction}` },
      ],
    });
    let data;
    try { data = JSON.parse(cleanJson(response.choices?.[0]?.message?.content || "")); }
    catch { return res.status(502).json({ error: "AI javobini o‘qib bo‘lmadi." }); }
    res.json({ changed: Boolean(data.changed), answer: String(data.answer || "Javob tayyor."), editedDocument: String(data.editedDocument || ""), documentId });
  } catch (e) {
    console.error("CHAT ERROR", e);
    res.status(Number(e?.status) || 500).json({ error: e?.error?.message || e?.message || "AI bilan bog‘lanishda xatolik." });
  }
});

function escapeXml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function paragraphTextReplace(paragraphXml, text) {
  const value = escapeXml(text);
  let used = false;
  return paragraphXml.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_m, open, _old, close) => {
    if (used) return `${open}${close}`;
    used = true;
    return `${open}${value}${close}`;
  });
}
function applyText(xml, editedText) {
  const lines = String(editedText || "").split(/\r?\n/);
  let lineIndex = 0;
  const replaced = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, paragraphXml => {
    if (!/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(paragraphXml)) return paragraphXml;
    return paragraphTextReplace(paragraphXml, lines[lineIndex++] ?? "");
  });
  const remaining = lines.slice(lineIndex).filter(Boolean);
  if (!remaining.length) return replaced;
  const extra = remaining.map(line => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
  return replaced.replace(/<\/w:body>/, `${extra}</w:body>`);
}
async function updateDocxFile(id, text) {
  const meta = getMeta(id);
  if (!meta) throw new Error("Fayl topilmadi.");
  const p = filePath(id);
  if (!fs.existsSync(p)) throw new Error("Saqlanadigan Word fayl topilmadi.");
  const original = fs.readFileSync(p);
  const zip = await JSZip.loadAsync(original);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("DOCX document.xml topilmadi.");
  const xml = await documentFile.async("string");
  zip.file("word/document.xml", applyText(xml, text));
  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(p, output);
  const updatedAt = new Date().toISOString();
  upsertMeta({ ...meta, updatedAt });
  return output;
}

app.post("/api/save", async (req, res) => {
  try {
    const id = String(req.body?.documentId || "");
    const text = String(req.body?.text || "");
    if (!id) return res.status(400).json({ error: "Saqlash uchun Word fayl tanlanmagan." });
    const buffer = await updateDocxFile(id, text);
    const meta = getMeta(id);
    res.json({ ok: true, documentId: id, fileName: meta.name, updatedAt: meta.updatedAt, size: buffer.length });
  } catch (e) {
    console.error("SAVE ERROR", e);
    res.status(500).json({ error: e?.message || "Word faylni saqlab bo‘lmadi." });
  }
});

app.post("/api/export", async (req, res) => {
  try {
    const id = String(req.body?.documentId || "");
    const meta = getMeta(id);
    if (!meta) return res.status(400).json({ error: "Word fayl topilmadi." });
    if (typeof req.body?.text === "string") await updateDocxFile(id, req.body.text);
    const p = filePath(id);
    const outputName = meta.name || "AI-Word-Hujjat.docx";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${outputName.replace(/\"/g, "")}"`);
    res.send(fs.readFileSync(p));
  } catch (e) {
    console.error("EXPORT ERROR", e);
    res.status(500).json({ error: e?.message || "Word fayl tayyorlanmadi." });
  }
});

app.post("/api/files/:id/favorite", (req, res) => {
  const meta = getMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "Fayl topilmadi." });
  const next = !meta.favorite;
  upsertMeta({ ...meta, favorite: next, updatedAt: meta.updatedAt });
  res.json({ ok: true, favorite: next });
});

app.use((e, _req, res, _next) => {
  console.error("SERVER ERROR", e);
  if (!res.headersSent) res.status(400).json({ error: e?.message || "Server xatosi." });
});
app.listen(port, "0.0.0.0", () => console.log(`AI Word Editor API: ${port} | Auth: OFF | AI: ${Boolean(client)}`));