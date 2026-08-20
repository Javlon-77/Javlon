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
const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";

if (!apiKey) {
  console.warn("WARNING: OPENAI_API_KEY topilmadi. AI endpointlari ishlamaydi.");
}

const client = apiKey ? new OpenAI({ apiKey }) : null;

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
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".docx")) return cb(null, true);
    cb(new Error("Faqat .docx Word fayl yuklash mumkin."));
  },
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "AI Word Editor API" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(client), model });
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
    return res.status(500).json({ error: "Word faylni o‘qib bo‘lmadi." });
  }
});

function cleanJson(text) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!client) {
      return res.status(503).json({
        error: "OPENAI_API_KEY serverda sozlanmagan.",
      });
    }

    const documentText = String(req.body?.documentText || "");
    const instruction = String(req.body?.instruction || "").trim();

    if (!instruction) {
      return res.status(400).json({ error: "Buyruq yoki savol yuboring." });
    }

    const input = `
Siz AI Word Editor dasturining yordamchisisiz. Foydalanuvchi o‘zbek tilida yozishi mumkin.

Vazifa:
- Foydalanuvchi hujjatni tahrirlashni so‘rasa, changed=true qiling va editedDocument maydonida BUTUN hujjatning yangi to‘liq matnini qaytaring.
- Faqat savol bersa yoki mazmun so‘rasa, changed=false qiling va editedDocument ni bo‘sh qoldiring.
- Hujjatni tahrirlashda asl mazmunni imkon qadar saqlang.
- Javobni qisqa va tushunarli o‘zbek tilida yozing.
- Faqat quyidagi JSON formatida javob bering:
{"changed":true,"answer":"...","editedDocument":"..."}

HOZIRGI HUJJAT:
${documentText}

FOYDALANUVCHI BUYRUG‘I:
${instruction}
`;

    const response = await client.responses.create({
      model,
      input,
    });

    const raw = response.output_text || "";
    let data;

    try {
      data = JSON.parse(cleanJson(raw));
    } catch {
      return res.status(502).json({
        error: "AI javobini to‘g‘ri formatda qaytarmadi.",
      });
    }

    return res.json({
      changed: Boolean(data.changed),
      answer: String(data.answer || "Javob tayyor."),
      editedDocument: String(data.editedDocument || ""),
    });
  } catch (error) {
    console.error("CHAT ERROR:", error);
    return res.status(500).json({
      error: error?.message || "AI bilan bog‘lanishda xatolik yuz berdi.",
    });
  }
});

app.post("/api/export", async (req, res) => {
  try {
    const text = String(req.body?.text || "");
    const fileName = String(req.body?.fileName || "AI-Word-Hujjat.docx")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.docx$/i, "") || "AI-Word-Hujjat";

    const paragraphs = text.split(/\r?\n/).map(
      (line) =>
        new Paragraph({
          children: [new TextRun(line)],
        })
    );

    if (paragraphs.length === 0) {
      paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
    }

    const document = new Document({
      sections: [{ children: paragraphs }],
    });

    const buffer = await Packer.toBuffer(document);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}-AI.docx"`
    );

    return res.send(buffer);
  } catch (error) {
    console.error("EXPORT ERROR:", error);
    return res.status(500).json({ error: "Word fayl yaratilmadi." });
  }
});

app.use((error, _req, res, _next) => {
  console.error("SERVER ERROR:", error);
  res.status(400).json({ error: error.message || "Server xatosi." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`AI Word Editor API http://localhost:${port}`);
});
