# Stooq Quote Fetcher (HTTP + Playwright)

Fetch latest quote data from Stooq quote pages (e.g. `gc.f`, `btc.v`) and output JSON or a table.

## Node.js

### Install

```bash
npm i
npx playwright install chromium
```

### Run

```bash
node bin/stooq-quote.js --symbols gc.f,btc.v --mode auto --format table
node bin/stooq-quote.js --symbols gc.f,btc.v --mode http --format json
node bin/stooq-quote.js --symbols gc.f,btc.v --mode http --format json --no-raw
node bin/stooq-quote.js --symbol gc.f --symbol btc.v --mode playwright --format json
```

Default `--concurrency` is `1` (sequential) to avoid parallel traffic.

### Test (offline, fixture-based)

```bash
npm run lint
```

## Python

### Install (base)

```bash
python3 -m pip install -r requirements.txt
```

### Install (browser mode)

```bash
python3 -m pip install -r requirements-browser.txt
python3 -m playwright install chromium
```

### Run

```bash
python3 stooq_quote.py --symbols gc.f,btc.v --mode auto --format table
python3 stooq_quote.py --symbols gc.f,btc.v --mode http --format json
python3 stooq_quote.py --symbols gc.f,btc.v --mode http --format json --no-raw
python3 stooq_quote.py --symbol gc.f --symbol btc.v --mode playwright --format json
```

Default `--concurrency` is `1` (sequential) to avoid parallel traffic.

### Test (offline, fixture-based)

```bash
# no tests shipped
```
