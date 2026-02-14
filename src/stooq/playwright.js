const { chromium } = require("playwright");

async function fetchQuoteViaPlaywright({ symbol, timeoutMs, headless = true }) {
  const sym = String(symbol).toLowerCase();
  const url = `https://stooq.com/q/?s=${encodeURIComponent(sym)}`;

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    const data = await page.evaluate((s) => {
      const sym = String(s).toLowerCase();
      const lastCandidates = [2, 0, 3, 1, 4, 5, 6, 7, 8, 9].map((d) => `aq_${sym}_c${d}|3`);
      let last = null;
      let last_id = null;
      for (const id of lastCandidates) {
        const el = document.getElementById(id);
        if (el) {
          last_id = id;
          last = (el.textContent || "").trim();
          break;
        }
      }
      const ids = {
        date: `aq_${sym}_d2`,
        time: `aq_${sym}_t1`,
        change: `aq_${sym}_m2`,
        change_pct: `aq_${sym}_m3`,
        high: `aq_${sym}_h`,
        low: `aq_${sym}_l`,
        open: `aq_${sym}_o`,
        prev: `aq_${sym}_p`,
        volume: `aq_${sym}_v2`,
        turnover: `aq_${sym}_r2`
      };

      const out = {};
      out.last = last;
      out.last_id = last_id;
      for (const [k, id] of Object.entries(ids)) {
        const el = document.getElementById(id);
        out[k] = el ? (el.textContent || "").trim() : null;
      }
      return out;
    }, sym);

    return data;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = { fetchQuoteViaPlaywright };
