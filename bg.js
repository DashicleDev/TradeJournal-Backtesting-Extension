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

/* ---------- candle-close notifications (Settings → Alerts) ---------- */
// Forex candles close at 17:00 New York: the daily one Monday to Friday, the weekly one on Friday.
// One alarm for the next close you asked for; when it fires we notify and set the next one.
const nyParts = ms => {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const g = k => (p.find(x => x.type === k) || {}).value;
  return { wd: g("weekday"), h: +g("hour"), m: +g("minute") };
};
// next 17:00 New York after `from` that is a daily close (Mon–Fri) or, with weekOnly, a Friday
const nextCloseMs = (from, weekOnly) => {
  let t = Math.floor(from / 36e5) * 36e5 + 36e5;
  for (let i = 0; i < 24 * 9; i++, t += 36e5) {
    const q = nyParts(t);
    if (q.h === 17 && q.m === 0 && (weekOnly ? q.wd === "Fri" : !["Sat", "Sun"].includes(q.wd))) return t;
  }
  return 0;
};
async function scheduleClose() {
  const n = (await get("notify")) || {};
  await chrome.alarms.clear("close");
  if (!n.d && !n.w) return;
  const when = nextCloseMs(Date.now(), !n.d);
  if (when) chrome.alarms.create("close", { when });
}
chrome.alarms.onAlarm.addListener(async a => {
  if (a.name !== "close") return;
  const n = (await get("notify")) || {},
    fri = nyParts(a.scheduledTime).wd === "Fri",
    late = Date.now() - a.scheduledTime > 30 * 60e3; // computer was asleep: don't announce an old close
  if (!late && (n.d || (n.w && fri))) {
    const both = fri && n.w;
    chrome.notifications.create("close-" + a.scheduledTime, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: both ? "Weekly candle closed" : "Daily candle closed",
      message: both
        ? "The weekly and daily forex candles just closed (17:00 New York)."
        : "The daily forex candle just closed (17:00 New York).",
    });
  }
  scheduleClose();
});
chrome.storage.onChanged.addListener(ch => {
  if (ch.notify) scheduleClose();
});
chrome.runtime.onStartup.addListener(scheduleClose);
chrome.runtime.onInstalled.addListener(scheduleClose);
