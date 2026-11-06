# Trade Journal for TradingView

A browser extension that adds a small panel to TradingView, so you can log backtest
trades from bar replay straight into your [Trade Journal](https://dashicledev.github.io/TradeJournal/).

- Same fields as the journal's trade form: phase, inner/outer, trend, MS, ranging,
  pattern, pros/cons, daily, 4H, result, notes.
- 📷 per timeframe (Weekly, Daily, 4H, 1H/2H): takes a TradingView snapshot
  (the same as Alt+S) and stores the link with the trade. Pressing Alt+S yourself works too.
- Reads the pair and replay date from the chart (“⟳ from chart”).
- Saves into the backtest project you pick, in your own journal (same login).

It is separate from the journal: it only writes trades in the journal's normal format.
The field lists come from the journal's `plan.json`, so new options show up here automatically.

## Install (Edge, Chrome, Brave, Opera)

1. Download and unzip this folder.
2. Edge: open `edge://extensions` (Chrome: `chrome://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped folder.
5. Open a TradingView chart. Click the **TJ** button (bottom right), or the extension icon, and sign in with your journal account.

To update: replace the folder with the new version and click **Reload** on the extension.

## Using it in bar replay

1. Pick the project, check pair and date (⟳ from chart fills them in).
2. Fill in the analysis.
3. For each timeframe: switch the chart, then tap its 📷. The snapshot appears in the panel.
4. Fill in the result and **Save trade**. The pair and project stay, so the next trade is quick.

## Privacy

- Runs only on `tradingview.com/chart`.
- Talks only to your journal's database and the journal's `plan.json`.
- It never sees your TradingView login. Your journal password goes straight to the journal's sign-in and is not stored. Only the session token is kept, in the browser's extension storage.
