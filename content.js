// The Trade Journal panel on TradingView. Lives in a shadow root so TradingView's
// styles and ours never mix.
(() => {
  if (window.__tjPanel) return; window.__tjPanel = true;
  const call = (type, extra = {}) => new Promise((res, rej) => chrome.runtime.sendMessage({ type, ...extra }, (r) => {
    if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
    r && r.ok ? res(r.v) : rej(new Error((r && r.error) || "No answer"));
  }));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const tvImg = (id) => id ? `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png` : "";
  const SLOTS = [["weekly", "Weekly"], ["daily", "Daily"], ["h4", "4H"], ["ltf", "1H/2H"]];
  const hasStruct = (e) => e === "Reversal" || e === "Continuation" || e === "Pattern in Pattern";
  let dd = null, lastEmail = "", P = TJ_PLAN_DEFAULT, user = null, projects = [], open = false, armed = null, armTimer = null, msg = "", busy = false;
  const blank = () => ({ project: "", pair: "", date: "", dir: "", fase: "", wStruct: "", trend: "", ms: "", wRange: false, wPat: "", wPatSub: "", w: {}, concept: "", sub: "", dMs: "", dPros: [], entry4h: "", hMs: "", struct: "", room: false, scaleIn: false, ecTf: "", links: {}, outcome: "", r: "", maxR: "", exit: "", evaluation: "", notes: "" });
  let D = blank(), collapsed = {};

  /* ---------- storage ---------- */
  const store = (o) => chrome.storage.local.set(o);
  const load = async () => { const o = await chrome.storage.local.get(["draft", "pos", "open", "collapsed", "lastProject"]); if (o.draft) D = { ...blank(), ...o.draft }; if (!D.project && o.lastProject) D.project = o.lastProject; collapsed = o.collapsed || {}; open = !!o.open; return o.pos; };
  let saveT; const keep = () => { clearTimeout(saveT); saveT = setTimeout(() => store({ draft: D }), 250); };

  /* ---------- shell ---------- */
  const host = document.createElement("div"); host.id = "tj-panel-host";
  host.style.cssText = "position:fixed;z-index:2147483000;top:72px;right:16px;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS()}</style><button class="pill" title="Trade Journal">TJ</button><section class="panel" hidden></section>`;
  const panel = root.querySelector(".panel"), pill = root.querySelector(".pill");
  document.documentElement.appendChild(host);

  pill.onclick = () => toggle(true);
  chrome.runtime.onMessage.addListener((m) => { if (m && m.type === "toggle") toggle(!open); });
  function toggle(v) { open = v; store({ open }); panel.hidden = !open; pill.hidden = open; if (open) render(); }

  // drag by header
  let drag = null;
  root.addEventListener("pointerdown", (e) => { const h = e.target.closest(".head"); if (!h || e.target.closest("button")) return; const r = host.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; h.setPointerCapture(e.pointerId); });
  root.addEventListener("pointermove", (e) => { if (!drag) return; const x = Math.max(0, Math.min(innerWidth - 80, e.clientX - drag.dx)), y = Math.max(0, Math.min(innerHeight - 40, e.clientY - drag.dy)); Object.assign(host.style, { left: x + "px", top: y + "px", right: "auto" }); });
  root.addEventListener("pointerup", () => { if (drag) { drag = null; store({ pos: { left: host.style.left, top: host.style.top } }); } });

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
    msg = `${SLOTS.find((s) => s[0] === slot)[1]} chart saved.`; keep(); render();
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

  /* ---------- doc ---------- */
  function toDoc() {
    const weekly = { ...D.w };
    if (D.ms) weekly.ms = D.ms; if (D.trend) weekly.trend = D.trend; if (D.wPat) weekly.pattern = "for";
    const st = hasStruct(D.entry4h) ? D.struct : "", bos = st === "bos", som = st === "som", num = (v) => v === "" || v == null || isNaN(+v) ? null : +v;
    let r = num(D.r); if (r != null && D.outcome === "loss" && r > 0) r = -r; if (r != null && D.outcome === "win" && r < 0) r = -r; if (D.outcome === "be" && r == null) r = 0;
    return { id: uid(), mode: "backtest", market: "fx", project: D.project || null, status: "taken", account: "", btDate: new Date().toISOString().slice(0, 10),
      date: D.date, closeDate: "", concept: D.concept, fase: D.fase ? +D.fase : null, wStruct: D.wStruct, wPat: D.wPat, wPatSub: D.wPat ? D.wPatSub : "", wRange: !!D.wRange,
      scaleIn: !!D.scaleIn, dMs: D.dMs, hMs: D.hMs, weekly, sub: D.concept === "Weekly - 4H" ? "" : D.sub, dPros: D.dPros.slice(), dailyFib: D.dPros.includes("fc") ? "ja" : "nee",
      outcome: D.outcome, r, maxR: num(D.maxR), notes: D.notes.trim(), evaluation: D.evaluation, onPlan: D.evaluation ? D.evaluation === "plan" : null, exitReason: D.exit,
      entry4h: D.entry4h, planEntry: null, slPips: null, tpPips: null, struct: st, bos: bos ? "ja" : som ? "nee" : "", dfs: "", som: som && D.entry4h === "Reversal" ? "ja" : "", room: som ? (D.room ? "ja" : "nee") : "",
      ecTf: D.entry4h === "Engulfing Candle" ? D.ecTf : "", shots: {}, shotLinks: { ...D.links }, pair: pairOf(D.pair), dir: D.dir, created: Date.now(), source: "tradingview-extension" };
  }
  const missing = () => [!D.pair && "pair", !D.date && "date", !D.dir && "direction"].filter(Boolean);
  async function save() {
    const miss = missing(); if (miss.length) { msg = "Still needed: " + miss.join(", ") + "."; return render(); }
    busy = true; render();
    try { const doc = toDoc(); await call("save", { doc }); const pj = D.project, pr = D.pair;
      D = { ...blank(), project: pj, pair: pr }; store({ draft: D, lastProject: pj });
      msg = `Saved ${doc.pair} ${doc.dir} to ${(projects.find((p) => p.id === pj) || {}).name || "Backtest"}.`; }
    catch (e) { msg = "Couldn't save: " + e.message; }
    busy = false; render();
  }

  /* ---------- render ---------- */
  const seg = (k, opts, v) => `<div class="segs">${opts.map(([val, l]) => `<button type="button" class="sg${v === val ? " on" : ""}${val === "against" ? " neg" : ""}" data-k="${k}" data-v="${esc(val)}">${l}</button>`).join("")}</div>`;
  const sel = (k, opts, v, ph) => `<select data-k="${k}"><option value="">${ph}</option>${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const f = (l, h) => `<div class="f"><span>${l}</span>${h}</div>`;
  const sec = (id, title, sum, body) => `<div class="sec${collapsed[id] ? " shut" : ""}"><button type="button" class="sh" data-sec="${id}"><b>${title}</b><em>${esc(sum)}</em><i>${collapsed[id] ? "▸" : "▾"}</i></button>${collapsed[id] ? "" : `<div class="sb">${body}</div>`}</div>`;
  const MS = [["for", "✓ With"], ["against", "✗ Against"]];
  function render() { try { renderInner(); } catch (e) { console.error("[Trade Journal]", e); panel.innerHTML = `<div class="head"><b>Trade Journal</b><button type="button" class="x" data-act="hide">–</button></div><div class="body"><p class="msg">Something went wrong: ${esc(e.message)}</p><button type="button" class="btn" data-act="clear">Reset form</button></div>`; } }
  function renderInner() {
    if (!open) return;
    const pos = panel.querySelector(".body"), top = pos ? pos.scrollTop : 0;
    if (!user) {
      panel.innerHTML = `<div class="head"><b>Trade Journal</b><button type="button" class="x" data-act="hide" title="Hide">–</button></div>
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
    panel.innerHTML = `<div class="head"><b>Trade Journal</b><span class="who" title="${esc(user.email)}">Backtest</span><button type="button" class="x" data-act="hide" title="Hide">–</button></div>
    <div class="body">
      ${f("Project", `<select data-k="project"><option value="">No project</option>${projects.map((p) => `<option value="${esc(p.id)}" ${p.id === D.project ? "selected" : ""}>${esc(p.name)}${p.status === "closed" ? " (closed)" : ""}</option>`).join("")}</select>`)}
      <div class="row2">${f(`Pair <button type="button" class="lnk inl" data-act="read" title="Read pair and replay date from the chart">⟳ from chart</button>`, `<input type="text" data-k="pair" value="${esc(D.pair)}" list="tjpairs" autocomplete="off"><datalist id="tjpairs">${String((pj && pj.pairs) || "").split(/[\s,]+/).filter(Boolean).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`)}
        ${f("Entry date", `<input type="date" data-k="date" value="${esc(D.date)}">`)}</div>
      ${f("Direction", seg("dir", [["long", "↑ Long"], ["short", "↓ Short"]], D.dir))}
      ${sec("w", "Weekly", wsum, `
        <div class="row2">${f("Phase", seg("fase", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]], String(D.fase)))}${f("Inner / outer", seg("wStruct", [["inner", "Inner"], ["outer", "Outer"]], D.wStruct))}</div>
        <div class="row2">${f("Market trend", seg("trend", MS, D.trend))}${f("Market structure", seg("ms", MS, D.ms))}</div>
        <div class="row2">${f("Ranging", `<div class="segs"><button type="button" class="sg${D.wRange ? " on" : ""}" data-tog="wRange">↔ Ranging</button></div>`)}
          ${f("Weekly pattern", sel("wPat", ["Continuation", "Reversal", "Pattern in Pattern"], D.wPat, "No pattern"))}</div>
        ${D.wPat && D.wPat !== "Reversal" ? f("Pattern variant", sel("wPatSub", P.plan.concepts[D.wPat] || [], D.wPatSub, "Not set")) : ""}
        <div class="row2">${["for", "against"].map((side) => { const lab = side === "for" ? "Pros" : "Cons", sel = wc.filter(([k]) => D.w[k] === side), rest = wc.filter(([k]) => !D.w[k]);
          return f(lab, `<div class="ms ${side}"><div class="msbox" data-dd="${side}">${sel.map(([k, l]) => `<span class="mchip ${side}">${esc(l)}<button type="button" data-unw="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("") || `<span class="msph">Choose criteria…</span>`}<i>▾</i></div>${dd === side ? `<div class="mslist">${rest.length ? rest.map(([k, l]) => `<button type="button" data-addw="${k}" data-side="${side}">${esc(l)}</button>`).join("") : `<span class="msph">All criteria used</span>`}</div>` : ""}</div>`); }).join("")}</div>`)}
      ${sec("d", "Daily", dsum, `
        ${(() => { const v = P.plan.concepts[D.concept] || [], none = !D.concept || D.concept === "Weekly - 4H" || !v.length || (v.length === 1 && v[0] === "—"); return `<div class="row2">${f("Trade concept", sel("concept", fc, D.concept, "Choose…"))}${none ? "" : f("Variant", sel("sub", v, D.sub, "Choose…"))}</div>`; })()}
        ${f("Market structure", seg("dMs", MS, D.dMs))}
        ${f("Daily pros", (() => { const sel = P.dcrit.filter(([k]) => D.dPros.includes(k)), rest = P.dcrit.filter(([k]) => !D.dPros.includes(k)); return `<div class="ms for"><div class="msbox" data-dd="dpros">${sel.map(([k, l]) => `<span class="mchip for">${esc(l)}<button type="button" data-und="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("") || `<span class="msph">Choose criteria…</span>`}<i>▾</i></div>${dd === "dpros" ? `<div class="mslist">${rest.length ? rest.map(([k, l]) => `<button type="button" data-addd="${k}">${esc(l)}</button>`).join("") : `<span class="msph">All criteria used</span>`}</div>` : ""}</div>`; })())}`)}
      ${sec("h", "4H", hsum, `
        <div class="row2">${f("4H entry", sel("entry4h", P.plan.entries, D.entry4h, "Choose…"))}${f("Market structure", seg("hMs", MS, D.hMs))}</div>
        ${hasStruct(D.entry4h) ? `<div class="row2">${f("4H structure", seg("struct", [["bos", "BoS"], ["som", "SoM"]], D.struct))}${D.struct === "som" ? f("Room", `<div class="segs"><button type="button" class="sg${D.room ? " on" : ""}" data-tog="room">Room</button></div>`) : ""}</div>` : ""}
        ${D.entry4h === "Engulfing Candle" ? f("Reversal on", seg("ecTf", [["1h", "1 hour"], ["2h", "2 hour"]], D.ecTf)) : ""}
        ${f("Scale-in", `<div class="segs"><button type="button" class="sg${D.scaleIn ? " on" : ""}" data-tog="scaleIn">Scale-in</button></div>`)}`)}
      ${sec("c", "Charts", csum, `<p class="hint">Set the chart to the timeframe, then tap its camera. Alt+S on the chart works too.</p>
        <div class="shots">${SLOTS.map(([k, l]) => `<div class="shot${armed === k ? " armed" : ""}">${D.links[k] ? `<img src="${tvImg(D.links[k].match(/x\/([^/]+)/)[1])}" alt="${l} chart"><button type="button" class="rm" data-rm="${k}" title="Remove">×</button>` : `<div class="ph"></div>`}<button type="button" class="btn sm${armed === k ? " pri" : ""}" data-arm="${k}">📷 ${l}</button></div>`).join("")}</div>`)}
      ${sec("r", "Result", rsum, `
        ${f("Outcome", seg("outcome", [["win", "Win"], ["be", "BE"], ["loss", "Loss"]], D.outcome))}
        <div class="row2">${f("Result (R)", `<input type="number" step="any" data-k="r" value="${esc(D.r)}">`)}${f("Max R reached", `<input type="number" step="any" min="0" data-k="maxR" value="${esc(D.maxR)}">`)}</div>
        ${f("Exit", sel("exit", P.plan.exits.filter((x) => x !== "Invalid, cancelled"), D.exit, "Choose…"))}
        ${f("According to plan?", seg("evaluation", [["plan", "Yes"], ["off", "No"]], D.evaluation))}
        ${f("Notes", `<textarea data-k="notes" rows="3">${esc(D.notes)}</textarea>`)}`)}
    </div>
    <div class="foot">${msg ? `<p class="msg">${esc(msg)}</p>` : ""}<div class="fb"><button type="button" class="btn pri" data-act="save" ${busy ? "disabled" : ""}>${busy ? "Saving…" : "Save trade"}</button><button type="button" class="btn ghost" data-act="clear">Clear</button><span class="sp"></span><button type="button" class="lnk" data-act="logout" title="${esc(user.email)}">Sign out</button></div></div>`;
    const b = panel.querySelector(".body"); if (b) b.scrollTop = top;
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
    if (d.act === "hide") return toggle(false);
    if (d.act === "logout") { await call("logout"); user = null; msg = ""; return render(); }
    if (d.act === "save") return save();
    if (d.act === "clear") { const pj = D.project; D = { ...blank(), project: pj }; msg = ""; keep(); return render(); }
    if (d.act === "read") { await ask(); if (info.symbol) D.pair = pairOf(info.symbol); const dt = dateOf(info.replay); if (dt) D.date = dt; msg = dt ? "" : "Couldn't read the replay date, so fill it in yourself."; keep(); return render(); }
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
  root.addEventListener("change", (e) => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; D[k] = e.target.value;
    // typing fields: no re-render, so a click that caused the blur (e.g. Save) isn't lost
    if (e.target.tagName === "TEXTAREA" || e.target.type === "number" || e.target.type === "date" || k === "pair") { if (k === "pair") { D.pair = pairOf(D.pair); e.target.value = D.pair; } keep(); return; }
    if (k === "wPat") D.wPatSub = ""; if (k === "concept") D.sub = ""; if (k === "entry4h" && !hasStruct(D.entry4h)) { D.struct = ""; D.room = false; } if (k === "pair") D.pair = pairOf(D.pair);
    if (k === "project") store({ lastProject: D.project }); keep(); render(); });
  root.addEventListener("input", (e) => { const k = e.target.dataset && e.target.dataset.k; if (k && (e.target.tagName === "TEXTAREA" || e.target.type === "number")) { D[k] = e.target.value; keep(); } });
  // keep TradingView from reacting to keys typed in the panel
  ["keydown", "keyup", "keypress"].forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));

  /* ---------- boot ---------- */
  async function boot() {
    try { const p = await call("plan"); if (p && p.plan && p.wcrit) P = p; } catch {}
    try { projects = await call("projects"); } catch (e) { msg = "Couldn't load projects: " + e.message; }
    if (D.project && !projects.some((p) => p.id === D.project)) D.project = "";
  }
  (async () => {
    const pos = await load(); if (pos && pos.left) Object.assign(host.style, { left: pos.left, top: pos.top, right: "auto" });
    try { user = await call("status"); } catch {}
    if (user) await boot();
    panel.hidden = !open; pill.hidden = open; render();
  })();

  function CSS() { return `
  :host{all:initial}
  *{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}
  .pill{position:fixed;right:16px;bottom:80px;width:44px;height:44px;border-radius:50%;border:0;background:#7c8cff;color:#0b0e17;font:800 14px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35)}
  [hidden]{display:none!important}
  .panel{width:360px;max-height:calc(100vh - 100px);display:flex;flex-direction:column;background:#121624;color:#e8ebf5;border:1px solid #2a3046;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:13px;overflow:hidden}
  .head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #2a3046;cursor:move;user-select:none}
  .head b{font-size:14px}.who{font-size:11px;color:#8d94ad;text-transform:uppercase;letter-spacing:.05em}.x{margin-left:auto;background:none;border:0;color:#8d94ad;font-size:18px;cursor:pointer;line-height:1}
  .body{overflow-y:auto;overflow-x:hidden;padding:10px 12px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
  .login{display:grid;gap:10px}.login p{margin:0;color:#aab0c6;line-height:1.45}
  .f{display:grid;gap:4px;min-width:0}.f>span{font-size:11px;font-weight:600;color:#8d94ad}.f>span em{font-weight:400;font-style:normal;opacity:.8;margin-left:4px}
  .row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:start}.row3{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:end}
  input,select,textarea{width:100%;font-size:13px;color:#e8ebf5;background:#0b0e17;border:1px solid #2a3046;border-radius:7px;padding:6px 8px;outline:none}
  input:focus,select:focus,textarea:focus{border-color:#7c8cff}textarea{resize:vertical}
  .segs{display:flex;flex-wrap:wrap;gap:4px}
  .sg{border:1px solid #2a3046;background:#0b0e17;color:#e8ebf5;border-radius:7px;padding:5px 9px;font-size:12.5px;cursor:pointer}
  .sg.on{background:#3bbd85;border-color:#3bbd85;color:#fff}.sg.on.neg{background:#e5534b;border-color:#e5534b}
  .sec{border:1px solid #2a3046;border-radius:9px}
  .sh{width:100%;display:flex;align-items:center;gap:8px;background:none;border:0;color:#e8ebf5;padding:8px 10px;cursor:pointer;text-align:left}
  .sh b{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#aab0c6}.sh em{font-style:normal;color:#e8ebf5;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sh i{font-style:normal;color:#8d94ad}
  .sec{min-width:0}.sb{display:grid;grid-template-columns:minmax(0,1fr);gap:9px;padding:2px 10px 10px}
  .chips{display:flex;flex-wrap:wrap;gap:4px}
  .ms{position:relative}.msbox{min-height:34px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:4px 22px 4px 5px;border:1px solid #2a3046;border-radius:7px;background:#0b0e17;cursor:pointer;position:relative}
  .msbox i{position:absolute;right:7px;top:50%;transform:translateY(-50%);font-style:normal;color:#8d94ad;font-size:11px}.msph{color:#8d94ad;font-size:12.5px;padding:2px 3px}
  .mchip{display:inline-flex;align-items:center;gap:4px;border-radius:6px;padding:2px 3px 2px 7px;font-size:12px}.mchip.for{background:rgba(59,189,133,.18);color:#7fe0b4}.mchip.against{background:rgba(229,83,75,.16);color:#ff9a93}
  .mchip button{background:none;border:0;color:inherit;cursor:pointer;font-size:13px;line-height:1;padding:0 3px}
  .mslist{position:absolute;z-index:5;left:0;right:0;top:calc(100% + 3px);background:#161b2b;border:1px solid #2a3046;border-radius:8px;padding:4px;display:grid;box-shadow:0 10px 30px rgba(0,0,0,.4);max-height:220px;overflow:auto}
  .mslist button{background:none;border:0;color:#e8ebf5;text-align:left;padding:7px 9px;border-radius:6px;font-size:13px;cursor:pointer}.mslist button:hover{background:#222a40}
  .chip{border:1px solid #2a3046;background:#0b0e17;color:#cfd4e6;border-radius:999px;padding:4px 9px;font-size:12px;cursor:pointer}
  .chip.for{background:rgba(59,189,133,.18);border-color:#3bbd85;color:#7fe0b4}.chip.against{background:rgba(229,83,75,.16);border-color:#e5534b;color:#ff9a93}
  .hint{margin:0;color:#8d94ad;font-size:12px;line-height:1.4}
  .shots{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.shot{min-width:0}
  .shot{position:relative;display:grid;gap:5px}.shot img,.shot .ph{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:6px;border:1px solid #2a3046;background:#0b0e17}
  .shot.armed .ph,.shot.armed img{border-color:#7c8cff;box-shadow:0 0 0 2px rgba(124,140,255,.35)}
  .rm{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;cursor:pointer;line-height:1}
  .btn{border:1px solid #2a3046;background:#1b2133;color:#e8ebf5;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer}
  .btn.sm{padding:5px 8px;font-size:12px}.btn.pri{background:#7c8cff;border-color:#7c8cff;color:#0b0e17}.btn.ghost{background:none}.btn:disabled{opacity:.6;cursor:default}
  .foot{border-top:1px solid #2a3046;padding:10px 12px;display:grid;gap:8px}.fb{display:flex;gap:8px;align-items:center}.sp{flex:1}
  .lnk{background:none;border:0;color:#8d94ad;font-size:12px;cursor:pointer;text-decoration:underline}.lnk.inl{font-size:11px;padding:0;margin-left:6px;color:#9aa6ff;text-decoration:none}
  .msg{margin:0;font-size:12px;color:#c8cdf9;line-height:1.4}`; }
})();
