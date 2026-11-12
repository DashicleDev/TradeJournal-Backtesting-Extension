/*
 * grade-parity.js — The live grade in the panel (panel/grade.js) must match the journal's gradeOf (js/plan.js).
 * The extension can't load code from the journal (Manifest V3), so the rules are copied; this test catches drift.
 *
 * Needs the journal repo checked out next to this one (or set TJ_JOURNAL to its folder). Run:
 *   node tests/grade-parity.js
 */
const fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  assert = require("assert");

const EXT = path.join(__dirname, ".."),
  JOURNAL = process.env.TJ_JOURNAL || path.join(EXT, "..", "TradeJournal");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

// the journal: core.js (PLAN) + plan.js (gradeOf), with grades switched on
const J = vm.createContext({ document: {}, feat: () => true });
vm.runInContext(read(JOURNAL, "js", "core.js") + read(JOURNAL, "js", "plan.js"), J);
vm.runInContext("this.api = { gradeOf, grNorm, GR_CRIT, GR_DEF, entries: PLAN.entries, against: GR_AGAINST };", J);
const journal = J.api;

// the extension: panel/grade.js with the plan.json the journal publishes
const plan = JSON.parse(read(JOURNAL, "plan.json"));
const E = vm.createContext({ P: plan, INV: () => false, esc: s => String(s), cur: null });
vm.runInContext("const toDoc = () => cur;" + read(EXT, "panel", "grade.js"), E);
vm.runInContext("jFeat = { grade: true }; this.api = { liveGrade };", E);
const ext = E.api;

// plan.json must be rebuilt (scripts/build_plan.py) whenever the journal's grade criteria or defaults change
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
assert(same(plan.grade.crit, journal.GR_CRIT), "plan.json grade.crit is out of date: run scripts/build_plan.py");
assert(same(plan.grade.def, journal.GR_DEF), "plan.json grade.def is out of date: run scripts/build_plan.py");
assert(same(plan.plan.entries, journal.entries), "plan.json plan.entries is out of date: run scripts/build_plan.py");
assert(same(plan.grade.against, journal.against), "plan.json grade.against is out of date: run scripts/build_plan.py");

// rule sets that use every kind of rule (requirements, extras, red flags, limits, old and odd values)
const RULES = [
  null,
  {
    1: { req: ["ms"], extras: ["fibc", "dPat", "d:fc"], min: 2, flags: ["trend"], inner: "b", ent: { Deceleration: "x" }, setup: { w4h: "b" } },
    2: { req: [], extras: ["chan", "hMs"], min: 1, flags: ["dMs"], inner: "x", ent: { "Engulfing Candle": "b" }, setup: { outer: "x" } },
    3: { innerB: true, extras: ["d:sd", "pattern"], min: 0, setup: { wd4h: "b" } },
    4: { req: ["bogus", "sd"], extras: ["ic", "whl", "pz"], min: "abc", flags: ["ec", "lcc"] },
  },
  {
    1: { extras: ["ms", "trend", "fiba"], min: 3 },
    2: { req: ["d:dcc"], flags: ["hMs"], ent: { Reversal: "b", Continuation: "x" } },
    3: { req: ["dPat"], extras: ["chan"], min: 1, inner: "x" },
    4: { flags: ["dPat"], extras: ["dMs"], min: 1, setup: { w4h: "x", outer: "b" } },
  },
];

// realistic trades from a seeded random generator (same trades every run)
let seed = 42;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647,
  pick = a => a[Math.floor(rnd() * a.length)];
const WEEK = ["ms", "trend", "fibc", "fiba", "ic", "whl", "sd", "pz", "lcc", "ec"];
const CONCEPTS = ["", ...Object.keys(plan.plan.concepts)];
function trade() {
  const weekly = {};
  WEEK.forEach(k => rnd() < 0.5 && (weekly[k] = pick(["for", "against"])));
  if (rnd() < 0.3) weekly.pattern = "for"; // the weekly pattern is only ever "with"
  return {
    fase: pick(["", 1, 2, 3, 4, "1", "4"]),
    weekly: rnd() < 0.1 ? {} : weekly,
    wStruct: pick(["", "inner", "outer"]),
    concept: pick(CONCEPTS),
    entry4h: pick(["", ...journal.entries]),
    dMs: pick(["", "for", "against"]),
    hMs: pick(["", "for", "against"]),
    channel: rnd() < 0.3,
    dPros: rnd() < 0.8 ? ["fc", "dcc", "sd"].filter(() => rnd() < 0.4) : undefined,
  };
}

let n = 0;
for (const rules of RULES) {
  vm.runInContext("jRules = " + JSON.stringify(rules) + ";", E);
  const R = journal.grNorm(rules);
  for (let i = 0; i < 400; i++) {
    const t = trade();
    E.cur = t;
    const a = journal.gradeOf(t, R),
      b = ext.liveGrade();
    assert.deepStrictEqual(
      b && { g: b.g, why: b.why },
      a && { g: a.g, why: a.why },
      "grades differ for " + JSON.stringify({ rules, t })
    );
    n++;
  }
}
console.log(`grade parity: ${n} trades graded the same in the journal and the extension`);
