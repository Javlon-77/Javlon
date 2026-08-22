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
import { Document, Packer, Paragraph, TextRun, ImageRun } from "docx";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const groqKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
const textClient = groqKey ? new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" }) : null;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "70mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = String(file.originalname || "").toLowerCase().endsWith(".docx");
    cb(ok ? null : new Error("Faqat .docx Word fayl yuklash mumkin."), ok);
  },
});

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const filesDir = path.join(dataDir, "files");
const statesDir = path.join(dataDir, "states");
const indexFile = path.join(dataDir, "index.json");
fs.mkdirSync(filesDir, { recursive: true });
fs.mkdirSync(statesDir, { recursive: true });

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

function safeName(name) {
  return String(name || "AI-Word-Hujjat.docx")
    .replace(/[<>:\"/\\|?*\x00-\x1F]/g, "_")
    .trim() || "AI-Word-Hujjat.docx";
}
function safeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
}
function filePath(id) { return path.join(filesDir, `${safeId(id)}.docx`); }
function statePath(id) { return path.join(statesDir, `${safeId(id)}.json`); }
function getMeta(id) { return files.find((x) => x.id === String(id || "")) || null; }
function upsertMeta(meta) {
  files = files.filter((x) => x.id !== meta.id);
  files.unshift(meta);
  saveIndex(files);
}
function readState(id) {
  try {
    const raw = fs.readFileSync(statePath(id), "utf8");
    const value = JSON.parse(raw);
    return value && Array.isArray(value.content) ? value : null;
  } catch {
    return null;
  }
}
function writeState(id, content) {
  fs.writeFileSync(statePath(id), JSON.stringify({ version: 1, content, updatedAt: new Date().toISOString() }), "utf8");
}

function contentToText(content) {
  return (Array.isArray(content) ? content : []).map((item) => {
    if (item?.type === "image") return `[[IMAGE:${item.id || "image"}]]${item.caption ? `\n${item.caption}` : ""}`;
    return String(item?.text || "");
  }).join("\n").trim();
}
function normaliseContent(content) {
  return (Array.isArray(content) ? content : []).map((item, index) => {
    if (item?.type === "image") {
      return {
        type: "image",
        id: String(item.id || `img-${index}`),
        dataUrl: String(item.dataUrl || ""),
        caption: String(item.caption || "").slice(0, 5000),
      };
    }
    return { type: "text", text: String(item?.text || "") };
  }).filter((item) => item.type === "image" ? item.dataUrl : true);
}

app.get("/", (_req, res) => res.json({ ok: true, service: "AI Word Editor API", textAI: Boolean(textClient), authRequired: false }));
app.get("/health", (_req, res) => res.json({ ok: true, aiConfigured: Boolean(textClient), provider: "Groq", model, authRequired: false }));
app.get("/api/files", (_req, res) => res.json({ files: files.filter((x) => fs.existsSync(filePath(x.id))) }));

app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Word fayl yuborilmadi." });
    const id = crypto.randomUUID();
    const name = safeName(req.file.originalname);
    fs.writeFileSync(filePath(id), req.file.buffer);
    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    upsertMeta({ id, name, favorite: false, updatedAt: new Date().toISOString() });
    return res.json({ documentId: id, fileName: name, text: result.value || "" });
  } catch (error) {
    console.error("EXTRACT", error);
    return res.status(500).json({ error: error?.message || "Word faylni ochib bo‘lmadi." });
  }
});

app.get("/api/files/:id", async (req, res) => {
  try {
    const meta = getMeta(req.params.id);
    if (!meta || !fs.existsSync(filePath(meta.id))) return res.status(404).json({ error: "Fayl topilmadi." });
    const state = readState(meta.id);
    if (state) {
      return res.json({ documentId: meta.id, fileName: meta.name, content: state.content, updatedAt: meta.updatedAt });
    }
    const result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath(meta.id)) });
    return res.json({ documentId: meta.id, fileName: meta.name, content: [{ type: "text", text: result.value || "" }], updatedAt: meta.updatedAt });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Faylni ochib bo‘lmadi." });
  }
});

app.get("/api/files/:id/download", (req, res) => {
  const meta = getMeta(req.params.id);
  if (!meta || !fs.existsSync(filePath(meta.id))) return res.status(404).json({ error: "Fayl topilmadi." });
  return res.download(filePath(meta.id), meta.name);
});

app.post("/api/files/:id/favorite", (req, res) => {
  const meta = getMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "Fayl topilmadi." });
  const favorite = !meta.favorite;
  upsertMeta({ ...meta, favorite });
  return res.json({ ok: true, favorite });
});

