/**
 * app.js — Dashboard application logic
 * Redwood Services · Partner Safety Scorecard Dashboard · FY 2025–26
 *
 * Depends on: config.js, data.js (must be loaded first via index.html)
 *
 * Entry point: initDashboard() — called on DOMContentLoaded
 */

'use strict';

/* ── Partner name aliases (board label → data key) ───────────────────────── */
const PARTNER_ALIASES = {
  'Crisafulli Bros':    'Crisafulli',
  'Crisafulli Bros.':   'Crisafulli',
  'ABC Allbritten':     'Allbritten',
  'Environmental Masters': 'Environment Masters',
  'John C Flood':       'John C. Flood',
  'HVAC Pro':           'Apollo',
  'HVAC Pro (Apollo)':  'Apollo',
};
function normalizeName(n) { return PARTNER_ALIASES[n] || n; }

/* ── Module-level state ───────────────────────────────────────────────────── */
let allPartners  = [];   // analyzed partner objects
let activeFilter = 'all';
let activeSort   = 'rating';

// Computed portfolio-average claim frequencies (set in render())
let PORT_FREQ = { wc: 0, auto: 0, gl: 0 };

// Ranked list of partners by total incurred (for #1–18 incurred rank display)
const FIN_RANKED = Object.entries(FIN_DATA)
  .sort((a, b) => b[1].total_incurred - a[1].total_incurred)
  .map(([name], i) => ({ name, rank: i + 1 }));

/* ── Utility helpers ──────────────────────────────────────────────────────── */

/**
 * Safely read a Monday.com column value from a claim item.
 * Returns an empty string if the value is missing, null, or "None".
 * @param {Object} item  - Claim record with a column_values object
 * @param {string} col   - Column ID (from CONFIG.COLS)
 */
function cv(item, col) {
  const v = item.column_values?.[col];
  return (v && v !== 'None' && v !== 'null') ? String(v).trim() : '';
}

/**
 * Returns true if a flag column value is set (not blank / N/A / No / None).
 */
function isFlagged(v) {
  return v && !['NA', 'N/A', 'NO', 'NONE', ''].includes(v.trim().toUpperCase());
}

/** Integer percentage: (n / d) * 100, 0 if d is 0. */
function pct(n, d) { return d ? Math.round(100 * n / d) : 0; }

/** Format a dollar amount as $123K or $999 (short form for cards). */
function fmt$(n) {
  if (!n || n === 0) return '—';
  return n >= 1000 ? '$' + (n / 1000).toFixed(0) + 'K' : '$' + Math.round(n);
}

