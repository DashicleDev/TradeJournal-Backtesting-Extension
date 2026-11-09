# Changelog

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
