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

To update: replace the folder with the new version (or `git pull` if you cloned it) and click **⟳** in the panel. It reloads the extension and the chart tab.

## Using it in bar replay

Click the logo, then **+** (New trade). The panel walks you through the trade:

1. **Trade**: project, pair and direction (the pair is read from the chart).
2. **Weekly**: the chart switches to 1W. Position it, fill in the weekly analysis, click **📷 Continue**.
   It grabs the chart and switches to the next timeframe.
3. **Daily** (1D), **4H** (240) and, for an Engulfing Candle entry, **1H/2H**: the same. The entry date is on the last of these and is filled from the replay date.
4. **Result**: fill it in and **Save trade**. It starts again at step 1 with the pair kept.

**Long / Short Position tool:** draw it at the entry candle and stretch its right edge to the candle where the trade closed.
The panel takes direction, entry date and close date from it (the one selected on the chart, otherwise the one picked under **Position** on the first step, otherwise the one with the latest entry).
It only fills empty fields, so you can still change the dates; **⟳ from chart** reads them again.

On the start screen, **⏩ Daily CC** / **⏩ Weekly CC** switch the chart to 4H and skip to the next candle that touches one of your drawings, at most until the daily or weekly candle closes (forex: 17:00 New York, weekly on Friday).

While a skip runs, **■ Stop** stops it. In ⚙ → Replay you can add your templates (select a drawing, **Use the selected drawing's style**) so it only stops at those. A drawing matches a style when the tool, the colours and the text are the same (line width and capitals don't matter).

**Stop** pauses logging and keeps the trade: the start screen then offers **Continue trade** or **Discard it**.

**Back** or the step tabs go to an earlier step (the chart switches back too).

## Settings (⚙)

- **Fit chart after switching timeframe**: turns Auto (price scale) on and off after the panel switches timeframe.
- **Same look as my journal**: uses the theme and accent colour from your journal. Untick it to pick your own.

## Settings sync

Your extension settings (fit chart, look, trigger styles) are saved in your journal account as well, so they follow you to another browser or PC.

## Privacy

- Runs only on `tradingview.com/chart`.
- Talks only to your journal's database and the journal's `plan.json`.
- The font (Archivo, SIL Open Font License, see `fonts/OFL.txt`) ships with the extension.
- It never sees your TradingView login. Your journal password goes straight to the journal's sign-in and is not stored. Only the session token is kept, in the browser's extension storage.
