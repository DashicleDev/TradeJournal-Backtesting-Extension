/*
 * panel/boot.js — Start-up: load the trade plan, projects and accounts, restore the panel and sign-in.
 */
/* ---------- boot ---------- */
async function boot() {
  try {
    const p = await call("plan");
    if (p && p.plan && p.wcrit) P = p;
  } catch {}
  try {
    projects = await call("projects");
  } catch (e) {
    msg = "Couldn't load projects: " + e.message;
  }
  try {
    accounts = await call("accounts");
  } catch {}
  if (D.project && !projects.some(p => p.id === D.project)) D.project = "";
  loadJLook();
  loadSet();
}
(async () => {
  const pos = await load();
  applyLook();
  if (pos && pos.left) Object.assign(host.style, { left: pos.left, top: pos.top, right: "auto" });
  try {
    user = await call("status");
  } catch {}
  if (user) await boot();
  panel.hidden = !open;
  pill.hidden = open;
  render();
  if (user) pickUpTrade();
})();
// The journal's Replay window has #tj-trade=<id> in its address: open that trade here for editing (once; the id is then dropped)
async function pickUpTrade() {
  const id = (/[#&]tj-trade=([A-Za-z0-9_-]{1,40})/.exec(location.hash) || [])[1];
  if (!id) return;
  history.replaceState(null, "", location.pathname + location.search + location.hash.replace(/&tj-trade=[^&]*/, ""));
  const t = await call("openTrade", { id }).catch(() => null);
  if (!t) return;
  sessionStorage.setItem("tjReplayWin", "1"); // this window came from the journal's Replay: it closes after saving
  call("replayWin").catch(() => {});
  requestOpen(t);
}
// the same chart window is reused for the next Replay: the page doesn't reload, only the address changes
addEventListener("hashchange", () => user && pickUpTrade());
