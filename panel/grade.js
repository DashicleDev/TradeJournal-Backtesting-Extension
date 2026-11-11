/*
 * panel/grade.js — The live setup grade (A / B / C) while logging a forex trade.
 * Same rules as the journal (js/plan.js gradeOf): the criteria and default rules come from plan.json
 * (P.grade), your own rules from your journal settings (gradeRules), and it only shows when your
 * role has the "grade" feature.
 */
let jRules = null, // your grade rules from the journal settings (null = the defaults)
  jFeat = {}; // your role's features

function grRules() {
  const G = P.grade || null;
  if (!G) return null;
  const keys = new Set(G.crit.map(c => c[0])),
    out = {};
  for (const ph of ["1", "2", "3", "4"]) {
    const d = G.def[ph],
      x = (jRules && jRules[ph]) || {},
      list = (v, def) => (Array.isArray(v) ? v.filter(k => keys.has(k)) : [...def]);
    out[ph] = {
      req: list(x.req, d.req),
      extras: list(x.extras, d.extras),
      flags: list(x.flags, d.flags),
      min: Number.isFinite(+x.min) && +x.min >= 0 ? Math.round(+x.min) : d.min,
      inner: ["", "b", "x"].includes(x.inner) ? x.inner : x.innerB === true ? "b" : d.inner,
      // per 4H entry type: "" same rules · "b" at most B · "x" not valid (C)
      ent: Object.fromEntries(
        (P.plan.entries || []).map(e => {
          const v = (x.ent || d.ent || {})[e];
          return [e, v === "b" || v === "x" ? v : ""];
        })
      ),
    };
  }
  return out;
}
const grLabel = k => (((P.grade || {}).crit || []).find(c => c[0] === k) || [k, k])[1];
const grCrit = (t, k) =>
  k === "dPat"
    ? t.concept
      ? t.concept === "Weekly - 4H"
        ? "against"
        : "for"
      : ""
    : k === "chan"
      ? t.channel && t.entry4h === "Reversal"
        ? "for"
        : ""
      : k === "dMs"
        ? t.dMs || ""
        : k === "hMs"
          ? t.hMs || ""
          : k.startsWith("d:")
            ? (t.dPros || []).includes(k.slice(2))
              ? "for"
              : ""
            : (t.weekly || {})[k] || "";

// { g, why } for the trade being logged, or null (grades off, invest, no phase or no analysis yet)
function liveGrade() {
  if (!jFeat.grade || INV()) return null;
  const R = grRules();
  if (!R) return null;
  const t = toDoc(),
    P_ = R[String(t.fase || "")];
  if (!P_) return null;
  if (!Object.keys(t.weekly || {}).length && !t.dMs && !t.hMs && !(t.dPros || []).length) return null;
  if (P_.inner === "x" && t.wStruct === "inner") return { g: "C", why: "Inner structure not valid in phase " + t.fase };
  const cap = (P_.ent || {})[t.entry4h] || "";
  if (cap === "x") return { g: "C", why: t.entry4h + " entry not valid in phase " + t.fase };
  const miss = P_.req.filter(k => grCrit(t, k) !== "for");
  if (miss.length) return { g: "C", why: "Missing: " + miss.map(grLabel).join(", ") };
  const ag = P_.flags.filter(k => grCrit(t, k) === "against");
  if (ag.length) return { g: "C", why: "Against: " + ag.map(grLabel).join(", ") };
  const ex = P_.extras.filter(k => grCrit(t, k) === "for");
  if (ex.length >= P_.min && P_.min > 0) {
    if (P_.inner === "b" && t.wStruct === "inner") return { g: "B", why: "Inner structure: at most B" };
    if (cap === "b") return { g: "B", why: t.entry4h + " entry: at most B" };
    return { g: "A", why: ex.map(grLabel).join(", ") };
  }
  return { g: "B", why: ex.length ? ex.map(grLabel).join(", ") : "No extras" };
}
const gradeLine = () => {
  const x = liveGrade();
  return x
    ? `<p class="grl" title="Setup grade from your grade rules in the journal"><span class="grb g${x.g}">${x.g}</span><span>${esc(x.why)}</span></p>`
    : "";
};
