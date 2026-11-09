/*
 * panel/core.js — Shared state and helpers: messaging with the background script (bg.js), the journal's look,
 * settings (kept in this browser and synced to your journal account) and local storage.
 */
const call = (type, extra = {}) =>
  new Promise((res, rej) =>
    chrome.runtime.sendMessage({ type, ...extra }, r => {
      if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
      r && r.ok ? res(r.v) : rej(new Error((r && r.error) || "No answer"));
    })
  );
const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
const JOURNAL = "https://dashicledev.github.io/TradeJournal/";
const FF = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6zM13 6l7 6-7 6z" fill="currentColor"/></svg>`;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const tvImg = id => (id ? `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png` : "");
const SLOTS = [
  ["weekly", "Weekly"],
  ["daily", "Daily"],
  ["h4", "4H"],
  ["ltf", "1H/2H"],
  ["m12", "12M"],
  ["m6", "6M"],
  ["m3", "3M"],
  ["mo", "Monthly"],
  ["wk", "Weekly"],
];
const hasStruct = e => e === "Reversal" || e === "Continuation" || e === "Pattern in Pattern";
let dd = null,
  mini = false,
  lastEmail = "",
  P = TJ_PLAN_DEFAULT,
  user = null,
  projects = [],
  open = false,
  armed = null,
  armTimer = null,
  msg = "",
  busy = false;
const blank = () => ({
  project: "",
  pair: "",
  date: "",
  closeDate: "",
  dir: "",
  fase: "",
  wStruct: "",
  trend: "",
  ms: "",
  wRange: false,
  wPat: "",
  wPatSub: "",
  w: {},
  concept: "",
  sub: "",
  dMs: "",
  dPros: [],
  entry4h: "",
  hMs: "",
  struct: "",
  room: false,
  scaleIn: false,
  ecTf: "",
  links: {},
  outcome: "",
  r: "",
  maxR: "",
  exit: "",
  evaluation: "",
  notes: "",
  planEntry: "",
  slPips: "",
  tpPips: "",
  sExits: [],
});
// close notices in bar replay: which closes, how long the notice stays (s, 0 = until clicked), where, how big,
// chime, buttons to open the Daily/Weekly chart, pause autoplay
const CLOSES0 = { d: true, w: true, sound: true, dur: 10, pos: "mid", size: "lg", tf: true, pause: false };
let mkt = "fx",
  tmode = "backtest",
  accounts = [],
  savedId = "",
  tfPrev = "",
  skipBack = "",
  autoFit = true,
  closes = CLOSES0,
  settings = false,
  setTab = "chart",
  trig = [],
  fwd = null,
  D = blank(),
  collapsed = {},
  view = "steps",
  step = 0,
  logging = false,
  snapWait = null;

/* ---------- look (same themes and accents as the journal) ---------- */
const THEMES = {
  light: {
    bg: "#ffffff",
    in: "#f2f3f8",
    ink: "#141a2e",
    mut: "#5a6283",
    line: "#dcdfeb",
    soft: "#eceef6",
    good: "#1d8657",
    bad: "#c3342b",
  },
  dark: {
    bg: "#161a2d",
    in: "#0e1120",
    ink: "#e6e8f3",
    mut: "#9299b8",
    line: "#283050",
    soft: "#1d2238",
    good: "#43c088",
    bad: "#f06c60",
  },
  black: {
    bg: "#0c0c0e",
    in: "#000000",
    ink: "#ececef",
    mut: "#8d8d96",
    line: "#24242a",
    soft: "#151518",
    good: "#43c088",
    bad: "#f06c60",
  },
};
const ACCENTS = [
  ["blue", "Blue", "#2230d6", "#8590ff"],
  ["violet", "Violet", "#6b3fd4", "#a98bff"],
  ["teal", "Teal", "#0f7f86", "#45c4c9"],
  ["green", "Green", "#1f7a46", "#5cc98a"],
  ["rose", "Rose", "#b8326a", "#f07aa8"],
  ["slate", "Slate", "#3b4664", "#a3acc6"],
];
let look = { match: true, theme: "dark", accent: "blue" },
  jLook = null;
function applyLook() {
  const L = look.match && jLook ? jLook : look,
    th =
      L.theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : THEMES[L.theme]
          ? L.theme
          : "dark";
  const a = ACCENTS.find(x => x[0] === L.accent) || ACCENTS[0],
    v = { ...THEMES[th], acc: th === "light" ? a[2] : a[3], live: th === "light" ? "#d0601b" : "#f08c4c" };
  Object.entries(v).forEach(([k, c]) => (panel.style.setProperty("--" + k, c), toast.style.setProperty("--" + k, c)));
  panel.style.colorScheme = toast.style.colorScheme = th === "light" ? "light" : "dark";
}
async function loadJLook() {
  try {
    const st = await call("jsettings");
    if (st) {
      jLook = { theme: st.theme || "system", accent: st.accent || "blue" };
      store({ jLook });
    }
  } catch {}
  applyLook();
}

/* ---------- settings: kept in this browser and in your journal account ---------- */
let setT;
const saveSet = o => {
  store(o);
  clearTimeout(setT);
  setT = setTimeout(() => {
    if (user) call("extSave", { data: { autoFit, look, trig, closes } }).catch(() => {});
  }, 600);
};
async function loadSet() {
  try {
    const r = await call("extLoad");
    if (r) {
      if (typeof r.autoFit === "boolean") autoFit = r.autoFit;
      if (r.look) look = { ...look, ...r.look };
      if (Array.isArray(r.trig)) trig = r.trig;
      if (r.closes) closes = { ...CLOSES0, ...r.closes };
      store({ autoFit, look, trig, closes });
      applyLook();
    } else call("extSave", { data: { autoFit, look, trig, closes } }).catch(() => {}); // first time: put this browser's settings in the account
  } catch {}
}

/* ---------- storage ---------- */
const store = o => chrome.storage.local.set(o);
const load = async () => {
  const o = await chrome.storage.local.get([
    "draft",
    "pos",
    "open",
    "collapsed",
    "lastProject",
    "mini",
    "view",
    "step",
    "logging",
    "autoFit",
    "closes",
    "look",
    "jLook",
    "trig",
    "tmode",
    "lastAccount",
    "mkt",
  ]);
  mini = !!o.mini;
  tmode = o.tmode === "live" ? "live" : "backtest";
  mkt = o.mkt === "stocks" ? "stocks" : "fx";
  trig = o.trig || [];
  if (o.look) look = { ...look, ...o.look };
  if (o.jLook) jLook = o.jLook;
  autoFit = o.autoFit !== false;
  if (o.closes) closes = { ...CLOSES0, ...o.closes };
  logging = !!o.logging;
  view = "steps";
  step = o.step || 0;
  if (o.draft) D = { ...blank(), ...o.draft };
  if (!D.account && o.lastAccount) D.account = o.lastAccount;
  if (!D.project && o.lastProject) D.project = o.lastProject;
  collapsed = o.collapsed || {};
  open = !!o.open;
  return o.pos;
};
let saveT;
const keep = () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => store({ draft: D }), 250);
};
