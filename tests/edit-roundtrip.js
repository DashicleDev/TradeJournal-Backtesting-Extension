/*
 * edit-roundtrip.js — A trade opened for editing (journal Replay link → panel) and saved again unchanged
 * must come back exactly as it was: same id, same fields, and what only the journal has (stored
 * screenshots, reviews, …) kept. Guards fromDoc() and the edit branch of save() in panel/steps.js.
 *   node tests/edit-roundtrip.js
 */
const fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  assert = require("assert");

const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let saved = null;
const C = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  location: { origin: "x" },
  chrome: {
    runtime: { lastError: null, sendMessage: (m, cb) => ((saved = m.doc), cb({ ok: true, v: true })) },
    storage: { local: { set: async () => {}, get: async () => ({}) } },
  },
});
vm.runInContext(
  read("plan-default.js") +
    read("panel/core.js") +
    read("panel/steps.js") +
    `;const pairOf = s => String(s || "").split(":").pop().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
     function render() {} function toggle() {} projects = [];
     this.api = { blank, toDoc, fromDoc, save, set: o => { if ("D" in o) D = o.D; if ("tmode" in o) tmode = o.tmode; if ("edit" in o) editDoc = o.edit; if ("logging" in o) logging = o.logging; }, get editDoc() { return editDoc } };`,
  C
);
const api = C.api;

// random drafts with values the panel can produce (same trades every run)
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647,
  pick = a => a[Math.floor(rnd() * a.length)],
  maybe = (p, v) => (rnd() < p ? v : "");
const ENTRIES = ["", "Reversal", "Continuation", "Deceleration", "Engulfing Candle", "Pattern in Pattern"];
const CONCEPTS = ["", "Weekly - 4H", "Continuation", "Reversal", "Pattern in Pattern", "Daily Retrace"];
function draft() {
  const w = {};
  for (const k of ["fibc", "fiba", "ic", "whl", "sd", "pz", "lcc", "ec"]) if (rnd() < 0.3) w[k] = pick(["for", "against"]);
  const concept = pick(CONCEPTS),
    outcome = pick(["", "win", "loss", "be", "open"]);
  return {
    ...api.blank(),
    project: maybe(0.5, "p1"),
    account: maybe(0.5, "100K challenge"),
    pair: pick(["EURUSD", "GBPJPY", "XAUUSD"]),
    date: "2026-08-03",
    closeDate: maybe(0.7, "2026-08-06"),
    dir: pick(["long", "short"]),
    fase: pick(["", "1", "2", "3", "4"]),
    wStruct: pick(["", "inner", "outer"]),
    trend: pick(["", "bull", "bear", "range"]),
    ms: pick(["", "for", "against"]),
    wPat: pick(["", "Continuation", "Reversal"]),
    wPatSub: maybe(0.5, "100 level"),
    w,
    concept,
    setup: concept === "Weekly - 4H" ? "w4" : concept ? "wd4" : "",
    sub: concept && concept !== "Weekly - 4H" ? maybe(0.5, "First Structure") : "",
    dMs: pick(["", "for", "against"]),
    dPros: ["fc", "dcc", "sd"].filter(() => rnd() < 0.4),
    entry4h: pick(ENTRIES),
    hMs: pick(["", "for", "against"]),
    struct: pick(["", "bos", "som"]),
    room: rnd() < 0.5,
    scaleIn: rnd() < 0.3,
    channel: rnd() < 0.3,
    ecTf: pick(["", "1h", "2h"]),
    links: rnd() < 0.7 ? { weekly: "https://www.tradingview.com/x/abcdefgh/" } : {},
    outcome,
    r: outcome === "open" || !outcome ? "" : pick(["1.5", "-1", "0", "2.17"]),
    maxR: maybe(0.4, "2.5"),
    exit: maybe(0.4, "Stop loss"),
    evaluation: pick(["", "plan", "off"]),
    notes: maybe(0.4, "Late entry"),
    planEntry: maybe(0.5, "1.0832"),
    slPips: maybe(0.5, "25"),
    tpPips: maybe(0.5, "50"),
    missed: rnd() < 0.15,
  };
}

(async () => {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const tmode = pick(["live", "backtest"]);
    api.set({ D: draft(), tmode, edit: null });
    // what the journal holds: the trade as first saved, plus fields only the journal writes
    const orig = {
      ...api.toDoc(),
      id: "t" + i,
      created: 1700000000000 + i,
      btDate: tmode === "live" ? null : "2026-08-10",
      shots: { weekly: "u/abc.webp" },
      reviews: [{ at: "2026-09-01", plan: "plan" }],
      news: "nee",
    };
    // open it for editing (the panel switches to the trade's live / backtest mode) and save it unchanged
    api.set({ D: api.fromDoc(orig), tmode: orig.mode, edit: orig, logging: true });
    saved = null;
    assert.strictEqual(await api.save(), true, "save failed for " + orig.id);
    // compared as JSON: the saved trade comes from the panel's sandbox, a different JavaScript realm
    const diff = Object.keys({ ...orig, ...saved }).filter(k => JSON.stringify(orig[k]) !== JSON.stringify(saved[k]));
    assert.deepStrictEqual(diff, [], `trade ${orig.id} changed: ` + diff.map(k => `${k} ${JSON.stringify(orig[k])} -> ${JSON.stringify(saved[k])}`).join(", "));
    assert.strictEqual(api.editDoc, null, "edit mode not left after saving");
    n++;
  }
  // and a real edit lands: Max R changed, everything else (id, screenshots, reviews) kept
  api.set({ D: draft(), tmode: "live", edit: null });
  const orig = { ...api.toDoc(), id: "edit1", created: 1, shots: { h4: "u/x.webp" }, reviews: [{ at: "2026-09-01" }] };
  const d = api.fromDoc(orig);
  d.maxR = "3.4";
  api.set({ D: d, tmode: "live", edit: orig, logging: true });
  await api.save();
  assert.strictEqual(saved.maxR, 3.4);
  assert.strictEqual(saved.id, "edit1");
  assert.strictEqual(JSON.stringify(saved.shots), JSON.stringify(orig.shots));
  assert.strictEqual(JSON.stringify(saved.reviews), JSON.stringify(orig.reviews));
  console.log(`edit round trip: ${n} trades opened and saved unchanged`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