function cleanJson(text) {
  const value = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end > start ? value.slice(start, end + 1) : value;
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!textClient) return res.status(503).json({ error: "AI kaliti serverda sozlanmagan." });
    const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) return res.status(400).json({ error: "So‘rov yozing." });
    const documentText = String(req.body?.documentText || "");
    const system = `Siz professional AI Word Editor yordamchisisiz. [[IMAGE:id]] markerlarini o‘zgartirmang, o‘chirmang va oddiy matnga aylantirmang. Tahrirlash so‘ralsa changed=true va editedDocument to‘liq tahrirlangan matn bo‘lsin. Savol yoki maslahat bo‘lsa changed=false. Javob o‘zbek tilida, qisqa va foydali bo‘lsin. FAQAT JSON qaytaring: {"changed":true,"answer":"...","editedDocument":"..."}`;
    const response = await textClient.chat.completions.create({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Hujjat:\n${documentText}\n\nFoydalanuvchi so‘rovi:\n${instruction}` },
      ],
    });
    let data;
    try { data = JSON.parse(cleanJson(response.choices?.[0]?.message?.content || "")); }
    catch { return res.status(502).json({ error: "AI javobini o‘qib bo‘lmadi." }); }
    return res.json({
      changed: Boolean(data.changed),
      answer: String(data.answer || ""),
      editedDocument: String(data.editedDocument || ""),
      documentId: String(req.body?.documentId || ""),
    });
  } catch (error) {
    console.error("CHAT", error);
    return res.status(Number(error?.status) || 500).json({ error: error?.message || "AI bilan bog‘lanishda xatolik." });
  }
});

function escapeXml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}
function paragraphReplace(xml, text) {
  const value = escapeXml(text);
  let used = false;
  return xml.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_m, open, _old, close) => {
    if (used) return `${open}${close}`;
    used = true;
    return `${open}${value}${close}`;
  });
}
function replaceDocxText(xml, text) {
  const lines = String(text || "").split(/\r?\n/);
  let index = 0;
  let out = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(paragraph)) return paragraph;
    return paragraphReplace(paragraph, lines[index++] ?? "");
  });
  const rest = lines.slice(index).filter(Boolean);
  if (rest.length) {
    out = out.replace(/<\/w:body>/, `${rest.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("")}</w:body>`);
  }
  return out;
}
function imageData(url) {
  const match = String(url || "").match(/^data:(image\/(?:png|jpeg|jpg|gif|bmp));base64,(.+)$/i);
  if (!match) throw new Error("Rasm formati qo‘llab-quvvatlanmaydi. PNG yoki JPG ishlating.");
  const mime = match[1].toLowerCase();
  const type = mime === "image/jpeg" || mime === "image/jpg" ? "jpg" : mime.replace("image/", "");
  return { type, buffer: Buffer.from(match[2], "base64") };
}
async function buildDocx(id, content) {
  const meta = getMeta(id);
  if (!meta || !fs.existsSync(filePath(id))) throw new Error("Word fayl topilmadi.");
  const normal = normaliseContent(content);
  const images = normal.filter((item) => item.type === "image" && item.dataUrl);
  if (!images.length) {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath(id)));
    const file = zip.file("word/document.xml");
    if (!file) throw new Error("DOCX document.xml topilmadi.");
    const xml = await file.async("string");
    zip.file("word/document.xml", replaceDocxText(xml, normal.filter((x) => x.type === "text").map((x) => x.text).join("\n")));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }
  const children = [];
  for (const item of normal) {
    if (item.type === "text") {
      for (const line of String(item.text || "").split(/\r?\n/)) children.push(new Paragraph({ children: [new TextRun(line)] }));
    } else if (item.type === "image") {
      const { type, buffer } = imageData(item.dataUrl);
      children.push(new Paragraph({ children: [new ImageRun({ data: buffer, type, transformation: { width: 650, height: 450 } })] }));
      if (item.caption) children.push(new Paragraph({ children: [new TextRun(item.caption)] }));
    }
  }
  const doc = new Document({ sections: [{ children: children.length ? children : [new Paragraph("")] }] });
  return Packer.toBuffer(doc);
}

app.post("/api/save", async (req, res) => {
  try {
    const id = String(req.body?.documentId || "");
    const meta = getMeta(id);
    if (!meta) return res.status(404).json({ error: "Word fayl topilmadi." });
    const content = normaliseContent(req.body?.content);
    const out = await buildDocx(id, content);
    fs.writeFileSync(filePath(id), out);
    writeState(id, content);
    const updatedAt = new Date().toISOString();
    upsertMeta({ ...meta, updatedAt });
    return res.json({ ok: true, documentId: id, fileName: meta.name, updatedAt });
  } catch (error) {
    console.error("SAVE", error);
    return res.status(500).json({ error: error?.message || "Word faylni saqlab bo‘lmadi." });
  }
});

app.post("/api/export", async (req, res) => {
  try {
    const id = String(req.body?.documentId || "");
    const meta = getMeta(id);
    if (!meta) return res.status(404).json({ error: "Word fayl topilmadi." });
    const content = normaliseContent(req.body?.content);
    const out = await buildDocx(id, content);
    fs.writeFileSync(filePath(id), out);
    writeState(id, content);
    upsertMeta({ ...meta, updatedAt: new Date().toISOString() });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${meta.name.replace(/\"/g, "")}"`);
    return res.send(out);
  } catch (error) {
    console.error("EXPORT", error);
    return res.status(500).json({ error: error?.message || "Word fayl tayyorlanmadi." });
  }
});

app.use((error, _req, res, _next) => {
  console.error("SERVER", error);
  if (!res.headersSent) res.status(400).json({ error: error?.message || "Server xatosi." });
});

app.listen(port, "0.0.0.0", () => console.log(`AI Word Editor API: ${port} | TextAI:${Boolean(textClient)} | ImageAI:OFF`));
