const Table = require("cli-table3");

function fmtMissing(v) {
  return v == null || v === "" ? "-" : String(v);
}

function fmtNumberLike(v) {
  if (v == null) return "-";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v);
}

function fmtChangePct(v) {
  if (v == null) return "-";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${n}%`;
}

function toTableRows(quotes) {
  return quotes.map((q) => ([
    q.symbol,
    fmtNumberLike(q.last),
    fmtMissing(q.date),
    fmtMissing(q.time),
    fmtNumberLike(q.change),
    fmtChangePct(q.change_pct),
    fmtNumberLike(q.high),
    fmtNumberLike(q.low),
    fmtNumberLike(q.open),
    fmtNumberLike(q.prev),
    fmtNumberLike(q.volume),
    fmtNumberLike(q.turnover)
  ]));
}

function renderTable(quotes) {
  const table = new Table({
    head: ["Symbol", "Last", "Date", "Time", "Change", "Change%", "High", "Low", "Open", "Prev", "Volume", "Turnover"],
    style: { head: [], border: [] }
  });
  for (const r of toTableRows(quotes)) table.push(r);
  return table.toString();
}

module.exports = { renderTable };
