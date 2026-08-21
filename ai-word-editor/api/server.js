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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (_req, file, cb) => String(file.originalname || "").toLowerCase().endsWith(".docx") ? cb(null, true) : cb(new Error("Faqat .docx Word fayl yuklash mumkin.")) });

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const filesDir = path.join(dataDir, "files");
const indexFile = path.join(dataDir, "index.json");
fs.mkdirSync(filesDir, { recursive: true });
function loadIndex(){try{const v=JSON.parse(fs.readFileSync(indexFile,"utf8"));return Array.isArray(v)?v:[]}catch{return[]}}
function saveIndex(v){fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(indexFile,JSON.stringify(v.slice(0,200),null,2),"utf8")}
let files=loadIndex();
function safeName(name){return String(name||"AI-Word-Hujjat.docx").replace(/[<>:\"/\\|?*\x00-\x1F]/g,"_").trim()||"AI-Word-Hujjat.docx"}
function filePath(id){return path.join(filesDir,`${String(id).replace(/[^a-zA-Z0-9_-]/g,"")}.docx`)}
function upsertMeta(meta){files=files.filter(x=>x.id!==meta.id);files.unshift(meta);saveIndex(files)}
function getMeta(id){return files.find(x=>x.id===String(id||""))||null}

app.get("/",(_req,res)=>res.json({ok:true,service:"AI Word Editor API",provider:"Groq",model,aiConfigured:Boolean(client),authRequired:false}));
app.get("/health",(_req,res)=>res.json({ok:true,aiConfigured:Boolean(client),provider:"Groq",model,authRequired:false}));
app.get("/api/files",(_req,res)=>res.json({files:files.filter(x=>fs.existsSync(filePath(x.id)))}));

app.post("/api/extract",upload.single("file"),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:"Word fayl yuborilmadi."});const id=crypto.randomUUID(),name=safeName(req.file.originalname),now=new Date().toISOString();fs.writeFileSync(filePath(id),req.file.buffer);const result=await mammoth.extractRawText({buffer:req.file.buffer});upsertMeta({id,name,favorite:false,updatedAt:now});res.json({documentId:id,text:result.value||"",fileName:name})}catch(e){console.error("EXTRACT ERROR",e);res.status(500).json({error:e?.message||"Word faylni o‘qib bo‘lmadi."})}});

app.get("/api/files/:id",async(req,res)=>{try{const meta=getMeta(req.params.id);if(!meta||!fs.existsSync(filePath(meta.id)))return res.status(404).json({error:"Fayl topilmadi."});const buffer=fs.readFileSync(filePath(meta.id));const result=await mammoth.extractRawText({buffer});upsertMeta({...meta,updatedAt:new Date().toISOString()});res.json({documentId:meta.id,fileName:meta.name,text:result.value||"",updatedAt:meta.updatedAt})}catch(e){res.status(500).json({error:e?.message||"Faylni ochib bo‘lmadi."})}});
app.get("/api/files/:id/download",(req,res)=>{try{const meta=getMeta(req.params.id);if(!meta||!fs.existsSync(filePath(meta.id)))return res.status(404).json({error:"Fayl topilmadi."});res.download(filePath(meta.id),meta.name)}catch(e){res.status(500).json({error:e?.message||"Faylni yuklab bo‘lmadi."})}});
app.post("/api/files/:id/favorite",(req,res)=>{const meta=getMeta(req.params.id);if(!meta)return res.status(404).json({error:"Fayl topilmadi."});const favorite=!meta.favorite;upsertMeta({...meta,favorite});res.json({ok:true,favorite})});

