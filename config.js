/**
 * config.js — Dashboard configuration
 * Redwood Services · Partner Safety Scorecard Dashboard · FY 2025–26
 *
 * To update for a new fiscal year:
 *   1. Change PERIOD_START / PERIOD_END
 *   2. Replace data.js with a fresh data export from Monday.com
 *   3. Update SNAPSHOT_DATE to reflect the export date
 */

const CONFIG = {
  // Fiscal year period (incident date filter)
  PERIOD_START: '2025-06-01',
  PERIOD_END:   '2026-05-31',

  // Monday.com column IDs (do not change unless the board schema changes)
  COLS: {
    INCIDENT_DATE: 'date_mkn55y39',   // Date & Time of Incident
    RECEIVED_DATE: 'date',            // Date claim was received
    CLAIM_TYPE:    '_claim_type_mkn59gda',
    PARTNER:       'color_mknj5mky',
    STATUS:        'status95',
    AT_FAULT:      'color_mksm37ne',
    INJURY_TYPE:   '__type_of_injury_mkn5epe4',
    MEDICAL:       'color_mkp5pbe7',
    HOSPITALIZED:  'color_mkn5rchn',
    LITIGATION:    'color_mkrhmygj',
    OSHA:          'color_mkx5jxgg',
    SUBROGATION:   'color_mkznnbx6',
  },

  // Rating thresholds — adjust to calibrate sensitivity
  THRESHOLDS: {
    CRITICAL_LIT:       1,   // any litigation = Critical
    CRITICAL_HOSP:      2,   // 2+ hospitalizations = Critical
    CRITICAL_WC_ER:    [10, 3], // WC >= 10 AND ER >= 3 = Critical
    NI_OPEN_PCT:       0.55, // 55%+ open = Needs Improvement
    NI_WC:            15,   // 15+ WC claims = Needs Improvement
    NI_ER:             3,   // 3+ ER visits = Needs Improvement
    MONITOR_OPEN_PCT:  0.40,
    MONITOR_WC:        8,
  },

  // Data snapshot metadata
  SNAPSHOT_DATE:    'Jun 30, 2026',
  PORTFOLIO_TOTAL_INCURRED: 3902588.77, // Safety National PDF 5755392, as of 06-25-2026
  OPEN_RESERVE:     1421687.89,

  // Status values from Monday.com
  STATUS_CLOSED: 'Claim Closed',
};
