// The Trade Journal panel on TradingView. Lives in a shadow root so TradingView's
// styles and ours never mix.
(() => {
  if (window.__tjPanel) return; window.__tjPanel = true;
  const call = (type, extra = {}) => new Promise((res, rej) => chrome.runtime.sendMessage({ type, ...extra }, (r) => {
    if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
    r && r.ok ? res(r.v) : rej(new Error((r && r.error) || "No answer"));
  }));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const JOURNAL = "https://dashicledev.github.io/TradeJournal/";
  const FF = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6zM13 6l7 6-7 6z" fill="currentColor"/></svg>`;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const tvImg = (id) => id ? `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png` : "";
  const SLOTS = [["weekly", "Weekly"], ["daily", "Daily"], ["h4", "4H"], ["ltf", "1H/2H"]];
  const hasStruct = (e) => e === "Reversal" || e === "Continuation" || e === "Pattern in Pattern";
  let dd = null, mini = false, lastEmail = "", P = TJ_PLAN_DEFAULT, user = null, projects = [], open = false, armed = null, armTimer = null, msg = "", busy = false;
  const blank = () => ({ project: "", pair: "", date: "", closeDate: "", dir: "", fase: "", wStruct: "", trend: "", ms: "", wRange: false, wPat: "", wPatSub: "", w: {}, concept: "", sub: "", dMs: "", dPros: [], entry4h: "", hMs: "", struct: "", room: false, scaleIn: false, ecTf: "", links: {}, outcome: "", r: "", maxR: "", exit: "", evaluation: "", notes: "", planEntry: "", slPips: "", tpPips: "" });
  let savedId = "", tfPrev = "", skipBack = "", autoFit = true, settings = false, setTab = "chart", trig = [], fwd = null, D = blank(), collapsed = {}, view = "steps", step = 0, logging = false, snapWait = null;

  /* ---------- look (same themes and accents as the journal) ---------- */
  const THEMES = {
    light: { bg: "#ffffff", in: "#f2f3f8", ink: "#141a2e", mut: "#5a6283", line: "#dcdfeb", soft: "#eceef6", good: "#1d8657", bad: "#c3342b" },
    dark: { bg: "#161a2d", in: "#0e1120", ink: "#e6e8f3", mut: "#9299b8", line: "#283050", soft: "#1d2238", good: "#43c088", bad: "#f06c60" },
    black: { bg: "#0c0c0e", in: "#000000", ink: "#ececef", mut: "#8d8d96", line: "#24242a", soft: "#151518", good: "#43c088", bad: "#f06c60" } };
  const ACCENTS = [["blue", "Blue", "#2230d6", "#8590ff"], ["violet", "Violet", "#6b3fd4", "#a98bff"], ["teal", "Teal", "#0f7f86", "#45c4c9"], ["green", "Green", "#1f7a46", "#5cc98a"], ["rose", "Rose", "#b8326a", "#f07aa8"], ["slate", "Slate", "#3b4664", "#a3acc6"]];
  let look = { match: true, theme: "dark", accent: "blue" }, jLook = null;
  function applyLook() {
    const L = look.match && jLook ? jLook : look, th = L.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : (THEMES[L.theme] ? L.theme : "dark");
    const a = ACCENTS.find((x) => x[0] === L.accent) || ACCENTS[0], v = { ...THEMES[th], acc: th === "light" ? a[2] : a[3] };
    Object.entries(v).forEach(([k, c]) => panel.style.setProperty("--" + k, c)); panel.style.colorScheme = th === "light" ? "light" : "dark";
  }
  async function loadJLook() { try { const st = await call("jsettings"); if (st) { jLook = { theme: st.theme || "system", accent: st.accent || "blue" }; store({ jLook }); } } catch {} applyLook(); }

  /* ---------- settings: kept in this browser and in your journal account ---------- */
  let setT; const saveSet = (o) => { store(o); clearTimeout(setT); setT = setTimeout(() => { if (user) call("extSave", { data: { autoFit, look, trig } }).catch(() => {}); }, 600); };
  async function loadSet() {
    try { const r = await call("extLoad");
      if (r) { if (typeof r.autoFit === "boolean") autoFit = r.autoFit; if (r.look) look = { ...look, ...r.look }; if (Array.isArray(r.trig)) trig = r.trig; store({ autoFit, look, trig }); applyLook(); }
      else call("extSave", { data: { autoFit, look, trig } }).catch(() => {}); // first time: put this browser's settings in the account
    } catch {}
  }

  /* ---------- storage ---------- */
  const store = (o) => chrome.storage.local.set(o);
  const load = async () => { const o = await chrome.storage.local.get(["draft", "pos", "open", "collapsed", "lastProject", "mini", "view", "step", "logging", "autoFit", "look", "jLook", "trig"]); mini = !!o.mini; trig = o.trig || []; if (o.look) look = { ...look, ...o.look }; if (o.jLook) jLook = o.jLook; autoFit = o.autoFit !== false; logging = !!o.logging; view = "steps"; step = o.step || 0; if (o.draft) D = { ...blank(), ...o.draft }; if (!D.project && o.lastProject) D.project = o.lastProject; collapsed = o.collapsed || {}; open = !!o.open; return o.pos; };
  let saveT; const keep = () => { clearTimeout(saveT); saveT = setTimeout(() => store({ draft: D }), 250); };

  /* ---------- shell ---------- */
  const host = document.createElement("div"); host.id = "tj-panel-host";
  host.style.cssText = "position:fixed;z-index:2147483000;top:72px;right:16px;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS()}</style><button class="pill" title="Trade Journal (drag to move)"><img src="${chrome.runtime.getURL("icons/icon-128.png")}" alt="Trade Journal" draggable="false"></button><section class="panel" hidden></section>`;
  const panel = root.querySelector(".panel"), pill = root.querySelector(".pill");
  document.documentElement.appendChild(host);
  // the journal's font (Archivo), shipped with the extension, so the page's rules can't block it
  fetch(chrome.runtime.getURL("fonts/archivo.woff2")).then((r) => r.arrayBuffer()).then((buf) => { const ff = new FontFace("TJ Archivo", buf, { weight: "100 900", stretch: "62% 125%" }); return ff.load().then(() => document.fonts.add(ff)); }).catch(() => {});
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyLook());

  // the logo button: click opens the panel, drag moves it (position is remembered)
  let pd = null;
  pill.addEventListener("pointerdown", (e) => { const r = pill.getBoundingClientRect(); pd = { x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false }; pill.setPointerCapture(e.pointerId); e.preventDefault(); });
  pill.addEventListener("pointermove", (e) => { if (!pd) return; if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 4) pd.moved = true; if (!pd.moved) return;
    const x = Math.max(4, Math.min(innerWidth - 48, e.clientX - pd.dx)), y = Math.max(4, Math.min(innerHeight - 48, e.clientY - pd.dy)); Object.assign(pill.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" }); });
  pill.addEventListener("pointerup", () => { if (!pd) return; const m = pd.moved; pd = null; if (m) store({ pillPos: { left: pill.style.left, top: pill.style.top } }); else toggle(true); });
  chrome.storage.local.get("pillPos").then((o) => { if (o.pillPos && o.pillPos.left) Object.assign(pill.style, { left: o.pillPos.left, top: o.pillPos.top, right: "auto", bottom: "auto" }); });
  chrome.runtime.onMessage.addListener((m) => { if (m && m.type === "toggle") toggle(!open); });
  function toggle(v) { open = v; store({ open }); panel.hidden = !open; pill.hidden = open; if (open) render(); }

  // drag by header
  let drag = null;
  root.addEventListener("pointerdown", (e) => { const h = e.target.closest(".head"); if (!h || e.target.closest("button")) return; const r = host.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; h.setPointerCapture(e.pointerId); });
  root.addEventListener("pointermove", (e) => { if (!drag) return; const x = Math.max(0, Math.min(innerWidth - 80, e.clientX - drag.dx)), y = Math.max(0, Math.min(innerHeight - 40, e.clientY - drag.dy)); Object.assign(host.style, { left: x + "px", top: y + "px", right: "auto" }); });
  root.addEventListener("pointerup", () => { if (drag) { drag = null; store({ pos: { left: host.style.left, top: host.style.top } }); } });
  const fit = () => { panel.style.maxHeight = Math.max(260, innerHeight - host.getBoundingClientRect().top - 12) + "px"; };
  addEventListener("resize", fit); root.addEventListener("pointerup", fit);

  /* ---------- page info (symbol, interval, replay date) ---------- */
  let info = {};
  const ask = () => new Promise((res) => { const f = (e) => { if (e.source === window && e.data && e.data.__tj === "info") { removeEventListener("message", f); info = e.data; res(info); } }; addEventListener("message", f); window.postMessage({ __tj: "ask" }, location.origin); setTimeout(() => { removeEventListener("message", f); res(info); }, 400); });
  const pairOf = (s) => String(s || "").split(":").pop().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const slotOf = (iv) => { const v = String(iv || "").trim().toLowerCase().replace(/\s/g, ""); if (/^(1?w|1week|week)$/.test(v)) return "weekly"; if (/^(1?d|1day|day)$/.test(v)) return "daily"; if (/^(4h|240)$/.test(v)) return "h4"; if (/^(1h|2h|60|120)$/.test(v)) return "ltf"; return null; };
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const dateOf = (t) => { if (!t) return ""; let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[0]; m = /(\d{1,2})\s([A-Za-z]{3})\w*\s'?(\d{2,4})/.exec(t); if (m && MON[m[2].toLowerCase()]) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`; } return ""; };

  /* ---------- snapshots ---------- */
  const seen = new Set();
  addEventListener("message", async (e) => {
    if (e.source !== window || !e.data || e.data.__tj !== "snap") return;
    // the same snapshot is often reported twice (network + clipboard): handle it once
    if (seen.has(e.data.id)) return; seen.add(e.data.id);
    let slot = armed;
    if (!slot) { await ask(); slot = slotOf(info.interval); }
    if (!slot) { msg = `Snapshot caught, but which timeframe? Pick a 📷 button first, then take it again.`; return render(); }
    D.links[slot] = "https://www.tradingview.com/x/" + e.data.id + "/"; armed = null; clearTimeout(armTimer);
    msg = `${SLOTS.find((s) => s[0] === slot)[1]} chart saved.`; keep();
    if (snapWait && snapWait.slot === slot) { const w = snapWait; snapWait = null; w.done(true); return; }
    render();
  });
  function trySnapshot() {
    // TradingView's own shortcut for "Copy link to the chart image". If it doesn't fire,
    // the user presses it (or camera → Copy link) and the hook still catches the link.
    const ev = (t) => new KeyboardEvent(t, { key: "s", code: "KeyS", keyCode: 83, which: 83, altKey: true, bubbles: true, cancelable: true });
    const tgt = document.querySelector(".chart-container, .chart-gui-wrapper, canvas") || document.body;
    try { tgt.dispatchEvent(ev("keydown")); tgt.dispatchEvent(ev("keyup")); } catch {}
  }
  function arm(slot) {
    armed = armed === slot ? null : slot; clearTimeout(armTimer);
    if (armed) { msg = `Switch TradingView to ${SLOTS.find((s) => s[0] === slot)[1]} if needed. Taking the snapshot…`; trySnapshot();
      armTimer = setTimeout(() => { if (armed === slot) { msg = `Press Alt+S on the chart (or camera → Copy link). It goes to ${SLOTS.find((s) => s[0] === slot)[1]}.`; render(); } }, 3500); }
    else msg = "";
    render();
  }

  /* ---------- long / short position tool ---------- */
  // hook.js reads the selected Long/Short Position drawing, otherwise the one with the latest entry.
  let posWhy = "", posList = [], shownId = "";
  const getPos = () => new Promise((done) => { const f = (e) => { if (e.source === window && e.data && e.data.__tj === "posinfo") { removeEventListener("message", f); posList = e.data.list || []; const userSel = e.data.selId && e.data.selId !== shownId, chosen = !userSel && D.posPick && posList.find((x) => x.id === D.posPick); if (chosen) e.data.pos = chosen; if (userSel) { D.posPick = ""; shownId = ""; } posWhy = e.data.pos ? "" : !e.data.api ? "Couldn't read the drawings on this chart." : "No Long/Short position on the chart yet."; done(e.data.pos || null); } }; addEventListener("message", f); window.postMessage({ __tj: "pos" }, location.origin); setTimeout(() => { removeEventListener("message", f); posWhy = "Couldn't read the drawings on this chart."; done(null); }, 800); });
  const day = (t) => t ? new Date(t * 1000).toISOString().slice(0, 10) : "";
  const posLab = (p) => { const d = (t) => t ? new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : "?"; return `${p.dir === "long" ? "↑ Long" : "↓ Short"} · ${d(p.t0)}${p.t1 ? " → " + d(p.t1) : ""}`; };
  const showPos = (p, scroll = true) => { if (p) shownId = p.id; if (p) window.postMessage({ __tj: "posshow", id: p.id, t0: p.t0, t1: p.t1, scroll }, location.origin); };
  const curPos = () => posList.find((x) => x.id === D.posId);
  const posLine = () => { const p = curPos(); return p ? `<div class="posl"><span>Position</span><b>${esc(posLab(p))}</b><button type="button" class="lnk inl" data-act="posshow" title="Highlight it on the chart">Show</button></div>` : ""; };
  const posSel = () => posList.length ? f(`Position <button type="button" class="lnk inl" data-act="posrefresh" title="Look for positions on the chart again">⟳</button>`, `<select data-k="posPick">${posList.map((p) => `<option value="${esc(p.id)}" ${p.id === D.posId ? "selected" : ""}>${esc(posLab(p))}</option>`).join("")}</select>`) : "";
  // fills empty fields only, unless "force" lists the fields to overwrite
  async function fromPos(force = []) {
    const p = await getPos(); if (!p) return null; D.posId = p.id; showPos(p, false);
    const set = (k, v) => { if (v && (force.includes(k) || !D[k])) D[k] = v; };
    set("dir", p.dir); set("date", day(p.t0)); set("closeDate", day(p.t1));
    // planned entry, stop and target in pips (0.0001; JPY 0.01; gold 0.1)
    if (p.entry) { const pr = pairOf(D.pair), pip = /JPY/.test(pr) ? 0.01 : /XAU/.test(pr) ? 0.1 : /XAG/.test(pr) ? 0.01 : 0.0001, r1 = (x) => String(Math.round(x * 10) / 10);
      const dec = String(p.entry).split(".")[1]; set("planEntry", String(+p.entry.toFixed(Math.min(6, Math.max(2, dec ? dec.length : 5)))));
      if (p.sl) set("slPips", r1(Math.abs(p.entry - p.sl) / pip)); if (p.tp) set("tpPips", r1(Math.abs(p.tp - p.entry) / pip)); }
    keep(); return p;
  }
  const replayDate = async () => { await ask(); return dateOf(info.replay); };

  /* ---------- forward to drawing ---------- */
  addEventListener("message", (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__tj === "fwdst") { if (e.data.done) { fwd = null; msg = e.data.why || ""; const tl = e.data.hit && e.data.ti != null && e.data.ti >= 0 && (trig[e.data.ti] || {}).label; if (tl) msg = msg.replace(/the (rectangle|line)/, tl); if (e.data.back && !e.data.hit) setTf(e.data.back); } else fwd = { n: e.data.n }; render(); }
    if (e.data.__tj === "sigok") { if (e.data.err) msg = e.data.err; else if (trig.some((t) => t.sig === e.data.sig)) msg = "That style is already in the list.";
      else { trig = [...trig, { sig: e.data.sig, name: e.data.name, color: e.data.color, label: e.data.text || "", text: e.data.text || "" }]; saveSet({ trig }); msg = ""; } render(); }
  });
  const onSigs = () => trig.map((t, i) => ({ sig: t.sig, text: t.text != null ? t.text : t.label || "", i, on: t.on !== false })).filter((t) => t.on);
  const fwdBtn = () => fwd ? `<div class="fwd"><span>${FF}Forwarding… ${fwd.n || 0} candle${fwd.n === 1 ? "" : "s"}</span><button type="button" class="btn sm" data-act="fwdstop">■ Stop</button></div>`
    : `<button type="button" class="btn sm fwdgo" data-act="fwd">${FF}Forward to drawing</button>`;

  /* ---------- step by step ---------- */
  // ask the page to switch the chart's timeframe (hook.js does it through TradingView's own API)
  const setTf = (res) => new Promise((done) => { const f = (e) => { if (e.source === window && e.data && e.data.__tj === "tfok") { removeEventListener("message", f); tfPrev = e.data.prev || ""; done(e.data.ok ? (e.data.same ? "same" : true) : false); } }; addEventListener("message", f); window.postMessage({ __tj: "tf", res, fit: autoFit }, location.origin); setTimeout(() => { removeEventListener("message", f); done(false); }, 1500); });
  const steps = () => [["setup", "Trade"], ["weekly", "Weekly", "1W"], ["daily", "Daily", "1D"], ["h4", "4H", "240"],
    ...(D.entry4h === "Engulfing Candle" ? [["ltf", D.ecTf === "1h" ? "1H" : "2H", D.ecTf === "1h" ? "60" : "120"]] : []), ["result", "Result"]];
  const dateStep = () => steps().filter((x) => x[2]).pop()[0];
  const missSetup = () => [!D.pair && "pair", !D.dir && "direction"].filter(Boolean);
  const curStep = () => { const L = steps(); if (step >= L.length) step = L.length - 1; return L[step]; };
  const snapFor = (slot) => new Promise((done) => { snapWait = { slot, done }; armed = slot; clearTimeout(armTimer); trySnapshot(); setTimeout(() => { if (snapWait && snapWait.slot === slot) { snapWait = null; armed = null; done(false); } }, 6000); });
  async function goStep(i) {
    step = Math.max(0, Math.min(steps().length - 1, i)); store({ step }); dd = null;
    const s = curStep(); if (s[2]) { msg = ""; render(); const ok = await setTf(s[2]); msg = ok ? "" : `Switch the chart to ${s[1]} yourself.`;
      if (s[0] === dateStep() && !D.date) { await fromPos(); if (!D.date) { const dt = await replayDate(); if (dt) { D.date = dt; keep(); } } } }
    if (s[0] === "result" && !D.closeDate) await fromPos();
    render();
  }
  async function startSteps(fresh) {
    await ask(); if (info.symbol && (fresh || !D.pair)) D.pair = pairOf(info.symbol); const p = await fromPos(); keep();
    await goStep(0);
    if (step === 0 && !D.dir) { msg = p ? "" : posWhy; render(); }
  }
  async function next() {
    const s = curStep();
    if (s[0] === "setup") { const miss = missSetup(); if (miss.length) { msg = "Still needed: " + miss.join(", ") + "."; return render(); } return goStep(step + 1); }
    if (s[0] === "result") return save();
    busy = true; msg = `Grabbing the ${s[1]} chart…`; render();
    const ok = await snapFor(s[0]); busy = false;
    if (!ok) { msg = `The ${s[1]} snapshot didn't come through. Press Alt+S on the chart, or continue without it.`; s.failed = true; return render(); }
    return goStep(step + 1);
  }

  /* ---------- doc ---------- */
  function toDoc() {
    const weekly = { ...D.w };
    if (D.ms) weekly.ms = D.ms; if (D.trend) weekly.trend = D.trend; if (D.wPat) weekly.pattern = "for";
    const st = hasStruct(D.entry4h) ? D.struct : "", bos = st === "bos", som = st === "som", num = (v) => v === "" || v == null || isNaN(+v) ? null : +v;
    let r = num(D.r); if (r != null && D.outcome === "loss" && r > 0) r = -r; if (r != null && D.outcome === "win" && r < 0) r = -r; if (D.outcome === "be" && r == null) r = 0;
    return { id: uid(), mode: "backtest", market: "fx", project: D.project || null, status: "taken", account: "", btDate: new Date().toISOString().slice(0, 10),
      date: D.date, closeDate: D.closeDate, concept: D.concept, fase: D.fase ? +D.fase : null, wStruct: D.wStruct, wPat: D.wPat, wPatSub: D.wPat ? D.wPatSub : "", wRange: !!D.wRange,
      scaleIn: !!D.scaleIn, dMs: D.dMs, hMs: D.hMs, weekly, sub: D.concept === "Weekly - 4H" ? "" : D.sub, dPros: D.dPros.slice(), dailyFib: D.dPros.includes("fc") ? "ja" : "nee",
      outcome: D.outcome, r, maxR: num(D.maxR), notes: D.notes.trim(), evaluation: D.evaluation, onPlan: D.evaluation ? D.evaluation === "plan" : null, exitReason: D.exit,
      entry4h: D.entry4h, planEntry: num(D.planEntry), slPips: num(D.slPips), tpPips: num(D.tpPips), struct: st, bos: bos ? "ja" : som ? "nee" : "", dfs: "", som: som && D.entry4h === "Reversal" ? "ja" : "", room: som ? (D.room ? "ja" : "nee") : "",
      ecTf: D.entry4h === "Engulfing Candle" ? D.ecTf : "", shots: {}, shotLinks: { ...D.links }, pair: pairOf(D.pair), dir: D.dir, created: Date.now(), source: "tradingview-extension" };
  }
  const rrText = () => { const sl = +D.slPips, tp = +D.tpPips; return sl > 0 && tp > 0 ? "1 : " + (Math.round(tp / sl * 100) / 100) : "—"; };
  const missing = () => [!D.pair && "pair", !D.date && "date", !D.dir && "direction"].filter(Boolean);
  async function save() {
    const miss = missing(); if (miss.length) { msg = "Still needed: " + miss.join(", ") + (view === "steps" && !D.date ? ` (on the ${steps().find((x) => x[0] === dateStep())[1]} step)` : "") + "."; return render(); }
    busy = true; render();
    try { const doc = toDoc(); await call("save", { doc }); savedId = doc.id; const pj = D.project, pr = D.pair;
      D = { ...blank(), project: pj, pair: pr }; store({ draft: D, lastProject: pj });
      msg = `Saved ${doc.pair} ${doc.dir} to ${(projects.find((p) => p.id === pj) || {}).name || "Backtest"}.`; if (view === "steps") { step = 0; logging = false; store({ step, logging }); } }
    catch (e) { msg = "Couldn't save: " + e.message; }
    busy = false; render();
  }

  /* ---------- render ---------- */
  const seg = (k, opts, v) => `<div class="segs">${opts.map(([val, l]) => `<button type="button" class="sg${v === val ? " on" : ""}${val === "against" ? " neg" : val === "for" ? " pos" : ""}" data-k="${k}" data-v="${esc(val)}">${l}</button>`).join("")}</div>`;
  const sel = (k, opts, v, ph) => `<select data-k="${k}"><option value="">${ph}</option>${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const f = (l, h) => `<div class="f"><span>${l}</span>${h}</div>`;
  const sec = (id, title, sum, body) => `<div class="sec${collapsed[id] ? " shut" : ""}"><button type="button" class="sh" data-sec="${id}"><b>${title}</b><em>${esc(sum)}</em><i>${collapsed[id] ? "▸" : "▾"}</i></button>${collapsed[id] ? "" : `<div class="sb">${body}</div>`}</div>`;
  const MS = [["for", "✓ With"], ["against", "✗ Against"]];
  function render() { try { renderInner(); } catch (e) { console.error("[Trade Journal]", e); panel.innerHTML = `<div class="head"><b>Trade Journal</b><button type="button" class="x" data-act="hide">–</button></div><div class="body"><p class="msg">Something went wrong: ${esc(e.message)}</p><button type="button" class="btn" data-act="clear">Reset form</button></div>`; } }
  function renderInner() {
    if (!open) return;
    panel.classList.toggle("mini", mini && !!user);
    if (mini && user) { const n = SLOTS.filter(([k]) => D.links[k]).length, sum = [D.pair, D.dir && (D.dir === "long" ? "↑" : "↓"), n ? n + " chart" + (n === 1 ? "" : "s") : ""].filter(Boolean).join(" "); panel.innerHTML = `<div class="head"><b>Trade Journal</b><span class="who">${esc(sum)}</span><button type="button" class="x" data-act="expand" title="Expand">▢</button><button type="button" class="x x2" data-act="close" title="Hide panel">×</button></div>`; return; }
    const pos = panel.querySelector(".body"), top = pos ? pos.scrollTop : 0;
    if (!user) {
      panel.innerHTML = `<div class="head"><b>Trade Journal</b><button type="button" class="x" data-act="hide" title="Minimize">–</button><button type="button" class="x x2" data-act="close" title="Hide panel">×</button></div>
      <form class="body login"><p>Sign in with your Trade Journal account. The extension only saves backtest trades to your own journal.</p>
      <label class="f"><span>Email</span><input type="email" name="email" autocomplete="username" required value="${esc(lastEmail)}"></label>
      <label class="f"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn pri" type="submit" ${busy ? "disabled" : ""}>${busy ? "Signing in…" : "Sign in"}</button>${msg ? `<p class="msg">${esc(msg)}</p>` : ""}</form>`;
      return;
    }
    const wc = P.wcrit.filter(([k]) => k !== "trend" && k !== "pattern"), fc = P.plan.faseConcepts[D.fase] || Object.keys(P.plan.concepts);
    const pros = wc.filter(([k]) => D.w[k] === "for").length, cons = wc.filter(([k]) => D.w[k] === "against").length;
    const wsum = [D.fase && "Phase " + D.fase, D.wStruct && (D.wStruct === "inner" ? "Inner" : "Outer"), D.trend && "Trend " + (D.trend === "for" ? "✓" : "✗"), D.ms && "MS " + (D.ms === "for" ? "✓" : "✗"), D.wRange && "Ranging", D.wPat, (pros || cons) && `${pros}+ ${cons}−`].filter(Boolean).join(" · ");
    const dsum = [D.concept, D.sub, D.dMs && "MS " + (D.dMs === "for" ? "✓" : "✗")].filter(Boolean).join(" · ");
    const hsum = [D.entry4h, D.hMs && "MS " + (D.hMs === "for" ? "✓" : "✗"), hasStruct(D.entry4h) && D.struct && D.struct.replace("bos", "BoS").replace("som", "SoM")].filter(Boolean).join(" · ");
    const csum = SLOTS.filter(([k]) => D.links[k]).map(([, l]) => l).join(" · ") || "none yet";
    const rsum = [D.outcome && ({ win: "Win", be: "BE", loss: "Loss" })[D.outcome], D.r !== "" && D.r + "R", D.evaluation && (D.evaluation === "plan" ? "To plan" : "Not to plan")].filter(Boolean).join(" · ");
    const pj = projects.find((p) => p.id === D.project);
    const B = { setup: () => `      ${f("Project", `<select data-k="project"><option value="">No project</option>${projects.map((p) => `<option value="${esc(p.id)}" ${p.id === D.project ? "selected" : ""}>${esc(p.name)}${p.status === "closed" ? " (closed)" : ""}</option>`).join("")}</select>`)}
      <div class="row2">${f(`Pair <button type="button" class="lnk inl" data-act="read" title="Read pair and replay date from the chart">⟳ from chart</button>`, `<input type="text" data-k="pair" value="${esc(D.pair)}" list="tjpairs" autocomplete="off"><datalist id="tjpairs">${String((pj && pj.pairs) || "").split(/[\s,]+/).filter(Boolean).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`)}
        ${view === "steps" ? f("Direction", seg("dir", [["long", "↑ Long"], ["short", "↓ Short"]], D.dir)) : f("Date", `<input type="date" data-k="date" value="${esc(D.date)}">`)}</div>
      ${view === "steps" ? "" : f("Direction", seg("dir", [["long", "↑ Long"], ["short", "↓ Short"]], D.dir))}${posSel()}`, weekly: () => `
        <div class="row2">${f("Weekly phase", seg("fase", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]], String(D.fase)))}${f("Inner / outer", seg("wStruct", [["inner", "Inner"], ["outer", "Outer"]], D.wStruct))}</div>
        <div class="row2">${f("Market trend", seg("trend", MS, D.trend))}${f("Market structure", seg("ms", MS, D.ms))}</div>
        <div class="row2">${f("Ranging <em>between two weekly levels</em>", `<div class="segs"><button type="button" class="sg${D.wRange ? " on" : ""}" data-tog="wRange">↔ Ranging</button></div>`)}
          ${f("Weekly pattern", sel("wPat", ["Continuation", "Reversal", "Pattern in Pattern"], D.wPat, "No pattern"))}</div>
        ${D.wPat && D.wPat !== "Reversal" ? f("Pattern variant <em>optional</em>", sel("wPatSub", P.plan.concepts[D.wPat] || [], D.wPatSub, "Not set")) : ""}
        <div class="row2">${["for", "against"].map((side) => { const lab = side === "for" ? "Pros" : "Cons", sel = wc.filter(([k]) => D.w[k] === side), rest = wc.filter(([k]) => !D.w[k]);
          return f(lab, `<div class="ms ${side}"><div class="msbox" data-dd="${side}">${sel.map(([k, l]) => `<span class="mchip ${side}">${esc(l)}<button type="button" data-unw="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("") || `<span class="msph">Choose criteria…</span>`}<i>▾</i></div>${dd === side ? `<div class="mslist">${rest.length ? rest.map(([k, l]) => `<button type="button" data-addw="${k}" data-side="${side}">${esc(l)}</button>`).join("") : `<span class="msph">All criteria used</span>`}</div>` : ""}</div>`); }).join("")}</div>`, daily: () => `
        ${(() => { const v = P.plan.concepts[D.concept] || [], none = !D.concept || D.concept === "Weekly - 4H" || !v.length || (v.length === 1 && v[0] === "—"); return `<div class="row2">${f("Trade concept", sel("concept", fc, D.concept, "Choose…"))}${none ? "" : f("Daily variant <em>optional</em>", sel("sub", v, D.sub, "Choose…"))}</div>`; })()}
        ${f("Market structure", seg("dMs", MS, D.dMs))}
        ${f("Pros", (() => { const sel = P.dcrit.filter(([k]) => D.dPros.includes(k)), rest = P.dcrit.filter(([k]) => !D.dPros.includes(k)); return `<div class="ms for"><div class="msbox" data-dd="dpros">${sel.map(([k, l]) => `<span class="mchip for">${esc(l)}<button type="button" data-und="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("") || `<span class="msph">Choose criteria…</span>`}<i>▾</i></div>${dd === "dpros" ? `<div class="mslist">${rest.length ? rest.map(([k, l]) => `<button type="button" data-addd="${k}">${esc(l)}</button>`).join("") : `<span class="msph">All criteria used</span>`}</div>` : ""}</div>`; })())}`, h4: () => `
        <div class="row2">${f("4H entry", sel("entry4h", P.plan.entries, D.entry4h, "Choose…"))}${f("Market structure", seg("hMs", MS, D.hMs))}</div>
        ${hasStruct(D.entry4h) ? `<div class="row2">${f("4H structure", seg("struct", [["bos", "BoS"], ["som", "SoM"]], D.struct))}${D.struct === "som" ? f("4H room", `<div class="segs"><button type="button" class="sg${D.room ? " on" : ""}" data-tog="room">Room</button></div>`) : ""}</div>` : ""}
        ${f("Scale-in", `<div class="segs"><button type="button" class="sg${D.scaleIn ? " on" : ""}" data-tog="scaleIn">Scale-in</button></div>`)}
        ${D.entry4h === "Engulfing Candle" ? f("Reversal on", seg("ecTf", [["1h", "1 hour"], ["2h", "2 hour"]], D.ecTf)) : ""}
        <div class="row3">${f("Planned entry price", `<input type="number" step="any" data-k="planEntry" value="${esc(D.planEntry)}">`)}${f("Stop loss (pips)", `<input type="number" step="any" min="0" data-k="slPips" value="${esc(D.slPips)}">`)}${f("Take profit (pips)", `<input type="number" step="any" min="0" data-k="tpPips" value="${esc(D.tpPips)}">`)}</div>
        <p class="hint">Planned R:R <b data-rr>${esc(rrText())}</b></p>`, result: () => `
        ${f("Outcome", seg("outcome", [["win", "Win"], ["be", "BE"], ["loss", "Loss"]], D.outcome))}
        ${f(`Close date <button type="button" class="lnk inl" data-act="readclose" title="From the Long/Short position (right edge), or the replay date">⟳ from chart</button>`, `<input type="date" data-k="closeDate" value="${esc(D.closeDate)}" min="${esc(D.date)}">`)}
        <div class="row2">${f("Result (R)", `<input type="number" step="any" data-k="r" value="${esc(D.r)}">`)}${f("Max R reached <em>optional</em>", `<input type="number" step="any" min="0" data-k="maxR" value="${esc(D.maxR)}">`)}</div>
        ${f("Exit", sel("exit", P.plan.exits.filter((x) => x !== "Invalid, cancelled"), D.exit, "Choose…"))}
        ${f("According to plan?", seg("evaluation", [["plan", "Yes"], ["off", "No"]], D.evaluation))}
        ${f("Notes", `<textarea data-k="notes" rows="3">${esc(D.notes)}</textarea>`)}`,
      ltf: () => `<p class="hint">Find the reversal on the ${curStep()[1]}, then continue to grab the chart.</p>` };
    const HEAD = `<div class="head"><b>Trade Journal</b><span class="who" title="${esc(user.email)}">Backtest</span><button type="button" class="x" data-act="settings" title="Settings">⚙</button><button type="button" class="x x2" data-act="reload" title="Reload extension (v${esc(chrome.runtime.getManifest().version)}) after an update">⟳</button><button type="button" class="x x2" data-act="hide" title="Minimize">–</button><button type="button" class="x x2" data-act="close" title="Hide panel">×</button></div>`;
    if (settings) {
      const L = look.match && jLook ? jLook : look, ST = [["chart", "Chart"], ["replay", "Replay"], ["look", "Look"], ["account", "Account"]];
      const tab = ST.some(([k]) => k === setTab) ? setTab : "chart";
      const tb = { chart: () => `<label class="chk"><input type="checkbox" data-set="autoFit" ${autoFit ? "checked" : ""}><span>Fit chart after switching timeframe<small>Turns Auto (price scale) on and off, so the chart fits the screen.</small></span></label>`,
        look: () => `<label class="chk"><input type="checkbox" data-set="match" ${look.match ? "checked" : ""}><span>Same look as my journal<small>Uses the theme and accent colour from your journal's settings.</small></span></label>
        ${f("Theme", `<div class="segs">${[["system", "System"], ["light", "Light"], ["dark", "Dark"], ["black", "Black"]].map(([k, l]) => `<button type="button" class="sg${L.theme === k ? " on" : ""}" data-look="theme" data-v="${k}">${l}</button>`).join("")}</div>`)}
        ${f("Accent colour", `<div class="sw">${ACCENTS.map(([k, l, c1, c2]) => `<button type="button" class="swb${L.accent === k ? " on" : ""}" data-look="accent" data-v="${k}" title="${l}" aria-label="${l}" style="background:${c2}"></button>`).join("")}</div>`)}`,
        replay: () => `<p class="hint">The skip buttons on the start screen step the replay until price touches a horizontal line or rectangle. Add your templates here so they only stop at those.</p>
          ${trig.length ? `<div class="trl">${trig.map((t, i) => `<div class="tr" data-tri="${i}"><span class="grip" draggable="true" data-grip="${i}" title="Drag to reorder">⋮⋮</span><i style="background:${esc(t.color || "transparent")}"></i><input type="text" class="trn" data-trn="${i}" value="${esc(t.label || "")}" placeholder="${t.name === "rectangle" ? "Rectangle" : t.name === "horizontal_ray" ? "Horizontal ray" : "Horizontal line"}" aria-label="Name"><em>${t.name === "rectangle" ? "Rectangle" : t.name === "horizontal_ray" ? "Ray" : "Line"}</em><button type="button" class="lnk" data-rmtrig="${i}" title="Remove">×</button></div>`).join("")}</div>` : `<p class="hint">No styles yet, so it stops at any horizontal line or rectangle.</p>`}
          <div><button type="button" class="btn ghost sm" data-act="trigadd">＋ Use the selected drawing's style</button></div>
          ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}`,
        account: () => `<p class="hint">Signed in as ${esc(user.email)}</p><p class="hint">Extension version ${esc(chrome.runtime.getManifest().version)}</p><div><button type="button" class="btn ghost" data-act="logout">Sign out</button></div>` };
      panel.innerHTML = `${HEAD}<div class="stp">${ST.map(([k, l]) => `<button type="button" class="st${k === tab ? " on" : ""}" data-settab="${k}">${l}</button>`).join("")}</div>
      <div class="body idle">${tb[tab]()}</div>
      <div class="foot"><div class="fb"><button type="button" class="btn ghost" data-act="settings">Back</button></div></div>`;
    } else if (view === "steps" && !logging) {
      const draft = D.dir || D.fase || D.concept || D.entry4h || Object.keys(D.links).length;
      panel.innerHTML = `${HEAD}<div class="body idle">
        ${f("Project", `<select data-k="project"><option value="">No project</option>${projects.map((p) => `<option value="${esc(p.id)}" ${p.id === D.project ? "selected" : ""}>${esc(p.name)}${p.status === "closed" ? " (closed)" : ""}</option>`).join("")}</select>`)}
        ${draft ? `<p class="hint">Unfinished trade: ${esc([D.pair, D.dir && (D.dir === "long" ? "↑ Long" : "↓ Short"), steps()[step] && "at " + steps()[step][1]].filter(Boolean).join(" · "))}</p>
          <div class="fb"><button type="button" class="btn pri" data-act="log">▶ Continue trade</button><button type="button" class="btn ghost" data-act="discard">Discard it</button></div>`
        : `<div class="newt"><button type="button" class="fab" data-act="log" aria-label="New trade" title="New trade">+</button><span><b>New trade</b><small>Weekly, Daily and 4H, grabbing each chart as you go.</small></span></div>`}
        <div class="skip"><b class="ttl">Skip to the next drawing hit (4H)</b>
          ${fwd ? fwdBtn() : `<div class="fb"><button type="button" class="btn ghost" data-act="skip1d" title="Stops at a hit, or at the latest when the daily candle closes">${FF}Daily CC</button><button type="button" class="btn ghost" data-act="skip1w" title="Stops at a hit, or at the latest when the weekly candle closes">${FF}Weekly CC</button></div>`}
          ${trig.length ? `<div class="tgw"><span class="tgl">Stop at</span><div class="tgs">${trig.map((t, k) => `<button type="button" class="tg${t.on === false ? "" : " on"}" data-tgtrig="${k}" title="${t.on === false ? "Off: skips ignore this style" : "On: skips stop at this style"}"><i style="background:${esc(t.color || "transparent")}"></i>${esc(t.label || (t.name === "rectangle" ? "Rectangle" : "Line"))}</button>`).join("")}</div></div>` : `<p class="hint">Stops at any horizontal line or rectangle. Add your templates in ⚙ → Replay.</p>`}</div>
      </div>${msg || savedId ? `<div class="foot">${msg ? `<p class="msg">${esc(msg)}</p>` : ""}${savedId ? `<a class="lnk ext" href="${JOURNAL}#trade=${encodeURIComponent(savedId)}" target="_blank" rel="noopener">Open in journal ↗</a>` : ""}</div>` : ""}`;
    } else if (view === "steps") {
      const L = steps(), s = curStep(), last = step === L.length - 1, link = s[2] && D.links[s[0]];
      panel.innerHTML = `${HEAD}
      <div class="stp">${L.map(([k, l], i) => `<button type="button" class="st${i === step ? " on" : ""}${i < step ? " done" : ""}" data-go="${i}">${esc(l)}</button>`).join("")}</div>
      <div class="body">${step ? posLine() : ""}${s[2] ? `<p class="hint">Chart is on ${esc(s[1])}. Position it, fill this in, then Continue grabs the chart.</p>` : ""}${B[s[0]]()}${s[0] === dateStep() ? f(`Date <button type="button" class="lnk inl" data-act="readdate" title="From the Long/Short position, or the replay date">⟳ from chart</button>`, `<input type="date" data-k="date" value="${esc(D.date)}">`) : ""}
        ${link ? `<div class="shot cur"><img src="${tvImg(link.match(/x\/([^/]+)/)[1])}" alt="${esc(s[1])} chart"><button type="button" class="rm" data-rm="${s[0]}" title="Remove">×</button></div>` : ""}</div>
      <div class="foot">${msg ? `<p class="msg">${esc(msg)}</p>` : ""}<div class="fb"><button type="button" class="lnk" data-act="stoplog" title="Stop for now. The trade is kept, so you can continue later.">Stop</button>${step ? `<button type="button" class="btn ghost" data-act="back" ${busy ? "disabled" : ""}>Back</button>` : ""}<span class="sp"></span>
        ${s.failed || (s[2] && msg && /didn't come/.test(msg)) ? `<button type="button" class="lnk" data-act="skip">Continue without chart</button>` : ""}
        <button type="button" class="btn pri" data-act="next" ${busy ? "disabled" : ""}>${busy ? (last ? "Saving…" : "Grabbing…") : last ? "Save trade" : s[2] ? "📷 Continue" : "Continue"}</button></div>
</div>`;
    }
    const b = panel.querySelector(".body"); if (b) b.scrollTop = top;
    fit();
    const ls = panel.querySelector(".mslist"); if (ls) ls.scrollIntoView({ block: "nearest" });
  }

  /* ---------- events ---------- */
  root.addEventListener("submit", async (e) => {
    e.preventDefault(); const fd = new FormData(e.target); lastEmail = fd.get("email") || ""; busy = true; msg = ""; render();
    try { user = await call("login", { email: fd.get("email"), password: fd.get("password") }); await boot(); }
    catch (er) { msg = er.message; } busy = false; render();
  });
  root.addEventListener("click", async (e) => {
    const box = e.target.closest("[data-dd]");
    if (box && !e.target.closest("[data-unw],[data-und]")) { dd = dd === box.dataset.dd ? null : box.dataset.dd; return render(); }
    if (dd && !e.target.closest(".mslist")) { dd = null; render(); }
    const t = e.target.closest("button"); if (!t) return;
    const d = t.dataset;
    if (d.act === "hide") { mini = true; store({ mini }); return render(); }
    if (d.act === "expand") { mini = false; store({ mini }); return render(); }
    if (d.act === "close") return toggle(false);
    if (d.act === "log") { const fresh = !(D.dir || D.fase || D.concept || D.entry4h || Object.keys(D.links).length); savedId = ""; logging = true; store({ logging }); msg = ""; return startSteps(fresh); }
    if (d.act === "stoplog") { logging = false; store({ logging }); msg = ""; return render(); }
    if (d.act === "discard") { const pj = D.project, pr = D.pair; D = { ...blank(), project: pj, pair: pr }; step = 0; store({ step, draft: D }); msg = ""; return render(); }
    if (d.act === "posshow") { showPos(curPos()); return; }
    if (d.act === "posrefresh") { const p = await fromPos(["dir", "date", "closeDate", "planEntry", "slPips", "tpPips"]); msg = p ? "" : posWhy; return render(); }
    if (d.act === "fwd") { skipBack = ""; fwd = { n: 0 }; msg = ""; render(); window.postMessage({ __tj: "fwd", specs: onSigs(), max: 300 }, location.origin); return; }
    if ((d.act === "skip1d" || d.act === "skip1w" || d.act === "fwd") && trig.length && !onSigs().length) { msg = "All your styles are off. Turn at least one on."; return render(); }
    if (d.act === "skip1d" || d.act === "skip1w") { const days = d.act === "skip1d" ? 1 : 7; fwd = { n: 0 }; msg = ""; render();
      window.postMessage({ __tj: "fwd", specs: onSigs(), max: 300, until: days === 1 ? "D" : "W", res: "240" }, location.origin); return; }
    if (d.act === "fwdstop") { window.postMessage({ __tj: "fwdstop" }, location.origin); return; }
    if (d.act === "trigadd") { window.postMessage({ __tj: "sig" }, location.origin); return; }
    if (d.tgtrig != null) { const k = +d.tgtrig; if (trig[k]) { trig[k] = { ...trig[k], on: trig[k].on === false }; saveSet({ trig }); } return render(); }
    if (d.rmtrig != null) { trig = trig.filter((_, i) => i !== +d.rmtrig); saveSet({ trig }); return render(); }
    if (d.settab) { setTab = d.settab; return render(); }
    if (d.look) { if (look.match && jLook) look = { ...look, theme: jLook.theme, accent: jLook.accent }; look.match = false; look[d.look] = d.v; saveSet({ look }); applyLook(); return render(); }
    if (d.act === "settings") { settings = !settings; msg = ""; return render(); }
    if (d.act === "next") return next();
    if (d.act === "back") return goStep(step - 1);
    if (d.act === "skip") { msg = ""; return goStep(step + 1); }
    if (d.go) { const i = +d.go; if (i > step && curStep()[0] === "setup" && missSetup().length) { msg = "Still needed: " + missSetup().join(", ") + "."; return render(); } return goStep(i); }
    if (d.act === "reload") { clearTimeout(saveT); await store({ draft: D }); chrome.runtime.sendMessage({ type: "reload" }); return; }
    if (d.act === "logout") { await call("logout"); user = null; settings = false; msg = ""; return render(); }
    if (d.act === "save") return save();
    if (d.act === "clear") { const pj = D.project; D = { ...blank(), project: pj }; msg = ""; keep(); return render(); }
    if (d.act === "readdate" || d.act === "readclose") { const k = d.act === "readdate" ? "date" : "closeDate", p = await fromPos([k]);
      if (p && D[k] === day(k === "date" ? p.t0 : p.t1)) msg = `From the ${p.dir === "long" ? "Long" : "Short"} position.`;
      else { const dt = await replayDate(); if (dt) D[k] = dt; msg = dt ? "From the replay date. " + posWhy : "Couldn't read the date, so fill it in yourself."; }
      keep(); return render(); }
    if (d.act === "read") { await ask(); if (info.symbol) D.pair = pairOf(info.symbol); const p = await fromPos(["dir", "date", "closeDate", "planEntry", "slPips", "tpPips"]); if (!p) { const dt = dateOf(info.replay); if (dt) D.date = dt; } msg = p ? `Direction and dates from the ${p.dir === "long" ? "Long" : "Short"} position.` : D.date ? posWhy : "Couldn't read the replay date, so fill it in yourself."; keep(); return render(); }
    if (d.sec) { collapsed[d.sec] = !collapsed[d.sec]; store({ collapsed }); return render(); }
    if (d.arm) return arm(d.arm);
    if (d.rm) { delete D.links[d.rm]; keep(); return render(); }
    if (d.tog) { D[d.tog] = !D[d.tog]; keep(); return render(); }
    if (d.addw) { D.w[d.addw] = d.side; dd = null; keep(); return render(); }
    if (d.unw) { delete D.w[d.unw]; keep(); return render(); }
    if (d.addd) { if (!D.dPros.includes(d.addd)) D.dPros = [...D.dPros, d.addd]; dd = null; keep(); return render(); }
    if (d.und) { D.dPros = D.dPros.filter((x) => x !== d.und); keep(); return render(); }
    if (d.dp) { D.dPros = D.dPros.includes(d.dp) ? D.dPros.filter((x) => x !== d.dp) : [...D.dPros, d.dp]; keep(); return render(); }
    if (d.k) { D[d.k] = D[d.k] === d.v ? "" : d.v; if (d.k === "fase" && D.concept && !(P.plan.faseConcepts[D.fase] || []).includes(D.concept)) { D.concept = ""; D.sub = ""; }
      if (d.k === "outcome" && d.v === "be" && D.r === "") D.r = "0"; keep(); return render(); }
  });
  root.addEventListener("change", async (e) => { if (e.target.dataset && e.target.dataset.trn != null) { const i = +e.target.dataset.trn; if (trig[i]) { trig[i] = { ...trig[i], label: e.target.value.trim() }; saveSet({ trig }); } return; }
    if (e.target.dataset && e.target.dataset.set === "autoFit") { autoFit = e.target.checked; saveSet({ autoFit }); return; }
    if (e.target.dataset && e.target.dataset.set === "match") { look.match = e.target.checked; if (!look.match && jLook) look = { ...look, theme: jLook.theme, accent: jLook.accent }; saveSet({ look }); if (look.match) loadJLook(); else applyLook(); return render(); }
    const k = e.target.dataset && e.target.dataset.k; if (!k) return;
    if (k === "posPick") { D.posPick = e.target.value; const p = await fromPos(["dir", "date", "closeDate", "planEntry", "slPips", "tpPips"]); showPos(p); msg = p ? "" : posWhy; return render(); }
    D[k] = e.target.value;
    // typing fields: no re-render, so a click that caused the blur (e.g. Save) isn't lost
    if (e.target.tagName === "TEXTAREA" || e.target.type === "number" || e.target.type === "date" || k === "pair") { if (k === "pair") { D.pair = pairOf(D.pair); e.target.value = D.pair; } keep(); return; }
    if (k === "wPat") D.wPatSub = ""; if (k === "concept") D.sub = ""; if (k === "entry4h" && !hasStruct(D.entry4h)) { D.struct = ""; D.room = false; } if (k === "pair") D.pair = pairOf(D.pair);
    if (k === "project") store({ lastProject: D.project }); keep(); render(); });
  root.addEventListener("input", (e) => { const k = e.target.dataset && e.target.dataset.k; if (k && (e.target.tagName === "TEXTAREA" || e.target.type === "number")) { D[k] = e.target.value; keep(); if (k === "slPips" || k === "tpPips") { const r = panel.querySelector("[data-rr]"); if (r) r.textContent = rrText(); } } });
  // reorder trigger styles by dragging the grip
  let dragI = null;
  root.addEventListener("dragstart", (e) => { const g = e.target.closest && e.target.closest("[data-grip]"); if (!g) return; dragI = +g.dataset.grip; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(dragI)); e.dataTransfer.setDragImage(g.closest(".tr"), 10, 10); } catch {} g.closest(".tr").classList.add("drag"); });
  root.addEventListener("dragover", (e) => { if (dragI == null) return; const r = e.target.closest && e.target.closest("[data-tri]"); if (!r) return; e.preventDefault();
    root.querySelectorAll(".tr.over-a,.tr.over-b").forEach((x) => x.classList.remove("over-a", "over-b")); const b = r.getBoundingClientRect(); r.classList.add(e.clientY < b.top + b.height / 2 ? "over-a" : "over-b"); });
  root.addEventListener("drop", (e) => { if (dragI == null) return; const r = e.target.closest && e.target.closest("[data-tri]"); e.preventDefault(); if (!r) return;
    const b = r.getBoundingClientRect(); let to = +r.dataset.tri + (e.clientY < b.top + b.height / 2 ? 0 : 1); const from = dragI; dragI = null;
    if (to > from) to--; if (to !== from) { const L = trig.slice(), [it] = L.splice(from, 1); L.splice(to, 0, it); trig = L; saveSet({ trig }); } render(); });
  root.addEventListener("dragend", () => { if (dragI != null) { dragI = null; render(); } });

  // keep TradingView from reacting to keys typed in the panel
  ["keydown", "keyup", "keypress"].forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));

  /* ---------- boot ---------- */
  async function boot() {
    try { const p = await call("plan"); if (p && p.plan && p.wcrit) P = p; } catch {}
    try { projects = await call("projects"); } catch (e) { msg = "Couldn't load projects: " + e.message; }
    if (D.project && !projects.some((p) => p.id === D.project)) D.project = "";
    loadJLook(); loadSet();
  }
  (async () => {
    const pos = await load(); applyLook(); if (pos && pos.left) Object.assign(host.style, { left: pos.left, top: pos.top, right: "auto" });
    try { user = await call("status"); } catch {}
    if (user) await boot();
    panel.hidden = !open; pill.hidden = open; render();
  })();

  function CSS() { return `
  :host{all:initial}
  *{box-sizing:border-box;font-family:"TJ Archivo",Archivo,system-ui,-apple-system,Segoe UI,sans-serif}
  .pill{position:fixed;right:16px;bottom:80px;width:46px;height:46px;border-radius:12px;border:0;padding:0;background:none;cursor:grab;box-shadow:0 6px 20px rgba(0,0,0,.4);touch-action:none;overflow:hidden}.pill:active{cursor:grabbing}.pill img{width:100%;height:100%;display:block;pointer-events:none;user-select:none}
  [hidden]{display:none!important}
  .panel{--bg:#161a2d;--in:#0e1120;--ink:#e6e8f3;--mut:#9299b8;--line:#283050;--soft:#1d2238;--good:#43c088;--bad:#f06c60;--acc:#8590ff;width:360px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:13px;overflow:hidden}
  .head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);cursor:move;user-select:none}
  .head b{font-size:14px}.who{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}.x{margin-left:auto;background:none;border:0;color:var(--mut);font-size:18px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px}.x:hover{background:var(--soft);color:var(--ink)}.x2{margin-left:0}.panel.mini{width:auto;min-width:220px}.panel.mini .head{border-bottom:0}
  .body{overflow-y:auto;overflow-x:hidden;padding:10px 12px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
  .login{display:grid;gap:10px}.login p{margin:0;color:var(--mut);line-height:1.45}
  .f{display:grid;gap:4px;min-width:0}.f>span{font-size:11px;font-weight:600;color:var(--mut)}.f>span em{font-weight:400;font-style:normal;opacity:.8;margin-left:4px}
  .row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:start}.row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:end}
  input,select,textarea{width:100%;font-size:13px;color:var(--ink);background:var(--in);border:1px solid var(--line);border-radius:7px;padding:6px 8px;outline:none}
  input:focus,select:focus,textarea:focus{border-color:var(--acc)}textarea{resize:vertical}
  .segs{display:flex;flex-wrap:wrap;gap:4px}
  .sg{border:1px solid var(--line);background:var(--in);color:var(--ink);border-radius:7px;padding:5px 9px;font-size:12.5px;cursor:pointer}
  .sg.on{background:var(--acc);border-color:var(--acc);color:#fff}.sg.on.pos{background:var(--good);border-color:var(--good)}.sg.on.neg{background:var(--bad);border-color:var(--bad)}
  .sec{border:1px solid var(--line);border-radius:9px}
  .sh{width:100%;display:flex;align-items:center;gap:8px;background:none;border:0;color:var(--ink);padding:8px 10px;cursor:pointer;text-align:left}
  .sh b{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}.sh em{font-style:normal;color:var(--ink);font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sh i{font-style:normal;color:var(--mut)}
  .sec{min-width:0}.sb{display:grid;grid-template-columns:minmax(0,1fr);gap:9px;padding:2px 10px 10px}
  .chips{display:flex;flex-wrap:wrap;gap:4px}
  .ms{position:relative}.msbox{min-height:34px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:4px 22px 4px 5px;border:1px solid var(--line);border-radius:7px;background:var(--in);cursor:pointer;position:relative}
  .msbox i{position:absolute;right:7px;top:50%;transform:translateY(-50%);font-style:normal;color:var(--mut);font-size:11px}.msph{color:var(--mut);font-size:12.5px;padding:2px 3px}
  .mchip{display:inline-flex;align-items:center;gap:4px;border-radius:6px;padding:2px 3px 2px 7px;font-size:12px}.mchip.for{background:color-mix(in srgb,var(--good) 18%,transparent);color:var(--good)}.mchip.against{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}
  .mchip button{background:none;border:0;color:inherit;cursor:pointer;font-size:13px;line-height:1;padding:0 3px}
  .mslist{margin-top:3px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:4px;display:grid;box-shadow:0 10px 30px rgba(0,0,0,.4);max-height:220px;overflow:auto}
  .mslist button{background:none;border:0;color:var(--ink);text-align:left;padding:7px 9px;border-radius:6px;font-size:13px;cursor:pointer}.mslist button:hover{background:var(--soft)}
  .chip{border:1px solid var(--line);background:var(--in);color:var(--ink);border-radius:999px;padding:4px 9px;font-size:12px;cursor:pointer}
  .chip.for{background:color-mix(in srgb,var(--good) 18%,transparent);border-color:var(--good);color:var(--good)}.chip.against{background:color-mix(in srgb,var(--bad) 16%,transparent);border-color:var(--bad);color:var(--bad)}
  .hint{margin:0;color:var(--mut);font-size:12px;line-height:1.4}
  .shots{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.shot{min-width:0}
  .shot{position:relative;display:grid;gap:5px}.shot img,.shot .ph{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:6px;border:1px solid var(--line);background:var(--in)}
  .shot.armed .ph,.shot.armed img{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 35%,transparent)}
  .rm{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;cursor:pointer;line-height:1}
  .btn{border:1px solid var(--line);background:var(--soft);color:var(--ink);border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer}
  .btn.sm{padding:5px 8px;font-size:12px}.btn.pri{background:var(--acc);border-color:var(--acc);color:#fff}.btn.ghost{background:none}.btn:disabled{opacity:.6;cursor:default}
  .foot{border-top:1px solid var(--line);padding:10px 12px;display:grid;gap:8px}.fb{display:flex;gap:8px;align-items:center}.sp{flex:1}
  .lnk{background:none;border:0;color:var(--mut);font-size:12px;cursor:pointer;text-decoration:underline}.lnk.inl{font-size:11px;padding:0;margin-left:6px;color:var(--acc);text-decoration:none}
  .posl{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 9px;border:1px solid var(--line);border-radius:7px;background:var(--in)}.posl span{color:var(--mut);font-weight:600;font-size:11px}.posl b{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.posl .lnk{margin:0}
  .fwd{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:6px 9px;border:1px solid var(--acc);border-radius:7px;font-size:12.5px}.fwdgo{justify-self:start}.trl{display:grid;gap:6px}.tr{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:5px 8px;border:1px solid var(--line);border-radius:7px}.tr i{width:14px;height:14px;border-radius:4px;border:1px solid var(--line)}.tr span{flex:1}.tr .grip{flex:none;cursor:grab;color:var(--mut);font-size:13px;letter-spacing:-3px;padding:0 4px 0 0;user-select:none}.tr.drag{opacity:.45}.tr.over-a{box-shadow:inset 0 2px 0 var(--acc)}.tr.over-b{box-shadow:inset 0 -2px 0 var(--acc)}.tr .trn{flex:1;min-width:0;padding:3px 6px;font-size:12.5px;background:transparent;border-color:transparent}.tr .trn:hover,.tr .trn:focus{border-color:var(--line);background:var(--in)}.tr em{font-style:normal;color:var(--mut);font-size:11px}.tr .lnk{font-size:16px;text-decoration:none}
  .newt{display:flex;align-items:center;gap:12px}.newt span{display:grid;gap:2px;font-size:13px}.newt small{color:var(--mut);font-size:12px}.fab{width:46px;height:46px;flex:none;border-radius:50%;border:0;background:var(--acc);color:#fff;font-size:30px;line-height:1;font-weight:400;padding:0 0 3px;cursor:pointer;box-shadow:0 6px 18px color-mix(in srgb,var(--acc) 40%,transparent)}.fab:hover{filter:brightness(1.08)}.skip{display:grid;gap:7px;border-top:1px solid var(--line);padding-top:10px}
  .lnk.ext{justify-self:start;color:var(--acc);text-decoration:none;font-weight:600;font-size:12.5px}
  .ic{width:13px;height:13px;vertical-align:-2px;margin-right:5px;color:var(--acc)}.btn .ic{flex:none}.tgw{display:grid;gap:6px;margin-top:4px;padding:8px 9px;border:1px solid var(--line);border-radius:9px;background:color-mix(in srgb,var(--in) 55%,transparent)}.tgl{font-size:11px;font-weight:600;color:var(--mut)}.tgs{display:flex;flex-wrap:wrap;gap:6px}.tg{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:none;color:var(--mut);border-radius:999px;padding:4px 10px 4px 7px;font-size:12px;cursor:pointer}.tg i{width:10px;height:10px;border-radius:3px;opacity:.45}.tg.on{color:var(--ink);border-color:var(--acc);background:color-mix(in srgb,var(--acc) 14%,transparent)}.tg.on i{opacity:1}
  .ttl{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}.sw{display:flex;gap:8px}.swb{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;box-shadow:inset 0 0 0 2px var(--bg)}.swb.on{border-color:var(--ink)}.chk{display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:12.5px;margin-top:4px}.chk input{width:auto;margin-top:2px;accent-color:var(--acc)}.chk small{display:block;color:var(--mut);font-size:11.5px;margin-top:2px}
  .btn.big{padding:11px 14px;font-size:14px}.idle{gap:12px}
  .msg{margin:0;font-size:12px;color:var(--ink);line-height:1.4}
  .stp{display:flex;gap:3px;padding:8px 12px 0}.st{flex:1;min-width:0;border:0;border-bottom:2px solid var(--line);background:none;color:var(--mut);font-size:11px;font-weight:600;padding:4px 2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .st.done{color:var(--ink);border-color:color-mix(in srgb,var(--acc) 45%,transparent)}.st.on{color:var(--ink);border-color:var(--acc)}
  .shot.cur img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:6px;border:1px solid var(--line)}`; }
})();
