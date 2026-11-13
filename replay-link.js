/*
 * replay-link.js — runs on the journal. A click on a "Replay ↗" link (a TradingView chart link ending in
 * #tj-replay=YYYY-MM-DD) goes to the extension, which opens it in your TradingView tab that's already open
 * (bg.js "replay"). Without an answer from the extension the link just opens as usual.
 */
addEventListener(
  "click",
  e => {
    const a = e.target.closest && e.target.closest('a[href*="#tj-replay="]');
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const url = a.href;
    try {
      chrome.runtime.sendMessage({ type: "replay", url }, r => {
        if (chrome.runtime.lastError || !r || !r.ok) window.open(url, "_blank", "noopener");
      });
    } catch {
      window.open(url, "_blank", "noopener"); // the extension was reloaded or removed
    }
  },
  true
);
