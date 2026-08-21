import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import OpenAI from "openai";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { register, login, userFromToken, listFiles, recordFile, recordUpdate } from "./server-auth.js";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const filesDir = path.join(dataDir, "files");
fs.mkdirSync(filesDir, { recursive: true });

const apiKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
const client = apiKey ? new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" }) : null;
const openaiKey = process.env.OPENAI_API_KEY?.trim();
const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
const imageClient = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map(x=>x.trim()).filter(Boolean);
app.use(cors({origin:(origin,cb)=>!origin||allowed.includes("*")||allowed.includes(origin)?cb(null,true):cb(new Error("Origin not allowed"))}));
app.use(express.json({limit:"25mb"}));

function auth(req,res,next){
  try { const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,""); const email=userFromToken(token); if(!email)return res.status(401).json({error:"Kirish talab qilinadi."}); req.userEmail=email; next(); }
  catch(e){return res.status(401).json({error:"Sessiya yaroqsiz."});}
}
function cleanName(name){return String(name||"AI-Word-Hujjat.docx").replace(/[^a-zA-Z0-9._-]/g,"_").replace(/\.docx$/i,"")||"AI-Word-Hujjat";}
function filePath(id){return path.join(filesDir,`${id}.docx`);}
async function buildDocx(text){const paragraphs=String(text||"").split(/\r?\n/).map(line=>new Paragraph({children:[new TextRun(line)]}));return Packer.toBuffer(new Document({sections:[{children:paragraphs.length?paragraphs:[new Paragraph({children:[new TextRun("")]})]}]}));}

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024},fileFilter:(_req,file,cb)=>file.originalname.toLowerCase().endsWith(".docx")?cb(null,true):cb(new Error("Faqat .docx Word fayl yuklash mumkin."))});

app.get("/",(_req,res)=>res.json({ok:true,service:"AI Word Editor API",model,imageModel}));
app.get("/health",(_req,res)=>res.json({ok:true,aiConfigured:!!client,imageConfigured:!!imageClient}));

app.post("/api/auth/register",async(req,res)=>{try{const token=register(String(req.body?.email||""),String(req.body?.password||""));res.json({token,email:String(req.body.email).trim().toLowerCase()});}catch(e){res.status(400).json({error:e.message});}});
app.post("/api/auth/login",async(req,res)=>{try{const token=login(String(req.body?.email||""),String(req.body?.password||""));res.json({token,email:String(req.body.email).trim().toLowerCase()});}catch(e){res.status(401).json({error:e.message});}});
app.get("/api/auth/me",auth,(req,res)=>res.json({email:req.userEmail}));
app.get("/api/files",auth,(req,res)=>res.json({files:listFiles(req.userEmail)}));

app.post("/api/extract",auth,upload.single("file"),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:"Word fayl yuborilmadi."});const result=await mammoth.extractRawText({buffer:req.file.buffer});const id=crypto.randomUUID();fs.writeFileSync(filePath(id),req.file.buffer);recordFile(req.userEmail,{id,name:req.file.originalname,size:req.file.size,type:req.file.mimetype||"application/vnd.openxmlformats-officedocument.wordprocessingml.document",createdAt:new Date().toISOString()});res.json({text:result.value||"",fileId:id,name:req.file.originalname});}catch(e){console.error(e);res.status(500).json({error:e.message||"Word faylni o‘qib bo‘lmadi."});}});

app.post("/api/generate-image",async(req,res)=>{try{if(!imageClient)return res.status(503).json({error:"OPENAI_API_KEY Render serverida sozlanmagan."});const prompt=String(req.body?.prompt||"").trim();if(!prompt)return res.status(400).json({error:"Rasm tavsifini yozing."});const result=await imageClient.images.generate({model:imageModel,prompt,size:"1024x1024",output_format:"png"});const b64=result?.data?.[0]?.b64_json;const url=result?.data?.[0]?.url;if(b64)return res.json({dataUrl:`data:image/png;base64,${b64}`});if(url)return res.json({dataUrl:url});throw new Error("Rasm qaytmadi.");}catch(e){console.error(e);res.status(500).json({error:e.message||"Rasm yaratilmadi."});}});

app.post("/api/chat",async(req,res)=>{try{if(!client)return res.status(503).json({error:"GROQ_API_KEY serverda sozlanmagan."});const documentText=String(req.body?.documentText||"");const instruction=String(req.body?.instruction||"").trim();const attachments=Array.isArray(req.body?.attachments)?req.body.attachments:[];if(!instruction)return res.status(400).json({error:"Buyruq yoki savol yuboring."});const attachmentText=attachments.map((x,i)=>`${i+1}. ${x.name||"file"} (${x.type||"file"})${x.text?`\n${String(x.text).slice(0,12000)}`:""}`).join("\n\n")||"Yo‘q";const input=`Siz AI Word Editor yordamchisisiz. Foydalanuvchi o‘zbek tilida yozadi. Hujjatni tahrirlash so‘ralsa changed=true va editedDocument to‘liq yangi matn bo‘lsin; oddiy savolda changed=false. Asl mazmunni saqlang. Faqat JSON qaytaring: {"changed":true,"answer":"...","editedDocument":"..."}\n\nHUJJAT:\n${documentText}\n\nFAYLLAR:\n${attachmentText}\n\nBUYRUQ:\n${instruction}`;const r=await client.responses.create({model,input});let data;try{data=JSON.parse(String(r.output_text||"").trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,""));}catch{ return res.status(502).json({error:"AI javob formati noto‘g‘ri."});}res.json({changed:!!data.changed,answer:String(data.answer||"Javob tayyor."),editedDocument:String(data.editedDocument||"")});}catch(e){res.status(500).json({error:e.message||"AI xatosi."});}});

async function saveWord(req,res){try{const id=String(req.body?.fileId||"");const meta=listFiles(req.userEmail).find(x=>x.id===id);if(!meta)return res.status(404).json({error:"Fayl topilmadi."});const buf=await buildDocx(req.body?.text||"");fs.writeFileSync(filePath(id),buf);recordUpdate(req.userEmail,id,{size:buf.length,name:meta.name,lastSavedAt:new Date().toISOString()});res.json({ok:true,message:"O‘zgarishlar aynan ulangan Word faylga saqlandi.",fileId:id,name:meta.name});}catch(e){res.status(500).json({error:e.message||"Saqlash xatosi."});}}
app.post("/api/save-original",auth,saveWord);
app.post("/api/export",auth,async(req,res)=>{try{const text=String(req.body?.text||"");const fileName=cleanName(req.body?.fileName);const buffer=await buildDocx(text);res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");res.setHeader("Content-Disposition",`attachment; filename="${fileName}-AI.docx"`);res.send(buffer);}catch(e){res.status(500).json({error:"Word yaratilmadi."});}});
app.get("/api/files/:id/download",auth,(req,res)=>{try{const meta=listFiles(req.userEmail).find(x=>x.id===req.params.id);if(!meta)return res.status(404).json({error:"Fayl topilmadi."});const p=filePath(req.params.id);if(!fs.existsSync(p))return res.status(404).json({error:"Fayl saqlanmagan."});res.download(p,meta.name);}catch(e){res.status(500).json({error:"Faylni yuklab bo‘lmadi."});}});
app.use((e,_req,res,_next)=>res.status(400).json({error:e?.message||"Server xatosi."}));
app.listen(port,"0.0.0.0",()=>console.log(`AI Word Editor API: ${port}`));
