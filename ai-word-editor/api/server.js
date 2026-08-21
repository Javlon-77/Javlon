import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import OpenAI from "openai";
import cors from "cors";
import dotenv from "dotenv";
import JSZip from "jszip";
import crypto from "node:crypto";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
const client = apiKey ? new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" }) : null;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (_req, file, cb) => String(file.originalname || "").toLowerCase().endsWith(".docx") ? cb(null, true) : cb(new Error("Faqat .docx Word fayl yuklash mumkin.")) });

const documents = new Map();
const TTL = 2 * 60 * 60 * 1000;
function rememberDocument(buffer, fileName) { const id = crypto.randomUUID(); documents.set(id, { buffer, fileName, editedText: null, updatedAt: Date.now() }); while (documents.size > 100) documents.delete(documents.keys().next().value); return id; }
function getDocument(id) { const item = documents.get(String(id || "")); if (!item) return null; if (Date.now() - item.updatedAt > TTL) { documents.delete(String(id)); return null; } item.updatedAt = Date.now(); return item; }

app.get("/", (_req, res) => res.json({ ok: true, service: "AI Word Editor API", provider: "Groq", model, aiConfigured: Boolean(client), authRequired: false }));
app.get("/health", (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client), provider: "Groq", model, authRequired: false }));

app.post("/api/extract", upload.single("file"), async (req, res) => {
  try { if (!req.file) return res.status(400).json({ error: "Word fayl yuborilmadi." }); const result = await mammoth.extractRawText({ buffer: req.file.buffer }); const documentId = rememberDocument(req.file.buffer, req.file.originalname); res.json({ documentId, text: result.value || "", fileName: req.file.originalname }); }
  catch (e) { console.error("EXTRACT ERROR", e); res.status(500).json({ error: e?.message || "Word faylni o‘qib bo‘lmadi." }); }
});

function cleanJson(text) { const value = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); const a = value.indexOf("{"); const b = value.lastIndexOf("}"); return a >= 0 && b > a ? value.slice(a, b + 1) : value; }
app.post("/api/chat", async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: "GROQ_API_KEY Render Environment Variables ichida sozlanmagan." });
    const documentId = String(req.body?.documentId || ""); const documentText = String(req.body?.documentText || ""); const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) return res.status(400).json({ error: "Buyruq yoki savol yuboring." });
    const system = `Siz professional AI Word Editor yordamchisisiz. Faqat JSON qaytaring: {"changed":true,"answer":"...","editedDocument":"..."}. Tahrirlash so‘ralsa changed=true va editedDocument to‘liq tahrirlangan matn bo‘lsin. Savol bo‘lsa changed=false. Javob o‘zbek tilida va aniq bo‘lsin.`;
    const response = await client.chat.completions.create({ model, temperature: 0.15, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: `HUJJAT MATNI:\n${documentText}\n\nBUYRUQ:\n${instruction}` }] });
    let data; try { data = JSON.parse(cleanJson(response.choices?.[0]?.message?.content || "")); } catch { return res.status(502).json({ error: "AI javobini o‘qib bo‘lmadi." }); }
    const item = getDocument(documentId); if (item && data.changed) item.editedText = String(data.editedDocument || "");
    res.json({ changed: Boolean(data.changed), answer: String(data.answer || "Javob tayyor."), editedDocument: String(data.editedDocument || ""), documentId });
  } catch (e) { console.error("CHAT ERROR", e); res.status(Number(e?.status) || 500).json({ error: e?.error?.message || e?.message || "AI bilan bog‘lanishda xatolik." }); }
});

function escapeXml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function replaceText(xml, text) { const value = escapeXml(text); let used = false; return xml.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_m, open, _old, close) => { if (used) return `${open}${close}`; used = true; return `${open}${value}${close}`; }); }
function applyText(xml, editedText) { const lines = String(editedText || "").split(/\r?\n/); let i = 0; return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, p => /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(p) ? replaceText(p, lines[i++] ?? "") : p); }
async function buildDocx(item) { const zip = await JSZip.loadAsync(item.buffer); const f = zip.file("word/document.xml"); if (!f) throw new Error("DOCX document.xml topilmadi."); const xml = await f.async("string"); zip.file("word/document.xml", applyText(xml, item.editedText ?? "")); return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }); }

app.post("/api/export", async (req, res) => {
  try { const item = getDocument(req.body?.documentId); if (!item) return res.status(400).json({ error: "Word fayl sessiyasi topilmadi. Word faylni qayta ulang." }); item.editedText = String(req.body?.text ?? item.editedText ?? ""); const buffer = await buildDocx(item); const base = String(req.body?.fileName || item.fileName || "AI-Word-Hujjat.docx").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.docx$/i, "") || "AI-Word-Hujjat"; res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"); res.setHeader("Content-Disposition", `attachment; filename="${base}-AI.docx"`); res.send(buffer); }
  catch (e) { console.error("EXPORT ERROR", e); res.status(500).json({ error: e?.message || "Word fayl yaratilmadi." }); }
});
app.use((e, _req, res, _next) => { console.error("SERVER ERROR", e); if (!res.headersSent) res.status(400).json({ error: e?.message || "Server xatosi." }); });
app.listen(port, "0.0.0.0", () => console.log(`AI Word Editor API: ${port} | Auth: OFF | AI: ${Boolean(client)}`));
