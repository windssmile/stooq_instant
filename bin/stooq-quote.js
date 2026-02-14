#!/usr/bin/env node

const { Command } = require("commander");
const { fetchQuoteHtml } = require("../src/stooq/http");
const { fetchQuoteViaPlaywright } = require("../src/stooq/playwright");
const { parseQuoteHtml, validateParsedQuote, parseNumberLoose, parsePctLoose } = require("../src/stooq/parse");
const { renderTable } = require("../src/stooq/format");

function stripRawForJson(r) {
  if (!r || r.error) return r;
  const out = { ...r };
  delete out.raw;
  return out;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function parseSymbols({ symbolsOpt, symbolListOpt }) {
  const out = [];
  if (Array.isArray(symbolListOpt)) out.push(...symbolListOpt);
  if (symbolsOpt) {
    out.push(...String(symbolsOpt).split(",").map((s) => s.trim()).filter(Boolean));
  }
  const uniq = [...new Set(out.map((s) => String(s).toLowerCase()))].filter(Boolean);
  if (uniq.length === 0) throw new Error("no symbols provided (use --symbols or --symbol)");
  return uniq;
}

function buildQuoteFromPlaywrightRaw(symbol, raw) {
  const sym = String(symbol).toLowerCase();
  const r = raw || {};
  const out = {
    symbol: sym,
    last: parseNumberLoose(r.last),
    date: r.date || null,
    time: r.time || null,
    updated_at: r.date && r.time ? `${r.date} ${r.time}` : null,
    change: parseNumberLoose(r.change),
    change_pct: parsePctLoose(r.change_pct),
    high: parseNumberLoose(r.high),
    low: parseNumberLoose(r.low),
    open: parseNumberLoose(r.open),
    prev: parseNumberLoose(r.prev),
    volume: parseNumberLoose(r.volume),
    turnover: parseNumberLoose(r.turnover),
    raw: {
      last: r.last ?? null,
      date: r.date ?? null,
      time: r.time ?? null,
      change: r.change ?? null,
      change_pct: r.change_pct ?? null,
      high: r.high ?? null,
      low: r.low ?? null,
      open: r.open ?? null,
      prev: r.prev ?? null,
      volume: r.volume ?? null,
      turnover: r.turnover ?? null
    }
  };
  return out;
}

async function fetchOne({ symbol, mode, timeoutMs }) {
  if (mode === "http") {
    const html = await fetchQuoteHtml({ symbol, timeoutMs });
    const q = parseQuoteHtml(html, symbol);
    if (!validateParsedQuote(q)) throw new Error("parsed quote missing required fields (http)");
    return q;
  }

  if (mode === "playwright") {
    const raw = await fetchQuoteViaPlaywright({ symbol, timeoutMs });
    const q = buildQuoteFromPlaywrightRaw(symbol, raw);
    if (!validateParsedQuote(q)) throw new Error("parsed quote missing required fields (playwright)");
    return q;
  }

  // auto: try http then fallback
  try {
    const html = await fetchQuoteHtml({ symbol, timeoutMs });
    const q = parseQuoteHtml(html, symbol);
    if (validateParsedQuote(q)) return q;
  } catch (_) {
    // ignore, fallback below
  }
  const raw = await fetchQuoteViaPlaywright({ symbol, timeoutMs });
  const q = buildQuoteFromPlaywrightRaw(symbol, raw);
  if (!validateParsedQuote(q)) throw new Error("parsed quote missing required fields (auto)");
  return q;
}

async function main() {
  const program = new Command();
  program
    .name("stooq-quote")
    .description("Fetch latest quotes from stooq.com via HTTP or Playwright; output JSON or table.")
    .option("--symbols <list>", "comma-separated symbols, e.g. gc.f,btc.v")
    .option("--symbol <symbol>", "repeatable symbol", (v, acc) => (acc.push(v), acc), [])
    .option("--mode <mode>", "http|playwright|auto", "auto")
    .option("--format <format>", "json|table|both", "table")
    .option("--no-raw", "omit the 'raw' object from JSON output")
    .option("--timeout-ms <ms>", "timeout in ms", (v) => Number(v), 15000)
    .option("--concurrency <n>", "concurrency for http/auto (default 1 to avoid parallel traffic)", (v) => Number(v), 1);

  program.parse(process.argv);
  const opts = program.opts();

  const symbols = parseSymbols({ symbolsOpt: opts.symbols, symbolListOpt: opts.symbol });
  const mode = String(opts.mode || "auto").toLowerCase();
  const format = String(opts.format || "table").toLowerCase();
  const timeoutMs = Number(opts.timeoutMs) || 15000;
  const concurrency = Math.max(1, Number(opts.concurrency) || 4);

  if (!["http", "playwright", "auto"].includes(mode)) {
    throw new Error(`invalid --mode ${mode}`);
  }
  if (!["json", "table", "both"].includes(format)) {
    throw new Error(`invalid --format ${format}`);
  }

  const effectiveConcurrency = mode === "playwright" ? 1 : concurrency;

  const results = await mapLimit(symbols, effectiveConcurrency, async (symbol) => {
    try {
      return await fetchOne({ symbol, mode, timeoutMs });
    } catch (e) {
      return {
        symbol,
        error: { message: e && e.message ? String(e.message) : String(e), mode }
      };
    }
  });

  const failures = results.filter((r) => r && r.error);
  const jsonResults = opts.raw ? results : results.map(stripRawForJson);

  if (format === "json" || format === "both") {
    process.stdout.write(JSON.stringify(jsonResults, null, 2) + "\n");
    if (format === "json") {
      if (failures.length) process.exitCode = 2;
      return;
    }
    process.stdout.write("\n");
  }

  // Table: show successes + failures as rows.
  const normalized = results.map((r) => {
    if (!r || r.error) {
      return {
        symbol: r ? r.symbol : "?",
        last: null,
        date: null,
        time: null,
        change: null,
        change_pct: null,
        high: null,
        low: null,
        open: null,
        prev: null,
        volume: null,
        turnover: null,
        raw: {},
        _error: r && r.error ? r.error.message : "unknown error"
      };
    }
    return r;
  });

  process.stdout.write(renderTable(normalized) + "\n");
  if (failures.length) {
    process.stderr.write(`\nFailures (${failures.length}/${results.length}):\n`);
    for (const f of failures) process.stderr.write(`- ${f.symbol}: ${f.error.message}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write((e && e.stack) ? `${e.stack}\n` : `${e}\n`);
  process.exit(1);
});
