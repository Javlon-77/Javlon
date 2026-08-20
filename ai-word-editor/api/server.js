import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import OpenAI from "openai";
import cors from "cors";
import dotenv from "dotenv";
import { Document, Packer, Paragraph, TextRun } from "docx";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const allowed = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(x => x.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error("Origin not allowed"));
  }
}));

app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const client = process.env.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
  ? new OpenAI({
      apiKey: process.env.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
    })
  : null;
