// Built-in copy of the journal field list; used only if plan.json cannot be fetched.
const TJ_PLAN_DEFAULT = {
  v: 1,
  plan: {
    concepts: {
      Continuation: ["First Structure", "100 level", "Fake Out", "New Action"],
      Reversal: ["S1 in 61.80% zone", "IC als S1 zone", "V-shape", "Push IC Push"],
      "Pattern in Pattern": ["Continuation", "Reversal"],
      "Daily Retrace": ["—"],
      "Push IC Push": ["Scenario 1", "Scenario 2"],
      "Weekly - 4H": ["Line Zone", "Liquidity Zone"],
    },
    faseConcepts: {
      1: ["Reversal", "Continuation", "Pattern in Pattern", "Push IC Push"],
      2: ["Reversal", "Continuation", "Pattern in Pattern", "Push IC Push", "Weekly - 4H", "Daily Retrace"],
      3: ["Reversal", "Continuation", "Pattern in Pattern", "Push IC Push", "Weekly - 4H", "Daily Retrace"],
      4: ["Continuation", "Pattern in Pattern", "Push IC Push"],
    },
    entries: ["Reversal", "Continuation", "Pattern in Pattern", "Deceleration", "Engulfing Candle"],
    exits: [
      "Take profit",
      "Stop loss",
      "Break-even",
      "Trailing stop",
      "Closed for news",
      "Closed manually",
      "Invalid, cancelled",
    ],
  },
  wcrit: [
    ["trend", "Market trend"],
    ["fibc", "FC"],
    ["fiba", "Fib active"],
    ["ic", "IC"],
    ["pattern", "Pattern"],
    ["whl", "High / Low"],
    ["sd", "S&D zone"],
    ["pz", "Proven zone"],
    ["lcc", "Last CC"],
  ],
  dcrit: [
    ["fc", "FC"],
    ["dcc", "Last CC"],
    ["sd", "S&D zone"],
  ],
  phases: [1, 2, 3, 4],
};
