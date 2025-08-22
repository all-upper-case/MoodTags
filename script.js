// ===== CONFIG: add your Supabase project values in Netlify env =====
// NETLIFY > Site settings > Environment variables:
//   VITE_SUPABASE_URL = https://YOURPROJECT.supabase.co
//   VITE_SUPABASE_ANON_KEY = <your anon public key>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || window.SUPABASE_URL;
const SUPABASE_ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.SUPABASE_ANON;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ---------- Subreddit options (you can extend this) ----------
const DEFAULT_SUBS = [
  { id: "GWASapphic", label: "r/GWASapphic (audio)" },
  { id: "DarkSideSapphic", label: "r/DarkSideSapphic (dark content)" },
  { id: "SapphicScriptGuild", label: "r/SapphicScriptGuild (scripts)" }
];

// ---------- Tag categories ----------
const TAG_CATEGORIES = {
  "Actions": [
    "kissing","cuddling","spooning","making out","oral","fingering","tribbing",
    "handholding","strapping on","dirty talk","edging","breath play","teasing","overstimulation"
  ],
  "Dynamics": [
    "gentle","soft","slow burn","rough","praise","degradation","brat","brat tamer",
    "domme","sub","switch","service top","mommy","good girl","tease & denial"
  ],
  "Mood / Aesthetic": [
    "romantic","comfort","sleepy","cozy","cute","angsty","GFE","soothing","playful","needy",
    "filthy","intense","mean domme","monster romance","succubus","vampire","witchy"
  ],
  "Scenarios": [
    "girlfriends","friends to lovers","roommates","coworkers","neighbours","gym crush",
    "first time","reunion","aftercare","massage","bath","shower","phone call","voicemail",
    "hypnosis","roleplay","nurse","professor","maid","barista","club","hotel"
  ],
  "Kinks (consensual-only)": [
    "bondage","blindfold","handcuffs","spanking","hair pulling","collar","choking (consensual)",
    "orgasm control","mutual masturbation","marking","bite marks","public risk","exhibitionism",
    "voyeur","humiliation (consensual)"
  ],
  "Format / Meta": [
    "script fill","improv","ramble","loop","ASMR","soundgasm link","sound effects"
  ]
};

// ---------- Helpers ----------
const nextState = (cur) => {
  if (cur === "") return "required";
  if (cur === "required") return "optional";
  if (cur === "optional") return "excluded";
  return ""; // back to off
};

const sortAlpha = (arr) => [...arr].sort((a,b) => a.localeCompare(b, undefined, {sensitivity:"base"}));

// Build reddit title-focused query like: title:"tag1" title:"tag2" (opt1 OR opt2) -title:"bad"
function buildQuery({ required, optional, excluded }) {
  const pieces = [];
  required.forEach(t => pieces.push(`title:"${t}"`));
  if (optional.length) {
    const group = optional.map(t => `title:"${t}"`).join(" OR ");
    pieces.push(`(${group})`);
  }
  excluded.forEach(t => pieces.push(`-title:"${t}"`));
  return pieces.join(" ");
}

// Combined multireddit URL: /r/subA+subB/search?q=...&restrict_sr=on&sort=...&t=...
function buildCombinedUrl(subs, q, sort, t){
  const multi = subs.join("+");
  const base = `https://www.reddit.com/r/${multi}/search/`;
  const params = new URLSearchParams({
    q, restrict_sr: "on", sort, t
  });
  return `${base}?${params.toString()}`;
}

// Single subreddit URL
function buildSingleUrl(sr, q, sort, t){
  const base = `https://www.reddit.com/r/${sr}/search/`;
  const params = new URLSearchParams({
    q, restrict_sr: "on", sort, t
  });
  return `${base}?${params.toString()}`;
}

// ---------- State ----------
let roomId = "";
let userName = "";
let knownTags = new Set();
let tagState = new Map(); // tag -> "", "required", "optional", "excluded"
let subs = new Set(DEFAULT_SUBS.map(s => s.id));

// Pre-fill known tags
Object.values(TAG_CATEGORIES).forEach(arr => arr.forEach(t => knownTags.add(t)));
knownTags = new Set(sortAlpha([...knownTags]));

// ---------- DOM refs ----------
const els = {
  roomId: document.getElementById("roomId"),
  userName: document.getElementById("userName"),
  connectBtn: document.getElementById("connectBtn"),
  connState: document.getElementById("connState"),
  categories: document.getElementById("categories"),
  reqList: document.getElementById("reqList"),
  optList: document.getElementById("optList"),
  exList: document.getElementById("exList"),
  sortSel: document.getElementById("sortSel"),
  timeSel: document.getElementById("timeSel"),
  linkList: document.getElementById("linkList"),
  openCombined: document.getElementById("openCombined"),
  subredditList: document.getElementById("subredditList"),
  customSub: document.getElementById("customSub"),
  addSubBtn: document.getElementById("addSubBtn"),
  installBtn: document.getElementById("installBtn"),
};

// ---------- Renderers ----------
function renderSubs() {
  els.subredditList.innerHTML = "";
  // ensure unique sorted
  const all = new Map();
  DEFAULT_SUBS.forEach(s => all.set(s.id, s.label));
  // add any custom ones already in 'subs' not in defaults
  subs.forEach(id => {
    if (!all.has(id)) all.set(id, `r/${id}`);
  });
  [...all.entries()].sort(([a],[b]) => a.localeCompare(b)).forEach(([id,label]) => {
    const wrap = document.createElement("label");
    wrap.className = "sub-chip";
    wrap.innerHTML = `
      <input type="checkbox" ${subs.has(id) ? "checked" : ""} data-id="${id}"/>
      <span>${label}</span>
    `;
    wrap.querySelector("input").addEventListener("change",(e)=>{
      const sid = e.target.getAttribute("data-id");
      if (e.target.checked) subs.add(sid); else subs.delete(sid);
      renderSearchLinks();
    });
    els.subredditList.appendChild(wrap);
  });
}

