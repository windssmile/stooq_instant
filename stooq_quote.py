#!/usr/bin/env python3

import argparse
import asyncio
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def _escape_re(s: str) -> str:
    return re.escape(str(s))


def extract_text_by_id(html: str, element_id: str):
    # Stooq often uses unquoted attributes: id=aq_gc.f_c2|3
    # Accept both quoted and unquoted id values.
    id_esc = _escape_re(element_id)
    pat = re.compile(r"\bid=(?:[\"']?%s[\"']?)[^>]*>([^<]*)<" % id_esc, re.IGNORECASE)
    last = None
    for m in pat.finditer(html):
        last = m.group(1)
    if last is None:
        return None
    return last.strip()


def parse_number_loose(s):
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    m = re.match(r"^([+-]?\d+(?:\.\d+)?)([kKmMgGbB])$", t)
    if m:
        n = float(m.group(1))
        unit = m.group(2).lower()
        # Stooq uses: k=thousand, m=million, g=billion, b=billion.
        mult = 1e3 if unit == "k" else 1e6 if unit == "m" else 1e9
        return n * mult
    t = re.sub(r"[,\s]", "", t)
    try:
        return float(t)
    except ValueError:
        return None


def parse_pct_loose(s):
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    if t.startswith("(") and t.endswith(")"):
        t = t[1:-1]
    if t.endswith("%"):
        t = t[:-1]
    return parse_number_loose(t)


def parse_quote_html(html: str, symbol: str):
    sym = str(symbol).lower()
    # "Last" id varies by instrument: c0|3, c2|3, c3|3, ...
    last_candidates = [2, 0, 3, 1, 4, 5, 6, 7, 8, 9]
    last_id = None
    last_raw = None
    for d in last_candidates:
        eid = f"aq_{sym}_c{d}|3"
        v = extract_text_by_id(html, eid)
        if v is not None:
            last_id = eid
            last_raw = v
            break

    ids = {
        "date": f"aq_{sym}_d2",
        "time": f"aq_{sym}_t1",
        "change": f"aq_{sym}_m2",
        "change_pct": f"aq_{sym}_m3",
        "high": f"aq_{sym}_h",
        "low": f"aq_{sym}_l",
        "open": f"aq_{sym}_o",
        "prev": f"aq_{sym}_p",
        "volume": f"aq_{sym}_v2",
        "turnover": f"aq_{sym}_r2",
    }

    raw = {k: extract_text_by_id(html, element_id) for k, element_id in ids.items()}
    raw["last"] = last_raw
    raw["last_id"] = last_id

    out = {
        "symbol": sym,
        "last": parse_number_loose(raw["last"]),
        "date": raw["date"] or None,
        "time": raw["time"] or None,
        "updated_at": f'{raw["date"]} {raw["time"]}' if raw["date"] and raw["time"] else None,
        "change": parse_number_loose(raw["change"]),
        "change_pct": parse_pct_loose(raw["change_pct"]),
        "high": parse_number_loose(raw["high"]),
        "low": parse_number_loose(raw["low"]),
        "open": parse_number_loose(raw["open"]),
        "prev": parse_number_loose(raw["prev"]),
        "volume": parse_number_loose(raw["volume"]),
        "turnover": parse_number_loose(raw["turnover"]),
        "raw": raw,
    }
    return out


def validate_parsed_quote(q: dict) -> bool:
    required = ["last", "date", "time", "change", "change_pct", "high", "low", "open", "prev"]
    return all(q.get(k) is not None for k in required)