function cleanJson(t){const v=String(t||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim(),a=v.indexOf("{"),b=v.lastIndexOf("}");return a>=0&&b>a?v.slice(a,b+1):v}
app.post("/api/chat",async(req,res)=>{try{if(!client)return res.status(503).json({error:"GROQ_API_KEY Render Environment Variables ichida sozlanmagan."});const instruction=String(req.body?.instruction||"").trim();if(!instruction)return res.status(400).json({error:"So‘rov yuboring."});const documentText=String(req.body?.documentText||"");const system=`Siz professional AI Word Editor yordamchisisiz. Tahrirlash so‘ralsa changed=true va editedDocument to‘liq tahrirlangan matn bo‘lsin. Savol yoki maslahat bo‘lsa changed=false. Javob o‘zbek tilida, aniq va qisqa bo‘lsin. FAQAT JSON qaytaring: {"changed":true,"answer":"...","editedDocument":"..."}`;const response=await client.chat.completions.create({model,temperature:0.15,response_format:{type:"json_object"},messages:[{role:"system",content:system},{role:"user",content:`Hujjat matni:\n${documentText}\n\nFoydalanuvchi so‘rovi:\n${instruction}`}]});let data;try{data=JSON.parse(cleanJson(response.choices?.[0]?.message?.content||""))}catch{return res.status(502).json({error:"AI javobini o‘qib bo‘lmadi."})}res.json({changed:Boolean(data.changed),answer:String(data.answer||"Javob tayyor."),editedDocument:String(data.editedDocument||""),documentId:String(req.body?.documentId||"")})}catch(e){console.error("CHAT ERROR",e);res.status(Number(e?.status)||500).json({error:e?.error?.message||e?.message||"AI bilan bog‘lanishda xatolik."})}});

function escapeXml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;")}
function replaceParagraph(p,text){const value=escapeXml(text);let used=false;return p.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,(_m,o,_old,c)=>{if(used)return `${o}${c}`;used=true;return `${o}${value}${c}`})}
function applyText(xml,text){const lines=String(text||"").split(/\r?\n/);let i=0;let out=xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,p=>/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(p)?replaceParagraph(p,lines[i++]??""):p);const rest=lines.slice(i).filter(Boolean);if(rest.length)out=out.replace(/<\/w:body>/,rest.map(x=>`<w:p><w:r><w:t xml:space="preserve">${escapeXml(x)}</w:t></w:r></w:p>`).join("")+"</w:body>");return out}
async function updateWord(id,text){const meta=getMeta(id);if(!meta||!fs.existsSync(filePath(id)))throw new Error("Word fayl topilmadi.");const zip=await JSZip.loadAsync(fs.readFileSync(filePath(id)));const f=zip.file("word/document.xml");if(!f)throw new Error("DOCX document.xml topilmadi.");const xml=await f.async("string");zip.file("word/document.xml",applyText(xml,text));const out=await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});fs.writeFileSync(filePath(id),out);upsertMeta({...meta,updatedAt:new Date().toISOString()});return out}
app.post("/api/save",async(req,res)=>{try{const id=String(req.body?.documentId||"");if(!id)return res.status(400).json({error:"Avval Word faylini oching."});const out=await updateWord(id,String(req.body?.text||""));const meta=getMeta(id);res.json({ok:true,documentId:id,fileName:meta.name,updatedAt:meta.updatedAt,size:out.length})}catch(e){console.error("SAVE ERROR",e);res.status(500).json({error:e?.message||"Word faylni saqlab bo‘lmadi."})}});
app.post("/api/export",async(req,res)=>{try{const id=String(req.body?.documentId||"");if(typeof req.body?.text==="string")await updateWord(id,req.body.text);const meta=getMeta(id);if(!meta)return res.status(404).json({error:"Word fayl topilmadi."});res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");res.setHeader("Content-Disposition",`attachment; filename="${meta.name.replace(/\"/g,"")}"`);res.send(fs.readFileSync(filePath(id)))}catch(e){console.error("EXPORT ERROR",e);res.status(500).json({error:e?.message||"Word fayl tayyorlanmadi."})}});
app.use((e,_req,res,_next)=>{console.error("SERVER ERROR",e);if(!res.headersSent)res.status(400).json({error:e?.message||"Server xatosi."})});
app.listen(port,"0.0.0.0",()=>console.log(`AI Word Editor API: ${port} | Auth: OFF | AI: ${Boolean(client)}`));