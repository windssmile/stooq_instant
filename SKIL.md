# Skill: Stooq Quote Fetcher (HTTP + Playwright)

Use this skill to fetch and parse the latest quote data from Stooq quote pages like `https://stooq.com/q/?s=gc.f`.

This repo provides two equivalent CLIs:
- Node: `bin/stooq-quote.js`
- Python: `stooq_quote.py`

Both CLIs:
- Fetch modes: `http`, `playwright`, `auto` (default)
- Output formats: `json`, `table`, `both` (default `table`)
- Fields: `Last`, `Date`, `Time`, `Change` (abs + %), `High`, `Low`, `Open`, `Prev`, `Volume`, `Turnover`
- Traffic control: default sequential (`--concurrency 1`)
- Cleaner JSON: `--no-raw` omits the debug `raw` object

## Preferred Runtime
Default to Node.js unless the caller explicitly requests Python.

## Quick Start

### Node (recommended)
Install:
```bash
npm i
```

Run (HTTP only, JSON only, no debug raw):
```bash
node bin/stooq-quote.js --symbols '8002.jp,btc.v,usdjpy,^spx' --mode http --format json --no-raw
```

Run (auto fallback, print JSON then table):
```bash
node bin/stooq-quote.js --symbols 'gc.f,btc.v' --mode auto --format both --no-raw
```

### Python
Install base deps (table output):
```bash
python3 -m pip install -r requirements.txt
```

Run:
```bash
python3 stooq_quote.py --symbols 'gc.f,btc.v' --mode http --format both --no-raw
```

## Playwright Mode (Browser Simulation)
Use Playwright only when `http` parsing fails (anti-bot / missing ids) or when explicitly requested.

### Node Playwright
```bash
npx playwright install chromium
node bin/stooq-quote.js --symbols 'gc.f,btc.v' --mode playwright --format json --no-raw
```

### Python Playwright
```bash
python3 -m pip install -r requirements-browser.txt
python3 -m playwright install chromium
python3 stooq_quote.py --symbols 'gc.f,btc.v' --mode playwright --format json --no-raw
```

## CLI Contract (Both CLIs)

### Symbols input
- `--symbols` takes a comma-separated list.
- `--symbol` can be repeated.
- Symbols are case-insensitive and normalized to lowercase.

Important: symbols like `^spx` must be quoted in shells that treat `^` specially.
- Good: `--symbols '^spx,btc.v'`
- Good: `--symbol '^spx'`

### Modes
- `--mode http`: single HTTP GET + parse.
- `--mode playwright`: real browser navigation + DOM extraction.
- `--mode auto` (default): try `http`, then fallback to `playwright` if required fields are missing or parsing fails.

### Formats
- `--format json`: prints JSON array only.
- `--format table`: prints a table only.
- `--format both`: prints JSON array, blank line, then table.

### Cleaner JSON
- `--no-raw`: removes the `raw` field from successful JSON records.
  - Failures stay as `{ "symbol": "...", "error": { "message": "...", "mode": "..." } }`.

### Traffic control
- `--concurrency N`: applies to `http` / `auto`. Default is `1` (sequential).
  - `playwright` effectively runs sequential regardless.
- `--timeout-ms`: request/navigation timeout per symbol (default `15000`).

## Output Schema (JSON)
The JSON output is an array of records. Each successful record has:
```json
{
  "symbol": "btc.v",
  "last": 69786.48,
  "date": "2026-02-14",
  "time": "12:09:42",
  "updated_at": "2026-02-14 12:09:42",
  "change": 804.99,
  "change_pct": 1.17,
  "high": 69865.05,
  "low": 68709.51,
  "open": 68981.48,
  "prev": 68981.49,
  "volume": 11100,
  "turnover": 767000000
}
```

Notes:
- `updated_at` is a simple string concat of the page `date` + `time` (no timezone inference).
- `volume`/`turnover` can be `null` if blank on the page.
- Multipliers are supported: `k`=thousand, `m`=million, `g`=billion.

## How Parsing Works (Implementation Notes)
Parsing is ID-based and resilient across instruments:
- Quote fields use ids like `aq_${symbol}_d2`, `aq_${symbol}_t1`, `aq_${symbol}_m2`, etc.
- `Last` varies by instrument (`c0|3`, `c2|3`, `c3|3`, ...); the parser tries multiple candidates and picks the last occurrence.

Relevant code:
- Node parser: `src/stooq/parse.js`
- Node HTTP fetch: `src/stooq/http.js`
- Node Playwright fetch: `src/stooq/playwright.js`
- Python implementation: `stooq_quote.py`

## Failure Handling
- Partial failure is allowed. A symbol failure returns an `error` object for that symbol.
- Exit code is `2` if any failures occur (for JSON-only runs too).

## Bot Operating Rules
- Prefer `--mode http` first; use `--mode auto` if you want automatic fallback.
- Keep traffic low: accept the default sequential behavior unless explicitly asked for speed.
- Use `--no-raw` by default for user-facing output; include raw only for debugging.

