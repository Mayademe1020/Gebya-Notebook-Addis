import { useState } from "react";

// USABILITY VARIANT 1 — INFORMATION HIERARCHY
// Tradeoff: Dramatic typographic scale makes profit the undeniable focus.
// Secondary stats are visually subordinate. Entries are grouped by type
// (income vs. expense) so the user scans by category, not chronology.
// Cost: chronological ordering is sacrificed; the list feels longer.

type Tab = "today" | "merro" | "history";

const D = {
  date: "8 ጥቅምት 2017",
  sales: 2450,
  expensesTotal: 680,
  net: 1770,
  income: [
    { label: "Injera (40 pcs)", amount: 850, profit: 320 },
    { label: "Sugar (5 kg)", amount: 650, profit: 200 },
    { label: "Cooking Oil", amount: 500, profit: 150 },
    { label: "Berbere Spice", amount: 450, profit: 130 },
  ],
  expensesList: [
    { label: "Market Fee", amount: 180 },
    { label: "Transport", amount: 500 },
  ],
  credit: [{ label: "Abebe Bekele", amount: 1200, due: "3 days" }],
  merro: [
    { name: "Abebe Bekele", remaining: 1200, total: 1200, urgency: "yellow", due: "3 days" },
    { name: "Tigist M.", remaining: 450, total: 900, urgency: "red", due: "Overdue" },
    { name: "Dawit G.", remaining: 600, total: 600, urgency: "green", due: "12 days" },
  ],
  history: [
    { day: "ዛሬ — 8 ጥቅምት", sales: 2450, exp: 680, net: 1770 },
    { day: "7 ጥቅምት", sales: 3100, exp: 420, net: 2680 },
    { day: "6 ጥቅምት", sales: 1850, exp: 950, net: 900 },
  ],
};

const fmt = (n: number) => n.toLocaleString();

