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
// A trade the journal's Replay link asked to open in this tab (bg.js keeps it for the tab it opened)
async function pickUpTrade() {
  const t = await call("openTrade").catch(() => null);
  if (t) requestOpen(t);
}
// same pair already open: the page doesn't reload, so watch for a new request
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.openTrade && ch.openTrade.newValue && user) pickUpTrade();
});
