function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTextById(html, id) {
  // Stooq often uses unquoted attributes: id=aq_gc.f_c2|3
  // Accept both quoted and unquoted id values.
  const idEsc = escapeRegExp(id);
  const re = new RegExp(`\\bid=(?:["']?${idEsc}["']?)[^>]*>([^<]*)<`, "ig");
  let last = null;
  let m;
  while ((m = re.exec(html)) !== null) {
    last = m[1];
  }
  if (last == null) return null;
  const v = String(last).trim();
  return v === "" ? "" : v;
}

function parseNumberLoose(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  // Handle things like "10.6k", "730m" seen on BTC.V volume/turnover.
  const km = t.match(/^([+-]?\d+(?:\.\d+)?)([kKmMgGbB])$/);
  if (km) {
    const n = Number(km[1]);
    const unit = km[2].toLowerCase();
    // Stooq uses: k=thousand, m=million, g=billion, b=billion.
    const mult = unit === "k" ? 1e3 : unit === "m" ? 1e6 : 1e9;
    return Number.isFinite(n) ? n * mult : null;
  }
  const normalized = t.replace(/[,\s]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parsePctLoose(s) {
  if (s == null) return null;
  let t = String(s).trim();
  if (!t) return null;
  // "(+1.98%)" -> "+1.98%"
  if (t.startsWith("(") && t.endsWith(")")) t = t.slice(1, -1);
  if (t.endsWith("%")) t = t.slice(0, -1);
  return parseNumberLoose(t);
}

function parseQuoteHtml(html, symbol) {
  const sym = String(symbol).toLowerCase();

  // "Last" id varies by instrument: c0|3, c2|3, c3|3, ...
  const lastIdCandidates = [2, 0, 3, 1, 4, 5, 6, 7, 8, 9].map((d) => `aq_${sym}_c${d}|3`);
  let lastId = null;
  let lastRaw = null;
  for (const id of lastIdCandidates) {
    const v = extractTextById(html, id);
    if (v != null) {
      lastId = id;
      lastRaw = v;
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

  const raw = {};
  raw.last = lastRaw;
  raw.last_id = lastId;
  for (const [k, id] of Object.entries(ids)) {
    raw[k] = extractTextById(html, id);
  }

  const out = {
    symbol: sym,
    last: parseNumberLoose(raw.last),
    date: raw.date || null,
    time: raw.time || null,
    updated_at: raw.date && raw.time ? `${raw.date} ${raw.time}` : null,
    change: parseNumberLoose(raw.change),
    change_pct: parsePctLoose(raw.change_pct),
    high: parseNumberLoose(raw.high),
    low: parseNumberLoose(raw.low),
    open: parseNumberLoose(raw.open),
    prev: parseNumberLoose(raw.prev),
    volume: parseNumberLoose(raw.volume),
    turnover: parseNumberLoose(raw.turnover),
    raw: {
      last: raw.last,
      last_id: raw.last_id,
      date: raw.date,
      time: raw.time,
      change: raw.change,
      change_pct: raw.change_pct,
      high: raw.high,
      low: raw.low,
      open: raw.open,
      prev: raw.prev,
      volume: raw.volume,
      turnover: raw.turnover
    }
  };

  return out;
}

function validateParsedQuote(q) {
  // Volume/turnover can be blank; these are the "required" fields.
  const required = ["last", "date", "time", "change", "change_pct", "high", "low", "open", "prev"];
  for (const k of required) {
    if (q[k] == null) return false;
  }
  return true;
}

module.exports = {
  extractTextById,
  parseNumberLoose,
  parsePctLoose,
  parseQuoteHtml,
  validateParsedQuote
};
