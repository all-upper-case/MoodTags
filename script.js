// ===== DOM helpers =====
const $ = (id) => document.getElementById(id);

// ===== Utility =====
function uniq(arr) {
  return Array.from(new Set(arr.map(s => s.trim()).filter(Boolean)));
}
function quoteTag(tag) {
  const safe = tag.replace(/"/g, '\\"').trim();
  return /\s/.test(safe) ? `"${safe}"` : `"${safe}"`;
}
function buildQuery({ required = [], optional = [], excluded = [] }) {
  const parts = [];
  if (required.length) parts.push(required.map(quoteTag).join(" AND "));
  if (optional.length) parts.push("(" + optional.map(quoteTag).join(" OR ") + ")");
  if (excluded.length) parts.push(excluded.map(t => "-" + quoteTag(t)).join(" "));
  return parts.join(" AND ").trim();
}
function redditSearchURL({ subreddit, q, sort = "new", t = "week" }) {
  const base = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search`;
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("restrict_sr", "1");
  params.set("sort", sort);
  params.set("t", t);
  return `${base}?${params.toString()}`;
}

// ===== Presets (consent-focused; add anything via custom input any time) =====
const PRESETS = [
  // Content / format
  "ASMR","audio","binaural","ear to ear","improv","semi-scripted","script","script fill",
  "script offer","soft spoken","sound effects","whispers",

  // Vibe / tone
  "affectionate","aftercare","angsty","comfort","cozy","cute","dirty talk","flirty",
  "gentle","giggles","grounding","intimate","playful","pillow talk","praise","reassurance",
  "romantic","slow burn","soothing","supportive","sweet","teasing","tender","wholesome",

  // Sapphic / identity markers
  "F4A","F4F","girlfriend","girlfriend experience","lesbian","sapphic","WLW",

  // Dynamics / roles (adult, consensual)
  "bottom","brat","brat tamer","domme","gentle domme","mommy","mommy domme","service top",
  "soft domme","sub","submissive","switch","top",

  // Actions / intimacy (consensual, adult)
  "69","cuddles","cuddling","cunnilingus","edging","fingering","foreplay","grinding",
  "handholding","heartbeat","kissing","makeout","oral","overstimulation","scissoring",
  "spooning","strap-on","strapon","tribbing",

  // Light kink (consensual, tame)
  "blindfold","bondage (light)","collar (soft)","handcuffs","praise kink","spanking (light)",

  // Scenarios / settings (adult)
  "anniversary","artist","barista","bartender","best friend","bookstore","boss","cabin",
  "camping","classmate","college","confession","coworker","date night","enemy to lover",
  "enemies to lovers","festival","friends to lovers","gaming night","girlfriend roleplay",
  "holiday","hotel","library","movie night","neighbor","office","reunion","road trip",
  "roommate","study date","tutor","tattoo artist",

  // Time / ambience
  "bedtime","fireplace","goodnight","late night","morning","nap","night in","rain",
  "rainstorm","shower","sleep aid","storm","thunderstorm","wake up","white noise",

  // Soft reassurance & care
  "affirmations","anxiety relief","breathing together","comfort you","encouragement",
  "spoiling you","taking care of you"
];

// ===== State =====
const state = {
  roomId: localStorage.getItem("roomId") || "",
  userName: localStorage.getItem("userName") || "",
  config: {
    supabaseUrl: localStorage.getItem("supabaseUrl") || "",
    supabaseAnonKey: localStorage.getItem("supabaseAnonKey") || "",
  },
  selections: {
    subreddit: "GWASapphic",
    required: [],
    optional: [],
    excluded: [],
    sort: "new",
    time: "week",
  },
  partner: null,
  sb: null,
};

// ===== Helpers for membership & cycling =====
function tagState(tag) {
  if (state.selections.required.includes(tag)) return "required";
  if (state.selections.optional.includes(tag)) return "optional";
  if (state.selections.excluded.includes(tag)) return "excluded";
  return "off";
}
function cycleTag(tag) {
  const cur = tagState(tag);
  // remove from all first
  ["required", "optional", "excluded"].forEach(k => {
    state.selections[k] = state.selections[k].filter(t => t !== tag);
  });
  // move to next state
  let next = "required";
  if (cur === "required") next = "optional";
  else if (cur === "optional") next = "excluded";
  else if (cur === "excluded") next = "off";
  if (next !== "off") {
    state.selections[next] = uniq([...state.selections[next], tag]);
  }
  renderLists();
  renderPresets(); // update chip colors
  persist();
}

// ===== UI renderers =====
function renderPresets() {
  const container = $("presetContainer");
  container.innerHTML = "";
  const list = PRESETS.map(t => t.trim()).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  list.forEach(tag => {
    const el = document.createElement("button");
    el.className = "pill";
    // color state
    const st = tagState(tag);
    if (st === "required") el.classList.add("is-required");
    if (st === "optional") el.classList.add("is-optional");
    if (st === "excluded") el.classList.add("is-excluded");

    el.textContent = tag;
    el.title = "Tap to cycle: Required → Optional → Excluded → Off";
    el.addEventListener("click", () => cycleTag(tag));
    container.appendChild(el);
  });
}

function renderLists() {
  const render = (id, list) => {
    const container = $(id);
    container.innerHTML = "";
    const sorted = (list || []).slice()
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    sorted.forEach(tag => {
      const el = document.createElement("span");
      el.className = "pill";
      el.textContent = tag;
      const x = document.createElement("span");
      x.className = "remove";
      x.title = "remove";
      x.textContent = "✕";
      x.addEventListener("click", () => removeTag(id, tag));
      el.appendChild(x);
      container.appendChild(el);
    });
  };
  render("requiredList", state.selections.required);
  render("optionalList", state.selections.optional);
  render("excludedList", state.selections.excluded);
}

function renderPartner() {
  const status = $("partnerStatus");
  if (!state.partner) {
    status.textContent = "— not connected yet —";
    ["p_required","p_optional","p_excluded"].forEach(id => $(id).innerHTML="");
    return;
  }
  status.textContent = `${state.partner.user_name} @ ${new Date(state.partner.updated_at).toLocaleString()}`;
  const mk = (arr) => (arr || []).slice()
    .sort((a,b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(t => `<span class="pill">${t}</span>`).join(" ");
  $("p_required").innerHTML = mk(state.partner.required_tags);
  $("p_optional").innerHTML = mk(state.partner.optional_tags);
  $("p_excluded").innerHTML = mk(state.partner.excluded_tags);
}

// ===== Mutators for bottom chips =====
function removeTag(fromListId, tag) {
  const map = { requiredList: "required", optionalList: "optional", excludedList: "excluded" };
  const key = map[fromListId];
  state.selections[key] = state.selections[key].filter(t => t !== tag);
  renderLists();
  renderPresets(); // keep preset colors in sync
  persist();
}
function addTagTo(bucket, tag) {
  // used by custom input (not presets)
  const key = bucket === "required" ? "required" : bucket === "optional" ? "optional" : "excluded";
  // clear from other buckets first to avoid duplicates across groups
  ["required","optional","excluded"].forEach(k => {
    state.selections[k] = state.selections[k].filter(t => t !== tag);
  });
  state.selections[key] = uniq([...state.selections[key], tag]);
  renderLists();
  renderPresets();
  persist();
}

// ===== Supabase realtime =====
async function ensureSupabase() {
  if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) return null;
  if (state.sb) return state.sb;
  state.sb = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 3 } }
  });
  return state.sb;
}

async function persist() {
  const sb = await ensureSupabase();
  if (!sb || !state.roomId || !state.userName) return;
  const payload = {
    room_id: state.roomId,
    user_name: state.userName,
    subreddit: state.selections.subreddit,
    required_tags: state.selections.required,
    optional_tags: state.selections.optional,
    excluded_tags: state.selections.excluded,
    sort: state.selections.sort,
    timeframe: state.selections.time,
    updated_at: new Date().toISOString(),
  };
  await sb.from("selections").upsert(payload, { onConflict: "room_id,user_name" });
}

async function joinRoom() {
  $("tagsSection").classList.add("hidden");
  $("partnerSection").classList.add("hidden");

  state.roomId = $("roomId").value.trim();
  state.userName = $("userName").value.trim();
  localStorage.setItem("roomId", state.roomId);
  localStorage.setItem("userName", state.userName);

  state.selections.subreddit = $("subreddit").value.trim() || "GWASapphic";
  await persist();

  $("tagsSection").classList.remove("hidden");
  $("partnerSection").classList.remove("hidden");

  const sb = await ensureSupabase();
  if (!sb) return;

  sb.channel(`room:${state.roomId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "selections",
      filter: `room_id=eq.${state.roomId}`,
    }, (payload) => {
      const row = payload.new;
      if (!row || row.user_name === state.userName) return;
      state.partner = row;
      renderPartner();
    })
    .subscribe();

  const { data } = await sb.from("selections").select("*").eq("room_id", state.roomId);
  state.partner = data ? data.find(r => r.user_name !== state.userName) || null : null;
  renderPartner();
}

