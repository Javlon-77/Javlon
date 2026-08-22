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
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType } from "docx";

dotenv.config();
const app=express();
const port=Number(process.env.PORT||3000);
const groqKey=process.env.GROQ_API_KEY?.trim();
const model=process.env.GROQ_MODEL?.trim()||"openai/gpt-oss-120b";
const textClient=groqKey?new OpenAI({apiKey:groqKey,baseURL:"https://api.groq.com/openai/v1"}):null;
app.use(cors({origin:true}));
app.use(express.json({limit:"70mb"}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024},fileFilter:(_r,f,cb)=>{const ok=String(f.originalname||"").toLowerCase().endsWith(".docx");cb(ok?null:new Error("Faqat .docx Word fayl yuklash mumkin."),ok)}});
const dataDir=process.env.DATA_DIR||path.join(process.cwd(),"data"),filesDir=path.join(dataDir,"files"),statesDir=path.join(dataDir,"states"),indexFile=path.join(dataDir,"index.json");
fs.mkdirSync(filesDir,{recursive:true});fs.mkdirSync(statesDir,{recursive:true});
function loadIndex(){try{const v=JSON.parse(fs.readFileSync(indexFile,"utf8"));return Array.isArray(v)?v:[]}catch{return[]}}
function saveIndex(v){fs.writeFileSync(indexFile,JSON.stringify(v.slice(0,200),null,2),"utf8")}
let files=loadIndex();
const safeName=n=>String(n||"AI-Word-Hujjat.docx").replace(/[<>:\"/\\|?*\x00-\x1F]/g,"_").trim()||"AI-Word-Hujjat.docx";
const safeId=id=>String(id||"").replace(/[^a-zA-Z0-9_-]/g,"");
const filePath=id=>path.join(filesDir,`${safeId(id)}.docx`),statePath=id=>path.join(statesDir,`${safeId(id)}.json`);
const getMeta=id=>files.find(x=>x.id===String(id||""))||null;
function upsertMeta(meta){files=files.filter(x=>x.id!==meta.id);files.unshift(meta);saveIndex(files)}
function readState(id){try{const v=JSON.parse(fs.readFileSync(statePath(id),"utf8"));return v&&Array.isArray(v.content)?v:null}catch{return null}}
function writeState(id,content){fs.writeFileSync(statePath(id),JSON.stringify({version:2,content,updatedAt:new Date().toISOString()}),"utf8")}
function normaliseContent(content){return(Array.isArray(content)?content:[]).map((item,i)=>{
  if(item?.type==="image")return{type:"image",id:String(item.id||`img-${i}`),dataUrl:String(item.dataUrl||""),caption:String(item.caption||"").slice(0,5000)};
  if(item?.type==="matrix")return{type:"matrix",id:String(item.id||`matrix-${i}`),title:String(item.title||"DIAGRAMMA").slice(0,300),rows:(Array.isArray(item.rows)?item.rows:[]).slice(0,100).map(row=>(Array.isArray(row)?row:[]).slice(0,30).map(v=>String(v??"").slice(0,1000)))};
  return{type:"text",text:String(item?.text||"")};
}).filter(x=>x.type!=="image"||x.dataUrl)}
function contentToPrompt(content){return normaliseContent(content).map(x=>x.type==="matrix"?(x.rows||[]).map(r=>r.join(" | ")).join("\n"):x.type==="image"?`[[IMAGE:${x.id}]]${x.caption?`\n${x.caption}`:""}`:x.text).join("\n").trim()}
app.get("/",(_r,res)=>res.json({ok:true,service:"AI Word Editor API",textAI:Boolean(textClient),authRequired:false}));
app.get("/health",(_r,res)=>res.json({ok:true,aiConfigured:Boolean(textClient),provider:"Groq",model,authRequired:false}));
app.get("/api/files",(_r,res)=>res.json({files:files.filter(x=>fs.existsSync(filePath(x.id)))}));
app.post("/api/extract",upload.single("file"),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:"Word fayl yuborilmadi."});const id=crypto.randomUUID(),name=safeName(req.file.originalname);fs.writeFileSync(filePath(id),req.file.buffer);const result=await mammoth.extractRawText({buffer:req.file.buffer});upsertMeta({id,name,favorite:false,updatedAt:new Date().toISOString()});res.json({documentId:id,fileName:name,text:result.value||""})}catch(e){console.error("EXTRACT",e);res.status(500).json({error:e?.message||"Word faylni ochib bo‘lmadi."})}});
app.get("/api/files/:id",async(req,res)=>{try{const meta=getMeta(req.params.id);if(!meta||!fs.existsSync(filePath(meta.id)))return res.status(404).json({error:"Fayl topilmadi."});const state=readState(meta.id);if(state)return res.json({documentId:meta.id,fileName:meta.name,content:state.content,updatedAt:meta.updatedAt});const result=await mammoth.extractRawText({buffer:fs.readFileSync(filePath(meta.id))});res.json({documentId:meta.id,fileName:meta.name,content:[{type:"text",text:result.value||""}],updatedAt:meta.updatedAt})}catch(e){res.status(500).json({error:e?.message||"Faylni ochib bo‘lmadi."})}});
app.get("/api/files/:id/download",(req,res)=>{const meta=getMeta(req.params.id);if(!meta||!fs.existsSync(filePath(meta.id)))return res.status(404).json({error:"Fayl topilmadi."});res.download(filePath(meta.id),meta.name)});
app.post("/api/files/:id/favorite",(req,res)=>{const meta=getMeta(req.params.id);if(!meta)return res.status(404).json({error:"Fayl topilmadi."});const favorite=!meta.favorite;upsertMeta({...meta,favorite});res.json({ok:true,favorite})});
function cleanJson(t){const v=String(t||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim(),s=v.indexOf("{"),e=v.lastIndexOf("}");return s>=0&&e>s?v.slice(s,e+1):v}
app.post("/api/chat",async(req,res)=>{try{if(!textClient)return res.status(503).json({error:"AI kaliti serverda sozlanmagan."});const instruction=String(req.body?.instruction||"").trim();if(!instruction)return res.status(400).json({error:"So‘rov yozing."});const documentText=String(req.body?.documentText||"");const system=`Siz professional AI Word Editor yordamchisisiz. Ichki texnik yozuvlarni foydalanuvchiga chiqarmang. [[IMAGE:id]] markerlarini saqlang. Tahrirlash so‘ralsa changed=true va editedDocument to‘liq tahrirlangan matn bo‘lsin. Savol yoki maslahat bo‘lsa changed=false. O‘zbek tilida, qisqa va foydali javob bering. FAQAT JSON: {"changed":true,"answer":"...","editedDocument":"..."}`;const response=await textClient.chat.completions.create({model,temperature:.15,response_format:{type:"json_object"},messages:[{role:"system",content:system},{role:"user",content:`${documentText}\n\n${instruction}`} ]});let data;try{data=JSON.parse(cleanJson(response.choices?.[0]?.message?.content||""))}catch{return res.status(502).json({error:"AI javobini o‘qib bo‘lmadi."})}res.json({changed:Boolean(data.changed),answer:String(data.answer||""),editedDocument:String(data.editedDocument||""),documentId:String(req.body?.documentId||"")})}catch(e){console.error("CHAT",e);res.status(Number(e?.status)||500).json({error:e?.message||"AI bilan bog‘lanishda xatolik."})}});
function escapeXml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;")}
function paragraphReplace(xml,text){const value=escapeXml(text);let used=false;return xml.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,(_m,o,_old,c)=>used?`${o}${c}`:`${o}${value}${c}`.replace(()=>{used=true;return""}))}
function replaceDocxText(xml,text){const lines=String(text||"").split(/\r?\n/);let i=0;let out=xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,p=>!/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(p)?p:paragraphReplace(p,lines[i++]??""));const rest=lines.slice(i).filter(Boolean);if(rest.length)out=out.replace(/<\/w:body>/,`${rest.map(line=>`<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("")}</w:body>`);return out}
function imageData(url){const m=String(url||"").match(/^data:(image\/(?:png|jpeg|jpg|gif|bmp));base64,(.+)$/i);if(!m)throw new Error("Rasm formati qo‘llab-quvvatlanmaydi. PNG yoki JPG ishlating.");const mime=m[1].toLowerCase(),type=mime==="image/jpeg"||mime==="image/jpg"?"jpg":mime.replace("image/","");return{type,buffer:Buffer.from(m[2],"base64")}}
function matrixTable(item){const rows=Array.isArray(item.rows)&&item.rows.length?item.rows:[[""]];return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map((row,ri)=>new TableRow({children:(row.length?row:[""]).map(cell=>new TableCell({children:[new Paragraph({children:[new TextRun({text:String(cell||""),bold:ri===0})]})]}))}))})}
async function buildDocx(id,content){const meta=getMeta(id);if(!meta||!fs.existsSync(filePath(id)))throw new Error("Word fayl topilmadi.");const normal=normaliseContent(content);const hasImages=normal.some(x=>x.type==="image"),hasMatrix=normal.some(x=>x.type==="matrix");if(!hasImages&&!hasMatrix){const zip=await JSZip.loadAsync(fs.readFileSync(filePath(id)));const file=zip.file("word/document.xml");if(!file)throw new Error("DOCX document.xml topilmadi.");const xml=await file.async("string");zip.file("word/document.xml",replaceDocxText(xml,normal.map(x=>x.text||"").join("\n")));return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"})}
const children=[];for(const item of normal){if(item.type==="text"){for(const line of String(item.text||"").split(/\r?\n/))children.push(new Paragraph({children:[new TextRun(line)]}))}else if(item.type==="matrix"){if(item.title)children.push(new Paragraph({children:[new TextRun({text:item.title,bold:true})]}));children.push(matrixTable(item));children.push(new Paragraph(""))}else if(item.type==="image"){const {type,buffer}=imageData(item.dataUrl);children.push(new Paragraph({children:[new ImageRun({data:buffer,type,transformation:{width:650,height:450}})]}));if(item.caption)children.push(new Paragraph({children:[new TextRun(item.caption)]}))}}
return Packer.toBuffer(new Document({sections:[{children:children.length?children:[new Paragraph("")]}]}))}
async function persist(req,res,mode){try{const id=String(req.body?.documentId||""),meta=getMeta(id);if(!meta)return res.status(404).json({error:"Word fayl topilmadi."});const content=normaliseContent(req.body?.content),out=await buildDocx(id,content);fs.writeFileSync(filePath(id),out);writeState(id,content);upsertMeta({...meta,updatedAt:new Date().toISOString()});if(mode==="export"){res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");res.setHeader("Content-Disposition",`attachment; filename="${meta.name.replace(/\"/g,"")}"`);return res.send(out)}res.json({ok:true,documentId:id,fileName:meta.name,updatedAt:new Date().toISOString()})}catch(e){console.error(mode.toUpperCase(),e);res.status(500).json({error:e?.message||"Word fayl tayyorlanmadi."})}}
app.post("/api/save",(req,res)=>persist(req,res,"save"));app.post("/api/export",(req,res)=>persist(req,res,"export"));
app.use((error,_req,res,_next)=>{console.error("SERVER",error);if(!res.headersSent)res.status(400).json({error:error?.message||"Server xatosi."})});
app.listen(port,"0.0.0.0",()=>console.log(`AI Word Editor API running on ${port}`));