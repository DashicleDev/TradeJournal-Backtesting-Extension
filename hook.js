/*
 * hook.js — runs inside the TradingView page itself (the "MAIN world"), because only there can it
 * reach TradingView's own chart API (window.TradingViewApi). The panel (panel/*.js) runs in the
 * extension's isolated world and talks to this file with window.postMessage, using a `__tj` field:
 *
 *   panel → hook                       hook → panel
 *   ask      symbol, timeframe, date   info
 *   tf       switch timeframe          tfok
 *   pos      list Long/Short positions posinfo
 *   posshow  select + scroll to one    posshown
 *   sig      read a drawing's style    sigok
 *   fwd      skip in bar replay        fwdst (progress / result)
 *   fwdstop  stop skipping
 *   pause    pause replay autoplay
 *                                      snap  (a TradingView snapshot link was created)
 *                                      close (replay reached a daily / weekly close)
 *
 * It only reads the chart and drives TradingView's own controls; it never sends anything to the network.
 */
(() => {
  if (window.__tjHook) return;
  window.__tjHook = true;
  const ID = /^[A-Za-z0-9]{6,12}$/;
  const fromText = t => {
    if (typeof t !== "string") return null;
    const m = /tradingview\.com\/x\/([A-Za-z0-9]{6,12})/.exec(t);
    if (m) return m[1];
    const s = t.trim().replace(/^"|"$/g, "");
    return ID.test(s) ? s : null;
  };
  const fromJson = t => {
    try {
      const j = JSON.parse(t);
      for (const k of ["id", "uid", "snapshot_id", "url"]) {
        const v = j && j[k];
        const x = typeof v === "string" && (fromText(v) || (ID.test(v) ? v : null));
        if (x) return x;
      }
    } catch {}
    return null;
  };
  const found = (id, via) => {
    if (id) window.postMessage({ __tj: "snap", id, via }, location.origin);
  };
  const isSnap = u => /\/snapshot\/?(\?|$)/.test(String(u || ""));

  const of = window.fetch;
  window.fetch = async function (input, init) {
    const res = await of.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input && input.url;
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method === "POST" && isSnap(url))
        res
          .clone()
          .text()
          .then(t => found(fromJson(t) || fromText(t), "fetch"))
          .catch(() => {});
    } catch {}
    return res;
  };

  const oo = XMLHttpRequest.prototype.open,
    os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__tj = { m: String(m).toUpperCase(), u };
    return oo.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__tj && this.__tj.m === "POST" && isSnap(this.__tj.u)) {
      this.addEventListener("load", () => {
        try {
          const t = this.responseText;
          found(fromJson(t) || fromText(t), "xhr");
        } catch {}
      });
    }
    return os.apply(this, arguments);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    const ow = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = t => {
      const id = /tradingview\.com\/x\//.test(t || "") && fromText(t);
      if (id) found(id, "clipboard");
      return ow(t);
    };
  }
  document.addEventListener(
    "copy",
    () => {
      setTimeout(() => {
        const sel = String(document.getSelection() || ""),
          el = document.activeElement,
          v = (el && "value" in el && el.value) || "";
        const id = /tradingview\.com\/x\//.test(sel + v) && fromText(sel + " " + v);
        if (id) found(id, "copy");
      }, 0);
    },
    true
  );

  // The panel asks to switch the chart's timeframe (step by step logging).
  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.__tj !== "tf") return;
    const res = String(e.data.res || "");
    let ok = false;
    const norm = r =>
      String(r || "")
        .toUpperCase()
        .replace(/^1(?=[DWM]$)/, "");
    try {
      const api0 = window.TradingViewApi,
        ch0 = api0 && api0.activeChart && api0.activeChart();
      var prevRes = ch0 && ch0.resolution ? String(ch0.resolution()) : "";
      if (prevRes && norm(prevRes) === norm(res))
        return window.postMessage({ __tj: "tfok", ok: true, same: true, prev: prevRes }, location.origin);
    } catch {}
    try {
      const api = window.TradingViewApi,
        ch = api && (api.activeChart ? api.activeChart() : api.chart && api.chart());
      if (ch && ch.setResolution) {
        // when the new timeframe has loaded: if Auto (price scale) was off, click it on and off again
        // so the chart fits the screen. Auto stays off, as you had it.
        const W = ms => new Promise(r => setTimeout(r, ms)),
          frame = () => Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), W(150)]);
        const scale = () => {
          try {
            const p = ch.getPanes()[0];
            return p.getMainSourcePriceScale() || p.getRightPriceScales()[0];
          } catch {
            return null;
          }
        };
        const autoBtn = () => {
          const all = [...document.querySelectorAll('button[aria-label="Toggle auto scale"]')],
            vis = all.filter(b => b.offsetParent && b.getBoundingClientRect().width > 0);
          return vis.pop() || all.pop() || null;
        };
        const isAuto = () => {
          const b = autoBtn();
          if (b) return [...b.classList].some(c => /^priceScaleModeButton_activated/.test(c));
          const s = scale();
          return !!(s && s.isAutoScale && s.isAutoScale());
        };
        const flip = v => {
          const b = autoBtn();
          if (b) b.click();
          else {
            const s = scale();
            if (s && s.setAutoScale) s.setAutoScale(v);
          }
        };
        const wasAuto = isAuto();
        const fit = async () => {
          if (!e.data.fit || wasAuto) return;
          await W(800);
          await frame();
          if (isAuto()) return;
          flip(true);
          await W(600);
          await frame();
          if (isAuto()) flip(false);
        };
        let done = false;
        const go = () => {
          if (!done) {
            done = true;
            fit();
          }
        };
        Promise.resolve(ch.setResolution(res))
          .catch(() => {})
          .then(go);
        setTimeout(go, 2500);
        ok = true;
      }
    } catch {}
    if (!ok) {
      const alt = { "1W": ["1W", "W"], "1D": ["1D", "D"] }[res] || [res];
      const b = alt.map(v => document.querySelector(`#header-toolbar-intervals [data-value="${v}"]`)).find(Boolean);
      if (b) {
        b.click();
        ok = true;
      }
    }
    window.postMessage({ __tj: "tfok", ok, prev: typeof prevRes === "string" ? prevRes : "" }, location.origin);
  });

  // The panel asks for the Long/Short Position drawing: the selected one, otherwise the one
  // with the latest entry.
  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.__tj !== "pos") return;
    let pos = null,
      n = 0,
      apiOk = false,
      selId = "",
      all = [];
    try {
      const api = window.TradingViewApi,
        ch = api && (api.activeChart ? api.activeChart() : api.chart && api.chart());
      all = ((ch && ch.getAllShapes && ch.getAllShapes()) || []).filter(s => /^(long|short)_position$/.test(s.name));
      apiOk = !!(ch && ch.getAllShapes);
      n = all.length;
      let sel = [];
      try {
        sel = ch.selection().allSources() || [];
      } catch {}
      // the chart's tick size, to turn the box's stop / target (stored in ticks) into prices
      let tick = 0;
      try {
        const si = window.TradingViewApi._activeChartWidgetWV.value().chartModel().mainSeries().symbolInfo();
        tick = (si.minmov || 1) / si.pricescale;
      } catch {}
      const list = all.map(s => {
        let ts = [],
          entry = null,
          sl = null,
          tp = null;
        try {
          const sh = ch.getShapeById(s.id),
            pts = sh.getPoints() || [];
          ts = pts
            .map(p => p && p.time)
            .filter(Boolean)
            .sort((a, b) => a - b);
          entry = Number(pts[0] && pts[0].price);
          const pr = sh.getProperties() || {},
            long = s.name.startsWith("long");
          const sP = Number(pr.stopPrice ?? pr.stopLossPrice),
            tP = Number(pr.targetPrice ?? pr.profitPrice ?? pr.takeProfitPrice);
          if (isFinite(sP) && sP) sl = sP;
          else if (tick && isFinite(+pr.stopLevel)) sl = entry + (long ? -1 : 1) * pr.stopLevel * tick;
          if (isFinite(tP) && tP) tp = tP;
          else if (tick && isFinite(+pr.profitLevel)) tp = entry + (long ? 1 : -1) * pr.profitLevel * tick;
          if (!isFinite(entry)) entry = null;
        } catch {}
        return {
          id: s.id,
          dir: s.name.startsWith("long") ? "long" : "short",
          t0: ts[0] || null,
          t1: ts.length > 1 ? ts[ts.length - 1] : null,
          entry,
          sl,
          tp,
        };
      });
      list.sort((a, b) => (b.t0 || 0) - (a.t0 || 0));
      all.length = 0;
      all.push(...list);
      const s = list.find(p => sel.includes(p.id));
      selId = s ? s.id : "";
      pos = s || list[0] || null;
    } catch {}
    window.postMessage({ __tj: "posinfo", pos, n, api: apiOk, list: all, selId }, location.origin);
  });

  // Show a position: select it on the chart and scroll to it.
  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.__tj !== "posshow") return;
    let ok = false;
    try {
      const api = window.TradingViewApi,
        ch = api && (api.activeChart ? api.activeChart() : api.chart && api.chart());
      try {
        const s = ch.selection();
        if (s.clear) s.clear();
        if (s.add) {
          s.add(e.data.id);
          ok = true;
        } else if (s.set) {
          s.set([e.data.id]);
          ok = true;
        }
      } catch {}
      const { t0, t1 } = e.data;
      if (e.data.scroll && t0 && ch.setVisibleRange) {
        const end = t1 || t0,
          pad = Math.max(86400 * 3, (end - t0) * 0.6);
        ch.setVisibleRange({ from: t0 - pad, to: end + pad });
        ok = true;
      }
    } catch {}
    window.postMessage({ __tj: "posshown", ok }, location.origin);
  });

  // ---------- forward the replay until price hits a drawing ----------
  const chartApi = () => {
    const api = window.TradingViewApi;
    return api && (api.activeChart ? api.activeChart() : api.chart && api.chart());
  };
  const barsOf = () => {
    try {
      return window.TradingViewApi._activeChartWidgetWV.value().chartModel().mainSeries().bars();
    } catch {
      return null;
    }
  };
  const lastBar = () => {
    const b = barsOf(),
      l = b && b.last();
    return l && l.value ? l.value.slice() : null;
  };
  const prevBar = () => {
    try {
      const b = barsOf(),
        v = b.valueAt(b.lastIndex() - 1);
      return v ? v.slice() : null;
    } catch {
      return null;
    }
  };
  const LEVELS = /horizontal|horz|rectangle/i; // horizontal line, horizontal ray, rectangle
  // a drawing's style: its tool plus every colour / width / line style it has (a template always gives the same)
  const styleOf = (ch, s) => {
    let props = {};
    try {
      props = ch.getShapeById(s.id).getProperties() || {};
    } catch {}
    const out = {};
    const walk = (o, pre) => {
      for (const [k, v] of Object.entries(o || {})) {
        const key = pre ? pre + "." + k : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          if (pre.split(".").length < 3) walk(v, key);
        } else if (/(color|linewidth|linestyle|transparency)$/i.test(k) && !/text|font|label/i.test(key)) out[key] = v;
      }
    };
    walk(props, "");
    return (
      s.name +
      "|" +
      JSON.stringify(
        Object.keys(out)
          .sort()
          .map(k => [k, out[k]])
      )
    );
  };
  const rgb = v => {
    const s = String(v).trim().toLowerCase();
    let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)).join(",");
    m = /^#([0-9a-f]{3})$/.exec(s);
    if (m) return [...m[1]].map(c => parseInt(c + c, 16)).join(",");
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
    return m ? [m[1], m[2], m[3]].map(Number).join(",") : "";
  };
  const looseSig = sig => {
    const i = sig.indexOf("|");
    let kv = [];
    try {
      kv = JSON.parse(sig.slice(i + 1));
    } catch {}
    return (
      (/rect/i.test(sig.slice(0, i)) ? "rectangle" : "horizontal") +
      "|" +
      [
        ...new Set(
          kv
            .filter(([k]) => /color$/i.test(k))
            .map(([, v]) => rgb(v))
            .filter(Boolean)
        ),
      ]
        .sort()
        .join(" ")
    );
  };
  const textOf = (ch, s) => {
    try {
      const pr = ch.getShapeById(s.id).getProperties() || {};
      return String(pr.text || (pr.label && pr.label.text) || "").trim();
    } catch {
      return "";
    }
  };
  const normT = t =>
    String(t || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const swatch = sig => {
    const m = /"(#[0-9a-fA-F]{6,8}|rgba?\([^"]+\))"/.exec(sig);
    return m ? m[1] : "";
  };
  // price levels of a drawing; ptsInfo keeps what TradingView returned, for the message when it can't be read
  const rawPts = (ch, s) => {
    try {
      const sh = ch.getShapeById(s.id);
      return (sh.getPoints && sh.getPoints()) || [];
    } catch (e) {
      return "error: " + String((e && e.message) || e);
    }
  };
  const levelsOf = (ch, s) => {
    const pts = rawPts(ch, s);
    if (!Array.isArray(pts)) return null;
    let ps = pts.map(p => Number(p && (p.price ?? p.y ?? p.value))).filter(x => isFinite(x) && x !== 0);
    if (!ps.length) {
      try {
        const pr = ch.getShapeById(s.id).getProperties() || {};
        const v = Number(pr.price ?? (pr.points && pr.points[0] && pr.points[0].price));
        if (isFinite(v) && v) ps = [v];
      } catch {}
    }
    if (!ps.length) return null;
    const ts = pts.map(p => Number(p && p.time)).filter(x => isFinite(x) && x > 0);
    return { lo: Math.min(...ps), hi: Math.max(...ps), t0: ts.length ? Math.min(...ts) : -Infinity, name: s.name };
  };
  // next daily / weekly candle close (forex: 17:00 New York; weekly = Friday) strictly after time t (seconds)
  const nyParts = t => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(t * 1000));
    const g = k => (p.find(x => x.type === k) || {}).value;
    return { wd: g("weekday"), h: +g("hour"), m: +g("minute") };
  };
  const nextClose = (t, kind) => {
    let x = Math.floor(t / 3600) * 3600 + 3600;
    for (let i = 0; i < 24 * 9; i++, x += 3600) {
      const q = nyParts(x);
      if (q.h === 17 && q.m === 0 && (kind === "W" ? q.wd === "Fri" : !["Sat", "Sun"].includes(q.wd))) return x;
    }
    return 0;
  };
  // ---------- candle-close notices in bar replay ----------
  // Every 300 ms: if a new candle appeared (replay stepped forward) and it ends at 17:00 New York on a
  // weekday, tell the panel. Intraday charts report daily closes (and weekly on Friday); the daily chart
  // only Friday's, for the weekly close. Scrolling, switching timeframe or jumping in time reports nothing.
  let seen = { k: "", t: 0 };
  setInterval(async () => {
    try {
      if (!window.TradingViewApi) return;
      const rp = await (window.__tjRp || (window.__tjRp = window.TradingViewApi.replayApi()));
      if (!rp.isReplayStarted().value()) return void (seen.k = "");
      const ch = chartApi(),
        res = String(ch.resolution()),
        k = ch.symbol() + "|" + res,
        b = lastBar();
      if (!b) return;
      if (seen.k !== k || b[0] < seen.t) return void (seen = { k, t: b[0] });
      if (b[0] === seen.t) return;
      const jump = b[0] - seen.t > 4 * 86400;
      seen.t = b[0];
      if (jump) return;
      const min = /^\d+$/.test(res) ? +res : 0,
        daily = /^1?D$/i.test(res);
      if (min > 240 || (!min && !daily)) return;
      const end = min ? b[0] + min * 60 : nextClose(b[0], "D"),
        q = nyParts(end);
      if (q.h !== 17 || q.m !== 0 || q.wd === "Sat" || q.wd === "Sun") return;
      const w = q.wd === "Fri";
      if (daily && !w) return;
      window.postMessage({ __tj: "close", t: end, w, d: !!min }, location.origin);
    } catch {}
  }, 300);

  // pause autoplay (the panel asks this at a close when "Pause autoplay at the close" is on)
  window.addEventListener("message", async e => {
    if (e.source !== window || !e.data || e.data.__tj !== "pause") return;
    try {
      const rp = await (window.__tjRp || (window.__tjRp = window.TradingViewApi.replayApi()));
      if (rp.isAutoplayStarted().value()) rp.toggleAutoplay();
    } catch {}
  });

  let fwdStop = false,
    fwdBack = "";
  window.addEventListener("message", async e => {
    if (e.source !== window || !e.data) return;
    const say = o => window.postMessage({ __tj: "fwdst", ...(o.done ? { back: fwdBack } : {}), ...o }, location.origin);
    if (e.data.__tj === "fwdstop") {
      fwdStop = true;
      return;
    }
    if (e.data.__tj === "sig") {
      // style of the selected line / rectangle, to use as a trigger
      let r = { err: "Select a horizontal line or rectangle on the chart first." };
      try {
        const ch = chartApi(),
          sel = ch.selection().allSources() || [],
          s = ch.getAllShapes().find(x => sel.includes(x.id) && LEVELS.test(x.name));
        if (s) {
          const sig = styleOf(ch, s);
          r = { sig, name: s.name, color: swatch(sig), text: textOf(ch, s) };
        }
      } catch {}
      return window.postMessage({ __tj: "sigok", ...r }, location.origin);
    }
    if (e.data.__tj !== "fwd") return;
    fwdStop = false;
    fwdBack = "";
    // Auto (price scale) on while skipping, so the candles stay in view; back off afterwards if it was off
    const aBtn = () => {
      const all = [...document.querySelectorAll('button[aria-label="Toggle auto scale"]')],
        vis = all.filter(b => b.offsetParent);
      return vis.pop() || all.pop() || null;
    };
    const aOn = () => {
      const b = aBtn();
      return !!b && [...b.classList].some(c => /^priceScaleModeButton_activated/.test(c));
    };
    const autoWasOff = !!aBtn() && !aOn();
    if (autoWasOff) aBtn().click();
    try {
      const ch = chartApi(),
        rp = await (window.__tjRp || (window.__tjRp = window.TradingViewApi.replayApi()));
      if (!rp.isReplayStarted().value()) return say({ done: true, why: "Start bar replay first." });
      const specs = (e.data.specs || []).map(t => ({ ls: looseSig(t.sig), tx: normT(t.text), i: t.i })),
        max = e.data.max || 300;
      const sigs = specs; // (kept for the messages below)
      const specOf = s => {
        if (!specs.length) return { i: -1 };
        const ls = looseSig(styleOf(ch, s)),
          tx = normT(textOf(ch, s));
        return specs.find(t => t.ls === ls && t.tx === tx) || null;
      };
      const pick = () =>
        ch
          .getAllShapes()
          .filter(s => LEVELS.test(s.name))
          .map(s => {
            const sp = specOf(s);
            if (!sp) return null;
            const L = levelsOf(ch, s);
            if (L) {
              L.ti = sp.i;
              L.label = textOf(ch, s);
            }
            return L;
          })
          .filter(Boolean);
      const touches = (b, L) => b[3] <= L.hi + 1e-9 && b[2] >= L.lo - 1e-9; // bar = [time, open, high, low, close]
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      // 1. your matching drawings and their prices, read on the timeframe you are on
      const watch = pick();
      // no matching drawings: just run to the close
      const none = !watch.length,
        noneTxt = none ? " No matching drawings on the chart." : "";
      // 2. switch to 4H
      const norm = r =>
          String(r || "")
            .toUpperCase()
            .replace(/^1(?=[DWM]$)/, ""),
        want = norm(e.data.res);
      let prev = "";
      try {
        prev = String(ch.resolution());
      } catch {}
      const switched = !!want && norm(prev) !== want;
      fwdBack = switched ? prev : "";
      // where the replay is now, before anything moves: the end of the last candle on an intraday chart
      // (on a daily/weekly chart we can't tell, and assume you're at a close)
      const pre = lastBar(),
        preMin = /^\d+$/.test(prev) ? +prev : 0,
        preEnd = pre && preMin ? pre[0] + preMin * 60 : 0;
      if (switched) {
        try {
          ch.setResolution(e.data.res);
        } catch {}
      }
      // 3. first candle right away, not checked
      try {
        rp.doStep();
      } catch {}
      // loaded = the chart really shows 4H candles: TradingView reports the new timeframe before the old candles are gone,
      // so look for two neighbouring candles exactly 4 hours apart
      const step4h = () => {
        try {
          const b = barsOf(),
            last = b.lastIndex();
          let n = 0;
          for (let k = 0; k < 8 && last - k - 1 >= 0; k++) {
            const x = b.valueAt(last - k),
              y = b.valueAt(last - k - 1);
            if (x && y && x[0] - y[0] === 14400) n++;
          }
          return n >= 3;
        } catch {}
        return false;
      };
      const loaded = () => {
        try {
          const b = barsOf();
          return (
            (!want || norm(ch.resolution()) === want) && b && !!lastBar() && (!switched || want !== "240" || step4h())
          );
        } catch {
          return false;
        }
      };
      for (let i = 0; i < 300 && !loaded(); i++) await sleep(30);
      if (!loaded()) return say({ done: true, why: "The chart is still loading. Try again in a moment." });
      await sleep(40);
      // wait for the first candle to really show (the chart can still show the previous last candle for a moment)
      for (let i = 0; i < 50 && preEnd && (lastBar() || [0])[0] < preEnd; i++) await sleep(20);
      let bar = lastBar();
      say({ n: 1 });
      // the close to run to: the first one after where the replay was. If the first candle is the last one before
      // that close, it was either just drawn (then we're done after it) or the step didn't get past a close we were
      // already at (then run to the next one).
      const start = bar[0],
        maxSec = e.data.maxSec || 0;
      let until = e.data.until ? nextClose(bar[0], e.data.until) : 0;
      if (until && bar[0] + 14400 >= until) {
        const fresh = preEnd ? preEnd < until : false;
        if (!fresh) until = nextClose(bar[0] + 14400, e.data.until);
        else {
          const h1 = watch.find(L => (!isFinite(L.t0) || L.t0 <= bar[0]) && touches(bar, L));
          if (h1)
            return say({
              done: true,
              hit: true,
              n: 1,
              ti: h1.ti,
              why: `Price hit the ${/rect/i.test(h1.name) ? "rectangle" : "line"} after 1 candle.`,
            });
          return say({
            done: true,
            why: `No hit before the ${e.data.until === "W" ? "weekly" : "daily"} close (1 candle).` + noneTxt,
          });
        }
      }
      for (let n = 2; n <= max; n++) {
        if (fwdStop) return say({ done: true, why: `Stopped after ${n - 1} candles.` });
        const t = bar[0];
        // step until a new candle starts. A step can also just extend the current candle (the replay can step in
        // smaller pieces, e.g. at the start of a week); that counts as progress and is checked for a hit right away.
        let nb = null,
          idle = 0;
        for (let k = 0; k < 40 && !nb && idle < 4; k++) {
          const before = (lastBar() || []).join();
          try {
            rp.doStep();
          } catch {}
          let upd = null;
          for (let i = 0; i < 100; i++) {
            await sleep(20);
            const b = lastBar();
            if (b && b.join() !== before) {
              upd = b;
              break;
            }
          }
          if (!upd) {
            idle++;
            continue;
          }
          idle = 0;
          if (upd[0] !== t) {
            nb = upd;
            break;
          }
          const sub = watch.find(L => (!isFinite(L.t0) || L.t0 <= upd[0]) && touches(upd, L));
          if (sub)
            return say({
              done: true,
              hit: true,
              n,
              ti: sub.ti,
              why: `Price hit the ${/rect/i.test(sub.name) ? "rectangle" : "line"} after ${n} candle${n === 1 ? "" : "s"}.`,
            });
        }
        if (!nb) return say({ done: true, why: `No new candle came in (after ${n - 1}). Is the replay at the end?` });
        bar = nb;
        say({ n });
        if (maxSec && bar[0] - start > maxSec)
          return say({ done: true, why: `No hit within ${e.data.span || "the limit"}.` });
        // the last few candles: a candle can fill in after we've already stepped past it
        const cands = (() => {
          const out = [];
          try {
            const b = barsOf(),
              last = b.lastIndex();
            for (let k = 0; k < 5 && last - k >= 0; k++) {
              const v = b.valueAt(last - k);
              if (v && v[0] > start) out.push(v);
            }
          } catch {}
          if (!out.length && bar) out.push(bar);
          return out;
        })();
        const hit = watch.find(L => cands.some(b => (!isFinite(L.t0) || L.t0 <= b[0]) && touches(b, L)));
        if (hit)
          return say({
            done: true,
            hit: true,
            n,
            ti: (hit || {}).ti,
            why: `Price hit the ${/rect/i.test(hit.name) ? "rectangle" : "line"} after ${n} candle${n === 1 ? "" : "s"}.`,
          });
        if (until && bar[0] + 14400 >= until) {
          // last candle before the close: let it fill in, then check it properly
          for (let i = 0; i < 100 && bar[2] === bar[3]; i++) {
            await sleep(20);
            const b = lastBar();
            if (b && b[0] === bar[0]) bar = b;
          }
          await sleep(120);
          {
            const b = lastBar();
            if (b && b[0] === bar[0]) bar = b;
          }
          const h2 = watch.find(L => (!isFinite(L.t0) || L.t0 <= bar[0]) && touches(bar, L));
          if (h2)
            return say({
              done: true,
              hit: true,
              n,
              ti: h2.ti,
              why: `Price hit the ${/rect/i.test(h2.name) ? "rectangle" : "line"} after ${n} candle${n === 1 ? "" : "s"}.`,
            });
        }
        if (until && bar[0] + 14400 >= until)
          return say({
            done: true,
            why:
              `No hit before the ${e.data.until === "W" ? "weekly" : "daily"} close (${n} candle${n === 1 ? "" : "s"}).` +
              noneTxt,
          });
        if (maxSec && bar[0] - start >= maxSec)
          return say({ done: true, why: `No hit within ${e.data.span || "the limit"} (${n} candles).` });
      }
      say({ done: true, why: `No hit in ${max} candles.` });
    } catch (err) {
      say({ done: true, why: "Couldn't forward the replay: " + String((err && err.message) || err) });
    } finally {
      if (autoWasOff && aOn()) aBtn().click();
    }
  });

  // The panel asks for the current symbol / interval / replay date; we read what we can.
  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.__tj !== "ask") return;
    const out = {};
    try {
      const qs = new URLSearchParams(location.search);
      let sym = "";
      try {
        const c = window.TradingViewApi.activeChart();
        sym = c.symbol();
      } catch {}
      sym = sym || qs.get("symbol") || document.title.split(" ")[0] || "";
      out.symbol = sym;
      const iv = document.querySelector(
        '#header-toolbar-intervals [aria-checked="true"], #header-toolbar-intervals button[aria-pressed="true"], [data-name="intervals"] [class*="isActive"], #header-toolbar-intervals button'
      );
      out.interval = (iv && (iv.getAttribute("data-value") || iv.textContent || "").trim()) || qs.get("interval") || "";
      const rp = [...document.querySelectorAll('[class*="replay"] *, [data-name*="replay"] *')]
        .map(n => (n.childElementCount ? "" : (n.textContent || "").trim()))
        .find(t => /\b\d{1,2}\s\w{3}\s'?\d{2,4}\b|\d{4}-\d{2}-\d{2}/.test(t));
      out.replay = rp || "";
    } catch {}
    window.postMessage({ __tj: "info", ...out }, location.origin);
  });
})();
