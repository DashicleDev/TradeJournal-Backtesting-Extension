// Runs inside the TradingView page (MAIN world). It only watches for TradingView's
// own snapshot links being created or copied, and hands them to the panel.
// It never sends anything anywhere else.
(() => {
  if (window.__tjHook) return; window.__tjHook = true;
  const ID = /^[A-Za-z0-9]{6,12}$/;
  const fromText = (t) => {
    if (typeof t !== "string") return null;
    const m = /tradingview\.com\/x\/([A-Za-z0-9]{6,12})/.exec(t);
    if (m) return m[1];
    const s = t.trim().replace(/^"|"$/g, "");
    return ID.test(s) ? s : null;
  };
  const fromJson = (t) => {
    try { const j = JSON.parse(t); for (const k of ["id", "uid", "snapshot_id", "url"]) { const v = j && j[k]; const x = typeof v === "string" && (fromText(v) || (ID.test(v) ? v : null)); if (x) return x; } } catch {}
    return null;
  };
  const found = (id, via) => { if (id) window.postMessage({ __tj: "snap", id, via }, location.origin); };
  const isSnap = (u) => /\/snapshot\/?(\?|$)/.test(String(u || ""));

  const of = window.fetch;
  window.fetch = async function (input, init) {
    const res = await of.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input && input.url;
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method === "POST" && isSnap(url)) res.clone().text().then((t) => found(fromJson(t) || fromText(t), "fetch")).catch(() => {});
    } catch {}
    return res;
  };

  const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__tj = { m: String(m).toUpperCase(), u }; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (this.__tj && this.__tj.m === "POST" && isSnap(this.__tj.u)) {
      this.addEventListener("load", () => { try { const t = this.responseText; found(fromJson(t) || fromText(t), "xhr"); } catch {} });
    }
    return os.apply(this, arguments);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    const ow = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (t) => { const id = /tradingview\.com\/x\//.test(t || "") && fromText(t); if (id) found(id, "clipboard"); return ow(t); };
  }
  document.addEventListener("copy", () => {
    setTimeout(() => { const sel = String(document.getSelection() || ""), el = document.activeElement, v = (el && "value" in el && el.value) || ""; const id = /tradingview\.com\/x\//.test(sel + v) && fromText(sel + " " + v); if (id) found(id, "copy"); }, 0);
  }, true);

  // The panel asks to switch the chart's timeframe (step by step logging).
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.__tj !== "tf") return;
    const res = String(e.data.res || ""); let ok = false;
    const norm = (r) => String(r || "").toUpperCase().replace(/^1(?=[DWM]$)/, "");
    try { const api0 = window.TradingViewApi, ch0 = api0 && api0.activeChart && api0.activeChart(); var prevRes = ch0 && ch0.resolution ? String(ch0.resolution()) : ""; if (prevRes && norm(prevRes) === norm(res)) return window.postMessage({ __tj: "tfok", ok: true, same: true, prev: prevRes }, location.origin); } catch {}
    try { const api = window.TradingViewApi, ch = api && (api.activeChart ? api.activeChart() : api.chart && api.chart()); if (ch && ch.setResolution) {
        // when the new timeframe has loaded: if Auto (price scale) was off, click it on and off again
        // so the chart fits the screen. Auto stays off, as you had it.
        const W = (ms) => new Promise((r) => setTimeout(r, ms)), frame = () => Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), W(150)]);
        const scale = () => { try { const p = ch.getPanes()[0]; return p.getMainSourcePriceScale() || p.getRightPriceScales()[0]; } catch { return null; } };
        const autoBtn = () => { const all = [...document.querySelectorAll('button[aria-label="Toggle auto scale"]')], vis = all.filter((b) => b.offsetParent && b.getBoundingClientRect().width > 0);
          return vis.pop() || all.pop() || null; };
        const isAuto = () => { const b = autoBtn(); if (b) return [...b.classList].some((c) => /^priceScaleModeButton_activated/.test(c)); const s = scale(); return !!(s && s.isAutoScale && s.isAutoScale()); };
        const flip = (v) => { const b = autoBtn(); if (b) b.click(); else { const s = scale(); if (s && s.setAutoScale) s.setAutoScale(v); } };
        const wasAuto = isAuto();
        const fit = async () => { if (!e.data.fit || wasAuto) return; await W(800); await frame(); if (isAuto()) return;
          flip(true); await W(600); await frame(); if (isAuto()) flip(false); };
        let done = false; const go = () => { if (!done) { done = true; fit(); } };
        Promise.resolve(ch.setResolution(res)).catch(() => {}).then(go); setTimeout(go, 2500);
        ok = true; } } catch {}
    if (!ok) { const alt = { "1W": ["1W", "W"], "1D": ["1D", "D"] }[res] || [res]; const b = alt.map((v) => document.querySelector(`#header-toolbar-intervals [data-value="${v}"]`)).find(Boolean); if (b) { b.click(); ok = true; } }
    window.postMessage({ __tj: "tfok", ok, prev: typeof prevRes === "string" ? prevRes : "" }, location.origin);
  });

  // The panel asks for the Long/Short Position drawing: the selected one, otherwise the one
  // with the latest entry.
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.__tj !== "pos") return;
    let pos = null, n = 0, apiOk = false, selId = "", all = [];
    try {
      const api = window.TradingViewApi, ch = api && (api.activeChart ? api.activeChart() : api.chart && api.chart());
      all = ((ch && ch.getAllShapes && ch.getAllShapes()) || []).filter((s) => /^(long|short)_position$/.test(s.name));
      apiOk = !!(ch && ch.getAllShapes); n = all.length;
      let sel = []; try { sel = ch.selection().allSources() || []; } catch {}
      const list = all.map((s) => { let ts = []; try { ts = (ch.getShapeById(s.id).getPoints() || []).map((p) => p && p.time).filter(Boolean).sort((a, b) => a - b); } catch {}
        return { id: s.id, dir: s.name.startsWith("long") ? "long" : "short", t0: ts[0] || null, t1: ts.length > 1 ? ts[ts.length - 1] : null }; });
      list.sort((a, b) => (b.t0 || 0) - (a.t0 || 0)); all.length = 0; all.push(...list);
      const s = list.find((p) => sel.includes(p.id)); selId = s ? s.id : "";
      pos = s || list[0] || null;
    } catch {}
    window.postMessage({ __tj: "posinfo", pos, n, api: apiOk, list: all, selId }, location.origin);
  });

  // Show a position: select it on the chart and scroll to it.
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.__tj !== "posshow") return;
    let ok = false;
    try {
      const api = window.TradingViewApi, ch = api && (api.activeChart ? api.activeChart() : api.chart && api.chart());
      try { const s = ch.selection(); if (s.clear) s.clear(); if (s.add) { s.add(e.data.id); ok = true; } else if (s.set) { s.set([e.data.id]); ok = true; } } catch {}
      const { t0, t1 } = e.data; if (e.data.scroll && t0 && ch.setVisibleRange) { const end = t1 || t0, pad = Math.max(86400 * 3, (end - t0) * 0.6); ch.setVisibleRange({ from: t0 - pad, to: end + pad }); ok = true; }
    } catch {}
    window.postMessage({ __tj: "posshown", ok }, location.origin);
  });

  // ---------- forward the replay until price hits a drawing ----------
  const chartApi = () => { const api = window.TradingViewApi; return api && (api.activeChart ? api.activeChart() : api.chart && api.chart()); };
  const barsOf = () => { try { return window.TradingViewApi._activeChartWidgetWV.value().chartModel().mainSeries().bars(); } catch { return null; } };
  const lastBar = () => { const b = barsOf(), l = b && b.last(); return l && l.value ? l.value.slice() : null; };
  const prevBar = () => { try { const b = barsOf(), v = b.valueAt(b.lastIndex() - 1); return v ? v.slice() : null; } catch { return null; } };
  const LEVELS = /^(horizontal_line|horizontal_ray|rectangle)$/;
  // a drawing's style: its tool plus every colour / width / line style it has (a template always gives the same)
  const styleOf = (ch, s) => {
    let props = {}; try { props = ch.getShapeById(s.id).getProperties() || {}; } catch {}
    const out = {}; const walk = (o, pre) => { for (const [k, v] of Object.entries(o || {})) { const key = pre ? pre + "." + k : k;
      if (v && typeof v === "object" && !Array.isArray(v)) { if (pre.split(".").length < 3) walk(v, key); }
      else if (/(color|linewidth|linestyle|transparency)$/i.test(k) && !/text|font|label/i.test(key)) out[key] = v; } };
    walk(props, ""); return s.name + "|" + JSON.stringify(Object.keys(out).sort().map((k) => [k, out[k]]));
  };
  const swatch = (sig) => { const m = /"(#[0-9a-fA-F]{6,8}|rgba?\([^"]+\))"/.exec(sig); return m ? m[1] : ""; };
  const levelsOf = (ch, s) => { try { const pts = ch.getShapeById(s.id).getPoints() || []; const ps = pts.map((p) => p.price).filter((x) => typeof x === "number");
    if (!ps.length) return null; return { lo: Math.min(...ps), hi: Math.max(...ps), t0: Math.min(...pts.map((p) => p.time || Infinity)), name: s.name }; } catch { return null; } };
  // next daily / weekly candle close (forex: 17:00 New York; weekly = Friday) strictly after time t (seconds)
  const nyParts = (t) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(t * 1000)); const g = (k) => (p.find((x) => x.type === k) || {}).value; return { wd: g("weekday"), h: +g("hour"), m: +g("minute") }; };
  const nextClose = (t, kind) => { let x = Math.floor(t / 3600) * 3600 + 3600; for (let i = 0; i < 24 * 9; i++, x += 3600) { const q = nyParts(x); if (q.h === 17 && q.m === 0 && (kind === "W" ? q.wd === "Fri" : !["Sat", "Sun"].includes(q.wd))) return x; } return 0; };
  let fwdStop = false;
  window.addEventListener("message", async (e) => {
    if (e.source !== window || !e.data) return;
    const say = (o) => window.postMessage({ __tj: "fwdst", ...o }, location.origin);
    if (e.data.__tj === "fwdstop") { fwdStop = true; return; }
    if (e.data.__tj === "sig") { // style of the selected line / rectangle, to use as a trigger
      let r = { err: "Select a horizontal line or rectangle on the chart first." };
      try { const ch = chartApi(), sel = ch.selection().allSources() || [], s = ch.getAllShapes().find((x) => sel.includes(x.id) && LEVELS.test(x.name)); if (s) { const sig = styleOf(ch, s); r = { sig, name: s.name, color: swatch(sig) }; } } catch {}
      return window.postMessage({ __tj: "sigok", ...r }, location.origin);
    }
    if (e.data.__tj !== "fwd") return;
    fwdStop = false;
    try {
      const ch = chartApi(), rp = await window.TradingViewApi.replayApi();
      if (!rp.isReplayStarted().value()) return say({ done: true, why: "Start bar replay first." });
      const sigs = e.data.sigs || [], max = e.data.max || 300;
      const pick = () => ch.getAllShapes().filter((s) => LEVELS.test(s.name) && (!sigs.length || sigs.includes(styleOf(ch, s)))).map((s) => levelsOf(ch, s)).filter(Boolean);
      const touches = (b, L) => b[3] <= L.hi + 1e-9 && b[2] >= L.lo - 1e-9; // bar = [time, open, high, low, close]
      let bar = lastBar(); if (!bar) return say({ done: true, why: "Couldn't read the candles." });
      // drawings the current candle already touches don't count
      let watch = pick().filter((L) => !touches(bar, L));
      if (!watch.length) return say({ done: true, why: (sigs.length ? "No lines or rectangles in your trigger styles ahead of price." : "No horizontal lines or rectangles ahead of price.") });
      const start = bar[0], maxSec = e.data.maxSec || 0, until = e.data.until ? nextClose(bar[0] + 14400, e.data.until) : 0;
      for (let n = 1; n <= max; n++) {
        if (fwdStop) return say({ done: true, why: `Stopped after ${n - 1} candles.` });
        const t = bar[0], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        try { rp.doStep(); } catch {}
        // wait for the next candle; over a weekend gap TradingView can take a while, so step again once if nothing comes
        let nb = null; for (let i = 0; i < 400; i++) { const b = lastBar(); if (b && b[0] !== t) { nb = b; break; } if (i === 150) { try { rp.doStep(); } catch {} } await sleep(20); }
        if (!nb) return say({ done: true, why: `No new candle came in (after ${n - 1}). Is the replay at the end?` });
        bar = nb; say({ n });
        if (maxSec && bar[0] - start > maxSec) return say({ done: true, why: `No hit within ${e.data.span || "the limit"}.` });
        // check the new candle and the one before it (with its final high / low)
        const pb = prevBar(), cands = [pb, bar].filter((b) => b && b[0] > start);
        const hit = watch.find((L) => cands.some((b) => (!isFinite(L.t0) || L.t0 <= b[0]) && touches(b, L)));
        if (hit) return say({ done: true, hit: true, n, why: `Price hit the ${hit.name === "rectangle" ? "rectangle" : "line"} after ${n} candle${n === 1 ? "" : "s"}.` });
        if (until && bar[0] + 14400 >= until) {
          // last candle before the close: let it fill in, then check it properly
          for (let i = 0; i < 100 && bar[2] === bar[3]; i++) { await sleep(20); const b = lastBar(); if (b && b[0] === bar[0]) bar = b; }
          await sleep(120); { const b = lastBar(); if (b && b[0] === bar[0]) bar = b; }
          const h2 = watch.find((L) => (!isFinite(L.t0) || L.t0 <= bar[0]) && touches(bar, L));
          if (h2) return say({ done: true, hit: true, n, why: `Price hit the ${h2.name === "rectangle" ? "rectangle" : "line"} after ${n} candle${n === 1 ? "" : "s"}.` }); }
        if (until && bar[0] + 14400 >= until) return say({ done: true, why: `No hit before the ${e.data.until === "W" ? "weekly" : "daily"} close (${n} candle${n === 1 ? "" : "s"}).` });
        if (maxSec && bar[0] - start >= maxSec) return say({ done: true, why: `No hit within ${e.data.span || "the limit"} (${n} candles).` });
      }
      say({ done: true, why: `No hit in ${max} candles.` });
    } catch (err) { say({ done: true, why: "Couldn't forward the replay: " + String((err && err.message) || err) }); }
  });

  // The panel asks for the current symbol / interval / replay date; we read what we can.
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.__tj !== "ask") return;
    const out = {};
    try {
      const qs = new URLSearchParams(location.search);
      const sym = qs.get("symbol") || (document.title.split(" ")[0] || "");
      out.symbol = sym;
      const iv = document.querySelector('#header-toolbar-intervals [aria-checked="true"], #header-toolbar-intervals button[aria-pressed="true"], [data-name="intervals"] [class*="isActive"], #header-toolbar-intervals button');
      out.interval = (iv && (iv.getAttribute("data-value") || iv.textContent || "").trim()) || qs.get("interval") || "";
      const rp = [...document.querySelectorAll('[class*="replay"] *, [data-name*="replay"] *')].map((n) => n.childElementCount ? "" : (n.textContent || "").trim()).find((t) => /\b\d{1,2}\s\w{3}\s'?\d{2,4}\b|\d{4}-\d{2}-\d{2}/.test(t));
      out.replay = rp || "";
    } catch {}
    window.postMessage({ __tj: "info", ...out }, location.origin);
  });
})();