export function HierarchyFirst() {
  const [tab, setTab] = useState<Tab>("today");
  const [hidden, setHidden] = useState(false);
  const m = (n: number) => hidden ? "••••" : fmt(n);

  const urgencyColor: Record<string, string> = {
    red: "#dc2626", yellow: "#ca8a04", green: "#15803d",
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ fontFamily: "'Inter', sans-serif", background: "#fdf8f0" }}>

      {/* LEVEL 1 — Brand + Date (smallest, least critical) */}
      <div className="px-5 pt-10 pb-0 flex-shrink-0 flex justify-between items-center" style={{ background: "#c47c1a" }}>
        <div className="flex items-baseline gap-2">
          <span className="font-black text-white text-lg">ገበያ</span>
          <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{D.date}</span>
        </div>
        <button onClick={() => setHidden(h => !h)} className="text-xs px-3 py-1 rounded-full"
          style={{ background: "rgba(0,0,0,0.2)", color: "rgba(255,255,255,0.9)" }}>
          {hidden ? "Show" : "Hide"}
        </button>
      </div>

      {/* LEVEL 2 — Profit: the hero number (dominant, unmissable) */}
      <div className="px-5 pt-3 pb-4 flex-shrink-0" style={{ background: "#c47c1a" }}>
        <div className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Net Profit Today
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-black text-white" style={{ fontSize: 52, lineHeight: 1 }}>{m(D.net)}</span>
          <span className="font-semibold text-xl" style={{ color: "rgba(255,255,255,0.55)" }}>ብር</span>
        </div>

        {/* LEVEL 3 — Sales & Expenses: secondary (smaller, muted) */}
        <div className="flex gap-6 mt-3 mb-1">
          <div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Sales</div>
            <div className="font-bold text-base" style={{ color: "rgba(255,255,255,0.85)" }}>{m(D.sales)} ብር</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Spent</div>
            <div className="font-bold text-base" style={{ color: "rgba(255,255,255,0.85)" }}>{m(D.expensesTotal)} ብር</div>
          </div>
        </div>
      </div>

      {/* LEVEL 4 — Quick actions */}
      <div className="px-4 py-2.5 flex gap-2 flex-shrink-0" style={{ background: "#e8901e" }}>
        {[
          { label: "ሸጠሁ", sub: "Sold", color: "#14532d", bg: "#bbf7d0" },
          { label: "ወጪ", sub: "Spent", color: "#7f1d1d", bg: "#fecaca" },
          { label: "ሜሮ", sub: "Credit", color: "#78350f", bg: "#fde68a" },
        ].map(b => (
          <button key={b.label} className="flex-1 py-2 rounded-xl text-center" style={{ background: b.bg }}>
            <div className="font-black text-sm" style={{ color: b.color }}>{b.label}</div>
            <div className="text-xs font-medium opacity-70" style={{ color: b.color }}>{b.sub}</div>
          </button>
        ))}
      </div>

      {/* LEVEL 5 — Entry list, grouped by category */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {tab === "today" && (
          <>
            {/* Income group */}
            <div>
              <div className="text-xs font-bold tracking-widest uppercase mb-2 px-1" style={{ color: "#15803d" }}>
                Income — {m(D.sales)} ብር
              </div>
              <div className="space-y-1.5">
                {D.income.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white" style={{ border: "1px solid #e6f4ea" }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm truncate">{e.label}</div>
                      <div className="text-xs text-green-600">+{hidden ? "••" : fmt(e.profit)} profit</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-green-700">+{m(e.amount)}</div>
                      <div className="text-xs text-gray-400">birr</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expense group */}
            <div>
              <div className="text-xs font-bold tracking-widest uppercase mb-2 px-1" style={{ color: "#dc2626" }}>
                Expenses — {m(D.expensesTotal)} ብር
              </div>
              <div className="space-y-1.5">
                {D.expensesList.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white" style={{ border: "1px solid #fee2e2" }}>
                    <div className="flex-1"><div className="font-semibold text-gray-800 text-sm">{e.label}</div></div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-red-600">-{m(e.amount)}</div>
                      <div className="text-xs text-gray-400">birr</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Credit group */}
            <div>
              <div className="text-xs font-bold tracking-widest uppercase mb-2 px-1" style={{ color: "#c47c1a" }}>
                Credit Given
              </div>
              <div className="space-y-1.5">
                {D.credit.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white" style={{ border: "1px solid #fde68a" }}>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 text-sm">{e.label}</div>
                      <div className="text-xs text-amber-600">Due in {e.due}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-amber-700">{m(e.amount)}</div>
                      <div className="text-xs text-gray-400">birr</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "merro" && (
          <div className="space-y-2">
            <div className="rounded-2xl p-4" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div className="text-xs font-bold tracking-widest uppercase text-amber-700 mb-1">Total Owed</div>
              <div className="font-black text-3xl text-amber-800">{m(D.merro.reduce((a, x) => a + x.remaining, 0))}<span className="text-lg ml-1">ብር</span></div>
            </div>
            {D.merro.map((r, i) => (
              <div key={i} className="rounded-2xl px-4 py-3 bg-white" style={{ border: "1px solid #f0e6d4" }}>
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="font-bold text-gray-800">{r.name}</div>
                    <div className="text-xs font-medium" style={{ color: urgencyColor[r.urgency] }}>{r.due}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-lg text-gray-800">{m(r.remaining)}</div>
                    <div className="text-xs text-gray-400">birr</div>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.round(((r.total - r.remaining) / r.total) * 100)}%`, background: urgencyColor[r.urgency] }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {D.history.map((h, i) => (
              <div key={i} className="rounded-2xl px-4 py-4 bg-white" style={{ border: `1px solid ${i === 0 ? "#fde68a" : "#f0e6d4"}` }}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-semibold text-gray-700 text-sm">{h.day}</span>
                  <span className="font-black text-xl" style={{ color: "#15803d" }}>{m(h.net)}<span className="text-sm ml-1 font-semibold text-gray-400">ብር</span></span>
                </div>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>↑ Sales {m(h.sales)}</span><span>↓ Spent {m(h.exp)}</span>
                </div>
              </div>
            ))}
            <button className="w-full py-3 rounded-2xl text-sm font-bold mt-1" style={{ background: "#c47c1a", color: "#fff" }}>📤 Export CSV</button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex-shrink-0 flex justify-around items-center px-2 pt-2 pb-6 border-t" style={{ background: "#fff", borderColor: "#f0e6d4" }}>
        {([["today","🏪","ዛሬ","Today"],["merro","📋","ሜሮ","Credit"],["history","📅","ታሪክ","History"]] as const).map(([key, icon, am, en]) => (
          <button key={key} onClick={() => setTab(key)} className="flex flex-col items-center gap-0.5 flex-1 py-1 rounded-xl"
            style={{ background: tab === key ? "#fff8ed" : "transparent" }}>
            <span className="text-2xl">{icon}</span>
            <span className="text-sm font-bold" style={{ color: tab === key ? "#c47c1a" : "#9ca3af" }}>{am}</span>
            <span className="text-xs" style={{ color: tab === key ? "#e8901e" : "#d1d5db" }}>{en}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
