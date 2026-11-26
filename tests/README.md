# Accounting test suites (v94)

These run the REAL app in a headless browser (real IndexedDB, no Firebase) through full cycles:
purchase, BOM issue, wages, release, completion, delivery, invoice, return, receipt, payment, cancellations -
and deliberately break individual steps to prove nothing is left half-done.

    npm i playwright && npx playwright install chromium
    python3 -m http.server 8765        # in the project folder, in one terminal
    node tests/accounting-suite-1.js   # in another
    node tests/accounting-suite-2.js

Every line must start with PASS. Each step also checks: trial balance, all Health Check controls,
and (at the end) every built-in check of every report in the Report Suite.
