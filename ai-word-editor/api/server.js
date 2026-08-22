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
const app=express(),port=Number(process.env.PORT||3000);
const apiKey=process.env.GROQ_API_KEY?.trim(),model=process.env.GROQ_MODEL?.trim()||"openai/gpt-oss-120b";
const client=apiKey?new OpenAI({apiKey,baseURL:"https://api.groq.com/openai/v1"}):null;
app.use(cors({origin:true}));app.use(express.json({limit:"60mb"}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024},fileFilter:(_r,f,cb)=>String(f.originalname||"").toLowerCase().endsWith(".docx")?cb(null,true):cb(new Error("Faqat .docx Word fayl yuklash mumkin."))});
const dataDir=process.env.DATA_DIR||path.join(process.cwd(),"data"),filesDir=path.join(dataDir,"files"),indexFile=path.join(dataDir,"index.json");
fs.mkdirSync(filesDir,{recursive:true});
function loadIndex(){try{const v=JSON.parse(fs.readFileSync(indexFile,"utf8"));return Array.isArray(v)?v:[]}catch{return[]}}
function saveIndex(v){fs.writeFileSync(indexFile,JSON.stringify(v.slice(0,200),null,2),"utf8")}
let files=loadIndex();
const safeName=n=>String(n||"AI-Word-Hujjat.docx").replace(/[<>:\"/\\|?*\x00-\x1F]/g,"_").trim()||"AI-Word-Hujjat.docx";
const filePath=id=>path.join(filesDir,`${String(id).replace(/[^a-zA-Z0-9_-]/g,"")}.docx`);
function upsertMeta(m){files=files.filter(x=>x.id!==m.id);files.unshift(m);saveIndex(files)}
const getMeta=id=>files.find(x=>x.id===String(id||""))||null;
app.get("/",(_r,res)=>res.json({ok:true,service:"AI Word Editor API",provider:"Groq",model,aiConfigured:Boolean(client),authRequired:false}));
app.get("/health",(_r,res)=>res.json({ok:true,aiConfigured:Boolean(client),provider:"Groq",model,authRequired:false}));
app.get("/api/files",(_r,res)=>res.json({files:files.filter(x=>fs.existsSync(filePath(x.id)))}));
app.post("/api/extract",upload.single("file"),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:"Word fayl yuborilmadi."});const id=crypto.randomUUID(),name=safeName(req.file.originalname),now=new Date().toISOString();fs.writeFileSync(filePath(id),req.file.buffer);const result=await mammoth.extractRawText({buffer:req.file.buffer});upsertMeta({id,name,favorite:false,updatedAt:now});res.json({documentId:id,text:result.value||"",fileName:name})}catch(e){console.error(e);res.status(500).json({error:e?.message||"Word faylni o‘qib bo‘lmadi."})}});
app.get("/api/files/:id",async(req,res)=>{try{const meta=getMeta(req.params.id);if(!meta||!fs.existsSync(filePath(meta.id)))return res.status(404).json({error:"Fayl topilmadi."});const result=await mammoth.extractRawText({buffer:fs.readFileSync(filePath(meta.id))});res.json({documentId:meta.id,fileName:meta.name,text:result.value||"",updatedAt:meta.updatedAt})}catch(e){res.status(500).json({error:e?.message||"Faylni ochib bo‘lmadi."})}});
app.get("/api/files/:id/download",(req,res)=>{try{const meta=getMeta(req.params.id);if(!meta||!fs.existsSync(filePath(meta.id)))return res.status(404).json({error:"Fayl topilmadi."});res.download(filePath(meta.id),meta.name)}catch(e){res.status(500).json({error:e?.message||"Faylni yuklab bo‘lmadi."})}});
app.post("/api/files/:id/favorite",(req,res)=>{const meta=getMeta(req.params.id);if(!meta)return res.status(404).json({error:"Fayl topilmadi."});const favorite=!meta.favorite;upsertMeta({...meta,favorite});res.json({ok:true,favorite})});
function cleanJson(t){const v=String(t||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim(),a=v.indexOf("{"),b=v.lastIndexOf("}");return a>=0&&b>a?v.slice(a,b+1):v}
app.post("/api/chat",async(req,res)=>{try{if(!client)return res.status(503).json({error:"GROQ_API_KEY Render Environment Variables ichida sozlanmagan."});const instruction=String(req.body?.instruction||"").trim();if(!instruction)return res.status(400).json({error:"So‘rov yuboring."});const documentText=String(req.body?.documentText||"");const system=`Siz professional AI Word Editor yordamchisisiz. [[IMAGE:id]] markerlarini aniq saqlang. Ularni o‘zgartirmang, o‘chirmang yoki oddiy matnga aylantirmang. Tahrirlash bo‘lsa changed=true va editedDocument to‘liq matn bo‘lsin. Savol bo‘lsa changed=false. Javob o‘zbek tilida va qisqa. FaqAT JSON: {"changed":true,"answer":"...","editedDocument":"..."}`;const r=await client.chat.completions.create({model,temperature:.15,response_format:{type:"json_object"},messages:[{role:"system",content:system},{role:"user",content:`Hujjat:\n${documentText}\n\nSo‘rov:\n${instruction}`}]});let d;try{d=JSON.parse(cleanJson(r.choices?.[0]?.message?.content||""))}catch{return res.status(502).json({error:"AI javobini o‘qib bo‘lmadi."})}res.json({changed:Boolean(d.changed),answer:String(d.answer||"Javob tayyor."),editedDocument:String(d.editedDocument||""),documentId:String(req.body?.documentId||"")})}catch(e){console.error(e);res.status(Number(e?.status)||500).json({error:e?.error?.message||e?.message||"AI bilan bog‘lanishda xatolik."})}});
function escapeXml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;")}
function replaceParagraph(p,text){const value=escapeXml(text);let used=false;return p.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,(_m,o,_old,c)=>{if(used)return `${o}${c}`;used=true;return `${o}${value}${c}`})}
function applyText(xml,text){const lines=String(text||"").split(/\r?\n/);let i=0;let out=xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,p=>/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(p)?replaceParagraph(p,lines[i++]??""):p);const rest=lines.slice(i).filter(Boolean);if(rest.length)out=out.replace(/<\/w:body>/,rest.map(x=>`<w:p><w:r><w:t xml:space="preserve">${escapeXml(x)}</w:t></w:r></w:p>`).join("")+"</w:body>");return out}
function dataUrlToBuffer(dataUrl){const m=String(dataUrl||"").match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error("Rasm formati noto‘g‘ri.");return {mime:m[1],buffer:Buffer.from(m[2],"base64")}}
function imageType(mime){const x=String(mime||"").toLowerCase();if(x==="image/jpeg"||x==="image/jpg")return"jpg";if(x==="image/png")return"png";if(x==="image/gif")return"gif";if(x==="image/bmp")return"bmp";if(x==="image/svg+xml")return"svg";return null}
function imageSize(mime){if(mime==="image/gif")return[500,400];return[700,480]}
async function buildDocx(text,blocks,meta){const original=fs.existsSync(filePath(meta.id))?fs.readFileSync(filePath(meta.id)):null;const hasImages=Array.isArray(blocks)&&blocks.some(b=>b?.type==="image"&&b.dataUrl);if(!hasImages&&original){const zip=await JSZip.loadAsync(original),f=zip.file("word/document.xml");if(!f)throw new Error("DOCX document.xml topilmadi.");const xml=await f.async("string");zip.file("word/document.xml",applyText(xml,text));return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"})}const children=[];for(const line of String(text||"").split(/\r?\n/))children.push(new Paragraph({children:[new TextRun(line)]}));for(const b of Array.isArray(blocks)?blocks:[]){if(b?.type!=="image"||!b.dataUrl)continue;const {mime,buffer}=dataUrlToBuffer(b.dataUrl),type=imageType(mime);if(!type)continue;const [width,height]=imageSize(mime);children.push(new Paragraph({children:[new ImageRun({data:buffer,type,transformation:{width,height}})]}));if(b.caption)children.push(new Paragraph({children:[new TextRun(String(b.caption))]}))}const doc=new Document({sections:[{children:children.length?children:[new Paragraph({children:[new TextRun("")]})]}]});return Packer.toBuffer(doc)}
app.post("/api/save",async(req,res)=>{try{const id=String(req.body?.documentId||""),meta=getMeta(id);if(!meta)return res.status(404).json({error:"Word fayl topilmadi."});const out=await buildDocx(String(req.body?.text||""),Array.isArray(req.body?.appendBlocks)?req.body.appendBlocks:[],meta);fs.writeFileSync(filePath(id),out);const updatedAt=new Date().toISOString();upsertMeta({...meta,updatedAt});res.json({ok:true,documentId:id,fileName:meta.name,updatedAt,size:out.length})}catch(e){console.error("SAVE ERROR",e);res.status(500).json({error:e?.message||"Word faylni saqlab bo‘lmadi."})}});
app.post("/api/export",async(req,res)=>{try{const id=String(req.body?.documentId||""),meta=getMeta(id);if(!meta)return res.status(404).json({error:"Word fayl topilmadi."});const out=await buildDocx(String(req.body?.text||""),Array.isArray(req.body?.appendBlocks)?req.body.appendBlocks:[],meta);fs.writeFileSync(filePath(id),out);res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");res.setHeader("Content-Disposition",`attachment; filename="${meta.name.replace(/\"/g,"")}"`);res.send(out)}catch(e){console.error("EXPORT ERROR",e);res.status(500).json({error:e?.message||"Word fayl tayyorlanmadi."})}});
app.use((e,_req,res,_next)=>{console.error("SERVER ERROR",e);if(!res.headersSent)res.status(400).json({error:e?.message||"Server xatosi."})});
app.listen(port,"0.0.0.0",()=>console.log(`AI Word Editor API: ${port} | Auth: OFF | AI: ${Boolean(client)}`));
