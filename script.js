// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const uniq = (arr) => Array.from(new Set(arr.map(s => s.trim()).filter(Boolean)));
const sortAlpha = (a) => a.slice().sort((x,y)=>x.localeCompare(y, undefined, {sensitivity:"base"}));
const esc = (s) => (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function quote(tag){ const t = tag.replace(/"/g,'\\"').trim(); return /\s/.test(t) ? `"${t}"` : `"${t}"`; }

// Build Reddit query using title keywords
function buildQuery({ required=[], optional=[], excluded=[] }){
  const parts = [];
  required.forEach(t => parts.push(`title:${quote(t)}`));
  if (optional.length){
    parts.push("(" + optional.map(t => `title:${quote(t)}`).join(" OR ") + ")");
  }
  excluded.forEach(t => parts.push(`-title:${quote(t)}`));
  return parts.join(" ");
}

// Multireddit + single URLs
function buildCombinedUrl(subs, q, sort, t){
  const multi = subs.join("+");
  const base = `https://www.reddit.com/r/${multi}/search`;
  const p = new URLSearchParams({ q, restrict_sr: "on", sort, t });
  return `${base}?${p.toString()}`;
}
function buildSingleUrl(sr, q, sort, t){
  const base = `https://www.reddit.com/r/${sr}/search`;
  const p = new URLSearchParams({ q, restrict_sr: "on", sort, t });
  return `${base}?${p.toString()}`;
}

// ===== Preset subs =====
const DEFAULT_SUBS = [
  "GWASapphic","DarkSideSapphic","SapphicScriptGuild",
  "GoneWildAudio","ScriptGuild"
];

// ===== Categories (presets) =====
const TAG_CATEGORIES = {
  "Actions": [
    "kissing","cuddling","spooning","making out","oral","fingering","tribbing",
    "handholding","strapping on","dirty talk","edging","teasing","overstimulation"
  ],
  "Dynamics": [
    "gentle","soft","slow burn","rough","praise","degradation (consensual)","brat","brat tamer",
    "domme","sub","switch","service top","mommy","good girl","tease & denial"
  ],
  "Mood / Aesthetic": [
    "romantic","comfort","sleepy","cozy","cute","angsty","GFE","soothing","playful","needy",
    "filthy","intense","monster romance","succubus","vampire","witchy"
  ],
  "Scenarios": [
    "girlfriends","friends to lovers","roommates","coworkers","neighbours","gym crush",
    "first time","reunion","aftercare","massage","bath","shower","phone call","voicemail",
    "roleplay","nurse","professor","maid","barista","club","hotel"
  ],
  "Kinks (consensual-only)": [
    "bondage","blindfold","handcuffs","spanking","hair pulling","collar",
    "orgasm control","mutual masturbation","marking","bite marks","public risk","exhibitionism",
    "voyeur","humiliation (consensual)"
  ],
  "Format / Meta": [
    "script fill","improv","ramble","loop","ASMR","soundgasm link","sound effects"
  ]
};

// A quick set of all preset tags for “Custom” detection
const PRESET_SET = new Set(Object.values(TAG_CATEGORIES).flat());

// ===== State =====
const state = {
  roomId: localStorage.getItem("roomId") || "",
  userName: localStorage.getItem("userName") || "",
  config: {
    supabaseUrl: localStorage.getItem("supabaseUrl") || "",
    supabaseAnonKey: localStorage.getItem("supabaseAnonKey") || "",
  },
  selections: {
    required: [],
    optional: [],
    excluded: [],
    sort: "new",
    time: "week"
  },
  subs: new Set(DEFAULT_SUBS),
  saved: [],
  partner: null,
  sb: null,
  channels: []
};

// ===== Supabase =====
async function ensureSupabase(){
  if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) return null;
  if (state.sb) return state.sb;
  state.sb = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 3 } }
  });
  return state.sb;
}
async function persist(){
  const sb = await ensureSupabase();
  if (!sb || !state.roomId || !state.userName) return;
  const payload = {
    room_id: state.roomId,
    user_name: state.userName,
    subreddit: "multi",
    required_tags: state.selections.required,
    optional_tags: state.selections.optional,
    excluded_tags: state.selections.excluded,
    sort: state.selections.sort,
    timeframe: state.selections.time,
    updated_at: new Date().toISOString(),
  };
  await sb.from("selections").upsert(payload, { onConflict: "room_id,user_name" });
}

