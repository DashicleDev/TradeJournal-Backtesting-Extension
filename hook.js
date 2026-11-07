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
    try { const api = window.TradingViewApi, ch = api && (api.activeChart ? api.activeChart() : api.chart && api.chart()); if (ch && ch.setResolution) {
        // when the new timeframe has loaded: if the price scale's Auto was off, turn it on and off
        // again so the chart fits the screen (Auto stays off, as you had it)
        let fixed = false; const fix = () => { if (fixed) return; fixed = true; try {
          const pane = ch.getPanes && ch.getPanes()[0], sc = pane && ((pane.getMainSourcePriceScale && pane.getMainSourcePriceScale()) || (pane.getRightPriceScales && pane.getRightPriceScales()[0]));
          if (sc && sc.isAutoScale && sc.setAutoScale && !sc.isAutoScale()) { sc.setAutoScale(true); setTimeout(() => { try { sc.setAutoScale(false); } catch {} }, 60); }
        } catch {} };
        ch.setResolution(res, () => setTimeout(fix, 150)); setTimeout(fix, 1200); ok = true; } } catch {}
    if (!ok) { const alt = { "1W": ["1W", "W"], "1D": ["1D", "D"] }[res] || [res]; const b = alt.map((v) => document.querySelector(`#header-toolbar-intervals [data-value="${v}"]`)).find(Boolean); if (b) { b.click(); ok = true; } }
    window.postMessage({ __tj: "tfok", ok }, location.origin);
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
