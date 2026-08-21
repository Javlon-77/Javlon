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

if (!apiKey) console.warn("WARNING: GROQ_API_KEY topilmadi.");

const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map((x) => x.trim()).filter(Boolean);
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowed.includes("*") || allowed.includes(origin)) return callback(null, true);
  return callback(new Error("Origin not allowed"));
}}));
app.use(express.json({ limit: "12mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".docx")) return cb(null, true);
    cb(new Error("Faqat .docx Word fayl yuklash mumkin."));
  },
});

// Original DOCX ZIP paketini vaqtincha saqlaymiz. Export paytida paket qayta
// yaratilmaydi: rasm, diagramma, jadval, grafik va boshqa Word obyektlari saqlanadi.
const documents = new Map();
const MAX_DOCUMENTS = 100;
const DOCUMENT_TTL = 2 * 60 * 60 * 1000;

function rememberDocument(buffer, fileName) {
  const id = crypto.randomUUID();
  documents.set(id, { buffer, fileName, updatedAt: Date.now(), editedText: null });
  while (documents.size > MAX_DOCUMENTS) documents.delete(documents.keys().next().value);
  return id;
}

function getDocument(id) {
  const item = documents.get(String(id || ""));
  if (!item) return null;
  if (Date.now() - item.updatedAt > DOCUMENT_TTL) {
    documents.delete(String(id));
    return null;
  }
  item.updatedAt = Date.now();
  return item;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, item] of documents) if (now - item.updatedAt > DOCUMENT_TTL) documents.delete(id);
}, 30 * 60 * 1000).unref();

app.get("/", (_req, res) => res.json({ ok: true, service: "AI Word Editor API", provider: "Groq", model, aiConfigured: Boolean(client) }));
app.get("/health", (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client), provider: "Groq", model }));

app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Word fayl yuborilmadi." });
    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    const documentId = rememberDocument(req.file.buffer, req.file.originalname);
    return res.json({ documentId, text: result.value || "", fileName: req.file.originalname });
  } catch (error) {
    console.error("EXTRACT ERROR:", error);
    return res.status(500).json({ error: error?.message || "Word faylni o‘qib bo‘lmadi." });
  }
});

function cleanJson(text) {
  let value = String(text || "").trim();
  value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  return first !== -1 && last > first ? value.slice(first, last + 1) : value;
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: "GROQ_API_KEY Render Environment Variables ichida sozlanmagan." });

    const documentId = String(req.body?.documentId || "");
    const documentText = String(req.body?.documentText || "");
    const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) return res.status(400).json({ error: "Buyruq yoki savol yuboring." });

    const system = `Siz professional AI Word Editor yordamchisisiz.
Muhim qoidalar:
- Word hujjatidagi diagramma, rasm, jadval, grafik, SmartArt, shakl yoki boshqa obyektlarni hech qachon matn bilan almashtirmang.
- Diagramma ko‘rinishini tasvirlab, soxta ASCII diagramma yoki g‘alati belgilar yaratmang.
- Faqat foydalanuvchi so‘ragan matnni o‘zgartiring.
- Asl mazmunni imkon qadar saqlang.
- Agar tahrirlash so‘ralsa changed=true va editedDocument ichida tahrirlangan matn bo‘lsin.
- Agar savol berilsa changed=false va editedDocument bo‘sh bo‘lsin.
- Javob o‘zbek tilida, qisqa va aniq bo‘lsin.
- FAQAT JSON qaytaring: {"changed":true,"answer":"...","editedDocument":"..."}`;

    const user = `HUJJAT MATNI (bu faqat matn ko‘rinishi; Worddagi rasm/diagramma/jadval obyektlari alohida saqlanadi):\n${documentText}\n\nBUYRUQ:\n${instruction}`;
    const response = await client.chat.completions.create({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });

    let data;
    try { data = JSON.parse(cleanJson(response.choices?.[0]?.message?.content || "")); }
    catch (error) {
      console.error("JSON PARSE ERROR:", error);
      return res.status(502).json({ error: "AI javobini JSON formatida qaytarmadi." });
    }

    if (data.changed && documentId) {
      const item = getDocument(documentId);
      if (item) item.editedText = String(data.editedDocument || "");
    }

    return res.json({ changed: Boolean(data.changed), answer: String(data.answer || "Javob tayyor."), editedDocument: String(data.editedDocument || ""), documentId });
  } catch (error) {
    console.error("GROQ CHAT ERROR:", error);
    const status = Number(error?.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.error?.message || error?.message || "Groq AI bilan bog‘lanishda xatolik yuz berdi." });
  }
});

function escapeXml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function getParagraphs(xml) {
  const paragraphs = [];
  const paragraphRegex = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  let match;
  while ((match = paragraphRegex.exec(xml))) {
    const paragraphXml = match[0];
    const texts = [];
    const textRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let textMatch;
    while ((textMatch = textRegex.exec(paragraphXml))) {
      texts.push(textMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    }
    paragraphs.push({ xml: paragraphXml, texts });
  }
  return paragraphs;
}

function replaceParagraphText(paragraphXml, text) {
  const value = escapeXml(text);
  let first = true;
  return paragraphXml.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_m, open, _old, close) => {
    if (first) { first = false; return `${open}${value}${close}`; }
    return `${open}${close}`;
  });
}

function applyTextWithoutDestroyingWordObjects(xml, editedText) {
  if (!getParagraphs(xml).length) return xml;
  const newParagraphs = String(editedText || "").split(/\r?\n/);
  let paragraphIndex = 0;
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    // Obyektga tegishli, matnsiz paragrafni butunlay o‘z holida qoldiramiz.
    if (!/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(paragraphXml)) return paragraphXml;
    const text = newParagraphs[paragraphIndex++] ?? "";
    return replaceParagraphText(paragraphXml, text);
  });
}

async function buildPreservedDocx(item) {
  const zip = await JSZip.loadAsync(item.buffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("DOCX document.xml topilmadi.");
  const xml = await documentFile.async("string");
  zip.file("word/document.xml", applyTextWithoutDestroyingWordObjects(xml, item.editedText ?? ""));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

app.post("/api/export", async (req, res) => {
  try {
    const documentId = String(req.body?.documentId || "");
    const item = getDocument(documentId);
    if (!item) return res.status(400).json({ error: "Original Word fayl sessiyasi topilmadi. Word faylni qayta ulang." });

    if (typeof req.body?.text === "string") item.editedText = req.body.text;
    const buffer = await buildPreservedDocx(item);
    const baseName = String(req.body?.fileName || item.fileName || "AI-Word-Hujjat.docx").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.docx$/i, "") || "AI-Word-Hujjat";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}-AI.docx"`);
    return res.send(buffer);
  } catch (error) {
    console.error("EXPORT ERROR:", error);
    return res.status(500).json({ error: error?.message || "Word fayl yaratilmadi." });
  }
});

app.use((error, _req, res, _next) => {
  console.error("SERVER ERROR:", error);
  res.status(400).json({ error: error?.message || "Server xatosi." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`AI Word Editor API ishga tushdi: port ${port}`);
  console.log(`Provider: Groq`);
  console.log(`Model: ${model}`);
  console.log(`AI configured: ${Boolean(client)}`);
});
