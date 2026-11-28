# Accounting test suites (v94)

These run the REAL app in a headless browser (real IndexedDB, no Firebase) through full cycles:
purchase, BOM issue, wages, release, completion, delivery, invoice, return, receipt, payment, cancellations -
and deliberately break individual steps to prove nothing is left half-done.

    npm i playwright && npx playwright install chromium
    python3 -m http.server 8765        # in the project folder, in one terminal
    node tests/accounting-suite-1.js   # in another
    node tests/accounting-suite-2.js
    node tests/accounting-suite-3.js   # WIP absorption, provisional cost, progress tab
    node tests/accounting-suite-4.js   # v98: pool double count, true-up after sales, all-or-nothing saves, stock-account guard

Every line must start with PASS. Each step also checks: trial balance, all Health Check controls,
and (at the end) every built-in check of every report in the Report Suite.

## v101 additions
- books-suite.js: runs the full November cycle, then checks every Accounting Books tab against the ledger and the P&L,
  the CSV, the sidebar and the classic screens.
- fix-suite.js, opening-balances.js, failure-injection.js, full-month-cycle.js: from the v98 audit.
Run: serve the folder (python3 -m http.server 8765) then `node tests/<name>.js`.