function renderCategories() {
  els.categories.innerHTML = "";
  Object.entries(TAG_CATEGORIES).forEach(([cat, arr])=>{
    const sec = document.createElement("div");
    sec.className = "category";
    const tags = sortAlpha(arr);
    sec.innerHTML = `<h3>${cat}</h3>`;
    const box = document.createElement("div");
    box.className = "tags";
    tags.forEach(tag=>{
      if (!tagState.has(tag)) tagState.set(tag, "");
      const btn = document.createElement("button");
      btn.className = `tag ${tagState.get(tag)}`;
      btn.textContent = tag;
      btn.addEventListener("click", () => toggleTag(tag));
      box.appendChild(btn);
    });
    sec.appendChild(box);
    els.categories.appendChild(sec);
  });
}

function renderSelected() {
  const req=[], opt=[], ex=[];
  tagState.forEach((v,k)=>{
    if (v==="required") req.push(k);
    else if (v==="optional") opt.push(k);
    else if (v==="excluded") ex.push(k);
  });
  const chipify = (arr, cls) => {
    return sortAlpha(arr).map(t=>{
      const span = document.createElement("span");
      span.className = "chip";
      span.textContent = t;
      span.addEventListener("click", ()=>toggleTag(t));
      return span;
    });
  };
  els.reqList.replaceChildren(...chipify(req,"required"));
  els.optList.replaceChildren(...chipify(opt,"optional"));
  els.exList.replaceChildren(...chipify(ex,"excluded"));
}

function renderSearchLinks() {
  const req=[], opt=[], ex=[];
  tagState.forEach((v,k)=>{
    if (v==="required") req.push(k);
    else if (v==="optional") opt.push(k);
    else if (v==="excluded") ex.push(k);
  });
  const q = buildQuery({required:req, optional:opt, excluded:ex});
  const sort = els.sortSel.value;
  const t = els.timeSel.value;
  const sr = [...subs];

  // combined button
  els.openCombined.onclick = () => {
    const url = buildCombinedUrl(sr, q, sort, t);
    window.open(url, "_blank");
  };

  // individual links list
  els.linkList.innerHTML = "";
  sr.sort().forEach(s=>{
    const a = document.createElement("a");
    a.href = buildSingleUrl(s, q, sort, t);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `Open in r/${s}`;
    els.linkList.appendChild(a);
  });
}

// ---------- Tag toggle & persistence ----------
async function toggleTag(tag){
  const newState = nextState(tagState.get(tag) || "");
  tagState.set(tag, newState);

  // update UI buttons
  document.querySelectorAll(".tag").forEach(btn=>{
    if (btn.textContent === tag) {
      btn.classList.remove("required","optional","excluded");
      if (newState) btn.classList.add(newState);
    }
  });
  renderSelected();
  renderSearchLinks();

  // upsert to Supabase
  if (!roomId || !userName) return;
  await sb.from("selections").upsert({
    room_id: roomId,
    user_name: userName,
    tag,
    state: newState
  }, { onConflict: "room_id,tag,user_name" });
}

// ---------- Realtime & load ----------
let channel = null;

async function connectRoom(){
  roomId = els.roomId.value.trim();
  userName = els.userName.value.trim() || "anon";
  if (!roomId){ els.connState.textContent = "Enter a room id."; return; }

  els.connState.textContent = "Connecting…";

  // Fetch existing selections
  const { data } = await sb.from("selections")
    .select("tag,state")
    .eq("room_id", roomId)
    .order("tag", { ascending: true });

  // merge into local state
  if (data) {
    data.forEach(({tag,state})=>{
      if (!tagState.has(tag)) tagState.set(tag, "");
      tagState.set(tag, state || "");
    });
    renderCategories();
    renderSelected();
    renderSearchLinks();
  }

  // subscribe to realtime room
  if (channel) sb.removeChannel(channel);
  channel = sb
    .channel(`room-${roomId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "selections", filter: `room_id=eq.${roomId}` },
      (payload)=>{
        const { tag, state } = payload.new;
        tagState.set(tag, state || "");
        // Update a single button quickly
        document.querySelectorAll(".tag").forEach(btn=>{
          if (btn.textContent === tag){
            btn.classList.remove("required","optional","excluded");
            if (state) btn.classList.add(state);
          }
        });
        renderSelected();
        renderSearchLinks();
      }
    ).subscribe(async (status)=>{
      els.connState.textContent = status === "SUBSCRIBED"
        ? `Connected to room “${roomId}” as ${userName}.`
        : `Status: ${status}`;
    });
}

// ---------- Sub add ----------
els.addSubBtn.addEventListener("click", ()=>{
  const raw = els.customSub.value.trim().replace(/^r\//i,"");
  if (!raw) return;
  subs.add(raw);
  els.customSub.value = "";
  renderSubs();
  renderSearchLinks();
});

// ---------- Wire up ----------
els.connectBtn.addEventListener("click", connectRoom);
renderSubs();
renderCategories();
renderSelected();
renderSearchLinks();

// ---------- PWA install ----------
let deferredPrompt;
window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();
  deferredPrompt = e;
  els.installBtn.hidden = false;
});
els.installBtn.addEventListener("click", async ()=>{
  els.installBtn.hidden = true;
  if (deferredPrompt){
    deferredPrompt.prompt();
    deferredPrompt = null;
  }
});

// If you didn’t add service-worker & manifest, it’ll still work—just without installability.