def fetch_quote_html(symbol: str, timeout_ms: int) -> str:
    sym = str(symbol).lower()
    url = f"https://stooq.com/q/?s={urllib.request.quote(sym)}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "stooq-quote-fetcher/0.1 (+https://stooq.com/)",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout_ms / 1000.0) as resp:
        return resp.read().decode("utf-8", errors="ignore")


async def fetch_quote_via_playwright(symbol: str, timeout_ms: int):
    try:
        from playwright.async_api import async_playwright
    except Exception as e:
        raise RuntimeError("playwright not installed; install requirements-browser.txt and run: python -m playwright install chromium") from e

    sym = str(symbol).lower()
    url = f"https://stooq.com/q/?s={urllib.request.quote(sym)}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            data = await page.evaluate(
                """
                (s) => {
                  const sym = String(s).toLowerCase();
                  const lastCandidates = [2,0,3,1,4,5,6,7,8,9].map(d => `aq_${sym}_c${d}|3`);
                  let last = null;
                  let last_id = null;
                  for (const id of lastCandidates) {
                    const el = document.getElementById(id);
                    if (el) { last_id = id; last = (el.textContent || "").trim(); break; }
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
                    turnover: `aq_${sym}_r2`,
                  };
                  const out = {};
                  out.last = last;
                  out.last_id = last_id;
                  for (const [k, id] of Object.entries(ids)) {
                    const el = document.getElementById(id);
                    out[k] = el ? (el.textContent || "").trim() : null;
                  }
                  return out;
                }
                """,
                sym,
            )
            return data
        finally:
            await page.close()
            await browser.close()


def build_quote_from_playwright_raw(symbol: str, raw: dict):
    sym = str(symbol).lower()
    r = raw or {}
    out = {
        "symbol": sym,
        "last": parse_number_loose(r.get("last")),
        "date": r.get("date") or None,
        "time": r.get("time") or None,
        "updated_at": f'{r.get("date")} {r.get("time")}' if r.get("date") and r.get("time") else None,
        "change": parse_number_loose(r.get("change")),
        "change_pct": parse_pct_loose(r.get("change_pct")),
        "high": parse_number_loose(r.get("high")),
        "low": parse_number_loose(r.get("low")),
        "open": parse_number_loose(r.get("open")),
        "prev": parse_number_loose(r.get("prev")),
        "volume": parse_number_loose(r.get("volume")),
        "turnover": parse_number_loose(r.get("turnover")),
        "raw": {k: r.get(k) for k in ["last", "last_id", "date", "time", "change", "change_pct", "high", "low", "open", "prev", "volume", "turnover"]},
    }
    return out


def fmt_missing(v):
    return "-" if v is None or v == "" else str(v)


def fmt_change_pct(v):
    if v is None:
        return "-"
    try:
        n = float(v)
    except Exception:
        return "-"
    sign = "+" if n > 0 else ""
    return f"{sign}{n}%"


def render_table(quotes):
    try:
        from tabulate import tabulate  # type: ignore
    except Exception as e:
        raise RuntimeError("tabulate not installed; install requirements.txt (pip install -r requirements.txt)") from e

    headers = ["Symbol", "Last", "Date", "Time", "Change", "Change%", "High", "Low", "Open", "Prev", "Volume", "Turnover"]
    rows = []
    for q in quotes:
        rows.append([
            q.get("symbol"),
            fmt_missing(q.get("last")),
            fmt_missing(q.get("date")),
            fmt_missing(q.get("time")),
            fmt_missing(q.get("change")),
            fmt_change_pct(q.get("change_pct")),
            fmt_missing(q.get("high")),
            fmt_missing(q.get("low")),
            fmt_missing(q.get("open")),
            fmt_missing(q.get("prev")),
            fmt_missing(q.get("volume")),
            fmt_missing(q.get("turnover")),
        ])
    return tabulate(rows, headers=headers, tablefmt="github")


def parse_symbols(symbols_opt: str, symbol_list_opt):
    out = []
    if symbol_list_opt:
        out.extend(symbol_list_opt)
    if symbols_opt:
        out.extend([s.strip() for s in str(symbols_opt).split(",") if s.strip()])
    uniq = []
    seen = set()
    for s in out:
        ss = str(s).lower()
        if ss and ss not in seen:
            seen.add(ss)
            uniq.append(ss)
    if not uniq:
        raise RuntimeError("no symbols provided (use --symbols or --symbol)")
    return uniq


def fetch_one_http(symbol, timeout_ms):
    html = fetch_quote_html(symbol, timeout_ms)
    q = parse_quote_html(html, symbol)
    if not validate_parsed_quote(q):
        raise RuntimeError("parsed quote missing required fields (http)")
    return q


async def fetch_one_playwright(symbol, timeout_ms):
    raw = await fetch_quote_via_playwright(symbol, timeout_ms)
    q = build_quote_from_playwright_raw(symbol, raw)
    if not validate_parsed_quote(q):
        raise RuntimeError("parsed quote missing required fields (playwright)")
    return q


