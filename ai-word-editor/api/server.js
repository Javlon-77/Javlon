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
const model =
  process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

if (!apiKey) {
  console.warn(
    "WARNING: GROQ_API_KEY topilmadi. AI endpointlari ishlamaydi."
  );
}

const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

// ===============================
// CORS
// ===============================
const allowed = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowed.includes("*") ||
        allowed.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed"));
    },
  })
);

// ===============================
// JSON
// ===============================
app.use(express.json({ limit: "10mb" }));

// ===============================
// FILE UPLOAD
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();

    if (name.endsWith(".docx")) {
      return cb(null, true);
    }

    cb(new Error("Faqat .docx Word fayl yuklash mumkin."));
  },
});

// ===============================
// HOME
// ===============================
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AI Word Editor API",
    provider: "Groq",
    model,
  });
});

// ===============================
// HEALTH
// ===============================
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(client),
    provider: "Groq",
    model,
  });
});

// ===============================
// EXTRACT DOCX
// ===============================
app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Word fayl yuborilmadi.",
      });
    }

    const result = await mammoth.extractRawText({
      buffer: req.file.buffer,
    });

    return res.json({
      text: result.value || "",
    });
  } catch (error) {
    console.error("EXTRACT ERROR:", error);

    return res.status(500).json({
      error: "Word faylni o‘qib bo‘lmadi.",
    });
  }
});

// ===============================
// CLEAN JSON
// ===============================
function cleanJson(text) {
  return text
    .trim()
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
    if (!client) {
      return res.status(503).json({
        error: "GROQ_API_KEY serverda sozlanmagan.",
      });
    }

    const documentText = String(
      req.body?.documentText || ""
    );

    const instruction = String(
      req.body?.instruction || ""
    ).trim();

    if (!instruction) {
      return res.status(400).json({
        error: "Buyruq yoki savol yuboring.",
      });
    }

    const input = `
Siz AI Word Editor dasturining yordamchisisiz.

Foydalanuvchi o‘zbek tilida yozishi mumkin.

Vazifa:

1. Foydalanuvchi hujjatni tahrirlashni so‘rasa:
   - changed=true qiling
   - editedDocument ichida BUTUN hujjatning yangi to‘liq matnini qaytaring.

2. Foydalanuvchi faqat savol bersa:
   - changed=false qiling
   - editedDocument bo‘sh bo‘lsin.

3. Hujjatni tahrirlashda:
   - asl mazmunni imkon qadar saqlang;
   - faqat foydalanuvchi so‘ragan o‘zgarishni bajaring.

4. Javob qisqa va tushunarli o‘zbek tilida bo‘lsin.

5. FAQAT quyidagi JSON formatida javob bering:

{
  "changed": true,
  "answer": "...",
  "editedDocument": "..."
}

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
    } catch (error) {
      console.error("JSON PARSE ERROR:", error);
      console.error("AI RAW:", raw);

      return res.status(502).json({
        error: "AI javobini to‘g‘ri JSON formatida qaytarmadi.",
      });
    }

    return res.json({
      changed: Boolean(data.changed),

      answer: String(
        data.answer || "Javob tayyor."
      ),

      editedDocument: String(
        data.editedDocument || ""
      ),
    });
  } catch (error) {
    console.error("GROQ CHAT ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Groq AI bilan bog‘lanishda xatolik yuz berdi.",
    });
  }
});

// ===============================
// EXPORT DOCX
// ===============================
app.post("/api/export", async (req, res) => {
  try {
    const text = String(
      req.body?.text || ""
    );

    const fileName =
      String(
        req.body?.fileName ||
          "AI-Word-Hujjat.docx"
      )
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/\.docx$/i, "") ||
      "AI-Word-Hujjat";

    const paragraphs = text
      .split(/\r?\n/)
      .map(
        (line) =>
          new Paragraph({
            children: [
              new TextRun(line),
            ],
          })
      );

    if (paragraphs.length === 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun("")],
        })
      );
    }

    const document = new Document({
      sections: [
        {
          children: paragraphs,
        },
      ],
    });

    const buffer =
      await Packer.toBuffer(document);

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

    return res.status(500).json({
      error: "Word fayl yaratilmadi.",
    });
  }
});

// ===============================
// ERROR HANDLER
// ===============================
app.use(
  (error, _req, res, _next) => {
    console.error(
      "SERVER ERROR:",
      error
    );

    res.status(400).json({
      error:
        error?.message ||
        "Server xatosi.",
    });
  }
);

// ===============================
// START SERVER
// ===============================
app.listen(
  port,
  "0.0.0.0",
  () => {
    console.log(
      `AI Word Editor API ishga tushdi: port ${port}`
    );

    console.log(
      `Provider: Groq`
    );

    console.log(
      `Model: ${model}`
    );
  }
);