// ===== Saved posts (unchanged from your working version) =====
async function loadSaved(){
  const sb = await ensureSupabase();
  if (!sb || !state.roomId) return;
  const { data } = await sb.from("saved_links")
    .select("*").eq("room_id", state.roomId)
    .order("created_at", { ascending: false });
  state.saved = data || [];
  renderSaved();
}
async function addSaved(){
  const url = $("saveUrl").value.trim();
  const title = $("saveTitle").value.trim();
  if (!/^https?:\/\//i.test(url)) { alert("Please paste a full https:// link."); return; }
  const sb = await ensureSupabase();
  if (!sb || !state.roomId || !state.userName) { alert("Connect to a room first."); return; }
  const payload = { room_id: state.roomId, user_name: state.userName, url, title: title || null };
  const { error } = await sb.from("saved_links").insert(payload);
  if (error && !/duplicate key/i.test(String(error.message))) { alert("Could not save link."); return; }
  $("saveUrl").value = ""; $("saveTitle").value = "";
  loadSaved();
}
async function deleteSaved(id){
  const sb = await ensureSupabase();
  if (!sb) return;
  await sb.from("saved_links").delete().eq("id", id);
}
function renderSaved(){
  const list = $("savedList");
  list.innerHTML = "";
  if (!state.saved.length){
    list.innerHTML = `<div class="muted">No saved posts yet.</div>`;
    return;
  }
  state.saved.forEach(row=>{
    const item = document.createElement("div");
    item.className = "saved-item";
    const main = document.createElement("div");
    main.className = "saved-main";
    const a = document.createElement("a");
    a.href = row.url; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = esc(row.title || row.url);
    const meta = document.createElement("div");
    meta.className = "saved-meta";
    meta.textContent = `by ${row.user_name} • ${new Date(row.created_at).toLocaleString()}`;
    main.appendChild(a); main.appendChild(meta);
    const del = document.createElement("button");
    del.className = "danger"; del.textContent = "Remove";
    del.addEventListener("click", ()=>deleteSaved(row.id));
    item.appendChild(main); item.appendChild(del);
    list.appendChild(item);
  });
}

// ===== Tags: membership, cycling, custom add =====
function whichBucket(tag){
  if (state.selections.required.includes(tag)) return "required";
  if (state.selections.optional.includes(tag)) return "optional";
  if (state.selections.excluded.includes(tag)) return "excluded";
  return "";
}
function cycleTag(tag, btnEl){
  const cur = whichBucket(tag);
  ["required","optional","excluded"].forEach(k=>{
    state.selections[k] = state.selections[k].filter(t => t !== tag);
  });
  let next = "required";
  if (cur==="required") next="optional";
  else if (cur==="optional") next="excluded";
  else if (cur==="excluded") next="";
  if (next) state.selections[next] = uniq([...state.selections[next], tag]);
  if (btnEl){
    btnEl.classList.remove("required","optional","excluded");
    if (next) btnEl.classList.add(next);
  }
  renderLists();
  persist();
  renderSearchLinks();
}

// NEW: add a custom tag to a chosen bucket
function addCustomTag(){
  const tag = $("customTag").value.trim();
  const bucket = $("customBucket").value;
  if (!tag) return;

  // Remove from all buckets, then add to chosen one
  ["required","optional","excluded"].forEach(k=>{
    state.selections[k] = state.selections[k].filter(t => t.toLowerCase() !== tag.toLowerCase());
  });
  state.selections[bucket] = uniq([...state.selections[bucket], tag]);

  $("customTag").value = "";
  renderLists();
  renderCategories(); // so it appears under "Custom (this room)" with cycle behavior
  persist();
  renderSearchLinks();
}
function removeTag(tag){
  ["required","optional","excluded"].forEach(k=>{
    state.selections[k] = state.selections[k].filter(t => t !== tag);
  });
  renderLists();
  renderCategories();
  persist();
  renderSearchLinks();
}

// ===== Rendering: subs, categories, lists, links =====
function renderSubs(){
  const list = $("subredditList");
  list.innerHTML = "";
  [...new Set([...DEFAULT_SUBS, ...state.subs])].sort().forEach(sr => {
    const el = document.createElement("label");
    el.className = "pill";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.subs.has(sr);
    cb.addEventListener("change", () => {
      if (cb.checked) state.subs.add(sr); else state.subs.delete(sr);
      renderSearchLinks();
    });
    el.appendChild(cb);
    el.appendChild(document.createTextNode(" r/" + sr));
    list.appendChild(el);
  });
}
function renderCategories(){
  const container = $("categories");
  container.innerHTML = "";

  // Preset categories
  Object.entries(TAG_CATEGORIES).forEach(([name, arr])=>{
    const sec = document.createElement("div");
    sec.className = "category";
    const h = document.createElement("h3"); h.textContent = name; sec.appendChild(h);
    const wrap = document.createElement("div"); wrap.className = "tags";
    sortAlpha(arr).forEach(tag=>{
      const btn = document.createElement("button");
      btn.className = "tag " + whichBucket(tag);
      btn.textContent = tag;
      btn.dataset.tag = tag;
      btn.addEventListener("click", ()=>cycleTag(tag, btn));
      wrap.appendChild(btn);
    });
    sec.appendChild(wrap);
    container.appendChild(sec);
  });

  // NEW: Custom tags (anything currently selected that isn't a preset)
  const selectedAll = new Set([...state.selections.required, ...state.selections.optional, ...state.selections.excluded]);
  const custom = [...selectedAll].filter(t => !PRESET_SET.has(t));
  if (custom.length){
    const sec = document.createElement("div");
    sec.className = "category";
    const h = document.createElement("h3"); h.textContent = "Custom (this room)";
    sec.appendChild(h);
    const wrap = document.createElement("div"); wrap.className = "tags";
    sortAlpha(custom).forEach(tag=>{
      const btn = document.createElement("button");
      btn.className = "tag " + whichBucket(tag);
      btn.textContent = tag;
      btn.dataset.tag = tag;
      btn.addEventListener("click", ()=>cycleTag(tag, btn));
      wrap.appendChild(btn);
    });
    sec.appendChild(wrap);
    container.appendChild(sec);
  }
}
function renderLists(){
  const render = (id, arr) => {
    const node = $(id); node.innerHTML = "";
    sortAlpha(arr).forEach(tag=>{
      const el = document.createElement("span");
      el.className = "pill";
      el.textContent = tag;
      const x = document.createElement("span");
      x.className = "remove"; x.textContent = " ✕";
      x.title = "remove";
      x.addEventListener("click", ()=>removeTag(tag));
      el.appendChild(x);
      node.appendChild(el);
    });
  };
  render("requiredList", state.selections.required);
  render("optionalList", state.selections.optional);
  render("excludedList", state.selections.excluded);
}
function renderSearchLinks(){
  const q = buildQuery(state.selections);
  const sort = $("sort").value;
  const t = $("time").value;
  const sr = [...state.subs];

  $("openCombined").onclick = ()=> window.open(buildCombinedUrl(sr, q, sort, t), "_blank");
  $("copyCombined").onclick = async ()=>{
    const url = buildCombinedUrl(sr, q, sort, t);
    try { await navigator.clipboard.writeText(url); alert("Copied!"); }
    catch { prompt("Copy this link:", url); }
  };

  const list = $("linkList"); list.innerHTML = "";
  sr.sort().forEach(s=>{
    const a = document.createElement("a");
    a.href = buildSingleUrl(s, q, sort, t); a.target = "_blank"; a.rel = "noopener";
    a.textContent = `Open in r/${s}`;
    list.appendChild(a);
  });
}

// ===== Join room (realtime) =====
async function joinRoom(){
  $("connState").textContent = "Connecting…";
  state.roomId = $("roomId").value.trim();
  state.userName = $("userName").value.trim();
  localStorage.setItem("roomId", state.roomId);
  localStorage.setItem("userName", state.userName);

  const sb = await ensureSupabase();
  if (!sb){ $("connState").textContent = "Open Config and paste Supabase URL & anon key."; return; }

  state.channels.forEach(ch => sb.removeChannel(ch));
  state.channels = [];

  const ch1 = sb.channel(`room:${state.roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "selections", filter: `room_id=eq.${state.roomId}` },
      (payload)=>{
        const row = payload.new;
        if (!row || row.user_name === state.userName) return;
        state.partner = row; renderPartner();
      })
    .subscribe();
  state.channels.push(ch1);

  const ch2 = sb.channel(`saved:${state.roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "saved_links", filter: `room_id=eq.${state.roomId}` },
      ()=> loadSaved())
    .subscribe();
  state.channels.push(ch2);

  const { data } = await sb.from("selections").select("*").eq("room_id", state.roomId);
  state.partner = data ? data.find(r => r.user_name !== state.userName) || null : null;
  renderPartner();
  await loadSaved();

  $("connState").textContent = `Connected as ${state.userName}.`;
  persist();
}

// ===== Wire up =====
window.addEventListener("DOMContentLoaded", ()=>{
  $("roomId").value = state.roomId;
  $("userName").value = state.userName;

  $("configBtn").addEventListener("click", ()=>{
    $("sbUrl").value = state.config.supabaseUrl;
    $("sbKey").value = state.config.supabaseAnonKey;
    $("configDialog").showModal();
  });
  $("saveConfig").addEventListener("click", ()=>{
    const url = $("sbUrl").value.trim();
    const key = $("sbKey").value.trim();
    if (url && key){
      state.config.supabaseUrl = url;
      state.config.supabaseAnonKey = key;
      localStorage.setItem("supabaseUrl", url);
      localStorage.setItem("supabaseAnonKey", key);
      $("configDialog").close();
      state.sb = null; ensureSupabase();
    }
  });

  // Saved posts
  $("saveBtn").addEventListener("click", addSaved);
  $("saveUrl").addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); addSaved(); }});
  $("saveTitle").addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); addSaved(); }});

  // Custom tag add
  $("addCustom").addEventListener("click", addCustomTag);
  $("customTag").addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); addCustomTag(); }});

  renderSubs();
  $("addSubBtn").addEventListener("click", ()=>{
    const raw = $("customSub").value.trim().replace(/^r\//i,"");
    if (!raw) return;
    state.subs.add(raw);
    $("customSub").value = "";
    renderSubs(); renderSearchLinks();
  });

  renderCategories();
  renderLists();
  ["sort","time"].forEach(id=> $(id).addEventListener("change", ()=>renderSearchLinks()));
  renderSearchLinks();

  $("joinBtn").addEventListener("click", joinRoom);

  if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) {
    $("configDialog").showModal();
  }
});
