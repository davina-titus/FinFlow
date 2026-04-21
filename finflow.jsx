import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_META = {
  "Food & Dining":  { color: "#f97316", icon: "🍔" },
  "Subscriptions":  { color: "#a78bfa", icon: "📱" },
  "Transport":      { color: "#22d3ee", icon: "🚗" },
  "Income":         { color: "#4ade80", icon: "💰" },
  "Shopping":       { color: "#f472b6", icon: "🛍️" },
  "Health":         { color: "#fb7185", icon: "💊" },
  "Utilities":      { color: "#94a3b8", icon: "⚡" },
  "Entertainment":  { color: "#c084fc", icon: "🎵" },
  "Transfers":      { color: "#64748b", icon: "↔️" },
  "Other":          { color: "#78716c", icon: "📦" },
};

const SAMPLE = [
  { id:1,  date:"2026-04-18", description:"Whole Foods Market",  amount:-87.43,  category:"Food & Dining" },
  { id:2,  date:"2026-04-17", description:"Netflix",             amount:-15.99,  category:"Subscriptions" },
  { id:3,  date:"2026-04-17", description:"Shell Gas Station",   amount:-52.10,  category:"Transport" },
  { id:4,  date:"2026-04-16", description:"Salary Deposit",      amount:2400.00, category:"Income" },
  { id:5,  date:"2026-04-15", description:"Chipotle",            amount:-14.25,  category:"Food & Dining" },
  { id:6,  date:"2026-04-14", description:"Amazon Purchase",     amount:-63.99,  category:"Shopping" },
  { id:7,  date:"2026-04-13", description:"Spotify",             amount:-9.99,   category:"Subscriptions" },
  { id:8,  date:"2026-04-12", description:"CVS Pharmacy",        amount:-23.50,  category:"Health" },
  { id:9,  date:"2026-04-11", description:"Uber Eats",           amount:-31.80,  category:"Food & Dining" },
  { id:10, date:"2026-04-10", description:"Con Edison Electric", amount:-110.00, category:"Utilities" },
  { id:11, date:"2026-04-09", description:"Starbucks",           amount:-6.75,   category:"Food & Dining" },
  { id:12, date:"2026-04-08", description:"Freelance Payment",   amount:350.00,  category:"Income" },
  { id:13, date:"2026-03-28", description:"Planet Fitness",      amount:-24.99,  category:"Health" },
  { id:14, date:"2026-03-25", description:"Target",              amount:-78.32,  category:"Shopping" },
  { id:15, date:"2026-03-20", description:"Salary Deposit",      amount:2400.00, category:"Income" },
  { id:16, date:"2026-03-18", description:"Trader Joe's",        amount:-64.20,  category:"Food & Dining" },
  { id:17, date:"2026-03-15", description:"AT&T Bill",           amount:-85.00,  category:"Utilities" },
  { id:18, date:"2026-03-12", description:"Steam Games",         amount:-29.99,  category:"Entertainment" },
  { id:19, date:"2026-03-08", description:"Uber",                amount:-18.40,  category:"Transport" },
  { id:20, date:"2026-03-05", description:"Freelance Payment",   amount:500.00,  category:"Income" },
];

// ─── Claude API ───────────────────────────────────────────────────────────────

