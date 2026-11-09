/*
 * bg.js — background service worker. Handles sign-in (Supabase Auth), all database calls
 * (projects, accounts, saving trades, settings) and fetching the journal's plan.json.
 * The panel never talks to the network itself; it sends a message here (see `call` in panel/core.js).
 */
importScripts("config.js");

const H = tok => ({
  apikey: TJ.anonKey,
  "Content-Type": "application/json",
  ...(tok ? { Authorization: "Bearer " + tok } : {}),
});
const get = k => chrome.storage.local.get(k).then(o => o[k]);
const set = o => chrome.storage.local.set(o);

async function authCall(grant, body) {
  const r = await fetch(`${TJ.url}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: H(),
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || "Sign-in failed (" + r.status + ")");
  const s = {
    access: j.access_token,
    refresh: j.refresh_token,
    exp: Date.now() + (j.expires_in || 3600) * 1000,
    uid: j.user && j.user.id,
    email: j.user && j.user.email,
  };
  await set({ session: s });
  return s;
}

async function session() {
  let s = await get("session");
  if (!s) return null;
  if (Date.now() > s.exp - 60000) {
    try {
      s = await authCall("refresh_token", { refresh_token: s.refresh });
    } catch (e) {
      await chrome.storage.local.remove("session");
      return null;
    }
  }
  return s;
}

async function rest(path, opt = {}) {
  const s = await session();
  if (!s) throw new Error("Not signed in");
  const r = await fetch(`${TJ.url}/rest/v1/${path}`, { ...opt, headers: { ...H(s.access), ...(opt.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) {
    let m = txt;
    try {
      const j = JSON.parse(txt);
      m = j.message || j.hint || txt;
    } catch {}
    throw new Error(m || "Request failed (" + r.status + ")");
  }
  return txt ? JSON.parse(txt) : null;
}

async function plan() {
  try {
    const r = await fetch(TJ.planUrl, { cache: "no-cache" });
    if (r.ok) {
      const j = await r.json();
      await set({ plan: j });
      return j;
    }
  } catch {}
  return (await get("plan")) || null; // last known copy; the content script falls back to its built-in one
}

const handlers = {
  async status() {
    const s = await session();
    return s ? { email: s.email, uid: s.uid } : null;
  },
  async login({ email, password }) {
    const s = await authCall("password", { email, password });
    return { email: s.email, uid: s.uid };
  },
  async logout() {
    await chrome.storage.local.remove("session");
    return true;
  },
  plan,
  async projects() {
    const rows = await rest("docs?select=id,data&data->>kind=eq.project");
    return rows
      .map(r => ({ ...r.data, id: r.id }))
      .filter(p => !p.demo)
      .sort((a, b) => (a.status === "closed") - (b.status === "closed") || (b.created || 0) - (a.created || 0));
  },
  async accounts() {
    const rows = await rest("docs?select=id,data&data->>kind=eq.account");
    const st = a => a.status || (a.archived ? "closed" : "active");
    return rows
      .map(r => ({ ...r.data, id: r.id }))
      .sort(
        (a, b) =>
          (st(a) === "active" ? 0 : 1) - (st(b) === "active" ? 0 : 1) || String(a.name).localeCompare(String(b.name))
      );
  },
  async jsettings() {
    const rows = await rest("docs?select=data&id=eq.settings");
    return (rows[0] && rows[0].data) || null;
  },
  // the extension's own settings, as one document in your journal data (the journal ignores this kind)
  async extLoad() {
    const rows = await rest("docs?select=data&id=eq.extsettings");
    return (rows[0] && rows[0].data) || null;
  },
  async extSave({ data }) {
    const s = await session();
    if (!s) throw new Error("Not signed in");
    await rest("docs", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([
        {
          user_id: s.uid,
          id: "extsettings",
          data: { ...data, id: "extsettings", kind: "extsettings", updated: Date.now() },
          updated_at: new Date().toISOString(),
        },
      ]),
    });
    return true;
  },
  // "analysed" marks for invest charts: one document per symbol with the dates you marked it
  async anList() {
    const rows = await rest("docs?select=data&data->>kind=eq.analysed");
    return rows.map(r => r.data);
  },
  async anMark({ sym, date, undo }) {
    const s = await session();
    if (!s) throw new Error("Not signed in");
    const id = "an_" + sym,
      rows = await rest("docs?select=data&id=eq." + encodeURIComponent(id)),
      old = (rows[0] && rows[0].data) || { id, kind: "analysed", sym, ticker: sym.split(":").pop(), dates: [] },
      dates = undo ? old.dates.filter(d => d !== date) : [...new Set([...old.dates, date])].sort(),
      doc = { ...old, dates, updated: Date.now() };
    await rest("docs", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ user_id: s.uid, id, data: doc, updated_at: new Date().toISOString() }]),
    });
    return doc;
  },
  async save({ doc }) {
    const s = await session();
    if (!s) throw new Error("Not signed in");
    await rest("docs", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ user_id: s.uid, id: doc.id, data: doc, updated_at: new Date().toISOString() }]),
    });
    return true;
  },
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "reload") {
    set({ reloadTab: sender.tab && sender.tab.id }).then(() => chrome.runtime.reload());
    return false;
  }
  const h = handlers[msg && msg.type];
  if (!h) return false;
  h(msg).then(
    v => reply({ ok: true, v }),
    e => reply({ ok: false, error: String((e && e.message) || e) })
  );
  return true;
});

chrome.action.onClicked.addListener(tab => {
  if (tab && tab.id)
    chrome.tabs.sendMessage(tab.id, { type: "toggle" }).catch(() => {
      chrome.tabs.create({ url: "https://www.tradingview.com/chart/" });
    });
});

// After a reload, refresh the TradingView tab that asked for it so it runs the new version.
chrome.runtime.onInstalled.addListener(async () => {
  const id = await get("reloadTab");
  if (id) {
    await chrome.storage.local.remove("reloadTab");
    chrome.tabs.reload(id).catch(() => {});
  }
});