/** Format a dollar amount as $1,234,567 (full form for detail tables). */
function fmt$full(n) {
  if (!n || n === 0) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Incurred rank (1 = highest cost) for a given partner name. */
function finRank(name) {
  return (FIN_RANKED.find(r => r.name === name) || { rank: 18 }).rank;
}

/* ── Portfolio-average exposure metrics ───────────────────────────────────── */
/**
 * Computes portfolio-wide loss rates per unit of exposure.
 * Used to benchmark individual partners against the group average.
 * Results are stored in PORT_EXP (severity) and PORT_FREQ (frequency).
 */
const PORT_EXP = (() => {
  let twcI = 0, twcP = 0, tauI = 0, tauV = 0, tglI = 0, tglR = 0;
  for (const [name, fin] of Object.entries(FIN_DATA)) {
    const exp = EXPOSURE_DATA[name] || {};
    if (exp.wc_payroll > 0)    { twcI += fin.wc_incurred   || 0; twcP += exp.wc_payroll; }
    if (exp.auto_vehicles > 0) { tauI += fin.auto_incurred  || 0; tauV += exp.auto_vehicles; }
    if (exp.gl_revenue > 0)    { tglI += fin.gl_incurred    || 0; tglR += exp.gl_revenue; }
  }
  return {
    wc:   twcP > 0 ? twcI / (twcP / 100000) : 0,   // $ per $100K payroll
    auto: tauV > 0 ? tauI / tauV             : 0,   // $ per vehicle
    gl:   tglR > 0 ? tglI / (tglR / 1000000): 0,   // $ per $1M revenue
  };
})();

/* ── Rating logic ─────────────────────────────────────────────────────────── */
const RATING_ORDER = { 'CRITICAL': 0, 'NEEDS IMPROVEMENT': 1, 'MONITOR': 2, 'GOOD': 3 };

/**
 * Compute an overall safety rating for a partner.
 * Ratings: CRITICAL > NEEDS IMPROVEMENT > MONITOR > GOOD
 * Thresholds are defined in CONFIG.THRESHOLDS.
 * @param {Object} p - Analyzed partner object
 */
function overallRating(p) {
  const t = CONFIG.THRESHOLDS;
  if (p.lit > 0 || p.hosp >= t.CRITICAL_HOSP || (p.wc >= t.CRITICAL_WC_ER[0] && p.er >= t.CRITICAL_WC_ER[1]))
    return 'CRITICAL';
  if (p.open / Math.max(p.total, 1) >= t.NI_OPEN_PCT || p.wc >= t.NI_WC || p.er >= t.NI_ER)
    return 'NEEDS IMPROVEMENT';
  if (p.open / Math.max(p.total, 1) >= t.MONITOR_OPEN_PCT || p.wc >= t.MONITOR_WC)
    return 'MONITOR';
  return 'GOOD';
}

/**
 * Compute per-category ratings for a partner's detail panel.
 * @param {Object} p - Analyzed partner object
 * @returns {Object} Map of category name → rating string
 */
function categoryRatings(p) {
  const openPct = pct(p.open, p.total);
  const afPct   = p.auto > 0 ? pct(p.afYes, p.auto) : 0;
  return {
    'WC Severity':      p.hosp >= 1 || p.er >= 3 ? 'CRITICAL' : p.er >= 2 || p.wc >= 10 ? 'NEEDS IMPROVEMENT' : p.er >= 1 ? 'MONITOR' : 'GOOD',
    'WC Frequency':     p.wc >= 15 ? 'CRITICAL' : p.wc >= 10 ? 'NEEDS IMPROVEMENT' : p.wc >= 7 ? 'MONITOR' : 'GOOD',
    'Auto Performance': p.auto === 0 ? 'GOOD' : afPct >= 65 ? 'NEEDS IMPROVEMENT' : afPct >= 45 ? 'MONITOR' : 'GOOD',
    'GL / Property':    p.gl >= 8 ? 'NEEDS IMPROVEMENT' : p.gl >= 4 ? 'MONITOR' : 'GOOD',
    'Claim Resolution': openPct >= 60 ? 'NEEDS IMPROVEMENT' : openPct >= 45 ? 'MONITOR' : 'GOOD',
    'Litigation':       p.lit > 0 ? 'CRITICAL' : 'GOOD',
  };
}

/* ── Data analysis ────────────────────────────────────────────────────────── */
/**
 * Analyze raw claim records and aggregate into per-partner summary objects.
 * Only includes claims whose incident date falls within CONFIG.PERIOD_START/END.
 * @param {Array} items - Raw claim records from CLAIMS_DATA
 * @returns {Array} Array of analyzed partner objects, sorted by rating
 */
function analyzeItems(items) {
  const today     = new Date();
  const byPartner = {};

  for (const item of items) {
    // Use incident date (preferred) or received date as fallback
    const rawIncident = cv(item, CONFIG.COLS.INCIDENT_DATE);
    const incidentDate = rawIncident ? rawIncident.slice(0, 10) : cv(item, CONFIG.COLS.RECEIVED_DATE);

    // Skip claims outside the fiscal year window
    if (!incidentDate || incidentDate < CONFIG.PERIOD_START || incidentDate > CONFIG.PERIOD_END) continue;

    const partner = normalizeName(cv(item, CONFIG.COLS.PARTNER) || 'Unknown');
    const type    = cv(item, CONFIG.COLS.CLAIM_TYPE);
    const status  = cv(item, CONFIG.COLS.STATUS);
    const closed  = status === CONFIG.STATUS_CLOSED;

    // Initialize partner bucket on first encounter
    if (!byPartner[partner]) {
      byPartner[partner] = {
        name: partner, total: 0, auto: 0, wc: 0, gl: 0,
        open: 0, closed: 0, osha: 0, subro: 0, lit: 0, er: 0, hosp: 0, afYes: 0,
        monthly: {},   // { 'YYYY-MM': count }
        openItems: [], // list of open claims for detail panel
      };
    }

    const p = byPartner[partner];
    p.total++;

    // Count by claim type
    if (type === 'Automobile Accident')    p.auto++;
    else if (type === 'Worker Compensation') p.wc++;
    else if (type === 'General Liability')   p.gl++;

    // Open vs closed
    if (closed) p.closed++; else p.open++;

    // Flag counts
    if (cv(item, CONFIG.COLS.OSHA) === 'Submitted')                                  p.osha++;
    if (cv(item, CONFIG.COLS.SUBROGATION) === 'Submitted')                            p.subro++;
    if (isFlagged(cv(item, CONFIG.COLS.LITIGATION)) &&
        !['NA','N/A'].includes((cv(item, CONFIG.COLS.LITIGATION)||'').toUpperCase())) p.lit++;
    if (cv(item, CONFIG.COLS.MEDICAL) === 'Emergency Room')                           p.er++;
    if (!['No','','N/A'].includes(cv(item, CONFIG.COLS.HOSPITALIZED)))                p.hosp++;
    if (cv(item, CONFIG.COLS.AT_FAULT) === 'Yes')                                     p.afYes++;

    // Monthly frequency tracking (for trend chart)
    if (incidentDate.length >= 7) {
      const mo = incidentDate.slice(0, 7);
      p.monthly[mo] = (p.monthly[mo] || 0) + 1;
    }

    // Build open claims list for detail panel
    if (!closed) {
      const ageMs   = incidentDate ? today - new Date(incidentDate) : 0;
      const ageDays = Math.floor(ageMs / 86400000);
      p.openItems.push({ name: item.name, type, date: incidentDate, ageDays });
    }
  }

  // Post-process each partner
  for (const p of Object.values(byPartner)) {
    p.openItems.sort((a, b) => b.ageDays - a.ageDays);

    // Trend: compare H2 (Jun–Dec 2025) vs H1 (Jan–May 2026)
    const h2 = Object.entries(p.monthly).filter(([k]) => k >= '2025-06' && k <= '2025-12').reduce((s,[,v]) => s+v, 0);
    const h1 = Object.entries(p.monthly).filter(([k]) => k >= '2026-01' && k <= '2026-05').reduce((s,[,v]) => s+v, 0);
    p.h2 = h2;
    p.h1 = h1;
    p.trendPct = h2 > 0 ? Math.round((h1 - h2) / h2 * 100) : 0;

    p.overall = overallRating(p);
    p.cats    = categoryRatings(p);
  }

  return Object.values(byPartner).filter(p => p.total > 0);
}

/* ── Render functions ─────────────────────────────────────────────────────── */

/**
 * Main render — analyzes data, computes PORT_FREQ, then renders portfolio
 * summary bar and partner card grid.
 * @param {Array} partners - Analyzed partner objects from analyzeItems()
 */
function render(partners) {
  allPartners = partners;

  // Compute portfolio-average claim frequencies for exposure benchmarking
  let twcC=0,twcP=0,tauC=0,tauV=0,tglC=0,tglR=0;
  for (const p of partners) {
    const e = EXPOSURE_DATA[p.name] || {};
    if (e.wc_payroll > 0)    { twcC += p.wc;   twcP += e.wc_payroll; }
    if (e.auto_vehicles > 0) { tauC += p.auto; tauV += e.auto_vehicles; }
    if (e.gl_revenue > 0)    { tglC += p.gl;   tglR += e.gl_revenue; }
  }
  PORT_FREQ = {
    wc:   twcP > 0 ? twcC / (twcP / 1000000)   : 0, // claims per $1M payroll
    auto: tauV > 0 ? tauC / (tauV / 10)         : 0, // claims per 10 vehicles
    gl:   tglR > 0 ? tglC / (tglR / 10000000)   : 0, // claims per $10M revenue
  };

  renderPortfolio(partners);
  renderGrid();
  document.getElementById('main').style.display = 'block';
}

/**
 * Render the portfolio summary stats bar at the top of the page.
 */
function renderPortfolio(partners) {
  const total = partners.reduce((s,p) => s+p.total, 0);
  const open  = partners.reduce((s,p) => s+p.open,  0);
  const wc    = partners.reduce((s,p) => s+p.wc,    0);
  const auto  = partners.reduce((s,p) => s+p.auto,  0);
  const gl    = partners.reduce((s,p) => s+p.gl,    0);
  const osha  = partners.reduce((s,p) => s+p.osha,  0);
  const lit   = partners.reduce((s,p) => s+p.lit,   0);
  const crit  = partners.filter(p => p.overall === 'CRITICAL').length;
  const ni    = partners.filter(p => p.overall === 'NEEDS IMPROVEMENT').length;
  const mon   = partners.filter(p => p.overall === 'MONITOR').length;
  const good  = partners.filter(p => p.overall === 'GOOD').length;

  document.getElementById('portfolio-bar').innerHTML = `
    <div class="pstat"><div class="pstat-val">${partners.length}</div><div class="pstat-label">Partners</div></div>
    <div class="pstat"><div class="pstat-val">${total}</div><div class="pstat-label">Total Claims</div></div>
    <div class="pstat"><div class="pstat-val red">${open}</div><div class="pstat-label">Open Claims</div></div>
    <div class="pstat"><div class="pstat-val">${wc}</div><div class="pstat-label">Worker Comp</div></div>
    <div class="pstat"><div class="pstat-val">${auto}</div><div class="pstat-label">Auto</div></div>
    <div class="pstat"><div class="pstat-val">${gl}</div><div class="pstat-label">GL</div></div>
    <div class="pstat"><div class="pstat-val amber">${osha}</div><div class="pstat-label">OSHA Rec.</div></div>
    <div class="pstat"><div class="pstat-val ${lit>0?'red':'green'}">${lit}</div><div class="pstat-label">Litigation</div></div>
    <div class="pstat"><div class="pstat-val red">${crit}</div><div class="pstat-label">🔴 Critical</div></div>
    <div class="pstat"><div class="pstat-val amber">${ni}</div><div class="pstat-label">🟠 Needs Impr.</div></div>
    <div class="pstat"><div class="pstat-val amber">${mon}</div><div class="pstat-label">🟡 Monitor</div></div>
    <div class="pstat"><div class="pstat-val green">${good}</div><div class="pstat-label">🟢 Good</div></div>
    <div class="pstat"><div class="pstat-val red">$${(CONFIG.PORTFOLIO_TOTAL_INCURRED/1000000).toFixed(2)}M</div><div class="pstat-label">Total Incurred</div></div>
    <div class="pstat"><div class="pstat-val amber">$${(CONFIG.OPEN_RESERVE/1000000).toFixed(2)}M</div><div class="pstat-label">Open Reserve</div></div>
  `;

  // Update filter tab labels with live counts
  const counts = { all: partners.length, 'CRITICAL': crit, 'NEEDS IMPROVEMENT': ni, 'MONITOR': mon, 'GOOD': good };
  const labels  = { all:'All Partners','CRITICAL':'🔴 Critical','NEEDS IMPROVEMENT':'🟠 Needs Improvement','MONITOR':'🟡 Monitor','GOOD':'🟢 Good' };
  document.querySelectorAll('.ftab').forEach(tab => {
    const f = tab.dataset.filter;
    tab.textContent = labels[f] + ` (${counts[f] || 0})`;
  });
}

/**
 * Render the partner card grid, applying current filter and sort.
 */
function renderGrid() {
  let list = [...allPartners];

  // Filter
  if (activeFilter !== 'all') list = list.filter(p => p.overall === activeFilter);

  // Sort
  if (activeSort === 'rating') list.sort((a, b) => RATING_ORDER[a.overall] - RATING_ORDER[b.overall] || b.total - a.total);
  else if (activeSort === 'name')    list.sort((a, b) => a.name.localeCompare(b.name));
  else if (activeSort === 'total')   list.sort((a, b) => b.total - a.total);
  else if (activeSort === 'open')    list.sort((a, b) => b.open  - a.open);
  else if (activeSort === 'exprisk') {
    function _expScore(p) {
      const e = EXPOSURE_DATA[p.name];
      if (!e || p.total === 0) return -1;
      const r = [];
      if (e.wc_payroll > 0 && PORT_FREQ.wc > 0)      r.push((p.wc  / (e.wc_payroll   / 1e6)) / PORT_FREQ.wc);
      if (e.auto_vehicles > 0 && PORT_FREQ.auto > 0)  r.push((p.auto/ (e.auto_vehicles / 10 )) / PORT_FREQ.auto);
      if (e.gl_revenue > 0 && PORT_FREQ.gl > 0)       r.push((p.gl  / (e.gl_revenue    / 1e7)) / PORT_FREQ.gl);
      return r.length ? r.reduce((a, b) => a + b, 0) / r.length : -1;
    }
    list.sort((a, b) => _expScore(b) - _expScore(a));
  }

  const grid = document.getElementById('grid');
  if (list.length === 0) {
    grid.innerHTML = '<div class="no-results">No partners match the selected filter.</div>';
    return;
  }
  grid.innerHTML = list.map(p => buildCard(p)).join('');
}

/**
 * Build the HTML for a single partner card including its expandable detail panel.
 * @param {Object} p - Analyzed partner object
 * @returns {string} HTML string
 */
function buildCard(p) {
  const rClass  = p.overall.replace(/ /g, '_');
  const afPct   = p.auto > 0 ? pct(p.afYes, p.auto) : 0;
  const openPct = pct(p.open, p.total);
  const fin     = FIN_DATA[p.name] || {};
  const ti      = fin.total_incurred || 0;
  const resv    = fin.future_reserve || 0;
  const paid    = fin.paid_to_date   || 0;
  const pip     = fin.paid_in_period || 0;
  const resvPct = ti > 0 ? Math.round(100 * resv / ti) : 0;
  const rank    = ti > 0 ? finRank(p.name) : 0;

  // Trend indicator
  const trendHTML = p.h2 === 0 ? '' :
    p.trendPct >= 10  ? `<span class="trend-pill trend-up">▲ ${p.trendPct}%</span>` :
    p.trendPct <= -10 ? `<span class="trend-pill trend-down">▼ ${Math.abs(p.trendPct)}%</span>` :
                        `<span class="trend-pill trend-flat">→ Stable</span>`;

  // Category ratings grid
  const catHTML = Object.entries(p.cats).map(([name, r]) => {
    const rc  = r.replace(/ /g, '_');
    const dot = r==='CRITICAL'?'🔴':r==='NEEDS IMPROVEMENT'?'🟠':r==='MONITOR'?'🟡':'🟢';
    return `<div class="cat-item"><span class="cat-name">${name}</span><span class="cat-badge badge-${rc}">${dot}</span></div>`;
  }).join('');

  // Monthly trend mini-bar chart
  const mos    = Object.keys(p.monthly).sort().slice(-10);
  const maxV   = Math.max(...mos.map(m => p.monthly[m]), 1);
  const trendBars = mos.map(m => {
    const v  = p.monthly[m] || 0;
    const h  = Math.max(4, Math.round((v / maxV) * 36));
    const cl = v >= 4 ? 'c3' : v >= 3 ? 'c2' : 'c0';
    const lbl = m.slice(5) + '/' + m.slice(2, 4);
    return `<div class="mini-bar-wrap"><div class="mini-bar ${cl}" style="height:${h}px"></div><div class="mini-label">${lbl}</div></div>`;
  }).join('');

  // Open claims list (top 5 by age)
  const openListHTML = p.openItems.slice(0, 5).map(oc => {
    const lt  = oc.type==='Worker Compensation'?'WC':oc.type==='Automobile Accident'?'Auto':'GL';
    const cls = lt==='WC'?'oi-wc':lt==='Auto'?'oi-auto':'oi-gl';
    const daysColor = oc.ageDays >= 180 ? 'color:#991b1b' : oc.ageDays >= 90 ? 'color:#856404' : '';
    return `<div class="open-item"><span class="oi-type ${cls}">${lt}</span><span class="oi-name">${oc.name.slice(0,45)}</span><span class="oi-days" style="${daysColor}">${oc.ageDays}d</span></div>`;
  }).join('');

  // Exposure-adjusted risk score (partner freq vs portfolio avg)
  const expScore = (() => {
    const e = EXPOSURE_DATA[p.name];
    if (!e || p.total === 0) return null;
    const ratios = [];
    if (e.wc_payroll > 0    && PORT_FREQ.wc > 0)   ratios.push((p.wc   / (e.wc_payroll   / 1e6)) / PORT_FREQ.wc);
    if (e.auto_vehicles > 0 && PORT_FREQ.auto > 0)  ratios.push((p.auto / (e.auto_vehicles / 10))  / PORT_FREQ.auto);
    if (e.gl_revenue > 0    && PORT_FREQ.gl > 0)    ratios.push((p.gl   / (e.gl_revenue    / 1e7)) / PORT_FREQ.gl);
    return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
  })();
  const expText  = expScore != null ? expScore.toFixed(2) + 'x' : '—';
  const expColor = expScore == null ? '#888' : expScore > 1.5 ? '#991b1b' : expScore > 1.1 ? '#856404' : '#155724';
  const expBg    = expScore == null ? '#f8f9fc' : expScore > 1.5 ? '#fef2f2' : expScore > 1.1 ? '#fffbeb' : '#f0fdf4';
  const rankColor= ti > 0 ? (rank <= 5 ? '#991b1b' : '#155724') : '#888';
  const rankBg   = ti > 0 ? (rank <= 5 ? '#fef2f2' : '#f0fdf4') : '#f8f9fc';

  // Financial breakdown rows
  const finLines = [
    ti > 0 ? ['Worker Comp',    fin.wc_incurred   || 0] : null,
    ti > 0 ? ['Automobile',     fin.auto_incurred  || 0] : null,
    ti > 0 ? ['Gen. Liability', fin.gl_incurred    || 0] : null,
  ].filter(l => l && l[1] > 0);
  const finDetailRows = finLines.map(([label, val]) => {
    const barW = ti > 0 ? Math.round((val / ti) * 100) : 0;
    return `<tr><td>${label}</td><td style="text-align:right;font-weight:600">${fmt$full(val)}</td>
      <td style="width:80px"><div class="fin-bar-wrap"><div class="fin-bar-bg"><div class="fin-bar-fill" style="width:${barW}%"></div></div><span style="font-size:10px;color:#888">${barW}%</span></div></td></tr>`;
  }).join('');

  // Exposure metrics section
  const expHTML = buildExposureSection(p, fin);

  // PBLF section
  const pblf_html = buildPBLFSection(p.name);

  const cid = 'card-' + p.name.replace(/[^a-zA-Z0-9]/g, '_');
  return `
    <div class="card" id="${cid}">
      <div class="card-stripe stripe-${rClass}"></div>
      <div class="card-header" onclick="toggleDetail('${cid}')">
        <div class="card-name">${p.name}</div>
        <span class="rating-badge badge-${rClass}">${p.overall === 'NEEDS IMPROVEMENT' ? 'NEEDS IMPR.' : p.overall}</span>
      </div>
      <div class="card-stats">
        <div class="stat-box"><div class="stat-val">${p.total}</div><div class="stat-label">Claims</div></div>
        <div class="stat-box"><div class="stat-val ${p.open>=10?'red':p.open>=5?'amber':''}">${p.open}</div><div class="stat-label">Open</div></div>
        <div class="stat-box"><div class="stat-val ${p.osha>=10?'amber':''}">${p.osha}</div><div class="stat-label">OSHA</div></div>
        <div class="stat-box"><div class="stat-val ${p.wc>=10?'red':''}">${p.wc}</div><div class="stat-label">WC</div></div>
        <div class="stat-box"><div class="stat-val">${p.auto}</div><div class="stat-label">Auto</div></div>
        <div class="stat-box"><div class="stat-val ${p.lit>0?'red':'green'}">${p.lit > 0 ? '⚖' : p.gl}</div><div class="stat-label">${p.lit > 0 ? 'Litigation' : 'GL'}</div></div>
      </div>
      ${ti > 0 ? `<div class="fin-row">
        <div class="fin-cell"><div class="fv red">${fmt$(ti)}</div><div class="fl">Total Incurred</div></div>
        <div class="fin-cell"><div class="fv">${fmt$(pip)}</div><div class="fl">Paid This Period</div></div>
        <div class="fin-cell"><div class="fv ${resv>=100000?'red':''}">${fmt$(resv)}</div><div class="fl">Reserve (${resvPct}%)</div></div>
      </div>` : ''}
      <div class="rank-row">
        <div class="rank-cell" style="background:${rankBg}"><div class="rank-val" style="color:${rankColor}">${ti > 0 ? '#' + rank : '—'}</div><div class="rank-lbl">Incurred Rank (of 18)</div></div>
        <div class="rank-cell" style="background:${expBg}"><div class="rank-val" style="color:${expColor}">${expText}</div><div class="rank-lbl">Exp. Risk Score</div></div>
      </div>
      <div class="card-footer" onclick="toggleDetail('${cid}')">
        <div>${trendHTML}</div>
        <div class="open-count"><strong>${openPct}%</strong> open · ${p.auto > 0 ? afPct + '% at-fault' : p.wc + ' WC'}</div>
        <div class="detail-toggle" id="${cid}-toggle">▾ Details</div>
      </div>
      <div class="detail-panel" id="${cid}-detail">
        <div class="dp-section">
          <div class="dp-title">Performance Categories</div>
          <div class="cat-grid">${catHTML}</div>
        </div>
        <div class="dp-section">
          <div class="dp-title">Monthly Frequency</div>
          <div class="mini-trend">${trendBars}</div>
        </div>
        ${expHTML}
        ${ti > 0 ? `<div class="dp-section">
          <div class="dp-title">Financial Detail <span style="font-weight:400;color:#999;font-size:10px">Safety National · #${rank} of 18 by total incurred</span></div>
          <table class="fin-detail-table">
            <thead><tr><th>Line</th><th style="text-align:right">Incurred</th><th style="width:80px">% of Total</th></tr></thead>
            <tbody>${finDetailRows}</tbody>
            <tfoot>
              <tr style="background:#f0f4ff"><td style="font-weight:700">TOTAL</td><td style="text-align:right;font-weight:700;color:#1B3A6B">${fmt$full(ti)}</td><td></td></tr>
              <tr><td colspan="3"><div style="display:flex;gap:16px;padding:4px 0">
                <span><b>Period Pmts:</b> ${fmt$full(pip)}</span>
                <span><b>Paid Total:</b> ${fmt$full(paid)} (${ti>0?Math.round(100*paid/ti):0}%)</span>
                <span><b>Reserve:</b> <span style="color:${resv>=100000?'#991b1b':'#856404'};font-weight:700">${fmt$full(resv)} (${resvPct}%)</span></span>
              </div></td></tr>
            </tfoot>
          </table>
          <div class="fin-note">Source: Safety National Claim Paid &amp; Financial Report · Period Jun 2025–May 2026 · As of 06-25-2026</div>
        </div>` : '<div class="dp-section"><div class="fin-note">No Safety National financial data for this partner.</div></div>'}
        ${pblf_html}
      </div>
    </div>`;
}

/**
 * Build the exposure-adjusted risk metrics section for a partner's detail panel.
 */
function buildExposureSection(p, fin) {
  const e = EXPOSURE_DATA[p.name];
  if (!e || !fin.total_incurred) return '';

  function vsLabel(ratio) {
    if (ratio > 1.5) return { txt: '▲ HIGH',        col: '#991b1b' };
    if (ratio > 1.1) return { txt: '▲ above avg',   col: '#856404' };
    return                  { txt: '✓ below avg',   col: '#155724' };
  }

  const freqRows = [], sevRows = [];

  if (e.wc_payroll > 0 && p.wc > 0) {
    const freq = p.wc / (e.wc_payroll / 1000000);
    const { txt, col } = vsLabel(PORT_FREQ.wc > 0 ? freq / PORT_FREQ.wc : 1);
    freqRows.push(`<tr><td>WC Frequency</td><td style="font-weight:600">${freq.toFixed(2)} claims / $1M payroll</td><td style="color:${col};font-weight:700">${txt} <span style="color:#aaa;font-weight:400">(avg ${PORT_FREQ.wc.toFixed(2)})</span></td></tr>`);
  }
  if (e.auto_vehicles > 0 && p.auto > 0) {
    const freq = p.auto / (e.auto_vehicles / 10);
    const { txt, col } = vsLabel(PORT_FREQ.auto > 0 ? freq / PORT_FREQ.auto : 1);
    freqRows.push(`<tr><td>Auto Frequency</td><td style="font-weight:600">${freq.toFixed(2)} claims / 10 vehicles</td><td style="color:${col};font-weight:700">${txt} <span style="color:#aaa;font-weight:400">(avg ${PORT_FREQ.auto.toFixed(2)})</span></td></tr>`);
  }
  if (e.wc_payroll > 0 && (fin.wc_incurred||0) > 0) {
    const rate = fin.wc_incurred / (e.wc_payroll / 100000);
    const { txt, col } = vsLabel(PORT_EXP.wc > 0 ? rate / PORT_EXP.wc : 1);
    sevRows.push(`<tr><td>WC Loss Rate</td><td style="font-weight:600">${fmt$full(rate)} / $100K payroll</td><td style="color:${col};font-weight:700">${txt} <span style="color:#aaa;font-weight:400">(avg ${fmt$full(PORT_EXP.wc)})</span></td></tr>`);
  }
  if (e.auto_vehicles > 0 && (fin.auto_incurred||0) > 0) {
    const rate = fin.auto_incurred / e.auto_vehicles;
    const { txt, col } = vsLabel(PORT_EXP.auto > 0 ? rate / PORT_EXP.auto : 1);
    sevRows.push(`<tr><td>Auto Cost / Vehicle</td><td style="font-weight:600">${fmt$full(rate)} / vehicle</td><td style="color:${col};font-weight:700">${txt} <span style="color:#aaa;font-weight:400">(avg ${fmt$full(PORT_EXP.auto)})</span></td></tr>`);
  }

  if (freqRows.length === 0 && sevRows.length === 0) return '';

  const expParts = [];
  if (e.wc_payroll > 0)    expParts.push('<b>$' + (e.wc_payroll/1000000).toFixed(1) + 'M payroll</b>');
  if (e.auto_vehicles > 0) expParts.push('<b>' + e.auto_vehicles + ' vehicles</b>');
  if (e.gl_revenue > 0)    expParts.push('<b>$' + (e.gl_revenue/1000000).toFixed(1) + 'M revenue</b>');

  return `<div class="dp-section">
    <div class="dp-title">Exposure-Adjusted Risk <span style="font-weight:400;color:#999;font-size:10px">vs. portfolio average</span></div>
    <div style="font-size:10px;color:#888;margin-bottom:5px">Exposure: ${expParts.join(' · ')}</div>
    <table class="fin-detail-table">
      <thead><tr><th>Metric</th><th>Rate</th><th>vs Portfolio</th></tr></thead>
      <tbody>
        ${freqRows.length ? `<tr style="background:#f0f4ff"><td colspan="3" style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.3px;padding:4px 6px">Claim Frequency</td></tr>${freqRows.join('')}` : ''}
        ${sevRows.length  ? `<tr style="background:#f0f4ff"><td colspan="3" style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.3px;padding:4px 6px">Loss Severity</td></tr>${sevRows.join('')}` : ''}
      </tbody>
    </table>
  </div>`;
}

/**
 * Build the Partner Backed Loss Fund section for a partner's detail panel.
 */
function buildPBLFSection(partnerName) {
  const pb = PBLF_DATA[partnerName];
  if (!pb) return '';
  const over   = pb.overUnder > 0;
  const hdr    = over ? '#7f1d1d' : '#14532d';
  const vc     = over ? '#991b1b' : '#15803d';
  const ouStr  = over
    ? '+$' + Math.round(pb.overUnder).toLocaleString()
    : '−$' + Math.round(Math.abs(pb.overUnder)).toLocaleString();
  return `<div class="dp-section">
    <div class="dp-title" style="color:${hdr}">Partner Backed Loss Fund — FY 2025–26</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:${hdr};color:#fff">
        <th style="padding:4px 6px;text-align:center;font-weight:700">25-26 PBLF</th>
        <th style="padding:4px 6px;text-align:center;font-weight:700">Total Incurred</th>
        <th style="padding:4px 6px;text-align:center;font-weight:700">Over / (Under)</th>
        <th style="padding:4px 6px;text-align:center;font-weight:700">% of Fund Used</th>
      </tr></thead>
      <tbody><tr style="background:#f9fafb">
        <td style="padding:5px 6px;text-align:center;font-weight:700">$${pb.pblf.toLocaleString()}</td>
        <td style="padding:5px 6px;text-align:center;font-weight:700">$${pb.incurred.toLocaleString()}</td>
        <td style="padding:5px 6px;text-align:center;font-weight:700;color:${vc}">${ouStr}</td>
        <td style="padding:5px 6px;text-align:center;font-weight:700;color:${vc}">${pb.pctUsed.toFixed(1)}% <span style="font-size:10px;font-weight:400">${over?'⚠ OVER':'✓ UNDER'}</span></td>
      </tr></tbody>
    </table>
  </div>`;
}

/* ── UI event handlers ────────────────────────────────────────────────────── */

/** Toggle a partner card's detail panel open/cl