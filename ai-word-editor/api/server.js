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

const apiKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

if (!apiKey) {
  console.warn("WARNING: GROQ_API_KEY topilmadi.");
}

const allowed = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowed.includes("*") || allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed"));
    },
  })
);

app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".docx")) {
      return cb(null, true);
    }
    cb(new Error("Faqat .docx Word fayl yuklash mumkin."));
  },
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI Word Editor API",
    provider: "Groq",
    model,
    aiConfigured: Boolean(client),
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(client),
    provider: "Groq",
    model,
  });
});

app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Word fayl yuborilmadi." });
    }

    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    return res.json({ text: result.value || "" });
  } catch (error) {
    console.error("EXTRACT ERROR:", error);
    return res.status(500).json({
      error: error?.message || "Word faylni o‘qib bo‘lmadi.",
    });
  }
});

function cleanJson(text) {
  let value = String(text || "").trim();
  value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first !== -1 && last > first) {
    value = value.slice(first, last + 1);
  }
  return value;
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!client) {
      return res.status(503).json({
        error: "GROQ_API_KEY Render Environment Variables ichida sozlanmagan.",
      });
    }

    const documentText = String(req.body?.documentText || "");
    const instruction = String(req.body?.instruction || "").trim();

    if (!instruction) {
      return res.status(400).json({ error: "Buyruq yoki savol yuboring." });
    }

    const system = `Siz AI Word Editor yordamchisisiz. Foydalanuvchi o‘zbek tilida yozishi mumkin.

Qoidalar:
- Agar foydalanuvchi hujjatni o‘zgartirishni so‘rasa, changed=true bo‘lsin va editedDocument ichida BUTUN yangi hujjat matni bo‘lsin.
- Agar foydalanuvchi faqat savol bersa yoki mazmun so‘rasa, changed=false bo‘lsin va editedDocument bo‘sh bo‘lsin.
- Faqat so‘ralgan o‘zgarishni bajaring va asl mazmunni imkon qadar saqlang.
- Javob qisqa, aniq va o‘zbek tilida bo‘lsin.
- FAQAT JSON qaytaring. Markdown yoki qo‘shimcha matn yozmang.
- JSON shakli: {"changed":true,"answer":"...","editedDocument":"..."}`;

    const user = `HOZIRGI HUJJAT:\n${documentText}\n\nFOYDALANUVCHI BUYRUG‘I:\n${instruction}`;

    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = response.choices?.[0]?.message?.content || "";
    let data;

    try {
      data = JSON.parse(cleanJson(raw));
    } catch (error) {
      console.error("JSON PARSE ERROR:", error);
      console.error("AI RAW:", raw);
      return res.status(502).json({
        error: "AI javobini JSON formatida qaytarmadi.",
      });
    }

    return res.json({
      changed: Boolean(data.changed),
      answer: String(data.answer || "Javob tayyor."),
      editedDocument: String(data.editedDocument || ""),
    });
  } catch (error) {
    console.error("GROQ CHAT ERROR:", error);

    const status = Number(error?.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: error?.error?.message || error?.message || "Groq AI bilan bog‘lanishda xatolik yuz berdi.",
    });
  }
});

app.post("/api/export", async (req, res) => {
  try {
    const text = String(req.body?.text || "");
    const safeName = String(req.body?.fileName || "AI-Word-Hujjat.docx")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.docx$/i, "") || "AI-Word-Hujjat";

    const lines = text.split(/\r?\n/);
    const paragraphs = lines.map(
      (line) => new Paragraph({ children: [new TextRun(line)] })
    );

    const document = new Document({
      sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph("")] }],
    });

    const buffer = await Packer.toBuffer(document);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}-AI.docx"`
    );

    return res.send(buffer);
  } catch (error) {
    console.error("EXPORT ERROR:", error);
    return res.status(500).json({
      error: error?.message || "Word fayl yaratilmadi.",
    });
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
