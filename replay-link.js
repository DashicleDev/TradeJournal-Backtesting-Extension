/*
 * replay-link.js — runs on the journal. Tells the page when the Replay window (opened by the journal, see bg.js "replayWin")
 * was closed, so the journal can unlock. The journal can't see that itself: TradingView cuts the link to a window it opens.
 */
chrome.runtime.onMessage.addListener(m => {
  if (m && m.type === "replayClosed") postMessage({ tjReplay: "closed" }, location.origin);
});