async function classifyTransactions(txList) {
  const payload = txList.map(t => `${t.id}|||${t.description}|||${t.amount > 0 ? "credit" : "debit"}`).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `Categorize financial transactions. Valid categories: Food & Dining, Subscriptions, Transport, Income, Shopping, Health, Utilities, Entertainment, Transfers, Other. Return ONLY raw JSON like: {"1":"Food & Dining","2":"Income"}. No markdown, no explanation.`,
      messages: [{ role: "user", content: payload }],
    }),
  });
  const data = await res.json();
  const text = data.content.map(c => c.text || "").join("");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function getAIInsights(transactions) {
  const summary = transactions
    .filter(t => t.category)
    .map(t => `${t.date}: ${t.description} $${t.amount} [${t.category}]`)
    .join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "You are a sharp quantitative finance analyst. Give 4 concise, specific insights with dollar amounts. Use numbered list. Be direct, data-driven, no fluff.",
      messages: [{ role: "user", content: `Analyze my transactions:\n${summary}` }],
    }),
  });
  const data = await res.json();
  return data.content.map(c => c.text || "").join("");
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));

  const findCol = (...keys) => headers.findIndex(h => keys.some(k => h.includes(k)));
  const dateCol   = findCol("date");
  const descCol   = findCol("description", "desc", "merchant", "name", "memo");
  const amtCol    = findCol("amount", "amt", "value");
  const debitCol  = findCol("debit");
  const creditCol = findCol("credit");

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
    try {
      const date = cols[dateCol] || new Date().toISOString().split("T")[0];
      const desc = cols[descCol] || "Unknown";
      let amount = 0;
      if (amtCol >= 0) {
        amount = parseFloat(cols[amtCol].replace(/[$,\s]/g, "")) || 0;
      } else if (debitCol >= 0 || creditCol >= 0) {
        const debit  = debitCol  >= 0 ? parseFloat(cols[debitCol].replace(/[$,\s]/g,""))  || 0 : 0;
        const credit = creditCol >= 0 ? parseFloat(cols[creditCol].replace(/[$,\s]/g,"")) || 0 : 0;
        amount = credit - debit;
      }
      if (desc && !isNaN(amount)) {
        results.push({ id: Date.now() + i, date: normalizeDate(date), description: desc, amount, category: null });
      }
    } catch {}
  }
  return results;
}

function normalizeDate(d) {
  try {
    const parsed = new Date(d);
    if (!isNaN(parsed)) return parsed.toISOString().split("T")[0];
  } catch {}
  return d;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtFull = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function buildSpendingOverTime(transactions) {
  const byMonth = {};
  transactions.forEach(t => {
    const month = t.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { month, income: 0, expenses: 0, net: 0 };
    if (t.amount > 0) byMonth[month].income += t.amount;
    else byMonth[month].expenses += Math.abs(t.amount);
    byMonth[month].net += t.amount;
  });
  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
    ...m,
    label: new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
  }));
}

