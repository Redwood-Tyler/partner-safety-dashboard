# Redwood Services — Partner Safety Dashboard

Static GitHub Pages dashboard showing FY 2025–26 insurance claim performance across all 18 Redwood Services portfolio companies.

## Live Site

**https://redwood-tyler.github.io/partner-safety-dashboard**

## What It Shows

- Overall safety rating per partner (Critical / Needs Improvement / Monitor / Good)
- Claim counts by line (WC, Auto, GL), open vs. closed, OSHA recordables, litigation flags
- Safety National financial data: total incurred, paid, open reserve, incurred rank (#1–18)
- Exposure-adjusted risk scores vs. portfolio average frequency and severity
- Partner Backed Loss Fund (PBLF) utilization — over/under vs. FY 2025–26 fund
- Monthly claim frequency trend (mini bar chart per partner)
- Per-category ratings: WC Severity, WC Frequency, Auto Performance, GL/Property, Claim Resolution, Litigation

## File Structure

```
index.html    HTML shell — links to CSS and JS files
styles.css    All styling
config.js     Constants: date period, column IDs, rating thresholds, portfolio totals
data.js       Embedded static data: CLAIMS_DATA (377 records), FIN_DATA, EXPOSURE_DATA, PBLF_DATA
app.js        All application logic: analysis, rating engine, rendering, UI handlers
README.md     This file
.gitignore    Standard web project ignores
```

## Data Sources

| Dataset | Source | As Of |
|---------|--------|-------|
| Claim records (377) | Monday.com Board 8584529295 | Jun 30, 2026 |
| Financial (incurred, paid, reserve) | Safety National Claim Paid & Financial Report | Jun 25, 2026 |
| Exposures (payroll, vehicles, revenue) | Annual Exposures spreadsheet | FY 2025–26 |
| PBLF (fund vs. incurred) | Internal PBLF schedule | FY 2025–26 |

**Fiscal Year:** Jun 1, 2025 – May 31, 2026. Claims are filtered to this window by incident date.

## Rating Logic

| Rating | Triggers |
|--------|---------|
| 🔴 Critical | Any litigation · 2+ hospitalizations · 10+ WC *and* 3+ ER visits |
| 🟠 Needs Improvement | ≥55% open claims · 15+ WC · 3+ ER visits |
| 🟡 Monitor | ≥40% open claims · 8+ WC |
| 🟢 Good | None of the above |

## Updating the Data

This is a static snapshot. To refresh:

1. Pull updated claim records from Monday.com and replace `CLAIMS_DATA` in `data.js`
2. Update `FIN_DATA` from the latest Safety National report
3. Update `CONFIG.SNAPSHOT_DATE` in `config.js`
4. Commit and push — GitHub Pages auto-deploys within ~60 seconds

## Contact

Tyler Manning · Director of EHS · Redwood Services · tyler@redwoodservices.com