def main():
    ap = argparse.ArgumentParser(description="Fetch latest quotes from stooq.com via HTTP or Playwright; output JSON or table.")
    ap.add_argument("--symbols", help="comma-separated symbols, e.g. gc.f,btc.v")
    ap.add_argument("--symbol", action="append", default=[], help="repeatable symbol")
    ap.add_argument("--mode", default="auto", help="http|playwright|auto")
    ap.add_argument("--format", default="table", help="json|table|both")
    ap.add_argument("--no-raw", action="store_true", help="omit the 'raw' object from JSON output")
    ap.add_argument("--timeout-ms", type=int, default=15000)
    ap.add_argument("--concurrency", type=int, default=1, help="concurrency for http/auto (default 1 to avoid parallel traffic)")
    args = ap.parse_args()

    symbols = parse_symbols(args.symbols, args.symbol)
    mode = str(args.mode).lower()
    fmt = str(args.format).lower()
    timeout_ms = int(args.timeout_ms)
    concurrency = max(1, int(args.concurrency))

    if mode not in ("http", "playwright", "auto"):
        raise SystemExit(f"invalid --mode {mode}")
    if fmt not in ("json", "table", "both"):
        raise SystemExit(f"invalid --format {fmt}")

    results = []

    if mode == "playwright":
        async def run():
            for sym in symbols:
                try:
                    q = await fetch_one_playwright(sym, timeout_ms)
                    results.append((sym, q))
                except Exception as e:
                    results.append((sym, {"symbol": sym, "error": {"message": str(e), "mode": mode}}))
        asyncio.run(run())
    else:
        http_results = {}
        http_errors = {}
        with ThreadPoolExecutor(max_workers=concurrency) as ex:
            futs = {ex.submit(fetch_one_http, sym, timeout_ms): sym for sym in symbols}
            for fut in as_completed(futs):
                sym = futs[fut]
                try:
                    http_results[sym] = fut.result()
                except Exception as e:
                    http_errors[sym] = e

        if mode == "http":
            for sym in symbols:
                if sym in http_results:
                    results.append((sym, http_results[sym]))
                else:
                    e = http_errors.get(sym)
                    results.append((sym, {"symbol": sym, "error": {"message": str(e) if e else "http fetch/parse failed", "mode": "http"}}))
        else:
            # auto: retry only the failed symbols via playwright (sequential; keeps it simple and stable)
            fallback = [sym for sym in symbols if sym not in http_results]

            async def run_fallback():
                out = {}
                for sym in fallback:
                    try:
                        out[sym] = await fetch_one_playwright(sym, timeout_ms)
                    except Exception as e:
                        out[sym] = {"symbol": sym, "error": {"message": str(e), "mode": "auto"}}
                return out

            fallback_results = asyncio.run(run_fallback()) if fallback else {}

            for sym in symbols:
                if sym in http_results:
                    results.append((sym, http_results[sym]))
                else:
                    results.append((sym, fallback_results.get(sym) or {"symbol": sym, "error": {"message": "auto fetch failed", "mode": "auto"}}))

    # Drop the (symbol, result) tuples now that we restored ordering.
    results = [r for _, r in results]

    failures = [r for r in results if r and isinstance(r, dict) and r.get("error")]
    json_results = results
    if args.no_raw:
        json_results = []
        for r in results:
            if r and isinstance(r, dict) and (not r.get("error")):
                rr = dict(r)
                rr.pop("raw", None)
                json_results.append(rr)
            else:
                json_results.append(r)

    if fmt in ("json", "both"):
        sys.stdout.write(json.dumps(json_results, indent=2) + "\n")
        if fmt == "json":
            return 2 if failures else 0
        sys.stdout.write("\n")

    # Table; also print failures to stderr.
    successes_or_blanks = []
    failures = []
    for r in results:
        if r and r.get("error"):
            failures.append(r)
            successes_or_blanks.append({"symbol": r.get("symbol")})
        else:
            successes_or_blanks.append(r)

    sys.stdout.write(render_table(successes_or_blanks) + "\n")
    if failures:
        sys.stderr.write(f"\nFailures ({len(failures)}/{len(results)}):\n")
        for f in failures:
            sys.stderr.write(f"- {f.get('symbol')}: {f.get('error', {}).get('message')}\n")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
