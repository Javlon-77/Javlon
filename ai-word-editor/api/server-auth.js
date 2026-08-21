// Authentication/file persistence layer for AI Word Editor.
// Uses a local JSON store by default; for production, replace with a real DB/storage service.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "users.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { users: {}, sessions: {}, files: {} }; }
}
function save(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function hash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash: derived };
}
function verify(password, user) {
  const check = crypto.scryptSync(password, user.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(user.passwordHash, "hex"));
}
export function register(email, password) {
  const db = load(); const key = email.trim().toLowerCase();
  if (!key || password.length < 6) throw new Error("Email va kamida 6 belgili parol kerak.");
  if (db.users[key]) throw new Error("Bu email allaqachon ro‘yxatdan o‘tgan.");
  const {salt, hash: passwordHash} = hash(password);
  db.users[key] = { email:key, salt, passwordHash, createdAt:new Date().toISOString() };
  save(db); return createSession(key);
}
export function login(email, password) {
  const db = load(); const key = email.trim().toLowerCase(); const user=db.users[key];
  if (!user || !verify(password,user)) throw new Error("Email yoki parol noto‘g‘ri.");
  return createSession(key);
}
function createSession(email) {
  const db=load(); const token=crypto.randomBytes(32).toString("hex"); db.sessions[token]={email,createdAt:Date.now()}; save(db); return token;
}
export function userFromToken(token) { if(!token) return null; const db=load(); const s=db.sessions[token]; return s?.email || null; }
export function listFiles(email) { const db=load(); return Object.values(db.files).filter(f=>f.email===email).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)); }
export function recordFile(email, file) { const db=load(); db.files[file.id]={...file,email,updatedAt:new Date().toISOString()}; save(db); }
export function recordUpdate(email,id,meta={}) { const db=load(); if(!db.files[id]) return; if(db.files[id].email!==email) throw new Error("Bu fayl sizga tegishli emas."); db.files[id]={...db.files[id],...meta,updatedAt:new Date().toISOString()}; save(db); }
