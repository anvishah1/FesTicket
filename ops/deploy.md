# tiqr — deploy & promote-to-prod (OPS-08)

Build the backend image **once**, validate it on **staging** (its own Neon
branch), then promote the **same digest** to **production** behind a manual
approval. Pipeline: `.github/workflows/deploy.yml`. Frontend deploys via Vercel.

## Flow

```
push to anvi ─▶ build (GHCR image @sha) ─▶ deploy-staging ─▶ deploy-production
                                            migrate + smoke   (manual approval)
                                                              retag digest :production
                                                              migrate + smoke
```

- **Build once, promote by digest.** `build` pushes `ghcr.io/<owner>/<repo>-backend:<sha>`.
  Staging and production reference it **by digest**; production is retagged with
  `docker buildx imagetools create` (no rebuild) so the promoted artifact is
  byte-identical to the one staging validated.
- **Schema.** Migrations run via the image itself (`npx prisma migrate deploy`,
  ARCH-08) so the pinned prisma CLI + committed migrations (schema + folded CHECK
  constraints) are what apply — not a drifting `db push`.
- **Smoke.** After each environment: `GET /api/health`, `/api/ready`, `/api/hello`
  must all be 200 before the stage is considered good.

## Operator setup (nothing secret is committed)

1. **Environments** (Settings → Environments): create `staging` and `production`.
   Add a **Required reviewers** protection rule to `production` — that rule *is*
   the promote-to-prod gate the pipeline waits on.
2. **Per-environment secrets** (each environment, not repo-wide):
   - `DATABASE_URL` — pooled Neon URL. **Staging must be a SEPARATE Neon branch**,
     never production data.
   - `DIRECT_URL` — unpooled Neon URL (used by `migrate deploy`).
   - Plus the runtime secrets the host injects into the container: `JWT_SECRET`
     (≥32 chars), `FRONTEND_URL` (CORS — set per environment or the staging
     frontend is blocked), and `RAZORPAY_*` / `SMTP_*` as applicable.
3. **Per-environment variables**: `API_URL` = this backend's public base URL
   (used for the smoke checks and the environment deployment URL).
4. **Container rollout** is host-specific and left as a documented placeholder in
   `deploy.yml` (the `Roll out ...` steps). Wire your host, e.g.:
   - Fly: `flyctl deploy --image <image@digest> --app tiqr-staging`
   - Cloud Run: `gcloud run deploy tiqr-staging --image <image@digest> ...`
   - Render: `curl -X POST "$RENDER_STAGING_DEPLOY_HOOK"`

## Frontend (Vercel)

`frontend/vercel.json` pins the framework + install/build commands. Set
`NEXT_PUBLIC_API_URL` as a **Vercel environment variable per environment**:
Preview → the staging API, Production → the prod API. Frontend promotes via
Vercel's own Preview → Production flow.

## Gotchas

- The demo payment path `PUT /api/bookings/:id/complete` is disabled whenever
  `RAZORPAY_KEY_*` is set — verify production has the real Razorpay keys so the
  no-payment completion bypass stays closed. (Staging may keep the demo flow.)
- `FRONTEND_URL` must be the correct origin per environment or CORS blocks the app.
- Container image: `docker build backend/` (node:20-slim, non-root, HEALTHCHECK on
  `/api/health`). It fails fast without `DATABASE_URL` + `JWT_SECRET`.
