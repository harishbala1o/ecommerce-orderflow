# Service Level Objectives

SLOs for the **Order Workflow Service** — the request path that owns order state.
Defined as code in `observability/prometheus/rules/slo.rules.yml`, visualized in the
Grafana dashboard *OrderFlow — SLOs & Error Budget*, and alerted via Alertmanager.

## SLIs and SLOs

| SLI | Definition | SLO |
|-----|-----------|-----|
| **Availability** | fraction of order-action requests that are **not** `server_error` | **99.5%** (30-day window) |
| **Latency** | fraction of requests completing in **< 0.5s** | **95%** |

**Why business rejections are not failures.** A forbidden or illegal transition is the
service *correctly* returning a 400 — that is a success, not an outage. The metrics
interceptor classifies every request as `ok`, `client_error` (handled 4xx), or
`server_error` (5xx/unhandled). Only `server_error` burns the availability budget.

## Error budget

A 99.5% availability SLO allows a **0.5% error budget** over 30 days (~3.6 hours of full
unavailability, or an equivalent partial-failure ratio). The budget governs how urgently
we respond to burn.

## Alerting — multi-window, multi-burn-rate

Following the Google SRE Workbook, each alert requires both a **long** and a **short**
window to be hot, so a brief blip doesn't page and a real regression isn't missed.

| Alert | Condition | Severity |
|-------|-----------|----------|
| `OrderflowErrorBudgetFastBurn` | server_error ratio > 7.2% over **1h AND 5m** (≈14.4× burn → 2% of budget/hour) | **page** |
| `OrderflowErrorBudgetSlowBurn` | server_error ratio > 3% over **6h AND 30m** (≈6× burn) | ticket |
| `OrderflowLatencySloBreach` | latency SLI < 95% over 30m | ticket |
| `OrderflowWorkflowServiceDown` | `up == 0` for 1m | page |

A `page` inhibits the same-SLO `ticket` (Alertmanager inhibit rule) to avoid duplicate noise.

## Running it

```bash
make obs-up   # Prometheus (rules), Alertmanager, Grafana
```

- Grafana SLO dashboard: http://localhost:3300/d/orderflow-slo
- Prometheus rules/alerts: http://localhost:9090/alerts
- Alertmanager: http://localhost:9093

No external alert delivery is wired for the demo; the Alertmanager receiver is a stub —
add a Slack/email/webhook config in `observability/alertmanager/alertmanager.yml` for real
routing.
