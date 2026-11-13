# Changelog

## 1.4.19 — 2026-11-13

- Opening a chart from the journal's **Replay ↗** button starts bar replay at the trade's date (00:00 UTC). Needs a TradingView account with bar replay.

## 1.4.18 — 2026-11-13

- **The opening date follows the position too.** From the 4H step on (Execution for invest), moving the Long/Short position's left edge updates the date, and moving the right edge updates the close date, after a mouse drag or an arrow-key nudge. A date you type yourself stays until its edge moves.

## 1.4.17 — 2026-11-13

- Fix: re-dragging the position's right edge on the Result step still didn't update the close date. The check skipped itself whenever a trade was being logged, which is always the case on the Result step.

## 1.4.16 — 2026-11-13

- Fix: re-dragging the position's right edge on the Result step didn't update the close date. It's now checked as soon as you let go of the drag (and still when the mouse comes back to the panel).

## 1.4.15 — 2026-11-13

- **Close date follows the position.** Going to the Result step takes the close date from the Long/Short position's right edge (it used to only fill an empty date), and while you're on the Result step, re-dragging that edge updates the close date as soon as your mouse is back on the panel (no background timer). A date you type yourself stays until you move the edge again.

## 1.4.14 — 2026-11-13

- Market trend is Bullish / Bearish / Ranging, as in the journal (1.3.17). Ranging replaces the separate Ranging button.

## 1.4.13 — 2026-11-12

- Weekly cons offer only the criteria the journal allows as a con (Fib active and Last CC), read from the journal's `plan.json`; the live grade uses the same list.

## 1.4.12 — 2026-11-12

- New test, `node tests/grade-parity.js`: checks that the live grade gives the same result as the journal's grade, and that the journal's `plan.json` is up to date. Run it after changing the grade rules in either repo.

## 1.4.11 — 2026-11-12

- You stay signed in when the panel opens without a connection (for example right after the laptop wakes up). You're only signed out when your login has really expired.

## 1.4.7 — 2026-11-11

- **Live setup grade** while logging a forex trade: A / B / C with the reason, at the bottom of the panel, updating as you fill in the analysis. Uses your own grade rules from the journal and only shows when your role has grades on.

## 1.4.6 — 2026-11-10

- Pattern in Pattern is no longer a 4H entry (it's a Reversal now).

## 1.4.5 — 2026-11-10

- 4H step: **Channel** as an extra confirmation on a Reversal entry.

## 1.4.4 — 2026-11-10

- **Setup** is now on the Trade step (under pair and direction), so the weekly step stays as it was. Weekly - 4H stays picked when you choose a phase on the weekly step.

## 1.4.3 — 2026-11-10

- **Setup** moved to the weekly step, under phase and inner/outer. The daily step only asks the daily pattern (with Weekly - Daily - 4H).

## 1.4.2 — 2026-11-10

- Daily step: first pick the **Setup**, Weekly - Daily - 4H or Weekly - 4H. With Weekly - Daily - 4H you then pick the **Daily pattern** and its variant. Saved the same way as before, so the journal reads it unchanged.

## 1.4.1 — 2026-11-09

- Removed the Analysed marks and the Stocks to revisit list from 1.3.0: with this many stocks a list of the ones you marked didn't help. Marks already saved stay in your account, unused.

## 1.4.0 — 2026-11-09

- **Forex or Invest from the chart:** the panel switches by itself to Invest on stocks and ETFs, and to Forex on forex pairs, gold, indices and the rest (from TradingView's symbol type). It doesn't switch while a trade is in progress, and if you switch by hand that stays until you open another symbol. Turn it off in Settings → Chart.

## 1.3.0 — 2026-11-09

- **Analysed marks (Invest):** on the start screen, **✓ Mark analysed** for the stock on your chart, with when you last did it. The line follows the chart when you switch stocks; click **✓ Today** to undo.
- **Stocks to revisit:** the stocks you haven't marked in the last 30 days, this quarter, this half year or this year, oldest first. Click one to open it on the chart, or copy the list to import into a TradingView watchlist.
- Saved in your journal account (one document per stock), so it works on every browser you sign in on.

## 1.2.0 — 2026-11-09

Options for the close notices in Settings → Replay:

- **Stays:** 3, 5 or 10 seconds, or until clicked.
- **Position:** top, middle or bottom of the chart.
- **Size:** large (coloured banner) or compact (a card in the panel's style).
- **Timeframe buttons:** Open Daily / Open Weekly on the notice switch the chart.
- **Pause autoplay at the close** when replay is playing by itself.
- **Show an example** to try your settings.

## 1.1.2 — 2026-11-09

- Close notices are hard to miss: a large banner in your accent colour (orange for the weekly close) in the middle of the chart that pulses, stays until you click it (or 15 seconds), and plays a short chime. The chime can be turned off in Settings → Replay.

## 1.1.1 — 2026-11-09

- **Close notices are for bar replay now**, not the real-time clock: while you step or skip in replay, a notice shows when a candle closes the day (on 4H and lower) or the week (also on the Daily chart). Turn them on or off in Settings → Replay. The Alerts tab and the extra browser permissions are gone again.

## 1.1.0 — 2026-11-09

- **Alerts:** new Settings → Alerts tab with a notification when the daily and/or weekly forex candle closes (17:00 New York). It comes from the browser, so TradingView doesn't have to be open. Needs the new "alarms" and "notifications" permissions.
- **Fix:** ⏩ Daily CC / Weekly CC sometimes ran past the first close, a whole day (or week) too far. That happened when only one 4H candle was left before the close and the chart showed it right away.
- The candle count in the skip messages no longer counts one candle too many.

## 1.0.0 — 2026-11-09

First numbered release. The code is split into readable files (`panel/` for the panel, with `hook.js` and `bg.js` documented) and comes with an architecture overview. No changes to how it works.

What the extension does at this point:

- **Log trades from the chart** step by step: forex Weekly → Daily → 4H (→ 1H/2H), invest 12M → 6M → 3M → Monthly → Weekly → execution. The chart switches timeframe for you and a snapshot is taken per step.
- **Backtest or live:** backtests go into a project, live trades into an account; missed trades too.
- **Long/Short Position tool:** direction, entry and close dates, entry, stop and target are read from it; pick or highlight which position is used.
- **Invest:** multiple exits with exit strategy; in backtests exits are % of the position.
- **Skip to drawing** in bar replay: Daily CC / Weekly CC skip candle by candle until price touches one of your drawings (styles you choose, matched on tool, colours and text).
- **Settings:** fit chart after switching timeframe, the journal's look, trigger styles; synced to your journal account.
- Same login and database as the journal; fields come from the journal's `plan.json`.

Earlier versions (0.x) were development builds without a changelog.
