async function fetchQuoteHtml({ symbol, timeoutMs }) {
  const sym = String(symbol).toLowerCase();
  const url = `https://stooq.com/q/?s=${encodeURIComponent(sym)}`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent": "stooq-quote-fetcher/0.1 (+https://stooq.com/)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

module.exports = { fetchQuoteHtml };

