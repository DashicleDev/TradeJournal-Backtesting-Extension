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
})();
