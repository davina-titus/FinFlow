# FinFlow

A personal finance dashboard built with React and powered by Claude AI. FinFlow lets you track transactions, visualize spending patterns, import bank CSVs, and get AI-generated financial insights — all in a sleek dark-mode interface.

---

## Features

- **Dashboard** — Summary stats (income, expenses, net cash flow), monthly area chart, and top spending categories with progress bars
- **Transactions** — Add transactions manually; AI auto-classifies them on entry; click any category pill to override it
- **Charts** — Bar chart (income vs expenses by month), donut pie (spending breakdown), and net flow area chart
- **AI Insights** — One-click financial analysis powered by Claude that surfaces specific, dollar-amount-grounded observations
- **CSV Import** — Drag-and-drop or paste CSV exports from Chase, Bank of America, Citi, and most generic bank formats

---

## Tech Stack

| Layer | Library |
|---|---|
| UI framework | React (hooks) |
| Charts | Recharts |
| AI classification & insights | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Fonts | IBM Plex Mono, Anybody (Google Fonts) |
| Styling | Inline styles + scoped CSS-in-JS |

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9+ (or yarn / pnpm)
- An **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com)

---

## Local Development

### 1. Scaffold a Vite + React project

```bash
npm create vite@latest finflow -- --template react
cd finflow
```

### 2. Install dependencies

```bash
npm install recharts
```

### 3. Drop in the component

Replace `src/App.jsx` (or add a new file) with `finflow.jsx`, then import it in `src/main.jsx`:

```jsx
import FinFlow from './finflow'
ReactDOM.createRoot(document.getElementById('root')).render(<FinFlow />)
```

### 4. Configure your API key

> ⚠️ **Important:** The app currently calls the Anthropic API directly from the browser, which exposes your API key in client-side code. This is fine for local development but **must not be used in production** (see the Deployment section below).

For local dev, add a `.env` file:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Then update the two `fetch` calls in `finflow.jsx` to pass the key via a header:

```js
headers: {
  "Content-Type": "application/json",
  "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
},
```

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Deployment

Because the Anthropic API key must never be exposed to end users, production deployments require a small backend proxy that holds the key server-side.

### Option A — Vercel (recommended, easiest)

1. Push your project to GitHub.
2. Create a `/api/claude.js` serverless function:

```js
// api/claude.js
export default async function handler(req, res) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  res.status(response.status).json(data);
}
```

3. In `finflow.jsx`, change the fetch URL from `https://api.anthropic.com/v1/messages` to `/api/claude`.
4. In Vercel dashboard → Settings → Environment Variables, add `ANTHROPIC_API_KEY`.
5. Deploy: `vercel --prod`

### Option B — Netlify Functions

Same idea as above, but use a Netlify Function in `netlify/functions/claude.js` and point your fetch calls to `/.netlify/functions/claude`.

### Option C — Express backend

Serve the built React app and add a proxy route:

```js
app.post('/api/claude', async (req, res) => {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});
```

---

## CSV Format Guide

FinFlow auto-detects columns by name. Supported layouts:

| Bank | Required columns |
|---|---|
| Generic | `date`, `description`, `amount` |
| Chase | `Transaction Date`, `Description`, `Amount` |
| Bank of America | `Date`, `Description`, `Amount` |
| Citi | `Date`, `Description`, `Debit`, `Credit` |

Negative amounts are treated as expenses; positive as income.

---

## Spending Categories

| Category | Icon |
|---|---|
| Food & Dining | 🍔 |
| Subscriptions | 📱 |
| Transport | 🚗 |
| Income | 💰 |
| Shopping | 🛍️ |
| Health | 💊 |
| Utilities | ⚡ |
| Entertainment | 🎵 |
| Transfers | ↔️ |
| Other | 📦 |

Categories are assigned automatically by Claude when you add a transaction or click **"Auto-classify."** You can click any category pill on the Transactions tab to override it manually.

---

## Project Structure

```
finflow.jsx          # Entire app — constants, API helpers, CSV parser, React component
```

The app is intentionally single-file for portability. If you want to scale it up, natural split points are:

```
src/
  constants.js       # CATEGORY_META, SAMPLE data
  api.js             # classifyTransactions(), getAIInsights()
  csv.js             # parseCSV(), normalizeDate()
  components/
    Dashboard.jsx
    Transactions.jsx
    Charts.jsx
    Insights.jsx
    Import.jsx
```

---

## License

MIT