// ===== Event wiring =====
window.addEventListener("DOMContentLoaded", () => {
  $("roomId").value = state.roomId;
  $("userName").value = state.userName;

  $("configBtn").addEventListener("click", () => {
    $("sbUrl").value = state.config.supabaseUrl;
    $("sbKey").value = state.config.supabaseAnonKey;
    $("configDialog").showModal();
  });
  $("saveConfig").addEventListener("click", () => {
    const url = $("sbUrl").value.trim();
    const key = $("sbKey").value.trim();
    if (url && key) {
      state.config.supabaseUrl = url;
      state.config.supabaseAnonKey = key;
      localStorage.setItem("supabaseUrl", url);
      localStorage.setItem("supabaseAnonKey", key);
      $("configDialog").close();
      state.sb = null;
      ensureSupabase();
    }
  });

  $("subreddit").addEventListener("input", e => {
    state.selections.subreddit = e.target.value.trim();
    persist();
  });
  $("sort").addEventListener("change", e => {
    state.selections.sort = e.target.value;
    persist();
  });
  $("time").addEventListener("change", e => {
    state.selections.time = e.target.value;
    persist();
  });

  // Custom add
  $("addCustom").addEventListener("click", () => {
    const tag = $("customTag").value.trim();
    const bucket = $("customBucket").value;
    if (!tag) return;
    addTagTo(bucket, tag);
    $("customTag").value = "";
  });
  $("customTag").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("addCustom").click(); }
  });

  $("joinBtn").addEventListener("click", joinRoom);

  $("openReddit").addEventListener("click", () => {
    const q = buildQuery(state.selections);
    const url = redditSearchURL({
      subreddit: state.selections.subreddit,
      q,
      sort: state.selections.sort,
      t: state.selections.time
    });
    window.open(url, "_blank");
  });
  $("copyLink").addEventListener("click", async () => {
    const q = buildQuery(state.selections);
    const url = redditSearchURL({
      subreddit: state.selections.subreddit,
      q,
      sort: state.selections.sort,
      t: state.selections.time
    });
    try {
      await navigator.clipboard.writeText(url);
      alert("Search link copied!");
    } catch {
      prompt("Copy this link:", url);
    }
  });

  renderPresets();
  renderLists();

  if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) {
    $("configDialog").showModal();
  }
});
