# tiqr — Ops runbook

Operational surface for the tiqr backend: health/readiness probes, metrics, error
tracking, and the uptime monitor. (CI/CD lives in `.github/workflows/`; the
Grafana dashboard is `ops/grafana/tiqr-dashboard.json`.)

## Health & readiness endpoints

All are served under both `/api/*` and `/api/v1/*`.

| Endpoint | Purpose | Success | Failure |
|---|---|---|---|
| `GET /api/health` | **Liveness** — is the process up? DB-free. | `200 {status:"ok",uptime}` | (process down → no response) |
| `GET /api/ready` | **Readiness** — can it serve traffic? Runs `SELECT 1`. | `200 {status:"ready"}` | `503 {status:"not-ready"}` when the DB is unreachable |
| `GET /api/ready?deep=1` | Readiness **+** optional-service report. | `200 {status:"ready",degraded:[...]}` | still `503` only on DB failure |

**Deep check semantics (graceful degradation).** `?deep=1` additionally reports
Razorpay / SMTP problems in a soft `degraded` array — e.g.
`[{ "service": "razorpay", "status": "not_configured" }, { "service": "smtp", "status": "verify_timeout" }]`.
An optional-service outage is a **warning, never a 503**: those services degrade
gracefully by design (Razorpay unset → demo flow, SMTP unset → emails skipped), so
they must not take the instance out of the load-balancer rotation. The SMTP
`verify()` is timeout-bounded (3s) so a black-holed mail host can't wedge the probe.

Use **liveness** for the orchestrator's restart probe and **readiness** for the
load balancer + external monitor. Keeping them separate means a transient DB blip
pulls the instance from rotation (readiness 503) **without** triggering a needless
process restart (liveness stays 200).

## Uptime monitoring

Primary: point an external monitor (UptimeRobot / Better Stack / PagerDuty) at
`/api/health` and `/api/ready` as **two separate checks** on a fixed interval.

Fallback (committed): `.github/workflows/uptime.yml` runs every 10 min and fails
the job on a non-200 or timeout. Enable it by setting repo/environment **Variables**
(Settings → Secrets and variables → Actions → Variables):

- `HEALTH_URL` = `https://<api-host>/api/health`
- `READY_URL`  = `https://<api-host>/api/ready`

Unset → the probe self-skips (no false failures before the env exists). A failing
run notifies via GitHub's default run-failure notifications. For real paging, add a
step that POSTs to a Slack/PagerDuty webhook stored as a **secret** (never commit
it), e.g. on `failure()`.

**Alert thresholds / who is paged.** Page on readiness non-200 for ≥2 consecutive
checks (≈20 min on the Actions fallback; seconds on a real monitor). Route to the
on-call backend engineer (email/Slack/PagerDuty per your monitor's config). A
`degraded` deep-check result is informational — open a ticket, don't page.

## Metrics (OPS-03)

`GET /api/metrics` (Prometheus). Open in dev; in production requires
`Authorization: Bearer $METRICS_TOKEN` and **fails closed** when `METRICS_TOKEN`
is unset. Import `ops/grafana/tiqr-dashboard.json` into Grafana (it prompts for
the Prometheus datasource).

## Error tracking (OPS-02)

Sentry (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`). Fully no-op without a DSN. Only
server faults (5xx + uncaught/unhandled) are reported, PII/secrets scrubbed.
