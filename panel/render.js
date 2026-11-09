/*
 * panel/render.js — Builds the panel's HTML for every screen: start screen, steps, settings.
 */
/* ---------- render ---------- */
const seg = (k, opts, v) =>
  `<div class="segs">${opts.map(([val, l]) => `<button type="button" class="sg${v === val ? " on" : ""}${val === "against" ? " neg" : val === "for" ? " pos" : ""}" data-k="${k}" data-v="${esc(val)}">${l}</button>`).join("")}</div>`;
const sel = (k, opts, v, ph) =>
  `<select data-k="${k}"><option value="">${ph}</option>${opts.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
const f = (l, h) => `<div class="f"><span>${l}</span>${h}</div>`;
const sec = (id, title, sum, body) =>
  `<div class="sec${collapsed[id] ? " shut" : ""}"><button type="button" class="sh" data-sec="${id}"><b>${title}</b><em>${esc(sum)}</em><i>${collapsed[id] ? "▸" : "▾"}</i></button>${collapsed[id] ? "" : `<div class="sb">${body}</div>`}</div>`;
const MS = [
  ["for", "✓ With"],
  ["against", "✗ Against"],
];
function render() {
  try {
    renderInner();
  } catch (e) {
    console.error("[Trade Journal]", e);
    panel.innerHTML = `<div class="head"><b>Trade Journal</b><button type="button" class="x" data-act="hide">–</button></div><div class="body"><p class="msg">Something went wrong: ${esc(e.message)}</p><button type="button" class="btn" data-act="clear">Reset form</button></div>`;
  }
}
function renderInner() {
  if (!open) return;
  panel.classList.toggle("mini", mini && !!user);
  if (mini && user) {
    const n = SLOTS.filter(([k]) => D.links[k]).length,
      sum = [D.pair, D.dir && (D.dir === "long" ? "↑" : "↓"), n ? n + " chart" + (n === 1 ? "" : "s") : ""]
        .filter(Boolean)
        .join(" ");
    panel.innerHTML = `<div class="head"><b>Trade Journal</b><span class="who">${esc(sum)}</span><button type="button" class="x" data-act="expand" title="Expand">▢</button><button type="button" class="x x2" data-act="close" title="Hide panel">×</button></div>`;
    return;
  }
  const pos = panel.querySelector(".body"),
    top = pos ? pos.scrollTop : 0;
  if (!user) {
    panel.innerHTML = `<div class="head"><b>Trade Journal</b><button type="button" class="x" data-act="hide" title="Minimize">–</button><button type="button" class="x x2" data-act="close" title="Hide panel">×</button></div>
    <form class="body login"><p>Sign in with your Trade Journal account. The extension only saves backtest trades to your own journal.</p>
    <label class="f"><span>Email</span><input type="email" name="email" autocomplete="username" required value="${esc(lastEmail)}"></label>
    <label class="f"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn pri" type="submit" ${busy ? "disabled" : ""}>${busy ? "Signing in…" : "Sign in"}</button>${msg ? `<p class="msg">${esc(msg)}</p>` : ""}</form>`;
    return;
  }
  const wc = P.wcrit.filter(([k]) => k !== "trend" && k !== "pattern"),
    fc = P.plan.faseConcepts[D.fase] || Object.keys(P.plan.concepts);
  const pros = wc.filter(([k]) => D.w[k] === "for").length,
    cons = wc.filter(([k]) => D.w[k] === "against").length;
  const wsum = [
    D.fase && "Phase " + D.fase,
    D.wStruct && (D.wStruct === "inner" ? "Inner" : "Outer"),
    D.trend && "Trend " + (D.trend === "for" ? "✓" : "✗"),
    D.ms && "MS " + (D.ms === "for" ? "✓" : "✗"),
    D.wRange && "Ranging",
    D.wPat,
    (pros || cons) && `${pros}+ ${cons}−`,
  ]
    .filter(Boolean)
    .join(" · ");
  const dsum = [D.concept, D.sub, D.dMs && "MS " + (D.dMs === "for" ? "✓" : "✗")].filter(Boolean).join(" · ");
  const hsum = [
    D.entry4h,
    D.hMs && "MS " + (D.hMs === "for" ? "✓" : "✗"),
    hasStruct(D.entry4h) && D.struct && D.struct.replace("bos", "BoS").replace("som", "SoM"),
  ]
    .filter(Boolean)
    .join(" · ");
  const csum =
    SLOTS.filter(([k]) => D.links[k])
      .map(([, l]) => l)
      .join(" · ") || "none yet";
  const rsum = [
    D.outcome && { win: "Win", be: "BE", loss: "Loss" }[D.outcome],
    D.r !== "" && D.r + "R",
    D.evaluation && (D.evaluation === "plan" ? "To plan" : "Not to plan"),
  ]
    .filter(Boolean)
    .join(" · ");
  const pj = projects.find(p => p.id === D.project);
  const ms = k =>
    seg(
      k,
      [
        ["for", "✓ With"],
        ["against", "✗ Against"],
      ],
      D[k]
    );
  const chk = (k, l) => `<button type="button" class="sg${D[k] ? " on" : ""}" data-tog="${k}">${l}</button>`;
  const IB = {
    setup: () => `${ctxSel()}
      <div class="row2">${f(`Ticker <button type="button" class="lnk inl" data-act="read" title="Read it from the chart">⟳ from chart</button>`, `<input type="text" data-k="pair" value="${esc(D.pair)}" autocomplete="off">`)}
        ${f(
          "Phase",
          seg(
            "sPhase",
            [
              ["A", "Phase A"],
              ["B", "Phase B"],
            ],
            D.sPhase
          )
        )}</div>${posSel()}
      ${f("Missed trade", `<div class="segs">${chk("missed", "Missed")}</div>`)}`,
    m12: () => `${f("Market structure", ms("s12Ms"))}
      ${
        D.s12Ms === "for"
          ? f(
              "Pattern <em>optional</em>",
              seg(
                "s12bm",
                [
                  ["FS", "FS"],
                  ["100", "100"],
                  ["PinP", "PinP"],
                ],
                D.s12bm
              )
            )
          : ""
      }
      ${
        D.s12Ms === "against"
          ? f(
              "Back to previous structure",
              seg(
                "s12ret",
                [
                  ["FS", "FS"],
                  ["100", "100"],
                ],
                D.s12ret
              )
            )
          : ""
      }`,
    m6: () => `${f("Market structure", ms("s6Ms"))}
      ${
        D.sPhase === "A"
          ? f(
              "BM",
              seg(
                "s6bm",
                [
                  ["FS", "FS"],
                  ["100", "100"],
                  ["PinP", "PinP"],
                ],
                D.s6bm
              )
            )
          : ""
      }
      ${
        D.sPhase === "B"
          ? f(
              "Back to previous MS",
              seg(
                "s6ret",
                [
                  ["FS", "FS"],
                  ["100", "100"],
                ],
                D.s6ret
              )
            )
          : ""
      }`,
    m3: () => `${f("Market structure", ms("s3Ms"))}
      ${D.sPhase === "A" ? `<div class="segs">${chk("s3bm", "BM")}${chk("s3room", "Room")}</div>` : D.sPhase === "B" ? `<div class="segs">${chk("s3roomB", "Room")}</div>` : ""}`,
    mo: () => `${f("Market structure", ms("s1Ms"))}
      ${D.sPhase ? `<div class="segs">${D.sPhase === "A" ? chk("s1room", "Room") : ""}${chk("s1cc", "Bullish CC")}</div>` : ""}`,
    wk: () =>
      `${f("Market structure", ms("swMs"))}${f(
        "Pattern",
        seg(
          "swPat",
          [
            ["BM", "BM"],
            ["IHS", "IHS"],
          ],
          D.swPat
        )
      )}`,
    // backtest: no shares bought or currency, just where you'd enter and stop
    exec: () => {
      const plan = exPlan(),
        sum = exSum(),
        sg = v => (v > 0 ? "+" : "") + v.toFixed(2);
      return `${f(`Date <button type="button" class="lnk inl" data-act="readdate" title="From the Long/Short position, or the replay date">⟳ from chart</button>`, `<input type="date" data-k="date" value="${esc(D.date)}">`)}
      ${
        LIVE() || simProj()
          ? f(
              "Currency",
              seg(
                "sCur",
                [
                  ["USD", "USD"],
                  ["EUR", "EUR"],
                  ["GBP", "GBP"],
                  ["CAD", "CAD"],
                  ["CHF", "CHF"],
                ],
                D.sCur || "USD"
              )
            )
          : ""
      }
      ${!LIVE() && simProj() ? `<p class="hint">Simulated with ${esc(simProj().simAccount)}: max ${esc(String(simProj().simMax))} per position. The journal works out the shares and P&amp;L.</p>` : ""}
      <div class="${LIVE() ? "row3" : "row2"}">${LIVE() ? f("Shares bought", `<input type="number" step="any" min="0" data-k="sShares" value="${esc(D.sShares)}">`) : ""}${f("Entry", `<input type="number" step="any" data-k="sEntry" value="${esc(D.sEntry)}">`)}${f("Initial stop", `<input type="number" step="any" data-k="sStop" value="${esc(D.sStop)}">`)}</div>
      <b class="ttl">Exits</b>
      ${plan.length ? `<p class="hint">Plan: ${esc(plan.map(([n, p]) => p + "% " + n).join(" · "))}</p>` : ""}
      ${(D.sExits || [])
        .map(
          (x, i) => `<div class="exr">
        <div class="row3">${f(LIVE() ? "Shares" : "% of position", `<input type="number" step="any" min="0" data-exi="${i}" data-exk="${LIVE() ? "shares" : "pct"}" value="${esc(LIVE() ? (x.shares ?? "") : (x.pct ?? ""))}">`)}${f("Price", `<input type="number" step="any" min="0" data-exi="${i}" data-exk="price" value="${esc(x.price ?? "")}">`)}${f("Date", `<input type="date" data-exi="${i}" data-exk="date" value="${esc(x.date || "")}">`)}</div>
        <div class="exh">${f(
          "Exit strategy",
          (() => {
            const hw = x.hows || [],
              rest = exOpts().filter(o => !hw.includes(o));
            return `<div class="ms"><div class="msbox" data-dd="ex${i}">${hw.map(h => `<span class="mchip">${esc(h)}<button type="button" data-exun="${esc(h)}" data-exi="${i}" aria-label="Remove ${esc(h)}">×</button></span>`).join("") || `<span class="msph">Choose strategy…</span>`}<i>▾</i></div>${dd === "ex" + i ? `<div class="mslist">${rest.length ? rest.map(o => `<button type="button" data-exhow="${esc(o)}" data-exi="${i}">${esc(o)}</button>`).join("") : `<span class="msph">All used</span>`}</div>` : ""}</div>`;
          })()
        )}<button type="button" class="lnk" data-exdel="${i}" title="Remove this exit">×</button></div></div>`
        )
        .join("")}
      <div><button type="button" class="btn ghost sm" data-act="exadd">+ Add exit</button></div>
      <p class="hint" data-exsum>${esc(exSumText())}</p>
      ${f("Notes", `<textarea data-k="notes" rows="3">${esc(D.notes)}</textarea>`)}`;
    },
  };
  const B = INV()
    ? { ...IB, setup: IB.setup }
    : {
        setup: () => `      ${ctxSel()}
    <div class="row2">${f(
      `Pair <button type="button" class="lnk inl" data-act="read" title="Read pair and replay date from the chart">⟳ from chart</button>`,
      `<input type="text" data-k="pair" value="${esc(D.pair)}" list="tjpairs" autocomplete="off"><datalist id="tjpairs">${String(
        (pj && pj.pairs) || ""
      )
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(x => `<option value="${esc(x)}">`)
        .join("")}</datalist>`
    )}
      ${
        view === "steps"
          ? f(
              "Direction",
              seg(
                "dir",
                [
                  ["long", "↑ Long"],
                  ["short", "↓ Short"],
                ],
                D.dir
              )
            )
          : f("Date", `<input type="date" data-k="date" value="${esc(D.date)}">`)
      }</div>
    ${
      view === "steps"
        ? ""
        : f(
            "Direction",
            seg(
              "dir",
              [
                ["long", "↑ Long"],
                ["short", "↓ Short"],
              ],
              D.dir
            )
          )
    }${posSel()}
    ${f("Missed trade", `<div class="segs"><button type="button" class="sg${D.missed ? " on" : ""}" data-tog="missed">Missed</button></div>`)}`,
        weekly: () => `
      <div class="row2">${f(
        "Weekly phase",
        seg(
          "fase",
          [
            ["1", "1"],
            ["2", "2"],
            ["3", "3"],
            ["4", "4"],
          ],
          String(D.fase)
        )
      )}${f(
        "Inner / outer",
        seg(
          "wStruct",
          [
            ["inner", "Inner"],
            ["outer", "Outer"],
          ],
          D.wStruct
        )
      )}</div>
      <div class="row2">${f("Market trend", seg("trend", MS, D.trend))}${f("Market structure", seg("ms", MS, D.ms))}</div>
      <div class="row2">${f("Ranging <em>between two weekly levels</em>", `<div class="segs"><button type="button" class="sg${D.wRange ? " on" : ""}" data-tog="wRange">↔ Ranging</button></div>`)}
        ${f("Weekly pattern", sel("wPat", ["Continuation", "Reversal", "Pattern in Pattern"], D.wPat, "No pattern"))}</div>
      ${D.wPat && D.wPat !== "Reversal" ? f("Pattern variant <em>optional</em>", sel("wPatSub", P.plan.concepts[D.wPat] || [], D.wPatSub, "Not set")) : ""}
      <div class="row2">${["for", "against"]
        .map(side => {
          const lab = side === "for" ? "Pros" : "Cons",
            sel = wc.filter(([k]) => D.w[k] === side),
            rest = wc.filter(([k]) => !D.w[k]);
          return f(
            lab,
            `<div class="ms ${side}"><div class="msbox" data-dd="${side}">${sel.map(([k, l]) => `<span class="mchip ${side}">${esc(l)}<button type="button" data-unw="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("") || `<span class="msph">Choose criteria…</span>`}<i>▾</i></div>${dd === side ? `<div class="mslist">${rest.length ? rest.map(([k, l]) => `<button type="button" data-addw="${k}" data-side="${side}">${esc(l)}</button>`).join("") : `<span class="msph">All criteria used</span>`}</div>` : ""}</div>`
          );
        })
        .join("")}</div>`,
        daily: () => `
      ${(() => {
        const v = P.plan.concepts[D.concept] || [],
          none = !D.concept || D.concept === "Weekly - 4H" || !v.length || (v.length === 1 && v[0] === "—");
        return `<div class="row2">${f("Trade concept", sel("concept", fc, D.concept, "Choose…"))}${none ? "" : f("Daily variant <em>optional</em>", sel("sub", v, D.sub, "Choose…"))}</div>`;
      })()}
      ${f("Market structure", seg("dMs", MS, D.dMs))}
      ${f(
        "Pros",
        (() => {
          const sel = P.dcrit.filter(([k]) => D.dPros.includes(k)),
            rest = P.dcrit.filter(([k]) => !D.dPros.includes(k));
          return `<div class="ms for"><div class="msbox" data-dd="dpros">${sel.map(([k, l]) => `<span class="mchip for">${esc(l)}<button type="button" data-und="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("") || `<span class="msph">Choose criteria…</span>`}<i>▾</i></div>${dd === "dpros" ? `<div class="mslist">${rest.length ? rest.map(([k, l]) => `<button type="button" data-addd="${k}">${esc(l)}</button>`).join("") : `<span class="msph">All criteria used</span>`}</div>` : ""}</div>`;
        })()
      )}`,
        h4: () => `
      <div class="row2">${f("4H entry", sel("entry4h", P.plan.entries, D.entry4h, "Choose…"))}${f("Market structure", seg("hMs", MS, D.hMs))}</div>
      ${
        hasStruct(D.entry4h)
          ? `<div class="row2">${f(
              "4H structure",
              seg(
                "struct",
                [
                  ["bos", "BoS"],
                  ["som", "SoM"],
                ],
                D.struct
              )
            )}${D.struct === "som" ? f("4H room", `<div class="segs"><button type="button" class="sg${D.room ? " on" : ""}" data-tog="room">Room</button></div>`) : ""}</div>`
          : ""
      }
      ${f("Scale-in", `<div class="segs"><button type="button" class="sg${D.scaleIn ? " on" : ""}" data-tog="scaleIn">Scale-in</button></div>`)}
      ${
        D.entry4h === "Engulfing Candle"
          ? f(
              "Reversal on",
              seg(
                "ecTf",
                [
                  ["1h", "1 hour"],
                  ["2h", "2 hour"],
                ],
                D.ecTf
              )
            )
          : ""
      }
      <div class="row3">${f("Planned entry price", `<input type="number" step="any" data-k="planEntry" value="${esc(D.planEntry)}">`)}${f("Stop loss (pips)", `<input type="number" step="any" min="0" data-k="slPips" value="${esc(D.slPips)}">`)}${f("Take profit (pips)", `<input type="number" step="any" min="0" data-k="tpPips" value="${esc(D.tpPips)}">`)}</div>
      <p class="hint">Planned R:R <b data-rr>${esc(rrText())}</b></p>`,
        result: () => `
      ${f(
        "Outcome",
        seg(
          "outcome",
          [
            ["win", "Win"],
            ["be", "BE"],
            ["loss", "Loss"],
          ],
          D.outcome
        )
      )}
      ${f(`Close date <button type="button" class="lnk inl" data-act="readclose" title="From the Long/Short position (right edge), or the replay date">⟳ from chart</button>`, `<input type="date" data-k="closeDate" value="${esc(D.closeDate)}" min="${esc(D.date)}">`)}
      <div class="row2">${f("Result (R)", `<input type="number" step="any" data-k="r" value="${esc(D.r)}">`)}${f("Max R reached <em>optional</em>", `<input type="number" step="any" min="0" data-k="maxR" value="${esc(D.maxR)}">`)}</div>
      ${f(
        "Exit",
        sel(
          "exit",
          P.plan.exits.filter(x => x !== "Invalid, cancelled"),
          D.exit,
          "Choose…"
        )
      )}
      ${f(
        "According to plan?",
        seg(
          "evaluation",
          [
            ["plan", "Yes"],
            ["off", "No"],
          ],
          D.evaluation
        )
      )}
      ${f("Notes", `<textarea data-k="notes" rows="3">${esc(D.notes)}</textarea>`)}`,
        ltf: () => `<p class="hint">Find the reversal on the ${curStep()[1]}, then continue to grab the chart.</p>`,
      };
  const HEAD = `<div class="head"><b>Trade Journal</b><span class="who" title="${esc(user.email)}">${INV() ? "Invest · " : ""}${LIVE() ? "Journal" : "Backtest"}</span><button type="button" class="x" data-act="settings" title="Settings">⚙</button><button type="button" class="x x2" data-act="reload" title="Reload extension (v${esc(chrome.runtime.getManifest().version)}) after an update">⟳</button><button type="button" class="x x2" data-act="hide" title="Minimize">–</button><button type="button" class="x x2" data-act="close" title="Hide panel">×</button></div>`;
  if (settings) {
    const L = look.match && jLook ? jLook : look,
      ST = [
        ["chart", "Chart"],
        ["replay", "Replay"],
        ["look", "Look"],
        ["account", "Account"],
      ];
    const tab = ST.some(([k]) => k === setTab) ? setTab : "chart";
    const tb = {
      chart: () =>
        `<label class="chk"><input type="checkbox" data-set="autoFit" ${autoFit ? "checked" : ""}><span>Fit chart after switching timeframe<small>Turns Auto (price scale) on and off, so the chart fits the screen.</small></span></label>`,
      look: () => `<label class="chk"><input type="checkbox" data-set="match" ${look.match ? "checked" : ""}><span>Same look as my journal<small>Uses the theme and accent colour from your journal's settings.</small></span></label>
      ${f(
        "Theme",
        `<div class="segs">${[
          ["system", "System"],
          ["light", "Light"],
          ["dark", "Dark"],
          ["black", "Black"],
        ]
          .map(
            ([k, l]) =>
              `<button type="button" class="sg${L.theme === k ? " on" : ""}" data-look="theme" data-v="${k}">${l}</button>`
          )
          .join("")}</div>`
      )}
      ${f("Accent colour", `<div class="sw">${ACCENTS.map(([k, l, c1, c2]) => `<button type="button" class="swb${L.accent === k ? " on" : ""}" data-look="accent" data-v="${k}" title="${l}" aria-label="${l}" style="background:${c2}"></button>`).join("")}</div>`)}`,
      replay:
        () => `<p class="hint">The skip buttons on the start screen step the replay until price touches a horizontal line or rectangle. Add your templates here so they only stop at those.</p>
        ${trig.length ? `<div class="trl">${trig.map((t, i) => `<div class="tr" data-tri="${i}"><span class="grip" draggable="true" data-grip="${i}" title="Drag to reorder">⋮⋮</span><i style="background:${esc(t.color || "transparent")}"></i><input type="text" class="trn" data-trn="${i}" value="${esc(t.label || "")}" placeholder="${t.name === "rectangle" ? "Rectangle" : t.name === "horizontal_ray" ? "Horizontal ray" : "Horizontal line"}" aria-label="Name"><em>${t.name === "rectangle" ? "Rectangle" : t.name === "horizontal_ray" ? "Ray" : "Line"}</em><button type="button" class="lnk" data-rmtrig="${i}" title="Remove">×</button></div>`).join("")}</div>` : `<p class="hint">No styles yet, so it stops at any horizontal line or rectangle.</p>`}
        <div><button type="button" class="btn ghost sm" data-act="trigadd">＋ Use the selected drawing's style</button></div>
        ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}`,
      account: () =>
        `<p class="hint">Signed in as ${esc(user.email)}</p><p class="hint">Extension version ${esc(chrome.runtime.getManifest().version)}</p><div><button type="button" class="btn ghost" data-act="logout">Sign out</button></div>`,
    };
    panel.innerHTML = `${HEAD}<div class="stp">${ST.map(([k, l]) => `<button type="button" class="st${k === tab ? " on" : ""}" data-settab="${k}">${l}</button>`).join("")}</div>
    <div class="body idle">${tb[tab]()}</div>
    <div class="foot"><div class="fb"><button type="button" class="btn ghost" data-act="settings">Back</button></div></div>`;
  } else if (view === "steps" && !logging) {
    const draft =
      (INV() ? D.sPhase || D.s12Ms || D.s6Ms : D.dir || D.fase || D.concept || D.entry4h) ||
      Object.keys(D.links).length;
    panel.innerHTML = `${HEAD}<div class="body idle">
      <div class="mkrow"><div class="mkt" role="radiogroup" aria-label="Market">${[
        ["fx", "Forex"],
        ["stocks", "Invest"],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="radio" aria-checked="${mkt === k}" class="${mkt === k ? "on" : ""}" data-mkt="${k}">${l}</button>`
        )
        .join("")}</div></div>
      <div class="tabs" role="tablist">${[
        ["live", "Journal"],
        ["backtest", "Backtest"],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="tab" aria-selected="${tmode === k}" class="tab ${k}${tmode === k ? " on" : ""}" data-tmode="${k}"><i></i>${l}</button>`
        )
        .join("")}</div>
      ${ctxSel()}
      ${
        draft
          ? `<p class="hint">Unfinished trade: ${esc([D.pair, !INV() && D.dir && (D.dir === "long" ? "↑ Long" : "↓ Short"), INV() && D.sPhase && "Phase " + D.sPhase, steps()[step] && "at " + steps()[step][1]].filter(Boolean).join(" · "))}</p>
        <div class="fb"><button type="button" class="btn pri" data-act="log">▶ Continue trade</button><button type="button" class="btn ghost" data-act="discard">Discard it</button></div>`
          : `<div class="newt"><button type="button" class="fab" data-act="log" aria-label="New trade" title="New trade">+</button><span><b>New trade</b><small>${INV() ? "12M, 6M, 3M, Monthly and Weekly" : "Weekly, Daily and 4H"}, grabbing each chart as you go.</small></span></div>`
      }
      ${
        LIVE() || INV()
          ? ""
          : `<div class="skip"><b class="ttl">Skip to the next drawing hit (4H)</b>
        ${fwd ? fwdBtn() : `<div class="fb"><button type="button" class="btn ghost" data-act="skip1d" title="Stops at a hit, or at the latest when the daily candle closes">${FF}Daily CC</button><button type="button" class="btn ghost" data-act="skip1w" title="Stops at a hit, or at the latest when the weekly candle closes">${FF}Weekly CC</button></div>`}
        ${trig.length ? `<div class="tgw"><span class="tgl">Stop at</span><div class="tgs">${trig.map((t, k) => `<button type="button" class="tg${t.on === false ? "" : " on"}" data-tgtrig="${k}" title="${t.on === false ? "Off: skips ignore this style" : "On: skips stop at this style"}"><i style="background:${esc(t.color || "transparent")}"></i>${esc(t.label || (t.name === "rectangle" ? "Rectangle" : "Line"))}</button>`).join("")}</div></div>` : `<p class="hint">Stops at any horizontal line or rectangle. Add your templates in ⚙ → Replay.</p>`}</div>`
      }
    </div>${msg || savedId ? `<div class="foot">${msg ? `<p class="msg">${esc(msg)}</p>` : ""}${savedId ? `<a class="lnk ext" href="${JOURNAL}#trade=${encodeURIComponent(savedId)}" target="_blank" rel="noopener">Open in journal ↗</a>` : ""}</div>` : ""}`;
  } else if (view === "steps") {
    const L = steps(),
      s = curStep(),
      last = step === L.length - 1,
      link = s[2] && D.links[s[0]];
    panel.innerHTML = `${HEAD}
    <div class="stp">${L.map(([k, l], i) => `<button type="button" class="st${i === step ? " on" : ""}${i < step ? " done" : ""}" data-go="${i}">${esc(l)}</button>`).join("")}</div>
    <div class="body">${step ? posLine() : ""}${s[2] ? `<p class="hint">Chart is on ${esc(s[1])}. Position it, fill this in, then Continue grabs the chart.</p>` : ""}${B[s[0]]()}${s[0] === dateStep() && !INV() ? f(`Date <button type="button" class="lnk inl" data-act="readdate" title="From the Long/Short position, or the replay date">⟳ from chart</button>`, `<input type="date" data-k="date" value="${esc(D.date)}">`) : ""}
      ${link ? `<div class="shot cur"><img src="${tvImg(link.match(/x\/([^/]+)/)[1])}" alt="${esc(s[1])} chart"><button type="button" class="rm" data-rm="${s[0]}" title="Remove">×</button></div>` : ""}</div>
    <div class="foot">${msg ? `<p class="msg">${esc(msg)}</p>` : ""}<div class="fb"><button type="button" class="lnk" data-act="stoplog" title="Stop for now. The trade is kept, so you can continue later.">Stop</button>${step ? `<button type="button" class="btn ghost" data-act="back" ${busy ? "disabled" : ""}>Back</button>` : ""}<span class="sp"></span>
      ${s.failed || (s[2] && msg && /didn't come/.test(msg)) ? `<button type="button" class="lnk" data-act="skip">Continue without chart</button>` : ""}
      <button type="button" class="btn pri" data-act="next" ${busy ? "disabled" : ""}>${busy ? (last ? "Saving…" : "Grabbing…") : last ? "Save trade" : s[2] ? "📷 Continue" : "Continue"}</button></div>
</div>`;
  }
  const b = panel.querySelector(".body");
  if (b) b.scrollTop = top;
  fit();
  const ls = panel.querySelector(".mslist");
  if (ls) ls.scrollIntoView({ block: "nearest" });
}
