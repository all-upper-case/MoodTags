// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const uniq = (arr) => Array.from(new Set(arr.map(s => s.trim()).filter(Boolean)));
const sortAlpha = (a) => a.slice().sort((x,y)=>x.localeCompare(y, undefined, {sensitivity:"base"}));
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

// Combined multireddit URL
function buildCombinedUrl(subs, q, sort, t){
  const multi = subs.join("+");
  const base = `https://www.reddit.com/r/${multi}/search`;
  const p = new URLSearchParams({ q, restrict_sr: "on", sort, t });
  return `${base}?${p.toString()}`;
}
// Single subreddit URL
function buildSingleUrl(sr, q, sort, t){
  const base = `https://www.reddit.com/r/${sr}/search`;
  const p = new URLSearchParams({ q, restrict_sr: "on", sort, t });
  return `${base}?${p.toString()}`;
}

// ===== Preset subs =====
const DEFAULT_SUBS = ["GWASapphic","DarkSideSapphic","SapphicScriptGuild"];

// ===== Categories =====
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
  partner: null,
  sb: null
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

// ===== UI: renderers =====
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
  Object.entries(TAG_CATEGORIES).forEach(([name, arr])=>{
    const sec = document.createElement("div");
    sec.className = "category";
    const h = document.createElement("h3"); h.textContent = name; sec.appendChild(h);
    const wrap = document.createElement("div"); wrap.className = "tags";
    sortAlpha(arr).forEach(tag=>{
      const btn = document.createElement("button");
      btn.className = "tag " + whichBucket(tag);
      btn.textContent = tag;
      btn.addEventListener("click", ()=>cycleTag(tag));
      wrap.appendChild(btn);
    });
    sec.appendChild(wrap);
    container.appendChild(sec);
  });
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
function renderPartner(){
  const st = $("partnerStatus");
  if (!state.partner){ st.textContent = "— not connected yet —";
    ["p_required","p_optional","p_excluded"].forEach(id => $(id).innerHTML="");
    return;
  }
  st.textContent = `${state.partner.user_name} @ ${new Date(state.partner.updated_at).toLocaleString()}`;
  const mk = (a)=> sortAlpha(a||[]).map(t=>`<span class="pill">${t}</span>`).join(" ");
  $("p_required").innerHTML = mk(state.partner.required_tags);
  $("p_optional").innerHTML = mk(state.partner.optional_tags);
  $("p_excluded").innerHTML = mk(state.partner.excluded_tags);
}

// ===== Tag membership & cycling =====
function whichBucket(tag){
  if (state.selections.required.includes(tag)) return "required";
  if (state.selections.optional.includes(tag)) return "optional";
  if (state.selections.excluded.includes(tag)) return "excluded";
  return "";
}
function cycleTag(tag){
  // ✅ FIX: capture current state BEFORE removing
  const cur = whichBucket(tag);

  // remove everywhere
  ["required","optional","excluded"].forEach(k=>{
    state.selections[k] = state.selections[k].filter(t => t !== tag);
  });

  // decide next state
  let next = "required";
  if (cur==="required") next="optional";
  else if (cur==="optional") next="excluded";
  else if (cur==="excluded") next=""; // off

  if (next) state.selections[next] = uniq([...state.selections[next], tag]);

  // refresh UI + persist
  document.querySelectorAll(".tag").forEach(btn=>{
    if (btn.textContent === tag){
      btn.classList.remove("required","optional","excluded");
      if (next) btn.classList.add(next);
    }
  });
  renderLists();
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

// ===== Search links =====
function renderSearchLinks(){
  const q = buildQuery(state.selections);
  const selectedSort = $("sort").value;
  const t = $("time").value;
  const sr = [...state.subs];

  // If a time filter is set, use TOP to actually enforce it (Reddit ignores t= with some sorts)
  const usedSort = t !== "all" && selectedSort !== "top" ? "top" : selectedSort;
  $("timeNote").textContent = t !== "all" && selectedSort !== "top"
    ? "Time filters are most reliable with ‘top’. Using ‘top’ to enforce your time window."
    : "";

  $("openCombined").onclick = ()=> window.open(buildCombinedUrl(sr, q, usedSort, t), "_blank");
  $("copyCombined").onclick = async ()=>{
    const url = buildCombinedUrl(sr, q, usedSort, t);
    try { await navigator.clipboard.writeText(url); alert("Copied!"); }
    catch { prompt("Copy this link:", url); }
  };

  const list = $("linkList"); list.innerHTML = "";
  sr.sort().forEach(s=>{
    const a = document.createElement("a");
    a.href = buildSingleUrl(s, q, usedSort, t); a.target = "_blank"; a.rel = "noopener";
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

  sb.channel(`room:${state.roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "selections", filter: `room_id=eq.${state.roomId}` },
      (payload)=>{
        const row = payload.new;
        if (!row || row.user_name === state.userName) return;
        state.partner = row; renderPartner();
      })
    .subscribe((s)=> $("connState").textContent = (s==="SUBSCRIBED" ? `Connected as ${state.userName}.` : `Status: ${s}`));

  const { data } = await sb.from("selections").select("*").eq("room_id", state.roomId);
  if (data) {
    const partnerRow = data.find(r => r.user_name !== state.userName) || null;
    state.partner = partnerRow; renderPartner();
  }
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

  renderSubs();
  $("addSubBtn").addEventListener("click", ()=>{
    const raw = $("customSub").value.trim().replace(/^r\//i,"");
    if (!raw) return;
    state.subs.add(raw);
    $("customSub").value = "";
    renderSubs(); renderSearchLinks();
  });

  // Tags UI
  renderCategories();
  renderLists();

  // Search controls
  ["sort","time"].forEach(id=> $(id).addEventListener("change", ()=>renderSearchLinks()));
  renderSearchLinks();

  // Join
  $("joinBtn").addEventListener("click", joinRoom);

  if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) {
    $("configDialog").showModal();
  }
});
