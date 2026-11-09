/*
 * panel/position.js — Reads the Long/Short Position drawing (entry, stop, target, dates) and the
 * "skip to drawing" bar-replay feature.
 */
/* ---------- long / short position tool ---------- */
// hook.js reads the selected Long/Short Position drawing, otherwise the one with the latest entry.
let posWhy = "",
  posList = [],
  shownId = "";
const getPos = () =>
  new Promise(done => {
    const f = e => {
      if (e.source === window && e.data && e.data.__tj === "posinfo") {
        removeEventListener("message", f);
        posList = e.data.list || [];
        const userSel = e.data.selId && e.data.selId !== shownId,
          chosen = !userSel && D.posPick && posList.find(x => x.id === D.posPick);
        if (chosen) e.data.pos = chosen;
        if (userSel) {
          D.posPick = "";
          shownId = "";
        }
        posWhy = e.data.pos
          ? ""
          : !e.data.api
            ? "Couldn't read the drawings on this chart."
            : "No Long/Short position on the chart yet.";
        done(e.data.pos || null);
      }
    };
    addEventListener("message", f);
    window.postMessage({ __tj: "pos" }, location.origin);
    setTimeout(() => {
      removeEventListener("message", f);
      posWhy = "Couldn't read the drawings on this chart.";
      done(null);
    }, 800);
  });
const day = t => (t ? new Date(t * 1000).toISOString().slice(0, 10) : "");
const posLab = p => {
  const d = t =>
    t
      ? new Date(t * 1000).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        })
      : "?";
  return `${p.dir === "long" ? "↑ Long" : "↓ Short"} · ${d(p.t0)}${p.t1 ? " → " + d(p.t1) : ""}`;
};
const showPos = (p, scroll = true) => {
  if (p) shownId = p.id;
  if (p) window.postMessage({ __tj: "posshow", id: p.id, t0: p.t0, t1: p.t1, scroll }, location.origin);
};
const curPos = () => posList.find(x => x.id === D.posId);
const posLine = () => {
  const p = curPos();
  return p
    ? `<div class="posl"><span>Position</span><b>${esc(posLab(p))}</b><button type="button" class="lnk inl" data-act="posshow" title="Highlight it on the chart">Show</button></div>`
    : "";
};
const posSel = () =>
  posList.length
    ? f(
        `Position <button type="button" class="lnk inl" data-act="posrefresh" title="Look for positions on the chart again">⟳</button>`,
        `<select data-k="posPick">${posList.map(p => `<option value="${esc(p.id)}" ${p.id === D.posId ? "selected" : ""}>${esc(posLab(p))}</option>`).join("")}</select>`
      )
    : "";
// fills empty fields only, unless "force" lists the fields to overwrite
async function fromPos(force = []) {
  const p = await getPos();
  if (!p) return null;
  D.posId = p.id;
  showPos(p, false);
  const set = (k, v) => {
    if (v && (force.includes(k) || !D[k])) D[k] = v;
  };
  set("dir", p.dir);
  set("date", day(p.t0));
  set("closeDate", day(p.t1));
  if (INV()) {
    if (p.entry) set("sEntry", String(p.entry));
    if (p.sl) set("sStop", String(+p.sl.toFixed(4)));
    keep();
    return p;
  }
  // planned entry, stop and target in pips (0.0001; JPY 0.01; gold 0.1)
  if (p.entry) {
    const pr = pairOf(D.pair),
      pip = /JPY/.test(pr) ? 0.01 : /XAU/.test(pr) ? 0.1 : /XAG/.test(pr) ? 0.01 : 0.0001,
      r1 = x => String(Math.round(x * 10) / 10);
    const dec = String(p.entry).split(".")[1];
    set("planEntry", String(+p.entry.toFixed(Math.min(6, Math.max(2, dec ? dec.length : 5)))));
    if (p.sl) set("slPips", r1(Math.abs(p.entry - p.sl) / pip));
    if (p.tp) set("tpPips", r1(Math.abs(p.tp - p.entry) / pip));
  }
  keep();
  return p;
}
const replayDate = async () => {
  await ask();
  return dateOf(info.replay);
};

/* ---------- forward to drawing ---------- */
addEventListener("message", e => {
  if (e.source !== window || !e.data) return;
  if (e.data.__tj === "fwdst") {
    if (e.data.done) {
      fwd = null;
      msg = e.data.why || "";
      const tl = e.data.hit && e.data.ti != null && e.data.ti >= 0 && (trig[e.data.ti] || {}).label;
      if (tl) msg = msg.replace(/the (rectangle|line)/, tl);
      if (e.data.back && !e.data.hit) setTf(e.data.back);
    } else fwd = { n: e.data.n };
    render();
  }
  if (e.data.__tj === "sigok") {
    if (e.data.err) msg = e.data.err;
    else if (trig.some(t => t.sig === e.data.sig)) msg = "That style is already in the list.";
    else {
      trig = [
        ...trig,
        {
          sig: e.data.sig,
          name: e.data.name,
          color: e.data.color,
          label: e.data.text || "",
          text: e.data.text || "",
        },
      ];
      saveSet({ trig });
      msg = "";
    }
    render();
  }
});
const onSigs = () =>
  trig
    .map((t, i) => ({ sig: t.sig, text: t.text != null ? t.text : t.label || "", i, on: t.on !== false }))
    .filter(t => t.on);
const fwdBtn = () =>
  fwd
    ? `<div class="fwd"><span>${FF}Forwarding… ${fwd.n || 0} candle${fwd.n === 1 ? "" : "s"}</span><button type="button" class="btn sm" data-act="fwdstop">■ Stop</button></div>`
    : `<button type="button" class="btn sm fwdgo" data-act="fwd">${FF}Forward to drawing</button>`;