function buildCategoryPie(transactions) {
  const totals = {};
  transactions.filter(t => t.amount < 0 && t.category).forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount);
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "inherit" }}>
      <div style={{ color: "#64748b", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>{p.name}: {fmt(p.value)}</div>
      ))}
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function FinFlow() {
  const [transactions, setTransactions] = useState(SAMPLE);
  const [tab, setTab] = useState("dashboard");
  const [classifying, setClassifying] = useState(false);
  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [csvSuccess, setCsvSuccess] = useState("");
  const [newTx, setNewTx] = useState({ date: new Date().toISOString().split("T")[0], description: "", amount: "" });
  const [addingTx, setAddingTx] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const fileRef = useRef();

  const uncategorized = transactions.filter(t => !t.category);
  const totalIncome   = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net           = totalIncome - totalExpenses;
  const spendingData  = buildSpendingOverTime(transactions);
  const pieData       = buildCategoryPie(transactions);

  const runClassify = async () => {
    const targets = uncategorized.length > 0 ? uncategorized : transactions;
    setClassifying(true);
    try {
      const map = await classifyTransactions(targets);
      setTransactions(prev => prev.map(t => ({ ...t, category: map[String(t.id)] || t.category || "Other" })));
    } catch { setTransactions(prev => prev.map(t => ({ ...t, category: t.category || "Other" }))); }
    setClassifying(false);
  };

  const runInsights = async () => {
    setInsightsLoading(true);
    setTab("insights");
    try { setInsights(await getAIInsights(transactions)); }
    catch { setInsights("Could not generate insights. Please try again."); }
    setInsightsLoading(false);
  };

  const handleCSV = useCallback((text) => {
    setCsvError(""); setCsvSuccess("");
    const parsed = parseCSV(text);
    if (!parsed.length) { setCsvError("Couldn't parse this CSV. Make sure it has date, description, and amount columns."); return; }
    setTransactions(prev => [...parsed, ...prev]);
    setCsvSuccess(`✓ Imported ${parsed.length} transactions`);
    setTab("transactions");
  }, []);

  const handleFile = (file) => {
    if (!file || !file.name.endsWith(".csv")) { setCsvError("Please upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = e => handleCSV(e.target.result);
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const addTransaction = async () => {
    if (!newTx.description || !newTx.amount) return;
    setAddingTx(true);
    const tx = { id: Date.now(), date: newTx.date, description: newTx.description, amount: parseFloat(newTx.amount), category: null };
    try {
      const map = await classifyTransactions([tx]);
      tx.category = map[String(tx.id)] || "Other";
    } catch { tx.category = "Other"; }
    setTransactions(prev => [tx, ...prev]);
    setNewTx({ date: new Date().toISOString().split("T")[0], description: "", amount: "" });
    setAddingTx(false);
  };

  const TABS = ["dashboard", "transactions", "charts", "insights", "import"];

  return (
    <div style={{ minHeight: "100vh", background: "#060609", color: "#e2e8f0", fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Anybody:wght@700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#060609}::-webkit-scrollbar-thumb{background:#1e293b}
        .tab{background:none;border:none;font-family:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:10px 16px;cursor:pointer;color:#334155;border-bottom:2px solid transparent;transition:all .2s}
        .tab.on{color:#e2e8f0;border-bottom-color:#38bdf8}
        .tab:hover:not(.on){color:#64748b}
        .card{background:#0c0c12;border:1px solid #0f172a;border-radius:10px;overflow:hidden}
        .btn{border:none;font-family:inherit;font-size:11px;letter-spacing:.08em;text-transform:uppercase;border-radius:7px;cursor:pointer;transition:all .18s;padding:9px 18px;font-weight:500}
        .btn-sky{background:#0ea5e9;color:#000}.btn-sky:hover{background:#38bdf8;transform:translateY(-1px)}.btn-sky:disabled{opacity:.35;cursor:not-allowed;transform:none}
        .btn-ghost{background:none;border:1px solid #1e293b;color:#64748b}.btn-ghost:hover{border-color:#334155;color:#e2e8f0}
        .inp{background:#0c0c12;border:1px solid #1e293b;color:#e2e8f0;font-family:inherit;font-size:12px;padding:9px 12px;border-radius:7px;outline:none;width:100%;transition:border-color .2s}
        .inp:focus{border-color:#0ea5e9}
        .inp::placeholder{color:#1e293b}
        .pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
        .tx-row{display:grid;grid-template-columns:72px 1fr auto 130px;gap:8px;align-items:center;padding:11px 16px;border-bottom:1px solid #0a0a10;transition:background .15s;cursor:default}
        .tx-row:hover{background:#0c0c12}
        .tx-row:last-child{border-bottom:none}
        select.inp{appearance:none;-webkit-appearance:none}
        .dot{display:inline-block;animation:blink 1.1s infinite}.dot:nth-child(2){animation-delay:.18s}.dot:nth-child(3){animation-delay:.36s}
        @keyframes blink{0%,80%,100%{opacity:.15}40%{opacity:1}}
        .drag-zone{border:2px dashed #1e293b;border-radius:10px;padding:40px 24px;text-align:center;transition:all .2s;cursor:pointer}
        .drag-zone.over{border-color:#0ea5e9;background:#0ea5e910}
        .drag-zone:hover{border-color:#334155}
        .stat-num{font-family:'Anybody',sans-serif;font-size:26px;font-weight:900;letter-spacing:-.02em;line-height:1}
      `}</style>

      {/* Header */}
      <div style={{ background:"#060609", borderBottom:"1px solid #0f172a", padding:"16px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:20 }}>
        <div>
          <span style={{ fontFamily:"'Anybody',sans-serif", fontSize:20, fontWeight:900, color:"#38bdf8", letterSpacing:"-.02em" }}>FIN</span>
          <span style={{ fontFamily:"'Anybody',sans-serif", fontSize:20, fontWeight:900, color:"#fff", letterSpacing:"-.02em" }}>FLOW</span>
          <span style={{ fontSize:9, color:"#1e293b", letterSpacing:".14em", marginLeft:10, verticalAlign:"middle" }}>AI-POWERED FINANCE</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {uncategorized.length > 0 && (
            <span style={{ fontSize:10, color:"#f97316", letterSpacing:".06em" }}>{uncategorized.length} unclassified</span>
          )}
          <button className="btn btn-ghost" onClick={runClassify} disabled={classifying}>
            {classifying ? <>Classifying<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></> : "✦ AI Classify"}
          </button>
          <button className="btn btn-sky" onClick={runInsights} disabled={insightsLoading}>
            {insightsLoading ? "Thinking..." : "Get Insights →"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom:"1px solid #0f172a", display:"flex", paddingLeft:20, background:"#060609", position:"sticky", top:52, zIndex:19 }}>
        {TABS.map(t => (
          <button key={t} className={`tab ${tab===t?"on":""}`} onClick={() => setTab(t)}>
            {t === "import" ? "📥 Import" : t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 20px" }}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div>
            {/* Stats row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
              {[
                { label:"Total Income",   value:fmt(totalIncome),   color:"#4ade80" },
                { label:"Total Expenses", value:fmt(totalExpenses), color:"#f97316" },
                { label:"Net Cash Flow",  value:(net>=0?"+":"")+fmt(net), color: net>=0?"#38bdf8":"#f43f5e" },
              ].map((s,i) => (
                <div key={i} className="card" style={{ padding:"18px 22px" }}>
                  <div style={{ fontSize:9, color:"#334155", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>{s.label}</div>
                  <div className="stat-num" style={{ color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:9, color:"#1e293b", marginTop:6 }}>{transactions.length} transactions</div>
                </div>
              ))}
            </div>

            {/* Spending over time */}
            <div className="card" style={{ padding:"20px 20px 12px", marginBottom:16 }}>
              <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:16 }}>Monthly Overview</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={spendingData} margin={{ top:4, right:4, bottom:0, left:0 }}>
                  <defs>
                    <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                  <XAxis dataKey="label" tick={{ fill:"#334155", fontSize:10, fontFamily:"inherit" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:"#334155", fontSize:10, fontFamily:"inherit" }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v/1000}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="income"   name="Income"   stroke="#4ade80" fill="url(#gi)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f97316" fill="url(#ge)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Top categories */}
            <div className="card" style={{ padding:"18px 20px" }}>
              <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:14 }}>Top Spending Categories</div>
              {pieData.slice(0,5).map(({ name, value }) => {
                const meta = CATEGORY_META[name] || { color:"#78716c", icon:"📦" };
                const pct  = totalExpenses > 0 ? (value / totalExpenses * 100) : 0;
                return (
                  <div key={name} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <span style={{ fontSize:12, color:"#94a3b8" }}>{meta.icon} {name}</span>
                      <span style={{ fontSize:12, color: meta.color, fontWeight:500 }}>{fmtFull(value)}</span>
                    </div>
                    <div style={{ background:"#0a0a10", borderRadius:3, height:4, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:meta.color, borderRadius:3, transition:"width .6s cubic-bezier(.16,1,.3,1)" }} />
                    </div>
                    <div style={{ fontSize:9, color:"#1e293b", marginTop:3, textAlign:"right" }}>{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {tab === "transactions" && (
          <div>
            {/* Add new */}
            <div className="card" style={{ padding:"18px 20px", marginBottom:16 }}>
              <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:12 }}>Add Transaction</div>
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr 110px auto", gap:10, alignItems:"end" }}>
                <div>
                  <div style={{ fontSize:9, color:"#334155", letterSpacing:".08em", textTransform:"uppercase", marginBottom:5 }}>Date</div>
                  <input className="inp" type="date" value={newTx.date} onChange={e => setNewTx(p=>({...p,date:e.target.value}))} />
                </div>
                <div>
                  <div style={{ fontSize:9, color:"#334155", letterSpacing:".08em", textTransform:"uppercase", marginBottom:5 }}>Description</div>
                  <input className="inp" placeholder="e.g. Trader Joe's" value={newTx.description} onChange={e => setNewTx(p=>({...p,description:e.target.value}))} />
                </div>
                <div>
                  <div style={{ fontSize:9, color:"#334155", letterSpacing:".08em", textTransform:"uppercase", marginBottom:5 }}>Amount</div>
                  <input className="inp" type="number" placeholder="-42.50" value={newTx.amount} onChange={e => setNewTx(p=>({...p,amount:e.target.value}))} />
                </div>
                <button className="btn btn-sky" onClick={addTransaction} disabled={addingTx || !newTx.description || !newTx.amount}>
                  {addingTx ? <><span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></> : "+ Add"}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="card">
              <div style={{ padding:"12px 16px", borderBottom:"1px solid #0a0a10", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:10, color:"#334155", letterSpacing:".08em", textTransform:"uppercase" }}>{transactions.length} transactions</span>
                <button className="btn btn-ghost" style={{ fontSize:10, padding:"5px 12px" }} onClick={() => setTransactions([])}>Clear all</button>
              </div>
              {transactions.map(tx => {
                const meta = CATEGORY_META[tx.category] || { color:"#78716c", icon:"?" };
                return (
                  <div key={tx.id} className="tx-row">
                    <span style={{ fontSize:10, color:"#1e293b" }}>{tx.date.slice(5)}</span>
                    <span style={{ fontSize:12, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.description}</span>
                    <span style={{ fontSize:12, fontWeight:500, color:tx.amount>0?"#4ade80":"#e2e8f0", textAlign:"right" }}>
                      {tx.amount > 0 ? "+" : ""}{fmtFull(tx.amount)}
                    </span>
                    {tx.category ? (
                      editingCategory === tx.id ? (
                        <select className="inp" style={{ fontSize:10, padding:"4px 8px" }}
                          value={tx.category}
                          onChange={e => { setTransactions(prev => prev.map(t => t.id===tx.id ? {...t,category:e.target.value} : t)); setEditingCategory(null); }}>
                          {Object.keys(CATEGORY_META).map(c => <option key={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className="pill" onClick={() => setEditingCategory(tx.id)} title="Click to edit"
                          style={{ background:meta.color+"22", color:meta.color, border:`1px solid ${meta.color}44`, cursor:"pointer" }}>
                          {meta.icon} {tx.category}
                        </span>
                      )
                    ) : (
                      <span style={{ fontSize:10, color:"#1e293b" }} className="dot">unclassified</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CHARTS ── */}
        {tab === "charts" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div className="card" style={{ padding:"20px 20px 12px" }}>
              <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:16 }}>Income vs Expenses by Month</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={spendingData} margin={{ top:4,right:4,bottom:0,left:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                  <XAxis dataKey="label" tick={{ fill:"#334155",fontSize:10,fontFamily:"inherit" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:"#334155",fontSize:10,fontFamily:"inherit" }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v/1000}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="income"   name="Income"   fill="#4ade80" radius={[4,4,0,0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div className="card" style={{ padding:"20px" }}>
                <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:16 }}>Spending Breakdown</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={(CATEGORY_META[entry.name]||{color:"#78716c"}).color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="card" style={{ padding:"20px" }}>
                <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:16 }}>Net Flow Trend</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={spendingData} margin={{ top:4,right:4,bottom:0,left:0 }}>
                    <defs>
                      <linearGradient id="gnet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                    <XAxis dataKey="label" tick={{ fill:"#334155",fontSize:9,fontFamily:"inherit" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:"#334155",fontSize:9,fontFamily:"inherit" }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v/1000}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="net" name="Net" stroke="#38bdf8" fill="url(#gnet)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Legend */}
            <div className="card" style={{ padding:"16px 20px" }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                {pieData.map(({ name }) => {
                  const meta = CATEGORY_META[name] || { color:"#78716c", icon:"📦" };
                  return (
                    <span key={name} className="pill" style={{ background:meta.color+"22", color:meta.color, border:`1px solid ${meta.color}44` }}>
                      {meta.icon} {name}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── INSIGHTS ── */}
        {tab === "insights" && (
          <div className="card" style={{ padding:"28px 32px" }}>
            <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:20 }}>AI Financial Analysis</div>
            {insightsLoading ? (
              <div style={{ textAlign:"center", padding:"48px 0", color:"#334155", fontSize:12 }}>
                Analyzing patterns<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
              </div>
            ) : insights ? (
              <div style={{ fontSize:13, color:"#94a3b8", lineHeight:2, whiteSpace:"pre-wrap" }}>{insights}</div>
            ) : (
              <div style={{ textAlign:"center", padding:"48px 0" }}>
                <div style={{ fontSize:28, marginBottom:12 }}>◈</div>
                <div style={{ fontSize:12, color:"#334155" }}>Click "Get Insights →" to run AI analysis on your transactions</div>
              </div>
            )}
          </div>
        )}

        {/* ── IMPORT ── */}
        {tab === "import" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Drop zone */}
            <div className={`drag-zone ${dragOver?"over":""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}>
              <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
              <div style={{ fontSize:28, marginBottom:10 }}>📥</div>
              <div style={{ fontSize:13, color:"#475569", marginBottom:4 }}>Drop a CSV file here or click to browse</div>
              <div style={{ fontSize:10, color:"#1e293b" }}>Supports most bank export formats (Chase, BofA, Citi, etc.)</div>
            </div>

            {csvError && <div style={{ background:"#f4433610", border:"1px solid #f4433640", borderRadius:8, padding:"12px 16px", fontSize:12, color:"#f44336" }}>{csvError}</div>}
            {csvSuccess && <div style={{ background:"#4ade8010", border:"1px solid #4ade8040", borderRadius:8, padding:"12px 16px", fontSize:12, color:"#4ade80" }}>{csvSuccess}</div>}

            {/* Paste */}
            <div className="card" style={{ padding:"20px" }}>
              <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:12 }}>Or Paste CSV Text</div>
              <textarea className="inp" rows={7} placeholder={"date,description,amount\n2026-04-18,Whole Foods,-87.43\n2026-04-16,Salary,2400.00"}
                style={{ resize:"vertical", lineHeight:1.6 }}
                onChange={e => { if (e.target.value.includes(",")) handleCSV(e.target.value); }}
              />
              <div style={{ fontSize:10, color:"#1e293b", marginTop:6 }}>Paste your CSV — it will be imported automatically as you type</div>
            </div>

            {/* Format guide */}
            <div className="card" style={{ padding:"18px 20px" }}>
              <div style={{ fontSize:10, color:"#334155", letterSpacing:".1em", textTransform:"uppercase", marginBottom:12 }}>Supported CSV Formats</div>
              {[
                { bank:"Generic", format:"date, description, amount" },
                { bank:"Chase",   format:"Transaction Date, Description, Amount" },
                { bank:"Bank of America", format:"Date, Description, Amount" },
                { bank:"Citi",    format:"Date, Description, Debit, Credit" },
              ].map(({ bank, format }) => (
                <div key={bank} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #0a0a10", fontSize:11 }}>
                  <span style={{ color:"#64748b" }}>{bank}</span>
                  <span style={{ color:"#1e293b", fontFamily:"inherit", fontSize:10 }}>{format}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
