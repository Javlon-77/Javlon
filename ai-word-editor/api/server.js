import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import OpenAI from "openai";
import cors from "cors";
import dotenv from "dotenv";
import { Document, Packer, Paragraph, TextRun } from "docx";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

// ===============================
// GROQ CONFIG
// ===============================
const apiKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

const client = apiKey
  ? new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" })
  : null;

// ===============================
// OPENAI IMAGE CONFIG
// ===============================
const openaiKey = process.env.OPENAI_API_KEY?.trim();
const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
const imageClient = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

if (!apiKey) console.warn("WARNING: GROQ_API_KEY topilmadi.");
if (!openaiKey) console.warn("WARNING: OPENAI_API_KEY topilmadi. AI rasm yaratish ishlamaydi.");

// ===============================
// CORS
// ===============================
const allowed = (process.env.ALLOWED_ORIGINS || "*")
  .split(",").map((x) => x.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
}));

app.use(express.json({ limit: "25mb" }));

// ===============================
// FILE UPLOAD
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".docx")) return cb(null, true);
    cb(new Error("Faqat .docx Word fayl yuklash mumkin."));
  },
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "AI Word Editor API", provider: "Groq", model, imageModel });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(client),
    imageConfigured: Boolean(imageClient),
    provider: "Groq",
    model,
    imageModel,
  });
});

// ===============================
// EXTRACT DOCX
// ===============================
app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Word fayl yuborilmadi." });
    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    return res.json({ text: result.value || "" });
  } catch (error) {
    console.error("EXTRACT ERROR:", error);
    return res.status(500).json({ error: "Word faylni o‘qib bo‘lmadi." });
  }
});

// ===============================
// AI IMAGE GENERATION
// ===============================
app.post("/api/generate-image", async (req, res) => {
  try {
    if (!imageClient) {
      return res.status(503).json({
        error: "OPENAI_API_KEY Render serverida sozlanmagan. AI rasm yaratish uchun shu secret kerak.",
      });
    }

    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "Rasm uchun tavsif yozing." });
    if (prompt.length > 4000) return res.status(400).json({ error: "Rasm tavsifi juda uzun." });

    const result = await imageClient.images.generate({
      model: imageModel,
      prompt,
      size: "1024x1024",
      output_format: "png",
    });

    const b64 = result?.data?.[0]?.b64_json;
    const url = result?.data?.[0]?.url;

    if (b64) return res.json({ dataUrl: `data:image/png;base64,${b64}`, model: imageModel });
    if (url) return res.json({ dataUrl: url, model: imageModel });

    throw new Error("Image API rasm ma’lumotini qaytarmadi.");
  } catch (error) {
    console.error("IMAGE GENERATION ERROR:", error);
    return res.status(500).json({
      error: error?.message || "AI rasm yaratishda xatolik yuz berdi.",
    });
  }
});

function cleanJson(text) {
  return text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// ===============================
// AI CHAT
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: "GROQ_API_KEY serverda sozlanmagan." });

    const documentText = String(req.body?.documentText || "");
    const instruction = String(req.body?.instruction || "").trim();
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (!instruction) return res.status(400).json({ error: "Buyruq yoki savol yuboring." });

    const attachmentText = attachments.length
      ? attachments.map((x, i) => `${i + 1}. ${x.name} (${x.type || "file"}, ${x.size || 0} bytes)${x.text ? `\nMatni:\n${String(x.text).slice(0, 12000)}` : ""}`).join("\n\n")
      : "Qo‘shilgan fayllar yo‘q.";

    const input = `
Siz AI Word Editor dasturining yordamchisisiz.

Foydalanuvchi o‘zbek tilida yozishi mumkin.

Vazifa:
1. Foydalanuvchi hujjatni tahrirlashni so‘rasa: changed=true va editedDocument ichida yangi to‘liq matnni qaytaring.
2. Faqat savol bersa: changed=false va editedDocument bo‘sh bo‘lsin.
3. Asl mazmunni saqlang va faqat so‘ralgan o‘zgarishni bajaring.
4. Javob qisqa va tushunarli o‘zbek tilida bo‘lsin.
5. FAQAT JSON qaytaring:
{"changed":true,"answer":"...","editedDocument":"..."}

HOZIRGI HUJJAT:
${documentText}

QO‘SHILGAN FAYLLAR:
${attachmentText}

FOYDALANUVCHI BUYRUG‘I:
${instruction}
`;

    const response = await client.responses.create({ model, input });
    const raw = response.output_text || "";
    let data;
    try { data = JSON.parse(cleanJson(raw)); }
    catch (error) {
      console.error("JSON PARSE ERROR:", error, raw);
      return res.status(502).json({ error: "AI javobini to‘g‘ri JSON formatida qaytarmadi." });
    }

    return res.json({
      changed: Boolean(data.changed),
      answer: String(data.answer || "Javob tayyor."),
      editedDocument: String(data.editedDocument || ""),
    });
  } catch (error) {
    console.error("GROQ CHAT ERROR:", error);
    return res.status(500).json({ error: error?.message || "Groq AI bilan bog‘lanishda xatolik yuz berdi." });
  }
});

// ===============================
// EXPORT DOCX
// ===============================
app.post("/api/export", async (req, res) => {
  try {
    const text = String(req.body?.text || "");
    const fileName = String(req.body?.fileName || "AI-Word-Hujjat.docx")
      .replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.docx$/i, "") || "AI-Word-Hujjat";

    const paragraphs = text.split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun(line)] }));
    if (paragraphs.length === 0) paragraphs.push(new Paragraph({ children: [new TextRun("")] }));

    const document = new Document({ sections: [{ children: paragraphs }] });
    const buffer = await Packer.toBuffer(document);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}-AI.docx"`);
    return res.send(buffer);
  } catch (error) {
    console.error("EXPORT ERROR:", error);
    return res.status(500).json({ error: "Word fayl yaratilmadi." });
  }
});

app.use((error, _req, res, _next) => {
  console.error("SERVER ERROR:", error);
  res.status(400).json({ error: error?.message || "Server xatosi." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`AI Word Editor API ishga tushdi: port ${port}`);
  console.log(`Provider: Groq | Model: ${model} | Image: ${imageModel}`);
});
