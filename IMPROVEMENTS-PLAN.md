# FesTicket — Improvements Implementation Plan

Generated from a code-grounded spec of 88 improvements across 9 themes, sequenced into 9 dependency-aware phases. Each spec is implementation-ready (data model, API, frontend, acceptance criteria, dependencies, risks).

> Excludes everything already built/fixed in prior rounds. IDs are stable (theme prefix + number) and referenced by the phase plan.

## Phase overview

| Phase | Name | Goal | Specs | S/M/L/XL |
|---|---|---|---|---|
| 1 | Backend foundations & shared primitives | Land the cross-cutting backend and formatting primitives that every later phase builds on. | 9 | 3/4/2/0 |
| 2 | Money-in-paise & payment reliability | Migrate all currency to integer paise and make the pay/settle path reliable end-to-end. | 8 | 1/3/4/0 |
| 3 | Fulfillment policy, invoices & account/auth completeness | Close the buyer fulfillment loop (policy, invoice) and ship the missing account/auth surfaces. | 8 | 4/3/1/0 |
| 4 | Event-day: QR tickets, check-in & delivery | Deliver individually scannable tickets and the full organizer door-to-wallet check-in stack. | 10 | 2/5/2/1 |
| 5 | Notifications, lifecycle comms & advanced auth | Wire the full email/SMS lifecycle, in-app notifications, waitlist auto-notify, and advanced sign-in. | 11 | 0/6/5/0 |
| 6 | SSR, SEO & cross-fest discovery | Server-render public pages and build the discovery/sharing surface for organic growth. | 10 | 1/6/3/0 |
| 7 | Frontend performance & UX polish | Modernize the data layer, caching, media, i18n and accessibility across the app. | 14 | 3/7/3/1 |
| 8 | Organizer analytics & finance tooling | Turn headline totals into a full analytics, budgeting, sponsor-CRM and settlement suite. | 10 | 0/8/2/0 |
| 9 | CI/CD, observability & release ops | Harden the pipeline, add production observability, and stand up staging→prod promotion. | 8 | 2/5/1/0 |

**Sequencing notes:** Critical cross-phase dependencies honored: (1) FE-13 currency formatter and NOTIF-01/NOTIF-04 email infra sit in Phase 1 because they are prerequisites for, respectively, all price UI + the paise migration, and every lifecycle email. (2) PAY-03 money-in-paise leads Phase 2 and precedes all money-derived work — PAY-07 invoice and ANL-08 settlement (formatting/GST), PAY-04 promo (integer discount math), PAY-02/PAY-06 refund amounts. (3) ARCH-01→ARCH-03 (envelope before central error handling) and ARCH-09→ARCH-06 both resolve inside Phase 1; ARCH-05 (sweep lock) and ARCH-07/08/04 depend only on Phase-1 arch. (4) TIX-01 order-QR roots the entire Phase-4 ticket chain (TIX-02 per-attendee → TIX-03 scan → TIX-04 dashboard / TIX-06 transfer / TIX-07 wallet); TIX-08 PWA and TIX-09 .ics are kept in Phase 4 so the event-day surface ships whole. (5) Lifecycle comms wait until Phase 5 because they require Phase-1 email infra, Phase-4 QR/.ics (NOTIF-03 reminders), and Phase-2 refund/cancel release points; NOTIF-09 preferences precede NOTIF-05 alerts which precede NOTIF-08 center. (6) SEO-01 SSR precedes SEO-02 JSON-LD, SEO-03 OG, SEO-05 discover, SEO-07 rail and SEO-10 categories; SEO-08 trending precedes SEO-06 homepage. (7) FE-02 SWR precedes FE-03 ISR and FE-08 prefetch. Deliberate deferrals: PAY-08 waitlist moved from the payments theme into Phase 5 because its auto-notify needs the email stack and refund/sweep release hooks; the whole ANL analytics suite is placed in Phase 8 so it aggregates paise-clean, index-backed data rather than being rebuilt after the money migration; all of OPS is intentionally last (Phase 9) so E2E money-path journeys, the oversell soak test, and staging promotion exercise the final webhook/refund/waitlist/check-in behavior instead of moving targets. Phase 7 is the largest (14 FE specs) but is one coherent, independently shippable frontend-quality release; it could be split into 7a data-layer/caching and 7b theming/i18n/a11y if a tighter increment is preferred.

---

## Phase 1: Backend foundations & shared primitives

**Goal:** Land the cross-cutting backend and formatting primitives that every later phase builds on.

**Why now:** These are cheap, high-leverage early wins that reduce churn: unifying the response envelope and centralizing error handling touch every route once now instead of repeatedly later; indexes, structured logging and Prisma observability de-risk everything that follows; the email shell + provider abstraction are prerequisites for all lifecycle mail; the currency formatter must exist before the paise migration and all price UI. Doing them first means later phases don't retrofit two response shapes, ad-hoc try/catch, or scattered ₹-concatenation.

**Exit criteria:** All routers emit one {success,data,error} envelope with a requestId; thrown AppErrors are mapped centrally via asyncHandler; Booking composite indexes are live; pino structured logging with PII redaction and Prisma slow-query logging + pooled/direct URLs are in place; the stale sweep runs under a Postgres advisory lock; renderEmail() shell + pluggable provider/EmailLog/retry exist and the confirmation email uses them; lib/format.ts is the single INR formatter and is imported by BookingSummary/payment/booking pages.

Specs (9): ARCH-01, ARCH-03, ARCH-02, ARCH-09, ARCH-06, ARCH-05, NOTIF-01, NOTIF-04, FE-13

### ARCH-01 — Unify the two API response envelopes behind res.ok()/res.fail()  `L`

The codebase has two response shapes — bookings/events/fests emit {success,data,error:{code,message}} while auth/user/roleRequests emit bare objects ({message,...} or the resource). Add response-helper middleware so every route emits one enveloped shape with a requestId, and migrate the bare routes, so clients can parse uniformly and correlate errors by req.id.

- **API:** No new endpoints. Add middleware in a new backend/src/middleware/respond.js mounted in index.js AFTER requestLogger (needs req.id) and before routers: res.ok(data,{status=200,message}) -> {success:true,data,message?,requestId:req.id}; res.fail(status,code,message) -> {success:false,error:{code,message},requestId:req.id}. Migrate every handler in auth.js, user.js, roleRequests.js from res.json({message,...})/res.status().json({message}) to res.ok/res.fail. Preserve today's semantics: signin's accessToken/refreshToken/user go under data (res.ok({accessToken,refreshToken,user})); validate.js middleware and the index.js 404 + error handlers should also route through the same shape (they already emit success+requestId). Keep field code stable (e.g. VALIDATION_ERROR, NOT_FOUND, FORBIDDEN).
- **Frontend:** Add an unwrap<T>(res: Response) helper in frontend/lib/auth.ts that reads {success,data} and throws on {success:false} surfacing error.code/message. Update refreshAccessToken (lib/auth.ts:141-143 reads data.accessToken/refreshToken/user at top level) and every auth page that parses bare bodies: app/signin, app/signup, app/forgot, app/reset, plus components/AuthForm.tsx and CompleteProfileModal.tsx (user.js responses). Because auth bodies move under data, frontend and backend must ship together.
- **Acceptance:**
  - Every JSON response from auth/user/roleRequests routes includes success and requestId and matches {success,data|error,requestId}.
  - Signin -> store tokens -> authenticated call -> refresh-token round trip all still work after moving auth fields under data.
  - A validation failure and a 404 both return {success:false,error:{code,message},requestId} identical in shape to bookings routes.
  - grep shows no remaining res.json({ message in auth.js/user.js/roleRequests.js.
  - A single frontend unwrap() helper is used by the migrated pages; no page reads top-level accessToken anymore.
- **Risks:** Breaking change to the frontend auth parser (lib/auth.ts) — must deploy backend+frontend atomically or clients break at signin/refresh. Third-party callers (Razorpay webhooks are not used here, but the /verify-payment body from the browser is) unaffected since those routes already enveloped. Keep error codes stable so existing frontend error-branching still matches.

### ARCH-03 — Centralize error handling with asyncHandler + typed AppError  `M`

**Depends on:** ARCH-01

The bookingError() factory in bookings.js:51-52 (Object.assign(new Error, {status,code,expose})) is a good pattern trapped in one file; every other route hand-rolls try/catch + res.status().json. Promote it to a shared AppError class + optional asyncHandler and let the central index.js handler map thrown AppErrors, so business errors are declared once, logged once with req.id, and untagged errors never leak their raw message.

- **API:** No endpoint changes. New backend/src/utils/AppError.js exports class AppError extends Error {constructor(status,code,message,{expose=true}={})}; replace bookingError with AppError.badRequest/notFound/conflict helpers. New backend/src/utils/asyncHandler.js: const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next). Extend the index.js error handler (index.js:165-202) to branch on err instanceof AppError -> res.status(err.status).json({success:false,requestId:req.id,error:{code:err.code,message:err.expose?err.message:'Unexpected error'}}); keep the existing body-parser 413/400 branches; everything else stays a generic 500 logged once with req.id.
- **Acceptance:**
  - Throwing AppError(409,'SOLD_OUT',msg) from any handler produces status 409 body {success:false,error:{code:'SOLD_OUT',message},requestId} via the central handler with no per-route try/catch.
  - An untagged thrown Error yields a 500 with a generic message (raw error.message not present in the response) and exactly one console/log line tagged with req.id.
  - bookings.js is migrated to import AppError (bookingError alias kept or removed) with identical status/code output to today.
  - At least the auth/user/roleRequests handlers can drop their duplicated try/catch when wrapped in asyncHandler without changing status codes.
  - No response leaks a stack trace or internal message.
- **Risks:** Express 5 already auto-forwards rejected promises from async handlers to the error middleware, so asyncHandler is partly redundant — the real value is the AppError type + centralized mapping; document that handlers may throw directly. Migrate incrementally to avoid a giant diff; keep bookingError as a thin re-export during transition. Central handler must run through the ARCH-01 envelope helper for consistency.

### ARCH-02 — Add composite/missing DB indexes to Booking  `S`

Booking currently has only @@index([eventId]) and @@index([userId]) (schema.prisma:188-189), but the hottest queries filter on eventId+status, sweep on status+createdAt, look up guestEmail, and order fest/buyer lists by purchaseDate. Add composite indexes so dashboards, the stale sweep, and guest lookup stay index-backed as data grows.

- **Data model:** In schema.prisma Booking model add: @@index([eventId, status]) (backs bookings.js GET /event/:eventId where eventId+optional status, GET /fest completed filter, events.js /:id/buyers eventId+status=COMPLETED); @@index([status, createdAt]) (backs expireStalePendingBookings status=PENDING + createdAt<cutoff, bookings.js:1250-1257); @@index([guestEmail]) (backs GET /guest/:email, bookings.js:905-913); @@index([eventId, purchaseDate]) (backs orderBy purchaseDate on fest/buyer lists). The existing @@index([eventId]) becomes a prefix of [eventId,status]/[eventId,purchaseDate] — drop it to avoid a redundant index. Apply via prisma db push (or a migration under ARCH-08).
- **Acceptance:**
  - schema.prisma Booking declares the four new @@index lines and no longer declares the now-redundant standalone @@index([eventId]).
  - prisma db push (or migrate) applies with no data loss.
  - EXPLAIN ANALYZE of the sweep query (status='PENDING' AND createdAt < cutoff) shows an Index Scan using the status,createdAt index rather than a Seq Scan.
  - EXPLAIN of GET /event/:eventId?status=COMPLETED uses the eventId,status index.
  - No functional behavior change in any endpoint.
- **Risks:** Extra indexes add write cost on the write-heavy Booking table (each POST /bookings insert updates 4 indexes) — acceptable for this read-skewed workload. If ARCH-08 lands, add these as a generated migration rather than db push to keep history consistent.

### ARCH-09 — Structured logging with levels + PII redaction  `M`

Logging is a mix of requestLogger's console.log(JSON) (middleware/requestLogger.js:47) and scattered console.error/console.log across index.js and every route (e.g. 'Signup error:', 'Error creating booking:'), with no levels and no redaction — an error object could log a JWT or password. Introduce a pino logger with levels, a per-request child logger, and a redaction list, replacing the ad-hoc console.* calls with single-line JSON suitable for a log drain.

- **API:** No endpoints. Add dep pino. New backend/src/utils/logger.js exports a pino instance configured with level:process.env.LOG_LEVEL||'info', redact paths ['req.headers.authorization','password','newPassword','token','refreshToken','accessToken','*.password','captchaToken'], and enabled:false (or level:'silent') under NODE_ENV==='test'. Update requestLogger.js to attach req.log = logger.child({requestId:req.id}) and emit the completed-request line via req.log.info({method,url,status,durationMs}) instead of console.log. Replace console.error/console.log in index.js (startup, readiness, error handler, sweep) and in routes (auth.js, bookings.js, events.js, user.js, roleRequests.js, fests.js) with logger/req.log calls carrying {requestId}.
- **Acceptance:**
  - Every log line is single-line JSON containing level, requestId (where a request context exists), and msg.
  - A request carrying Authorization: Bearer <jwt> and a body with password logs neither value — both appear as [Redacted] in any emitted line.
  - LOG_LEVEL=warn suppresses info/access lines but still emits warn/error; default info emits the per-request access line.
  - grep for console.log/console.error across backend/src and index.js returns no matches in route/handler code (test scripts excluded).
  - Under NODE_ENV=test no log output is produced (existing test-quiet behavior preserved) while req.id is still assigned.
- **Risks:** Large mechanical sweep across many files — risk of dropping context (ensure error objects are passed as {err} so pino serializes the stack, not string-concatenated). Must not log full request bodies for booking/auth (secrets); redaction list must cover nested paths. pino adds a dependency and its pretty transport should be dev-only (raw JSON to stdout in prod for the drain). Coordinate with ARCH-06 so Prisma query events flow through this logger.

### ARCH-06 — Add Prisma client observability + Neon-pooled config  `S`

**Depends on:** ARCH-09

src/prisma.js constructs a bare new PrismaClient() with no logging and the schema uses a single DATABASE_URL for both runtime and migrations. Add dev query logging with a slow-query warning and split into a pooled DATABASE_URL (pgbouncer) for the app plus a DIRECT_URL for migrations, so we get query visibility and don't exhaust Neon connections.

- **Data model:** schema.prisma datasource db: add directUrl = env("DIRECT_URL") alongside url = env("DATABASE_URL"). No model changes.
- **Acceptance:**
  - In development, prisma.js is constructed with log:[{emit:'event',level:'query'},'warn','error'] and $on('query') logs any query whose duration exceeds SLOW_QUERY_MS (default 200ms) with {ms,query} (params NOT logged in production).
  - Production defaults to log:['warn','error'] only — no per-query logging.
  - schema.prisma datasource declares directUrl; prisma migrate/db push uses DIRECT_URL while the running app uses the pooled DATABASE_URL.
  - .env.example documents DATABASE_URL as the pooled connection (…-pooler.…?pgbouncer=true) and adds a DIRECT_URL entry for the unpooled/migration connection.
  - App still boots with only DATABASE_URL set (DIRECT_URL optional in dev, falling back is documented).
- **Risks:** Query logging can emit PII in parameters — only log statement + duration (not bound params) outside dev. Adding directUrl means the fail-fast env check in index.js:25-41 should learn about DIRECT_URL for prod migrations (document, don't hard-require in dev). Slow-query threshold should be env-tunable to avoid log spam. Pairs with ARCH-09 so the query events use the structured logger, not console.log.

### ARCH-05 — Make the stale-booking sweep safe under horizontal scaling  `M`

**Depends on:** ARCH-03

index.js:210-218 starts a per-process setInterval calling expireStalePendingBookings every 5 min; with >1 replica every instance sweeps simultaneously (wasteful, and only safe today thanks to the guarded updateMany), and there are no metrics or a manual trigger. Guard the sweep with a Postgres advisory lock so exactly one runner executes per tick, emit count/duration metrics, and expose an admin manual-trigger.

- **API:** Wrap the interval body: run expireStalePendingBookings only after acquiring a transaction-scoped advisory lock — inside a prisma.$transaction, SELECT pg_try_advisory_xact_lock(<stable bigint key, e.g. hashtext('stale-sweep')>); if it returns false, skip this tick. Log a structured line {job:'stale-sweep',expired,durationMs,skipped}. expireStalePendingBookings (bookings.js:1242) already returns {expired}; also return durationMs. Add a manual trigger: POST /api/bookings/admin/sweep-stale, authenticateUser + authorizeRoles('ADMIN'), body {olderThanMinutes?}, returns {success:true,data:{expired,durationMs}} — scoped so only an ADMIN can force a sweep.
- **Frontend:** Optional: a 'Release stale holds' button on the admin dashboard (frontend/app/admin/dashboard) that POSTs the trigger and toasts the expired count via lib/toast. Not required for the core fix.
- **Acceptance:**
  - With two app instances pointed at the same DB, only one performs the decrementing sweep per tick (the other logs skipped:true) — verified by the metrics line.
  - The advisory lock is transaction-scoped (pg_try_advisory_xact_lock) so it is always released even if the sweep throws.
  - Each run logs {job,expired,durationMs} as a single JSON line.
  - POST /api/bookings/admin/sweep-stale returns the expired count for an ADMIN and 403 for any non-admin/guest.
  - Manual trigger and interval share the same expireStalePendingBookings implementation (no logic duplication).
- **Risks:** Session-level advisory locks do NOT survive Neon/pgbouncer connection pooling reliably — must use the transaction-scoped variant (pg_try_advisory_xact_lock) so lock lifetime is bound to a single pooled connection/transaction. A dedicated cron worker (separate process) is an alternative to the in-process interval and composes better with ARCH-08's release step. Keep the sweep's existing payment-in-flight guard (bookings.js:1250-1257).

### NOTIF-01 — Extract a shared branded email layout + real HTML→text  `S`

Every future lifecycle email needs one consistent, client-safe shell; today the only email (sendBookingConfirmation, email.js lines 93-151) is a one-off inline-styled `<div>` and sendMail's text fallback is a naive `html.replace(/<[^>]+>/g,"")` (line 48). Add a `renderEmail({preheader,heading,bodyHtml,cta,footerNote})` builder that emits a table-based, dark-mode-safe wrapper plus a proper HTML→plaintext converter, and refactor the confirmation email onto it.

- **API:** none — backend email-templating refactor only.
- **Acceptance:**
  - email.js exports `renderEmail({preheader,heading,bodyHtml,cta,footerNote})` returning `{html,text}`; html is a role=presentation table layout (not the current flex/div), uses inline styles only, keeps the #522C5D brand header, and includes a hidden preheader span and a `@media (prefers-color-scheme:dark)` block so dark-mode clients don't invert to unreadable.
  - A `htmlToText(html)` helper decodes entities, converts `<br>`/`</p>`/`</tr>` to newlines, renders `cta` as `label (url)`, and strips remaining tags — replacing the line-48 regex in sendMail so `text` is always populated.
  - sendBookingConfirmation is refactored to build its receipt body and pass it through renderEmail; the rendered receipt still shows bookingCode, event name/date/venue, line items, subtotal/fee/tax/total, and all user-controlled values remain wrapped in escapeHtml (lines 108-144).
  - A snapshot/manual render of the confirmation email is visually equivalent to today's output (same fields, same brand color) and its plaintext part contains the bookingCode and the total.
  - renderEmail is exported so NOTIF-02/03/05/06 can import it without duplicating markup.
- **Risks:** Outlook/Windows Mail ignore <style> media queries — dark-mode safety must lean on table bgcolor + explicit text colors, not only CSS. Must not regress the existing escapeHtml calls (XSS in receipt). Keep MAIL_FROM/APP_NAME env usage unchanged.

### NOTIF-04 — Deliverability: pluggable HTTP provider + send log + bounded retry  `L`

All mail currently goes through raw nodemailer SMTP (email.js getTransport, lines 21-34) with no delivery record and no retry — a transient failure is logged and lost. Introduce a provider abstraction (SMTP | Resend | Postmark | SES) selected by env, persist every attempt in an EmailLog, and add bounded retry with backoff, preserving the existing graceful no-op when nothing is configured.

- **Data model:** New model `EmailLog { id Int @id @default(autoincrement()) toEmail String subject String template String? bookingId Int? provider String? providerMessageId String? status EmailStatus @default(QUEUED) attempts Int @default(0) lastError String? createdAt DateTime @default(now()) updatedAt DateTime @updatedAt @@index([status]) @@index([bookingId]) }` with `enum EmailStatus { QUEUED SENT FAILED SKIPPED }`. `prisma db push`.
- **API:** none required for MVP. (Optional future: POST /api/webhooks/email for provider bounce callbacks — out of scope, note only.)
- **Acceptance:**
  - email.js refactors transport behind a `getMailProvider()` chosen by `EMAIL_PROVIDER` env (default `smtp`); each provider implements `send({from,to,subject,html,text})` returning `{providerMessageId}` or throwing. Resend/Postmark/SES use HTTP (no new SMTP infra); missing config for the selected provider degrades to the current skip-with-warn behavior (returns `{sent:false, reason:'not_configured'}`).
  - sendMail writes an EmailLog row (status QUEUED→SENT/FAILED/SKIPPED, provider, providerMessageId, attempts, lastError) for every call, keying bookingId/template when the caller passes them, without changing sendMail's existing `{sent, reason?, error?}` return contract used by callers in bookings.js.
  - On a transient send failure sendMail retries up to N times (env `EMAIL_MAX_RETRIES`, default 3) with exponential backoff, all non-blocking so booking/verify/cancel request latency is unaffected; final failure leaves status FAILED with lastError.
  - MAIL_FROM domain alignment for SPF/DKIM is documented in .env.example (add EMAIL_PROVIDER, provider API-key vars, EMAIL_MAX_RETRIES) and the From address is taken from MAIL_FROM for all providers.
  - With no provider configured, no email is sent, an EmailLog row with status SKIPPED is written, and nothing throws.
- **Risks:** Must stay backward compatible with existing SMTP env (SMTP_HOST/USER/PASS) so current deployments keep working. Retry must never block the HTTP request thread (fire-and-forget as callers already do with .catch). API keys are secrets — env only, never logged in lastError. Attachment-bearing mails (NOTIF-03 QR/.ics) must be supported across providers or documented as SMTP-only.

### FE-13 — Central currency and locale number formatter  `M`

Add one `lib/format.ts` using `Intl.NumberFormat('en-IN', INR)` and replace the ~39 files that build prices via bare `₹{n}` concatenation or `.toLocaleString()` with default (US) grouping, so amounts render consistently with Indian grouping (₹1,23,456) and correct 2-decimal money. Currency strings are currently scattered and inconsistent (e.g. BookingSummary.tsx lines 27/34-47 use `₹{n}` with no grouping; payment/page.tsx uses `.toLocaleString()` with browser-default locale).

- **Data model:** none (optional per-fest currency: add `Fest.currency String? @default("INR")` if the optional multi-currency path is taken — otherwise none).
- **Frontend:** New lib/format.ts exporting `formatCurrency(amount, currency='INR')` (Intl.NumberFormat en-IN, style currency, `maximumFractionDigits:2`) and `formatNumber`. Migrate the high-traffic money sites first — components/BookingSummary.tsx (lines 27,34-47), components/TicketSelector.tsx (line 20), app/events/[id]/booking/page.tsx (8 sites incl. lines 497-521,540), app/events/[id]/payment/page.tsx (7 sites incl. lines 255,268-298), app/host/marketing/page.tsx (11), app/host/events/[eventId]/manage/page.tsx (8), the admin dashboard/Expenses/Companies, PaymentSidebar — replacing `₹${x}` / `x.toLocaleString()` with `formatCurrency(x)`.
- **Acceptance:**
  - `lib/format.ts` exports `formatCurrency`/`formatNumber` and is unit-testable
  - BookingSummary, TicketSelector, and the booking + payment pages render amounts through `formatCurrency` (en-IN grouping, e.g. ₹1,23,456.00)
  - No bare `₹${number}` concatenation remains in the migrated files
  - Displayed totals still equal the backend-stored values to 2 decimals (no float artifacts like ₹118.00000001)
  - An optional `currency` param is supported (default INR) so a future per-fest currency needs no call-site churn
- **Risks:** Money is stored as Float with round2() server-side — the formatter must clamp to 2 decimals so float representation errors never surface. en-IN lakh grouping is a visible change from the current default grouping (intended, but confirm with design). Per-fest/multi-currency is optional and, if pursued, needs the Fest.currency column and threading the value to call sites; keep it deferred behind the default INR to bound scope.

---

## Phase 2: Money-in-paise & payment reliability

**Goal:** Migrate all currency to integer paise and make the pay/settle path reliable end-to-end.

**Why now:** The paise migration is the memory-noted deferred change and must land before any refund-amount, invoice, promo, or settlement math to remove float drift once. With money integer-clean, we harden the money path: a signed server-side webhook + sweep reconciliation stops captured-but-PENDING inventory leaks, a hold countdown sets buyer expectations, the refund engine and concurrency-safe promo codes are added on integer math. Data-platform items (aggregates+pagination, migrate deploy, OpenAPI) ride along because they depend only on Phase-1 arch and de-risk scaling of the same endpoints.

**Exit criteria:** Every money column is INTEGER paise with a CHECK amount>=0, round2 is deleted, and rupees are formatted only at the UI/email edge; a signed Razorpay webhook idempotently settles/fails bookings and the sweep reconciles orderId-set PENDING rows against Razorpay; payment page shows a live expiresAt countdown that disables Pay on lapse; host/admin full+partial refund endpoint issues real/demo refunds and restores inventory; capped promo codes redeem atomically inside the booking $transaction; dashboard stats use groupBy/aggregate with paginated lists; prisma/migrations + migrate deploy replace db push with constraints folded in; all routers mount under /api/v1 with an OpenAPI/Swagger doc.

Specs (8): PAY-03, PAY-01, PAY-05, PAY-02, PAY-04, ARCH-07, ARCH-08, ARCH-04

### PAY-03 — Store all money as INTEGER paise instead of Float  `L`

Every money column is a Prisma Float (Booking.subtotal/discount/platformFee/tax/total, BookingItem.unitPrice/totalPrice, TicketType.price, Payment.amount, plus Sponsor/Expense amounts), and fee math leans on round2() (bookings.js:78) to paper over binary-float drift. Migrate all currency to INTEGER paise, delete round2, do integer arithmetic, format to rupees only at the UI/email edge, and add a DB CHECK amount>=0. This is the memory-noted deferred change and removes an entire class of rounding/precision bugs and the fragile 'byte-for-byte reproducible total' contract between frontend and backend.

- **Data model:** Convert to Int (paise): Booking.subtotal/discount/platformFee/tax/total (+ PAY-02 refundedAmount), BookingItem.unitPrice/totalPrice, TicketType.price, Payment.amount/refundedAmount. In scope for money-reliability but coordinate: Sponsor.sponsorshipAmount/receivedAmount, Expense.amount. Data migration (raw SQL, since `npx prisma db push` is used, no migration files): ALTER each column to INTEGER using `ROUND(col*100)` to backfill existing rows, then add CHECK (col >= 0) constraints. Event.discount stays a percentage Float (0..100) — it is not a money column.
- **API:** No endpoint signatures change, but every response now carries paise integers. computeFees (bookings.js:83-88) and the inline fee block (bookings.js:302-307) become integer math: platformFee = Math.round(discountedBase*2/100); tax = Math.round((discountedBase+platformFee)*18/100); total = subtotal - discount + platformFee + tax — all already integer paise, so round2 is deleted. create-order amount (bookings.js:495) and verify amount check (bookings.js:606) drop the *100 and compare booking.total directly. The <₹1 guards (bookings.js:320, 496) compare total < 100 paise.
- **Frontend:** Add a shared formatPaise(paise) helper in frontend/lib (returns `₹${(paise/100).toLocaleString('en-IN',{minimumFractionDigits:2})}`) and route ALL money rendering through it: payment page (frontend/app/events/[id]/payment/page.tsx money lines ~255-299), booking page summary math (frontend/app/events/[id]/booking/page.tsx:146-163 — subtotal now in paise, mirror the integer fee formulas exactly), BookingSummary, PaymentSidebar, host manage revenue, marketing/admin dashboards. Ticket price INPUT in components/event-create/Tickets.tsx stays rupees in the field but is converted to paise (Math.round(x*100)) before POST; the events route parseFloat becomes a rupees→paise conversion on write.
- **Acceptance:**
  - schema.prisma money columns are Int; `npx prisma db push` applies cleanly and existing rows are backfilled to correct paise (e.g. a ₹250.00 ticket reads 25000).
  - A booking of a ₹99.50 ticket ×3 produces integer subtotal 29850 paise with fees computed by integer math and no round2 anywhere in the file (grep confirms round2 removed).
  - Razorpay create-order sends booking.total paise unchanged and verify-payment's amount equality check passes for a real capture.
  - The frontend booking total shown equals the backend-stored total exactly for at least 5 mixed-price/discount cases (integer equality, no floating drift).
  - A negative money value is rejected at the DB layer (CHECK constraint) and at the zod priceLike validator.
  - All money displays show two-decimal rupees via the single formatPaise helper (no bare /100 scattered in JSX).
- **Risks:** Highest-blast-radius change: touches schema, both booking pages' mirrored math, email.js receipt (email.js:130-144 toLocaleString), and every dashboard. Must land as one coordinated PR or totals will disagree mid-rollout. Migration is destructive-ish (type change) — snapshot the DB first; the *100 backfill must ROUND to avoid 24999-vs-25000 drift on pre-existing floats. Any external consumer reading the API now gets paise — breaking for anyone parsing rupees. PAY-01/02/04/07 all touch money and should be sequenced after (or rebased onto) this.

### PAY-01 — Server-side Razorpay webhook + stuck-order reconciliation  `M`

**Depends on:** RAZORPAY_WEBHOOK_SECRET env var; raw-body mount before express.json in index.js

Today a booking is only settled when the browser calls POST /:id/verify-payment (bookings.js:545); if the buyer pays then closes the tab, the captured booking stays PENDING forever because expireStalePendingBookings (bookings.js:1242) deliberately skips any row whose Payment has an orderId (the SWEEP-RACE guard, lines 1250-1257). Add a signed Razorpay webhook that settles/marks-failed idempotently server-side, and extend the sweep to actively reconcile orderId-set PENDING rows against Razorpay instead of leaking their inventory.

- **Data model:** Add model WebhookEvent { id Int @id @default(autoincrement()); provider String @default("razorpay"); eventId String @unique; type String; payload String; processedAt DateTime?; createdAt DateTime @default(now()) } for idempotent dedupe keyed on Razorpay's x-razorpay-event-id header. No changes to Booking/Payment columns (reuse Payment.orderId/transactionId/status and BookingStatus). New env var RAZORPAY_WEBHOOK_SECRET (document in backend/.env.example alongside RAZORPAY_KEY_*).
- **API:** POST /api/bookings/webhook/razorpay — PUBLIC (no JWT), authenticated instead by HMAC-SHA256 of the RAW request body against header `x-razorpay-signature` using RAZORPAY_WEBHOOK_SECRET (crypto.timingSafeEqual). Must be mounted with express.raw({type:'application/json'}) for THIS path only, registered in index.js BEFORE the global express.json() at index.js:92 (otherwise the parsed body breaks HMAC). Handle event types: `payment.captured` → look up Payment by order_id, verify amount === Math.round(booking.total*100), run the same $transaction as verify-payment (booking→COMPLETED, Payment→SUCCESS, mapRazorpayMethod, fire sendBookingConfirmation) but idempotent (no-op if already COMPLETED); `payment.failed` → set Payment.status=FAILED, leave booking PENDING for the sweep. Always insert a WebhookEvent row first; if eventId already present, return 200 without reprocessing. Return 200 quickly on success, 400 on bad signature, 200 (logged) on unknown event types so Razorpay stops retrying. Response body is opaque {received:true}.
- **Frontend:** None (server-to-server). Optionally the payment page (frontend/app/events/[id]/payment/page.tsx) verify handler can stay as-is since the webhook is a redundant safety net; no change required.
- **Acceptance:**
  - POSTing a body with a wrong/absent x-razorpay-signature returns 400 and does not mutate any booking.
  - A valid payment.captured webhook for a PENDING booking flips it to COMPLETED, sets Payment SUCCESS with the razorpay_payment_id, and sends exactly one confirmation email.
  - Re-delivering the same webhook (same x-razorpay-event-id) is a no-op: booking stays COMPLETED, no second email, only one WebhookEvent row.
  - A booking that created an order but never called verify-payment is settled by the webhook alone (browser never involved).
  - Extended expireStalePendingBookings: an orderId-set PENDING booking older than the reconciliation window is checked against Razorpay — settled if a captured payment exists, cancelled+inventory-restored only if the order has no captured payment.
  - The webhook route is reachable even when RAZORPAY_KEY_* is set; with keys unset it 503s like the other Razorpay endpoints.
- **Risks:** Raw-body middleware ordering is fragile — must be path-scoped so it does not disturb every other JSON route. Razorpay retries webhooks up to 24h, so idempotency via WebhookEvent.eventId is mandatory. Reconciling stale orderId rows requires razorpay.orders.fetchPayments; rate-limit the sweep so a large PENDING backlog does not hammer the Razorpay API. Clock skew: keep the reconciliation window (e.g. 30 min) longer than the create-order-to-capture window.

### PAY-05 — Live inventory-hold countdown timer on the payment page  `S`

Inventory is claimed the instant a PENDING booking is created (sold++ at bookings.js:380) and released by expireStalePendingBookings after 15 min (bookings.js:1242), but the buyer sees no indication their hold is time-boxed. Return an expiresAt on the guest booking lookup and render a live countdown on the payment page that disables Pay when the hold lapses, so buyers understand the urgency and don't pay into an already-swept booking.

- **Data model:** None. expiresAt is derived, not stored: expiresAt = booking.createdAt + STALE window. Extract the sweep window (currently the 15*60*1000 default at bookings.js:1242, invoked with defaults by the 5-min interval in index.js:211) into a shared exported constant BOOKING_HOLD_MS so the GET response and the sweep use one source of truth.
- **API:** GET /api/bookings/code/:bookingCode (bookings.js:817) and GET /api/bookings/:id (bookings.js:763): when status==='PENDING', add `expiresAt` (ISO) = createdAt + BOOKING_HOLD_MS and `holdMs` to the returned data. For non-PENDING bookings expiresAt is null. No new endpoint.
- **Frontend:** Payment page (frontend/app/events/[id]/payment/page.tsx): read booking.expiresAt, render a mm:ss countdown near the Pay button (a small useEffect setInterval decrementing to zero), and when it hits zero set an `expired` flag that disables payWithRazorpay/handlePaymentComplete (the Pay button at ~line 249) and shows 'Your ticket hold expired — please start a new booking' with a link back to /events/[id]/booking. Also guard the Razorpay handler so a payment attempted after expiry surfaces the backend INVALID_STATE cleanly.
- **Acceptance:**
  - GET /api/bookings/code/:bookingCode for a PENDING booking returns expiresAt = createdAt + hold window; a COMPLETED booking returns expiresAt null.
  - The payment page shows a live mm:ss countdown that ticks down each second.
  - When the countdown reaches zero the Pay button is disabled and an expiry message with a restart link is shown.
  - The hold window used for the countdown equals the sweep window (single shared constant) — changing it in one place changes both.
  - Paying just before expiry still works; attempting to pay after the server has swept the booking shows a graceful INVALID_STATE message, not a crash.
- **Risks:** The displayed expiry is a soft guide — the authoritative release is the 5-min server interval, so a booking may still be payable a few minutes past the shown zero, or (edge) already swept slightly after; the UI must handle a post-expiry INVALID_STATE from create-order/verify gracefully. Client clock skew can make the timer inaccurate; compute remaining from server expiresAt vs Date.now() rather than a fixed client-side start. Once create-order runs the sweep no longer touches the booking (SWEEP-RACE guard), so the countdown reaching zero does NOT actually cancel a booking that already started payment — copy should say 'hold may expire' rather than promise cancellation.

### PAY-02 — Full & partial refunds for completed bookings  `M`

COMPLETED bookings currently have no refund path — cancel (bookings.js:953) explicitly rejects them with INVALID_STATE. Add a host/admin refund endpoint that issues a real Razorpay refund (or records a demo refund when Razorpay is unset), transitions the booking to REFUNDED, and restores inventory using the same guarded updateMany pattern as cancel, with support for proportional partial refunds.

- **Data model:** Payment: add `refundedAmount Float @default(0)`, `refundId String?`, and reuse PaymentStatus.REFUNDED (already exists). Booking: add `refundedAmount Float @default(0)` and reuse BookingStatus.REFUNDED (already exists). A full refund sets Booking.status=REFUNDED and restores all sold; a partial refund keeps status=COMPLETED, accumulates refundedAmount, and (per policy) does NOT restore inventory unless the refund covers whole ticket lines. Add optional `refundReason String?` on Booking for audit.
- **API:** POST /api/bookings/:id/refund — authenticateUser + ownership = the event's host OR an ADMIN of the event's fest (reuse the isHost/managedFestId check from bookings.js:791-798; buyers do NOT get this endpoint — buyer-initiated refunds are PAY-06). Body: { amount?: number (rupees; omitted = full refund of booking.total - refundedAmount), reason?: string }. Validates the booking is COMPLETED, amount>0, and amount <= remaining refundable (total - refundedAmount). Calls razorpay.payments.refund(Payment.transactionId, { amount: Math.round(amount*100), speed:'normal' }); on success, in a $transaction: increment Payment.refundedAmount + Booking.refundedAmount, store refundId, set Payment.status=REFUNDED when fully refunded, set Booking.status=REFUNDED when total refunded, and for a full refund restore each item's sold via `updateMany({ where:{ id, sold:{ gte: qty } }, data:{ sold:{ decrement: qty } } })` (bookings.js:1007-1012 pattern). When getRazorpay() is null (demo), skip the Razorpay call and record a refundId of `DEMO-REFUND`. Returns {success,data:updatedBooking}.
- **Frontend:** Host event-manage page (frontend/app/host/events/[eventId]/manage/page.tsx) buyer/bookings table: add a Refund action per COMPLETED booking opening a modal (full vs partial amount + reason), calling the endpoint via apiFetch. Show REFUNDED/partially-refunded status badges. Surface refundedAmount in the row.
- **Acceptance:**
  - A host issuing a full refund on a COMPLETED booking sets it to REFUNDED, sets Payment REFUNDED, and restores every ticket type's sold count (verifiable by a subsequent booking succeeding against the freed inventory).
  - A partial refund (amount < total) leaves the booking COMPLETED, sets refundedAmount, and rejects a second refund whose cumulative amount would exceed the total.
  - A buyer (non-host, non-admin) calling POST /:id/refund gets 403.
  - Refunding a PENDING or already-REFUNDED booking returns INVALID_STATE (no Razorpay call made).
  - With Razorpay unset, the refund still transitions state and restores inventory (demo path) without throwing.
  - The Razorpay refund amount sent equals Math.round(amount*100) paise and never exceeds the captured payment amount.
- **Risks:** Partial-refund inventory semantics are a product decision: a seat already 'used' should not silently reappear; the spec restores inventory only on full refund. Razorpay refunds are async (refund.processed webhook) — the endpoint records the requested refund optimistically; a follow-up webhook (extends PAY-01) should reconcile FAILED refunds. Float rounding (see PAY-03) means refundedAmount comparisons must use the same round2 rule to avoid off-by-a-paise over-refund. Concurrent double-refund is prevented by a status-guarded updateMany on the REFUNDED transition.

### PAY-04 — Per-code promo / discount codes validated at checkout  `M`

**Depends on:** PAY-03 (money-in-paise) for clean integer discount math

The only discount today is a whole-event percentage (Event.discount, applied at bookings.js:302). Add reusable promo codes (percent or flat, scoped to a fest or a single event, with usage caps and expiry) that a buyer enters at checkout; validate and atomically increment redemption inside the existing booking $transaction (bookings.js:166) so a capped code can never be over-redeemed under concurrency.

- **Data model:** New model PromoCode { id Int @id @default(autoincrement()); code String; festId Int?; eventId Int?; kind PromoKind; percentOff Int?; flatOffPaise Int?; maxDiscountPaise Int?; minSubtotalPaise Int?; maxRedemptions Int?; redeemedCount Int @default(0); startsAt DateTime?; expiresAt DateTime?; active Boolean @default(true); createdAt/updatedAt } with @@unique([festId, code]) and enum PromoKind { PERCENT FLAT }. Add Booking.promoCodeId Int? + Booking.promoDiscount (paise) to record what was applied. (Money fields in paise assume PAY-03; if built first, use Float+round2.) Redemption cap enforced via guarded updateMany, not a read-then-write.
- **API:** CRUD (host/admin scoped): POST/GET/PATCH/DELETE /api/events/promo-codes (+ list by fest/event), authorizeRoles-style using callerCanManageEvent / managedFestId scoping from events.js:33-53 — a host may only create codes for their own event/fest. Checkout: POST /api/bookings accepts an optional `promoCode` string in the body (add to createBookingSchema in bookingValidator.js). Inside the $transaction, after subtotal is computed (bookings.js:296): look up the code case-insensitively scoped to this event/its fest, validate active + within [startsAt,expiresAt] + subtotal>=minSubtotal + redeemedCount<maxRedemptions, compute promoDiscount = kind===PERCENT ? min(round(subtotal*percentOff/100), maxDiscount) : min(flatOff, subtotal), stack it with the event discount to form discountedBase, then `updateMany({ where:{ id, redeemedCount:{ lt: maxRedemptions } }, data:{ redeemedCount:{ increment:1 } } })` and throw bookingError(409,'PROMO_EXHAUSTED') if count===0. An invalid/expired code throws bookingError(400,'INVALID_PROMO'). Never trust a client-supplied discount amount (matches the existing M8 contract).
- **Frontend:** Booking page (frontend/app/events/[id]/booking/page.tsx): add an 'Apply promo code' input + Apply button in the summary aside (~line 480), send `promoCode` in the POST body (line 221), and on a validation error show the backend message via showToast without losing selected tickets. Reflect the applied promo line in both the discount summary block and the payment page order summary (payment page discount line already exists at ~line 276). Host: a Promo Codes management section in the host dashboard/event-manage to create/deactivate codes.
- **Acceptance:**
  - A valid PERCENT code reduces the booking's discountedBase and the stored total, and the reduction is visible on both the booking summary and the payment page.
  - A code past expiresAt, inactive, or below minSubtotal is rejected with a clear message and no booking is created.
  - A code with maxRedemptions=N cannot be redeemed an N+1th time even under concurrent bookings (guarded updateMany returns count 0 → 409).
  - maxDiscountPaise caps a percent code (e.g. 50% off capped at ₹200 never discounts more than ₹200).
  - A host can only create/list/delete promo codes scoped to a fest/event they manage; cross-fest access returns 403.
  - The client cannot inject an arbitrary discount — the server ignores any body discount and derives promoDiscount solely from the stored PromoCode.
- **Risks:** Stacking a promo code on top of Event.discount can drive the discounted base toward zero — reuse the FREE/ZERO-TOTAL settle path (bookings.js:315) and the <₹1 guard (bookings.js:320). Case sensitivity and whitespace on codes must be normalised. Redemption must increment inside the SAME $transaction as booking creation and be released on cancel/expire/refund (decrement redeemedCount at bookings.js:1007 cancel and in expireStalePendingBookings) or a code slowly 'burns' on abandoned PENDING bookings.

### ARCH-07 — Push dashboard stats into DB aggregates and paginate booking lists  `L`

**Depends on:** ARCH-02

The dashboard endpoints load entire booking graphs into memory and compute stats with JS reduces — bookings.js GET /event/:eventId (1077-1136) and GET /fest/:festId (1169-1221), and events.js GET /:id/buyers (1078-1118). For a large fest this pulls thousands of rows per request. Replace the reduces with Prisma groupBy/aggregate and paginate the row lists.

- **Data model:** none (relies on the composite indexes from ARCH-02)
- **API:** GET /api/bookings/event/:eventId — compute stats via prisma.booking.groupBy({by:['status'],where:{eventId},_count:true,_sum:{total}}) plus a completed-tickets aggregate over BookingItem; return the row list paginated with ?page&pageSize (default 50, max 100) and data.pagination:{page,pageSize,total}. GET /api/bookings/fest/:festId — replace eventSummary/totals JS loop (1191-1211) with groupBy by eventId + _sum on completed bookings; keep recentBookings but drive it from a take:20 query instead of slice(0,20) over all rows. GET /api/events/:id/buyers — add the same pagination. Keep response envelope; add pagination object under data. Auth/ownership checks unchanged.
- **Frontend:** Update the consumers to page: host dashboard (frontend/app/host/dashboard), event manage (frontend/app/host/events/[eventId]/manage), and admin dashboard (frontend/app/admin/dashboard) — add page controls or infinite scroll and read data.pagination. Existing xlsx export should fetch all pages (loop until total reached) rather than assuming one response.
- **Acceptance:**
  - Stats returned by GET /event/:eventId (totalBookings, completed/pending/cancelled counts, totalRevenue, totalTicketsSold) equal the previous JS-reduce values for the same data.
  - GET /event/:eventId, /fest/:festId, and /:id/buyers each return at most pageSize booking rows and include pagination:{page,pageSize,total}.
  - A fest with 5,000 completed bookings returns a dashboard summary without loading all 5,000 rows (verified via query log / row count).
  - fest eventSummary revenue/ticket totals via groupBy match the old per-event loop output.
  - Frontend dashboards render page 1 and can navigate to page 2; export still captures every row across pages.
- **Risks:** Money is Float with round2() — _sum aggregates inherit floating error the same as the current reduces (no regression, but flag for the deferred money-in-paise migration). Adding a pagination object is an additive response change but frontends that ignored it must not break; keep the top-level list where callers expect it. groupBy over status won't include zero-count statuses — backfill missing statuses to 0 in JS so the stats shape is stable.

### ARCH-08 — Adopt Prisma Migrate (migrate deploy) for production  `L`

**Depends on:** ARCH-06

The project uses prisma db push with no migration history (CLAUDE.md:16-18) and keeps CHECK constraints in a hand-run backend/prisma/constraints.sql that must be re-applied after every push. Introduce prisma/migrations, fold constraints.sql into a migration, run prisma migrate deploy in the release step, and remove the stale SQLite dev.db so schema changes are versioned and reproducible.

- **Data model:** No new fields. Baseline the current schema.prisma as an initial migration, then add a migration that folds constraints.sql: ALTER TABLE "TicketType" ADD CONSTRAINT ticket_sold_lte_quantity CHECK (sold <= quantity). If ARCH-02 lands, its indexes become part of a migration too.
- **Acceptance:**
  - backend/prisma/migrations/ exists with an init migration matching the current schema plus a migration containing the ticket_sold_lte_quantity CHECK.
  - prisma migrate deploy applies cleanly against a fresh empty database and the CHECK constraint is present afterward (INSERT violating sold<=quantity is rejected).
  - Against the existing Neon DB, the init migration is baselined with prisma migrate resolve --applied so no data is dropped.
  - backend/prisma/dev.db is removed and README/CLAUDE.md no longer instruct db push as the primary flow (migrate dev locally, migrate deploy in release).
  - A CI workflow (.github/workflows/ci.yml, newly added) runs prisma generate + prisma migrate deploy against a throwaway Postgres and fails on drift.
- **Risks:** Baselining an existing production DB is the sharp edge — must migrate resolve --applied the init migration against Neon before any deploy, or it will try to recreate existing tables. Team must stop running db push once migrations exist (drift). migrate deploy needs the unpooled DIRECT_URL from ARCH-06. No CI exists yet (.github/workflows absent), so the workflow is net-new. constraints.sql can be deleted once folded, but keep a note in the migration referencing its origin.

### ARCH-04 — Add OpenAPI docs + /api/v1 versioning  `L`

**Depends on:** ARCH-01

There is no API contract doc and no version prefix, so clients hardcode /api/* paths and there is no machine-readable spec. Mount all routers under /api/v1 (keeping /api as a deprecation alias) and generate an OpenAPI 3 document from the existing zod validators, served behind Swagger UI, so the contract is discoverable and testable.

- **API:** In index.js mount every router at both /api/v1/* and /api/* (alias) to avoid breaking the frontend immediately. Add deps @asteasolutions/zod-to-openapi (zod v4 compatible; project is on zod ^4.3.6) and swagger-ui-express. New backend/src/openapi.js builds an OpenAPIRegistry, registers the schemas already in src/validators/* (signupSchema, signinSchema, createBookingSchema, createEventSchema, ticketTypeSchema, marketing + user validators) and the documented response envelopes. New routes: GET /api/openapi.json (the generated document) and GET /api/docs (Swagger UI). Document auth as bearer JWT and mark guest endpoints (GET /api/bookings/code/:code) public.
- **Frontend:** No change required if the /api alias is retained. Optionally introduce an API_VERSION constant in lib/auth.ts and migrate paths to /api/v1 in a later pass; do NOT remove the /api alias until all frontend callers use getApiUrl()+/v1.
- **Acceptance:**
  - GET /api/docs renders Swagger UI listing bookings/events/fests/auth/user/role-requests endpoints.
  - GET /api/openapi.json returns a valid OpenAPI 3.0 document that passes a schema validator.
  - Request bodies for signup, signin, and create-booking in the spec are derived from the actual zod validators (a change to a validator changes the doc).
  - Every existing /api/* route also responds at /api/v1/* with identical behavior.
  - The docs and openapi.json routes require no auth and are excluded from rate limiting.
- **Risks:** zod v4 + zod-to-openapi interop must be verified (some adapters lag zod v4); if incompatible, fall back to hand-authored path definitions referencing the validators. Keeping /api and /api/v1 mounted doubles the route table — ensure middleware (rate limiters, auth) apply to both. Response schemas depend on ARCH-01 unification to document a single envelope.

---

## Phase 3: Fulfillment policy, invoices & account/auth completeness

**Goal:** Close the buyer fulfillment loop (policy, invoice) and ship the missing account/auth surfaces.

**Why now:** Refund policy and the GST invoice PDF depend directly on the Phase-2 refund engine and paise money, so they slot in immediately after. In parallel we deliver the auth account cluster: real transactional emails + email verification (now that email infra exists), the reset-password UX parity, lockout recovery, and the account hub that sessions and the viewer→organizer upgrade hang off of. These are self-contained, high user value, and unblock later 2FA/magic-link work.

**Exit criteria:** Organizers set a per-event refund policy that governs a buyer self-service cancel/refund routed through the PAY-02 engine; an authorized endpoint renders a stable-numbered GST invoice PDF linked from the confirmation page/email; signup creates emailVerified:false with real branded verify/reset emails (auto-verify when SMTP unset) and a /verify+resend flow; reset page has the live 5-rule checklist and successful reset clears lockUntil; signin shows a lockout countdown + recovery CTA; /account hub supports change-password (bumps tokenVersion, revokes sessions), profile edit, typed-confirmation delete, active-session management, and in-app organizer upgrade, all reachable from a Header account entry.

Specs (8): PAY-06, PAY-07, AUTH-01, AUTH-07, AUTH-09, AUTH-04, AUTH-02, AUTH-03

### PAY-06 — Configurable per-event refund policy + buyer self-service cancel  `M`

**Depends on:** PAY-02 (refund execution engine)

The booking page hardcodes 'full refund up to 7 days before the event' (booking/page.tsx:472) but no such rule is enforced anywhere and buyers cannot cancel a COMPLETED booking at all. Let organizers set a refund policy at event creation and give buyers a governed self-service cancel/refund action that enforces that policy, wiring the actual money movement through the PAY-02 refund engine.

- **Data model:** Event: add `refundPolicy RefundPolicy @default(NO_REFUND)` and `refundCutoffHours Int?` (hours before startDate until which a refund is allowed for FULL_UNTIL_CUTOFF). enum RefundPolicy { NO_REFUND FULL_ANYTIME FULL_UNTIL_CUTOFF }. Reuses PAY-02's Booking.refundedAmount/status. No new tables.
- **API:** Event create/update (events.js createEventSchema in eventValidator.js): accept refundPolicy + refundCutoffHours (validate enum + non-negative int). New buyer endpoint POST /api/bookings/:id/request-refund — auth = the booking's buyer (userId===req.user.userId) OR the guest bookingCode holder (reuse callerOwnsBooking, bookings.js:33). Server loads the event, evaluates the policy: NO_REFUND → 403 REFUND_NOT_ALLOWED; FULL_ANYTIME → allowed; FULL_UNTIL_CUTOFF → allowed only if now <= startDate - refundCutoffHours, else 409 REFUND_WINDOW_CLOSED. When allowed for a COMPLETED booking it invokes the PAY-02 refund logic (full refund, restore inventory); for a still-PENDING booking it routes to the existing cancel path (bookings.js:953). Returns the updated booking.
- **Frontend:** Event-create Tickets/Basics step (components/event-create/): add a Refund Policy selector (+ cutoff-hours input when FULL_UNTIL_CUTOFF) and persist it. Booking page: replace the hardcoded refund bullet (booking/page.tsx:470-474) with copy derived from the event's refundPolicy. Buyer 'My bookings' view: add a Cancel / Request refund button on eligible bookings that calls request-refund via apiFetch and shows the policy-driven outcome (allowed / window closed / not allowed) via showToast.
- **Acceptance:**
  - An event created with NO_REFUND rejects a buyer request-refund with REFUND_NOT_ALLOWED and moves no money.
  - FULL_UNTIL_CUTOFF with refundCutoffHours=48 allows a refund 3 days before the event and rejects it 24 h before with REFUND_WINDOW_CLOSED.
  - A permitted buyer refund on a COMPLETED booking transitions it to REFUNDED, restores inventory, and issues the Razorpay refund (via PAY-02).
  - The booking page shows policy-accurate copy (not the old hardcoded 7-day text) for each policy type.
  - A user who is neither the buyer nor the bookingCode holder cannot cancel/refund someone else's booking (403).
  - A PENDING (unpaid) booking's buyer cancel still works and restores inventory via the existing cancel path.
- **Risks:** Policy is evaluated against Event.startDate which is nullable — define behaviour when startDate is null (treat FULL_UNTIL_CUTOFF as FULL_ANYTIME or block). Existing events created before this change default to NO_REFUND, which may surprise organizers — communicate the default. Buyer-initiated refunds are abuse-prone; keep the writeLimiter rate limit and ensure only one refund can win via the status-guarded transition. Timezone of startDate vs now must be consistent (store/compare in UTC).

### PAY-07 — Downloadable GST tax-invoice / receipt PDF  `M`

**Depends on:** PAY-03 (money-in-paise) for correct GST formatting

Buyers only get an HTML confirmation email (email.js sendBookingConfirmation) — there is no formal, downloadable GST invoice with an invoice number, which fest finance teams and reimbursements require. Add an authorized endpoint that renders a PDF tax invoice (line items, 2% platform fee, 18% GST, stable invoice number) and link it from the confirmation page and email.

- **Data model:** Booking: add `invoiceNumber String? @unique`, assigned when the booking becomes COMPLETED (at verify-payment bookings.js:613, demo complete bookings.js:704, free-booking creation bookings.js:339, and the PAY-01 webhook). Format e.g. `FesTicket-{YYYY}-{zero-padded sequential}`; generate via a small counter table or `FesTicket-{year}-{bookingId}` to avoid a hot sequence. No PDF is stored — it is generated on demand.
- **API:** GET /api/bookings/:id/invoice — auth = same ownership as GET /:id (buyer / host / fest ADMIN, bookings.js:791-798) OR the guest bookingCode via a query param (?code=), reusing callerOwnsBooking semantics. Only issues an invoice for COMPLETED/REFUNDED bookings (400 otherwise). Streams a PDF (Content-Type application/pdf, Content-Disposition attachment; filename=`invoice-<bookingCode>.pdf`) built server-side with a lightweight generator (e.g. pdfkit) containing: seller/fest + college header, invoiceNumber + date, buyer name/email, per-item table (name × qty × unitPrice = lineTotal reusing booking.items), subtotal, discount, platform fee (2%), GST (18%), total, and payment reference (Payment.transactionId). Money formatted via the shared paise formatter (PAY-03).
- **Frontend:** Confirmation page (frontend/app/booking-confirmation): add a 'Download tax invoice (PDF)' button linking to the invoice endpoint (with ?code= for guests). email.js sendBookingConfirmation (email.js:93-151): add a 'Download your GST invoice' link in the receipt body pointing at `${FRONTEND_URL or API}/api/bookings/:id/invoice?code=<bookingCode>`.
- **Acceptance:**
  - GET /api/bookings/:id/invoice for a COMPLETED booking returns a valid application/pdf with an attachment filename and the correct invoice number.
  - The PDF line items, subtotal, 2% fee, 18% GST, and total exactly match the stored booking amounts.
  - A booking is assigned a unique, stable invoiceNumber at completion and the same number appears on every regeneration of the PDF.
  - A guest with the correct bookingCode can download their invoice; a caller without ownership or a valid code gets 403.
  - Requesting an invoice for a PENDING booking returns 400 (no invoice for unpaid orders).
  - The confirmation email and confirmation page both expose a working invoice download link.
- **Risks:** Adds a PDF dependency (pdfkit) to the backend — keep generation streaming to avoid buffering large PDFs in memory. Invoice numbering must be gap-tolerant and unique under concurrency; a per-year sequence is a contention point, so `FesTicket-{year}-{bookingId}` is the low-risk default. GST invoice legal fields (GSTIN/HSN) may be required for a real tax invoice — confirm scope with finance; if unknown, label it 'Receipt' rather than a statutory tax invoice. REFUNDED bookings should show a credit/refund note rather than a clean invoice.

### AUTH-01 — Deliver transactional auth emails + turn on email verification  `M`

**Depends on:** SMTP configured for real delivery (graceful when unset)

Replace the console.log stubs in auth.js signup/forgot-password/verify with real branded HTML emails sent via sendMail(), and actually enforce email verification (create users emailVerified:false + a /verify page + resend) — while auto-verifying when SMTP is unset so dev/E2E keep working. Today signup hardcodes emailVerified:true (auth.js:128) and only console.logs the verify/reset links (auth.js:158, 590).

- **Data model:** No required change (User already has emailVerified, emailVerifyToken, resetPasswordToken/resetPasswordExpiry — schema.prisma:23-26). Optional: add emailVerifyExpiry DateTime? to give verify tokens a TTL like reset does (30 min). Requires `npx prisma db push` only if the optional column is added.
- **API:** email.js: add sendVerificationEmail({to,name,verifyLink}), sendPasswordResetEmail({to,name,resetLink}), sendWelcomeEmail({to,name}) reusing escapeHtml() + the branded #522C5D template already in sendBookingConfirmation(). Modify POST /api/auth/signup (auth.js:65, public): when getTransport() is configured set emailVerified:false and fire sendVerificationEmail non-blocking; when unset keep emailVerified:true (current behavior). Modify POST /api/auth/forgot-password (auth.js:559): call sendPasswordResetEmail() instead of console.log(590), keep the generic 200. Modify GET /api/auth/verify-email (auth.js:697): keep JSON success but 302-redirect option to FRONTEND_URL/verify?status=… for direct email clicks. Add POST /api/auth/resend-verification { email } (public, writeLimiter): enumeration-safe generic 200 that regenerates emailVerifyToken and re-sends only if the user exists and is unverified. Optionally gate signin (auth.js:216) on emailVerified when SMTP is configured. All routes keep the bare-object response convention.
- **Frontend:** New app/verify/page.tsx: reads ?token, calls /api/auth/verify-email, renders success / invalid / expired states and a 'Resend verification email' button hitting /api/auth/resend-verification. Update signup submitted-state copy (signup/page.tsx:125-165) to say 'check your email to verify' when verification is on. No change to getApiUrl usage.
- **Acceptance:**
  - With SMTP configured, signup creates emailVerified:false and an email arrives whose /api/auth/verify-email?token= link flips emailVerified to true.
  - With SMTP unset (getTransport() null), signup still returns emailVerified:true and attempts no send, so existing E2E/dev flows are unchanged.
  - forgot-password sends a branded reset email (no console.log) and still returns the generic 'if this email exists' message for unknown addresses.
  - resend-verification returns an identical 200 for existing-unverified, already-verified, and unknown emails.
  - The /verify page shows success and error states and offers resend on an invalid/expired token.
- **Risks:** Must preserve the auto-verify fallback — dev/E2E rely on emailVerified:true and signin-without-verify; do not hard-require verification unless SMTP present. Verify tokens have no TTL today (add expiry to match reset). Send non-blocking like sendBookingConfirmation so a mail failure never breaks signup.

### AUTH-07 — Bring the reset-password page up to signup password UX  `S`

Port signup's live 5-rule password checklist, show/hide toggles, and disabled-until-valid submit into reset/page.tsx, which today only checks length>=8 and match (reset/page.tsx:26-33). The backend already enforces the full policy (auth.js:626-644), so users currently discover rules via a post-submit 400 instead of up-front.

- **Data model:** None.
- **API:** None (backend reset-password already validates 8–30 + upper/lower/number/special).
- **Frontend:** reset/page.tsx: replace the two plain inputs (96-116) and the min-8 check (26-29) with the pwHasLength/Upper/Lower/Number/Special + passwordsMatch logic and passwordRules list from signup/page.tsx:56-71, add the eye-toggle inputs (signup 246-320), and gate the 'Set new password' button on passwordValid && passwordsMatch. Ideally extract a shared PasswordRules/PasswordInput component and reuse it in signup to avoid duplication.
- **Acceptance:**
  - The reset form shows 5 live rules plus 'passwords match', each flipping green as typed (parity with signup).
  - Submit stays disabled until every rule passes, so a password the backend would 400 cannot be submitted.
  - Show/hide toggles work on both the new-password and confirm fields.
  - A valid reset still succeeds and redirects to /signin?reset=1 (existing behavior preserved).
- **Risks:** Keep the client rules byte-for-byte aligned with the backend (8–30, upper/lower/number/special) so client and server never disagree. Pure-frontend, low risk.

### AUTH-09 — Account-lockout UX: countdown + self-service recovery  `S`

Surface the lock expiry so the sign-in form can show a live countdown and a 'reset your password' recovery CTA, and clear lockUntil/failedLoginAttempts on a successful password reset so recovery actually unlocks the account. Today signin returns only a static locked message with no lockUntil (auth.js:209-213, 232-234) and reset-password never clears the lock (auth.js:663-673).

- **Data model:** None (User.lockUntil and failedLoginAttempts already exist — schema.prisma:28-29).
- **API:** Modify POST /api/auth/signin (auth.js): include lockUntil (ISO) and retryAfterSeconds in BOTH 403 lock responses — the pre-check lock (209-213) and the just-locked branch (222-234) — keeping wording otherwise generic. Modify POST /api/auth/reset-password (auth.js:663-673): add failedLoginAttempts:0 and lockUntil:null to the update block so a completed reset clears an active lock (it currently does not).
- **Frontend:** AuthForm.tsx error handling (77-81): when a 403 carries lockUntil, render a live mm:ss countdown instead of the static string, disable submit until it elapses, and show a 'Reset your password' link to /forgot as the self-service path.
- **Acceptance:**
  - After 5 failed attempts, the signin 403 returns lockUntil and the form shows a ticking countdown that re-enables submit at zero.
  - The lock response links to /forgot for self-service recovery.
  - Completing a password reset clears lockUntil + failedLoginAttempts so the user can immediately sign in with the new password even if previously locked.
  - Invalid-credential responses still don't reveal whether the email exists (lockUntil is returned only on the lock path).
- **Risks:** Returning lockUntil is a minor, standard disclosure (confirms the account is locked); keep it off the plain invalid-credential path. The just-locked branch resets failedLoginAttempts to 0 while setting lockUntil — ensure it still returns lockUntil. Countdown should trust the server lockUntil and tolerate client clock skew.

### AUTH-04 — Account settings hub: change password, edit profile, delete account  `L`

**Depends on:** AUTH-07 shared password checklist (for the change-password form)

Add an authenticated /account hub and the backend handlers it needs: change-password (verify current, bump tokenVersion, revoke sessions), profile edit (name/phone/organizationName), and typed-confirmation account deletion — plus an 'Account' entry in the Header menu. None of these endpoints exist today (user.js only has GET /me and POST /complete-profile).

- **Data model:** None for password/profile. For delete, prefer soft-delete: add User.deletedAt DateTime? (+ email anonymization on delete) rather than hard-delete, because User has non-cascading FKs (Booking.userId, Event.hostId, Expense.hostId, RoleRequest) that a hard DELETE would violate (only RefreshToken cascades). Requires `npx prisma db push` for the deletedAt column.
- **API:** Bare-object convention (auth.js/user.js). POST /api/auth/change-password { currentPassword, newPassword } (authenticateUser): bcrypt.compare current, enforce the same complexity block as reset-password (auth.js:634-644), hash, update, tokenVersion:{increment:1}, and deleteMany refreshTokens — mirroring reset-password (auth.js:663-677); 400 on wrong current or weak new. PATCH /api/user/me { name?, phone?, organizationName? } (authenticateUser, zod-validated via a new userValidator schema) returning the updated user — distinct from /complete-profile which flips profileCompleted. DELETE /api/user/me { confirmEmail } (authenticateUser): require confirmEmail to equal the account email; for ADMIN with managedFest or HOST with events, either 409 'reassign your fest/events first' or documented cascade; on success set deletedAt, scrub PII, delete refresh tokens, bump tokenVersion; signin and GET /me must then treat deletedAt users as nonexistent.
- **Frontend:** New app/account/page.tsx hub with cards linking to sessions (AUTH-02) and organizer (AUTH-03) and security (AUTH-08), plus: a change-password form (current + new + confirm, reusing the AUTH-07 checklist), a profile form prefilled from /me that calls updateStoredUser on success, and a delete section requiring the user to type their exact email before DELETE, then clearAuth + redirect home. Header.tsx: add an 'Account' link to the dropdown (desktop 142-166, mobile 222-251) for every signed-in user.
- **Acceptance:**
  - Change-password rejects a wrong current password (400) and a weak new one, and on success the previously issued access + refresh tokens stop working (tokenVersion bumped, sessions revoked).
  - Profile edit persists name/phone/organizationName and the Header label/stored user update immediately.
  - Delete requires the exact account email; a mismatch is rejected and on success the account can no longer sign in and local auth is cleared.
  - Deleting an ADMIN/HOST with owned fest/events is either blocked with a clear message or safely handled with no orphaned-FK errors.
  - The Header menu shows an 'Account' entry for all signed-in roles.
- **Risks:** FK integrity on delete is the main hazard (Event.hostId/Booking.userId are not cascade); soft-delete avoids data loss but every read path (signin, /me, admin/host queries) must exclude deletedAt users, and deleting an ADMIN orphans a fest. Balance PII scrubbing against keeping booking receipts.

### AUTH-02 — Active-session / device management UI  `S`

**Depends on:** AUTH-04 Header account entry (or add a direct link)

Build an authenticated account page that lists a user's active refresh-token sessions and lets them sign individual devices (or all others) out. The backend already exposes GET/DELETE /api/auth/sessions (auth.js:470-556) but nothing in the UI consumes them.

- **Data model:** None. Optional: add RefreshToken.lastUsedAt DateTime? so the list can sort by recency and hint at the current device (sessions currently expose only id/userAgent/ipAddress/createdAt/expiresAt — auth.js:478-484).
- **API:** None new. Consume existing GET /api/auth/sessions (auth.js:470, authenticateUser), DELETE /api/auth/sessions/:id (auth.js:503, numeric id, scoped to req.user.userId), DELETE /api/auth/sessions (auth.js:532, revoke all). Optional: extend the GET select to include familyId or add a `current` flag by hashing the caller's stored refresh token and matching RefreshToken.token — needed because the metadata alone can't identify the current session.
- **Frontend:** New app/account/sessions/page.tsx using apiFetch from lib/auth. Parse userAgent into a browser/OS label, show IP + relative created/expires, newest first. Per-row 'Revoke' button (DELETE :id) and a 'Sign out everywhere' button (DELETE collection), each refetching and using showToast from lib/toast. Reachable from the Header account menu (add link here or via AUTH-04).
- **Acceptance:**
  - Page lists all of the user's sessions with a readable UA label, IP, and created/expires, newest first.
  - Revoking a row calls DELETE /:id, removes it, and the revoked refresh token can no longer be used at /api/auth/refresh-token.
  - 'Sign out everywhere' clears every row and the page handles the resulting refresh failure of the current device gracefully (redirect to /signin).
  - Visiting the page unauthenticated redirects to /signin via apiFetch's auth-failure handling.
- **Risks:** The current session isn't distinguishable from returned metadata, so 'sign out everywhere' also kills the current device on next refresh — warn in the UI. DELETE :id uses Number(id); non-numeric ids are silently no-ops.

### AUTH-03 — In-app VIEWER→organizer upgrade with live request status  `S`

**Depends on:** AUTH-04 Header account entry (or add a direct link)

Let signed-in VIEWERs request organizer (EDITOR) access in-app with a fest key and see their request status, instead of only being able to opt in at signup. The backend endpoints already exist (roleRequests.js POST / and GET /mine); there is no UI for them.

- **Data model:** None.
- **API:** None new. Consume POST /api/role-requests (roleRequests.js:92, authenticateUser + writeLimiter, requires festKey, enforces one-pending-per-user with 409, 400 on invalid key) and GET /api/role-requests/mine (roleRequests.js:68, authenticateUser, returns id/festId/festName/requestedRole/status/requestDate).
- **Frontend:** New app/account/organizer/page.tsx: a fest-key form posting to /api/role-requests and a status card driven by /mine mapping PENDING/APPROVED/DENIED to badges. Surface the 409 'already have a pending request' and 400 errors.festKey inline. On APPROVED, tell the user to sign in again to activate the new role (approval bumps tokenVersion and deletes their refresh tokens — roleRequests.js:198-208 — so the stored VIEWER role is stale until re-login). Link in Header account menu, shown only when stored role === 'VIEWER'.
- **Acceptance:**
  - A VIEWER submitting a valid fest key gets 201 and the status card shows PENDING.
  - An invalid fest key surfaces the backend errors.festKey message inline.
  - Submitting again while a request is pending is handled as a friendly 409 'already pending' state, not a raw error.
  - GET /mine history renders with fest name and status badges.
  - After admin approval the UI instructs the user to re-login to pick up EDITOR/editorFestId.
- **Risks:** Approval invalidates the user's tokens (forces re-login); the header gate reads the stale localStorage role until then. Fest key is validated server-side against Fest.adminKey — no client validation needed.

---

## Phase 4: Event-day: QR tickets, check-in & delivery

**Goal:** Deliver individually scannable tickets and the full organizer door-to-wallet check-in stack.

**Why now:** A single cohesive event-day increment. The order-level QR (TIX-01) is the root dependency; per-attendee codes (TIX-02) enable scan-to-admit, the live check-in dashboard, transfers, printable PDFs, wallet passes and offline PWA access. Grouping the whole TIX theme keeps the dependency chain intact and ships a complete gate experience in one release rather than dribbling half a scanner.

**Exit criteria:** Confirmation page and receipt email render the booking QR; each attendee has a unique ticketCode with its own scannable ticket; an atomic first-scan-admits endpoint + fest-scoped mobile scanner page work; the manage page has a live Check-in tab (admitted vs total, per type, searchable, manual admit/undo); print-to-PDF ticket route, attendee transfer/reissue (old QR invalidated), Apple/Google wallet passes (graceful when unconfigured), and an installable PWA caching the last ticket offline all function; add-to-calendar .ics and CSV bulk-attendee import with per-order caps are live.

Specs (10): TIX-01, TIX-02, TIX-03, TIX-04, TIX-05, TIX-06, TIX-07, TIX-08, TIX-09, TIX-10

### TIX-01 — QR e-ticket on confirmation page and in the receipt email  `M`

**Depends on:** add `qrcode` (backend) + `qrcode.react` (frontend) deps

Render the booking's `bookingCode` as a scannable QR on the confirmation view and embed the same QR in the receipt email, so attendees have a visual pass at entry instead of only a copy-pasteable code. This is the order-level QR; per-attendee QRs come in TIX-02.

- **Data model:** None. Reuses `Booking.bookingCode` (cuid, already unique/unguessable in schema.prisma line 164).
- **API:** No new endpoints. Frontend derives the QR client-side from the existing public GET /api/bookings/code/:bookingCode payload. Email side: extend `sendMail({to,subject,html,text})` in backend/src/utils/email.js to also accept and forward an `attachments` array to `transport.sendMail(...)` (line 43), keeping the SMTP-not-configured no-op path intact.
- **Frontend:** frontend/app/booking-confirmation/page.tsx — under the existing 'Your booking code' card (line ~173) add a QR panel using `QRCodeSVG` from `qrcode.react`, value = `booking.bookingCode` (optionally a deep link `${origin}/tickets/${bookingCode}` once TIX-05 lands). Client-only render is fine (page is already "use client"). No hardcoded API URLs.
- **Acceptance:**
  - On /booking-confirmation?bookingCode=… a QR code visibly renders and encodes exactly the bookingCode string.
  - The receipt email produced by sendBookingConfirmation() contains an inline <img src="cid:ticket-qr"> that displays the QR (verified in Gmail/Apple Mail), generated via qrcode.toBuffer(bookingCode) and attached with a matching cid.
  - When SMTP is unset, sendBookingConfirmation still returns {sent:false,reason:'not_configured'} without throwing (graceful-degradation path unchanged).
  - Scanning the on-page QR and the email QR with a phone camera both yield the same bookingCode.
  - No new external network calls at render time (QR generated locally, not via a remote image service).
- **Risks:** Some email clients block/strip inline images; cid attachments are more reliable than remote <img> but a text fallback (the plain bookingCode, already present) must remain. nodemailer is pinned at ^8 in backend/package.json — confirm attachments+cid API on that version. Bundle-size bump from qrcode.react on the confirmation route is minor.

### TIX-02 — Per-attendee individual tickets with unique scannable codes  `M`

**Depends on:** TIX-01

Give every named attendee their own unique `ticketCode` so each person gets an individually scannable ticket (needed for per-head door check-in), instead of one code covering the whole order.

- **Data model:** schema.prisma Attendee model (line 208): add `ticketCode String @unique @default(cuid())`. @unique already creates the index, so no extra @@index needed. Prisma auto-generates the cuid on insert including via createMany, so the existing `tx.attendee.createMany` in backend/src/routes/bookings.js (lines 353-362) needs no per-row value — but explicitly leaving `ticketCode` unset is fine and preferred.
- **API:** No new endpoints. GET /api/bookings/code/:bookingCode (bookings.js line 817) already includes `attendees: true`, so ticketCode is returned automatically once the column exists; same for GET /api/bookings/:id and the host GET /api/bookings/event/:eventId.
- **Frontend:** frontend/app/booking-confirmation/page.tsx — in the existing Attendees list (line ~219) render a small QR (QRCodeSVG value={att.ticketCode}) per attendee alongside name/email. Extend the ConfirmationBooking.attendees type (line 31) to include `ticketCode`.
- **Acceptance:**
  - Creating a booking with N attendees persists N Attendee rows each with a distinct non-null ticketCode.
  - GET /api/bookings/code/:bookingCode returns each attendee's ticketCode.
  - The confirmation page shows one QR per attendee encoding that attendee's ticketCode.
  - Two attendees in the same booking never share a ticketCode (DB unique constraint holds).
  - Bookings with an empty/omitted attendees array still succeed (attendee capture stays optional, per existing ATTENDEE-COUNT rule).
- **Risks:** Migration hazard: adding a NOT NULL @unique column to a table with existing Attendee rows will make `prisma db push` fail. Backfill plan: add the column nullable, run a one-off script assigning a cuid per existing row, then apply @unique/NOT NULL. Coordinate with the no-migration-files workflow noted in CLAUDE.md.

### TIX-03 — Organizer scan-to-admit check-in API + mobile scanner page  `L`

**Depends on:** TIX-02

Let organizers admit attendees at the door by scanning a ticket QR: an atomic 'first scan admits, re-scans are rejected' endpoint plus a camera+manual scanner page scoped to the caller's fest, so gate staff can validate entries in real time.

- **Data model:** schema.prisma Attendee (line 208): add `checkedInAt DateTime?` and `checkedInById Int?` with `checkedInBy User? @relation("attendeeCheckins", fields:[checkedInById], references:[id])`; add the back-relation `attendeeCheckins Attendee[] @relation("attendeeCheckins")` on User (line 12). (checkedInById may be stored as a bare Int? without the relation if a formal FK is undesirable.)
- **API:** POST /api/bookings/checkin (bookings router, envelope {success,data,error}). Auth: authenticateUser. Body: { code } (an attendee.ticketCode). Handler: look up attendee by ticketCode including booking.event {hostId,festId}; authorize with the caller's fest scope — reuse the `callerFests()` helper (bookings.js line 16): allow if event.hostId===userId OR event.festId ∈ {managedFestId, editorFestId}. Admit atomically: `prisma.attendee.updateMany({ where:{ id, checkedInAt:null }, data:{ checkedInAt:new Date(), checkedInById:userId } })`; count===1 → data:{status:'ADMITTED', attendee, event}; count===0 → data:{status:'ALREADY', checkedInAt, attendee}; not found → 404/{status:'INVALID'}.
- **Frontend:** New page frontend/app/host/events/[eventId]/checkin/page.tsx (guarded exactly like manage/page.tsx lines 129-139: host of event, or ADMIN.managedFestId / EDITOR-HOST.editorFestId === event.festId). Camera scan via dynamically-imported `html5-qrcode` (client-only, mirror the dynamic-import pattern used for xlsx/react-leaflet); on decode POST /api/bookings/checkin. Big result banner: green ADMITTED (name + ticket type), amber ALREADY (with prior time), red INVALID. Manual text input for damaged QRs. All calls via apiFetch/getApiUrl.
- **Acceptance:**
  - First scan of a valid ticketCode sets checkedInAt/checkedInById and returns status ADMITTED.
  - A second scan of the same code returns status ALREADY and does NOT overwrite the original checkedInAt (verified under concurrent double-scan — only one updateMany wins).
  - An unknown/garbage code returns INVALID (404) with no state change.
  - A host/editor scanning a ticket for an event in a DIFFERENT fest gets 403 (fest scope enforced).
  - The scanner page opens the camera, decodes a QR, and shows the correct colored result without a page reload.
  - Unauthenticated POST /api/bookings/checkin is rejected (401).
- **Risks:** Camera requires HTTPS (or localhost) and user permission — provide the manual-entry fallback. html5-qrcode must be dynamically imported to avoid SSR/Turbopack breakage (same class of issue as the xlsx crash noted in manage/page.tsx). Offline gates need TIX-08; this endpoint assumes connectivity. Concurrency correctness rests on the checkedInAt:null guard in updateMany — do not replace with read-then-write.

### TIX-04 — Live check-in dashboard tab with entry tracking  `M`

**Depends on:** TIX-02; TIX-03

Add a Check-in tab to the event manage page showing admitted-vs-total (overall and per ticket type) and a searchable attendee list with manual admit/undo, giving organizers a live door dashboard alongside scanning.

- **Data model:** None beyond TIX-02/TIX-03 fields (ticketCode, checkedInAt, checkedInById).
- **API:** Extend GET /api/bookings/event/:eventId (bookings.js line 1049): (a) include per-attendee `id`, `ticketCode`, `checkedInAt` in the formatted `attendees` array (line 1117); (b) add to `stats` (line 1126): `admittedCount`, `attendeeCount` (from COMPLETED bookings), and a `checkedInByType` map. New mutation POST /api/bookings/checkin/undo (auth + same fest-scope guard as TIX-03), body { attendeeId }, clears checkedInAt/checkedInById via a guarded updateMany. Manual admit reuses POST /api/bookings/checkin with the attendee's ticketCode.
- **Frontend:** frontend/app/host/events/[eventId]/manage/page.tsx — widen the `activeTab` union (line 94) to include 'checkin' and add the tab button (near lines 785-806). New panel: 'Admitted X / Y' counters, per-ticket-type admitted bars (reuse the ticketTypes breakdown styling), and a searchable (name/email/code) attendee table with Admit / Undo buttons calling the endpoints above and updating local state. Only build attendees from COMPLETED bookings, matching the existing buyers/salesData derivation.
- **Acceptance:**
  - Check-in tab shows correct admitted/total counts that update after an admit or undo.
  - Per-ticket-type admitted counts sum to the overall admitted count.
  - Searching by attendee name, email, or ticketCode filters the list.
  - Clicking Admit on a not-yet-admitted attendee marks them admitted; Undo reverts to not-admitted.
  - Counts reflect scans made on the TIX-03 scanner page after a refresh (same underlying data).
  - A user without manage access to the event cannot load the tab (existing accessDenied guard applies).
- **Risks:** Large events mean big attendee lists — paginate or virtualize the table and consider server-side search if row counts are high. Undo is a privileged correction; it is fest-scoped like admit but consider logging who undid an entry. Keep the existing stats consumers (Overview tab) working when new stats keys are added.

### TIX-05 — Printable / PDF ticket download  `S`

**Depends on:** TIX-01; TIX-02

Provide a print-optimized ticket route so attendees can print or save-as-PDF a clean pass (QR, event details, attendee names) using the browser's native print-to-PDF, avoiding a server-side PDF pipeline.

- **Data model:** None.
- **API:** No new endpoints. Reuses public GET /api/bookings/code/:bookingCode (returns event, items, attendees incl. ticketCode).
- **Frontend:** New page frontend/app/tickets/[bookingCode]/page.tsx ("use client") — fetch by bookingCode, render one printable ticket card per attendee (QRCodeSVG value={att.ticketCode}, attendee name, ticket type, event name/date/venue, bookingCode). Add `@media print` rules (hide Header/Footer/nav, page-break-after per ticket, black-on-white) and a 'Print / Save as PDF' button calling window.print(). Add a 'Download tickets' link from booking-confirmation/page.tsx (near the actions block, line ~242) and from the /bookings list.
- **Acceptance:**
  - /tickets/<bookingCode> renders one ticket per attendee, each with its own QR.
  - Print preview (Ctrl/Cmd+P) shows only ticket cards — no site header, footer, or buttons — with a page break between tickets.
  - Save-as-PDF produces a legible pass whose QR scans to the correct ticketCode.
  - An invalid bookingCode shows a graceful 'Booking not found' state (mirror confirmation page).
  - Layout is responsive and prints correctly on A4/Letter.
- **Risks:** QR must render before print; ensure it is drawn synchronously (SVG) rather than async canvas so print isn't blank. Print CSS across Chrome/Safari/Firefox differs — test each. If TIX-02 hasn't shipped, fall back to a single order-level QR (bookingCode).

### TIX-06 — Ticket transfer and attendee reassignment  `M`

**Depends on:** TIX-02; TIX-03

Allow the booking holder to reassign an attendee (change name/email) and reissue that ticket's code, invalidating the old QR — so tickets can be safely handed to a different person without reselling.

- **Data model:** Reuses Attendee.ticketCode (reissued to a fresh cuid on transfer, which auto-invalidates the old QR). Optionally add `transferredAt DateTime?` to Attendee for an audit trail.
- **API:** POST /api/bookings/:bookingCode/transfer (bookings router, envelope). Auth: optionalAuthenticate — extend the existing `callerOwnsBooking()` helper (bookings.js line 33) to also treat the :bookingCode path param as proof of ownership (guest-safe), in addition to buyer/host/admin. Body: { attendeeId, name, email }. Rules: attendee must belong to this booking; reject with 409 if attendee.checkedInAt is set (already admitted, non-transferable); on success update name/email and set ticketCode to a new cuid; return the updated attendee. Booking must be COMPLETED.
- **Frontend:** frontend/app/booking-confirmation/page.tsx and the TIX-05 /tickets page — add a 'Transfer / edit attendee' action opening a small modal (new name + email), POSTing to the transfer endpoint, then refreshing so the new QR/ticketCode shows. Surface the door policy 'cannot transfer after check-in'.
- **Acceptance:**
  - POST transfer with a valid bookingCode + attendeeId updates the attendee's name/email and returns a NEW ticketCode.
  - The previous ticketCode no longer resolves at POST /api/bookings/checkin (old QR is dead).
  - Transfer is rejected (409) when the attendee has already been checked in.
  - A caller who is not the buyer/host/admin and does not know the bookingCode gets 403.
  - After transfer, the confirmation and email/printable tickets reflect the new attendee and QR.
- **Risks:** Reissuing ticketCode races with a simultaneous door scan of the old code — do the reissue in a transaction and rely on the checkedInAt-null guard; a scan that lands first simply admits under the old identity. Note the current booking page copy says 'Tickets are non-transferable' (booking/page.tsx line 471) — update that copy to match the new capability. Guest transfer relies solely on possession of the unguessable bookingCode (consistent with existing guest payment endpoints).

### TIX-07 — Apple Wallet / Google Wallet passes  `XL`

**Depends on:** TIX-02; wallet signing certs/keys

Generate a signed Apple .pkpass and a Google Wallet save link that embed the ticket's QR, so attendees can add passes to their phone wallets — with graceful degradation when wallet credentials aren't configured (mirroring the Razorpay optional pattern).

- **Data model:** None required (optionally persist a pass serial on Attendee for later push updates).
- **API:** New endpoints on the bookings router, public-by-code: GET /api/bookings/code/:bookingCode/apple-pass → streams `application/vnd.apple.pkpass`; GET /api/bookings/code/:bookingCode/google-pass → { saveUrl }. Both embed the per-attendee ticketCode as the pass barcode. Add a config gate `getWallet()` analogous to `getRazorpay()` (bookings.js line 54): when certs/keys are unset, return 503 {code:'WALLET_DISABLED'} so the UI can hide the buttons.
- **Frontend:** New backend module backend/src/utils/wallet.js — Apple via `passkit-generator` (needs PASS_TYPE_ID, TEAM_ID, pass cert+key, WWDR cert); Google via a signed JWT save link (`google-auth-library` + existing `jsonwebtoken`, GOOGLE_WALLET_ISSUER_ID + service-account key). Confirmation page (booking-confirmation/page.tsx) + receipt email (email.js): add 'Add to Apple Wallet' and 'Save to Google Wallet' buttons/links, shown only when the endpoints don't 503. Document new env in backend/.env.example.
- **Acceptance:**
  - With wallet env configured, GET apple-pass returns a valid .pkpass that installs on iOS and whose barcode scans to the attendee ticketCode.
  - GET google-pass returns a save URL that adds a pass to Google Wallet with the same QR payload.
  - With wallet env unset, both endpoints return 503 WALLET_DISABLED and the wallet buttons are hidden on the confirmation page and omitted from the email.
  - Pass shows event name, date, venue, and attendee name.
  - Only a caller presenting the correct bookingCode can fetch the pass (unguessable-code access, consistent with other guest endpoints).
- **Risks:** Apple pass signing requires an Apple Developer Pass Type ID and WWDR cert; Google requires a Wallet API issuer account and service-account key — provisioning is the main cost, hence XL. Certs/keys must be loaded from secure env/secret storage, never committed. Pass updates/void-on-transfer (TIX-06) are out of scope unless push is added. Keep everything optional so local/demo deployments still run.

### TIX-08 — Installable PWA with offline ticket access  `L`

**Depends on:** TIX-01

Ship a web app manifest and a service worker that cache the app shell plus the user's last confirmation/bookings, so a saved ticket QR still renders at the gate with no signal — critical for venues with poor connectivity.

- **Data model:** None.
- **API:** None (service worker runtime-caches existing public GET /api/bookings/code/:bookingCode responses).
- **Frontend:** Add frontend/app/manifest.ts exporting a `MetadataRoute.Manifest` (name 'FesTicket', short_name, theme_color #522C5D, background, icons, display 'standalone'). Add a service worker at frontend/public/sw.js: precache the app shell (confirmation route assets), and a runtime cache-first-then-network for /api/bookings/code/* so the last-viewed booking renders offline; QR is redrawn client-side from the cached bookingCode/ticketCode. Register the SW from a small client component mounted in app/layout.tsx / _ClientRoot (layout.tsx line 42). Extend layout metadata (line 6) with themeColor + appleWebApp so iOS add-to-home works.
- **Acceptance:**
  - App is installable (Chrome shows install prompt; iOS Add to Home Screen works) with correct name/icon.
  - After viewing a booking online once, reloading /booking-confirmation?bookingCode=… with network disabled still renders the booking and a scannable QR.
  - The service worker registers without console errors and does not break normal online navigation or auth flows.
  - Cached ticket data is per the bookingCode actually viewed (no cross-booking leakage in the cache).
  - Lighthouse PWA installability checks pass.
- **Risks:** Service workers are HTTPS-only (except localhost) and can serve stale content — use versioned caches and a clear update/skipWaiting strategy. Never cache authenticated/admin responses or tokens. Next 16 + Turbopack SW registration timing needs care; guard registration to client + production. Cache invalidation on transfer (TIX-06) means the offline QR could be outdated — acceptable for a fallback, but document it.

### TIX-09 — Add-to-calendar (.ics) on confirmation, event pages, and email  `S`

Let users add an event to their calendar from the confirmation page, the public event detail page, and the receipt email, via a standards-compliant .ics feed built from the event's date/venue/online link, reducing no-shows.

- **Data model:** None (uses Event.startDate/endDate/startTime/venue/venueAddress/onlineLink/description from schema.prisma lines 96-102).
- **API:** GET /api/events/:id/calendar.ics (events router, public — same visibility rules as the public event fetch). Returns `text/calendar` VCALENDAR/VEVENT with UID (event id), DTSTART/DTEND (compose from startDate + startTime; fall back to all-day if no time), SUMMARY, LOCATION (venueAddress||venue), URL/DESCRIPTION (include onlineLink when isOnline). Build the string directly — no new dependency.
- **Frontend:** Add an 'Add to calendar' control (dropdown: Apple/Outlook → download the .ics endpoint; Google → a calendar.google.com/render template URL) to frontend/app/booking-confirmation/page.tsx and frontend/app/events/[id]/page.tsx (near the event date block, line ~301). In backend/src/utils/email.js sendBookingConfirmation, add an 'Add to calendar' link pointing at the .ics endpoint (built from an env base URL / FRONTEND_URL).
- **Acceptance:**
  - GET /api/events/:id/calendar.ics returns valid text/calendar that imports cleanly into Apple Calendar, Google Calendar, and Outlook.
  - Event title, start, end, and location match the event data; online events include the join link.
  - The confirmation page and event detail page both expose a working Add-to-calendar button.
  - The Google option opens a prefilled Google Calendar event.
  - The receipt email contains an Add-to-calendar link that resolves to the .ics.
- **Risks:** Timezone correctness — emit with an explicit TZID or UTC (Z) to avoid off-by-hours; startTime is a free-form String in the schema, so parse defensively and fall back to all-day when unpar. Events with null dates must still produce a valid (or omitted) file, not a 500. Escape newlines/commas per RFC 5545 in SUMMARY/DESCRIPTION.

### TIX-10 — Group/bulk booking with CSV attendee import + per-order caps  `M`

Speed up large/group bookings by importing attendee name+email rows from a CSV into the attendee form, and let organizers cap tickets per order to curb bulk-buying — building on the attendee-distribution validation that already exists in bookings.js.

- **Data model:** schema.prisma Event: add `maxTicketsPerOrder Int?` (null = no cap).
- **API:** Enforce the cap in POST /api/bookings (bookings.js): after computing `totalRequestedQty` (line 154), if event.maxTicketsPerOrder is set and totalRequestedQty exceeds it, throw bookingError(400,'VALIDATION_ERROR', …) — placed inside the transaction after the event fetch (line 168). Surface the field in GET /api/events/:id and accept it on event create/update (add to createEventSchema in eventValidator + the events route write handlers). The existing ATTENDEE-COUNT / ATTENDEE-DISTRIBUTION checks (lines 150-261) stay authoritative.
- **Frontend:** frontend/components/AttendeeForm.tsx — add an 'Import from CSV' control that parses a name,email CSV (header-tolerant) and fills the attendees array up to requiredCount (extend the onChange contract to accept prefilled rows). frontend/app/events/[id]/booking/page.tsx — read event.maxTicketsPerOrder, clamp total selectable quantity and show a message when the cap is hit; the attendeesPayload build (lines 190-203) is unchanged. Add a maxTicketsPerOrder input to the event create form.
- **Acceptance:**
  - Uploading a CSV of name,email rows populates the attendee fields (up to the required count) without manual typing.
  - A booking exceeding an event's maxTicketsPerOrder is rejected server-side with a clear 400 message, even if the client is bypassed.
  - When no cap is set (null), booking quantity behaves exactly as today.
  - The booking UI prevents selecting more than the cap and explains why.
  - CSV rows beyond the selected ticket count are ignored/flagged rather than silently over-filling.
  - Imported attendees still satisfy the existing per-type attendee-distribution rule before submit.
- **Risks:** CSV parsing edge cases (quoted commas, BOM, extra columns, malformed emails) — validate rows and show which failed; keep it dependency-light (a small parser or PapaParse). The cap is per-order only and does not stop repeat orders — note that abuse mitigation is partial. maxTicketsPerOrder is additive/nullable so it is backward-compatible with existing events.

---

## Phase 5: Notifications, lifecycle comms & advanced auth

**Goal:** Wire the full email/SMS lifecycle, in-app notifications, waitlist auto-notify, and advanced sign-in.

**Why now:** With the email shell/provider (Phase 1), QR + .ics (Phase 4), and the refund release points (Phase 2) all in place, the lifecycle comms can finally fire correctly and legally. Preferences/unsubscribe gate the non-transactional sends and must precede sales alerts/digests; the notification center builds on those alerts. The sold-out waitlist auto-notify plugs into refund/cancel/sweep release hooks and needs email, so it lands here. Magic-link, Google sign-in and optional TOTP round out auth on top of the Phase-3 account plumbing.

**Exit criteria:** Cancellation/payment-failed/expiry emails fire from the cancel route and sweep; abandoned-checkout recovery email + resume CTA on PENDING My-Bookings cards work; T-24h/T-1h reminders send QR+.ics+directions deduped per (booking,kind); per-category preferences + signed one-click unsubscribe + List-Unsubscribe headers gate all non-transactional mail; organizer new-sale alerts + daily digest respect opt-out; SMS/WhatsApp ticket delivery degrades gracefully; a header bell shows unread in-app notifications; sold-out waitlist joins and the oldest waiter gets a time-boxed claim link on any inventory release; magic-link and verified-Google sign-in issue the normal token pair; opt-in TOTP 2FA with backup codes enrolls and challenges at sign-in.

Specs (11): NOTIF-06, NOTIF-02, NOTIF-03, NOTIF-09, NOTIF-05, NOTIF-07, NOTIF-08, PAY-08, AUTH-06, AUTH-05, AUTH-08

### NOTIF-06 — Booking lifecycle emails: cancellation, payment-failed, expiry  `M`

**Depends on:** NOTIF-01

Buyers only ever get a confirmation email; cancellations, failed payments, and auto-expiry are silent. Add sendBookingCancelled / sendPaymentFailed / sendBookingExpired and fire them from the cancel route and the stale-pending sweep so the booking lifecycle is fully communicated.

- **Data model:** none (statuses BookingStatus.CANCELLED and Payment/PaymentStatus.FAILED already exist).
- **API:** No new endpoints. Emails are fired from existing handlers: PUT /api/bookings/:id/cancel (bookings.js ~line 1023 success path) and the verify-payment failure branches (~lines 566-577) for payment-failed; expiry from expireStalePendingBookings (~line 1276).
- **Acceptance:**
  - email.js exports `sendBookingCancelled(booking)`, `sendPaymentFailed(booking)`, and `sendBookingExpired(booking)`, each rendered via renderEmail with event name, bookingCode, and (for cancellation) refund/next-step wording.
  - PUT /:id/cancel fires sendBookingCancelled non-blocking after the transaction succeeds (after line ~1021), resolving the recipient as guestEmail || user.email.
  - expireStalePendingBookings sends sendBookingExpired for each booking it actually cancels (only when flip.count===1, inside/after the loop at ~line 1269) so no email is sent for a booking a concurrent cancel already handled.
  - A payment-verification failure that is genuinely a failed/uncaptured payment (verify-payment 'Payment not captured' / mismatch branches) records Payment status FAILED and fires sendPaymentFailed once, without blocking the HTTP response.
  - Every lifecycle send is fire-and-forget with .catch logging (matching the existing sendBookingConfirmation calls) and is skipped cleanly when no email is resolvable.
- **Risks:** De-dupe with NOTIF-02: a booking that got a recovery email then expires should get expiry mail (distinct message) — acceptable, but avoid firing both cancellation AND expiry for the same sweep-cancelled booking (expiry only from the sweep, cancellation only from the manual route). Payment-failed can fire repeatedly if the buyer retries verify — gate on a state change or Payment status transition to avoid spam. Guest-only bookings with no email are skipped.

### NOTIF-02 — Abandoned-checkout recovery email + resume link  `M`

**Depends on:** NOTIF-01

PENDING bookings hold inventory (sold is incremented at creation) and are swept/cancelled after 15 min by expireStalePendingBookings (bookings.js line 1242). Before that cancel fires, email the buyer a deep link back to the payment page to recover the sale, and surface a 'Complete payment' CTA on PENDING cards in My-Bookings (frontend/app/bookings/page.tsx) so a distracted buyer can resume.

- **Data model:** Add `recoveryEmailSentAt DateTime?` to Booking (schema.prisma model Booking, ~line 176) so the recovery mail is sent at most once per booking across repeated sweep runs. `npx prisma db push` (no migration files in this repo per CLAUDE.md).
- **API:** No new endpoint. The email's resume link targets the existing frontend payment page `/events/{eventId}/payment?bookingCode={bookingCode}`, which already loads the booking via the public GET /api/bookings/code/:bookingCode (unauthed, unguessable cuid).
- **Frontend:** frontend/app/bookings/page.tsx: in BookingCard, when `booking.status === 'PENDING'` render a secondary 'Complete payment' button/link to `/events/${booking.event?.id}/payment?bookingCode=${booking.bookingCode}` instead of only linking to /booking-confirmation. No new page.
- **Acceptance:**
  - A new exported `sendAbandonedCheckoutReminders(remindAfterMs=10*60*1000)` in bookings.js finds PENDING bookings older than remindAfterMs, not yet cancelled, with `recoveryEmailSentAt` null and a resolvable email (guestEmail or user.email), and sends one recovery email built via renderEmail (NOTIF-01).
  - The recovery email body contains the event name, held-tickets summary, total, and a CTA button linking to `${FRONTEND_URL}/events/{eventId}/payment?bookingCode={bookingCode}`; the reminder threshold (10 min) is strictly less than the expiry cutoff (15 min) so the mail always precedes cancellation.
  - After a successful send the booking's `recoveryEmailSentAt` is stamped so a later sweep pass never re-sends; sends are non-blocking and a send failure never throws out of the sweep.
  - index.js schedules `sendAbandonedCheckoutReminders` (reuse the existing 5-min setInterval block at lines 210-218, unref'd, skipped under NODE_ENV=test) running before/alongside expireStalePendingBookings.
  - My-Bookings shows a working 'Complete payment' CTA only on PENDING bookings that routes to the payment page and pre-loads the booking by code.
- **Risks:** Guest bookings with no email must be skipped (like sendBookingConfirmation's no_email guard). A booking that already has a Payment.orderId (order created) is NOT swept (line 1254) so recovery for those is fine but must not imply cancellation. Ensure the reminder job and expiry job don't both fire mail for the same booking (NOTIF-06 expiry email) — recovery precedes, expiry follows only if still unpaid.

### NOTIF-03 — Event reminder emails (T-24h and T-1h) with QR + .ics + directions  `L`

**Depends on:** NOTIF-01; qrcode-lib; ics-generation

COMPLETED-booking buyers get no pre-event nudge. Add a scheduled sweep that, for events starting in ~24h and ~1h, emails each completed buyer a QR (encoding bookingCode for gate scan), a calendar .ics attachment, and a Google Maps directions link, deduped so each (booking, reminder-kind) is sent exactly once.

- **Data model:** New model `ReminderLog { id Int @id @default(autoincrement()) bookingId Int kind ReminderKind sentAt DateTime @default(now()) @@unique([bookingId, kind]) @@index([bookingId]) }` with `enum ReminderKind { T24 T1 }`. The `@@unique` is the dedup guard. Relation to Booking optional; onDelete Cascade recommended. `prisma db push`.
- **API:** none — internal sweep only.
- **Acceptance:**
  - A new exported `sendEventReminders()` in bookings.js queries COMPLETED bookings whose event.startDate falls in the T-24h window (e.g. 24h±sweep-interval) or T-1h window, excluding events with null startDate, and skips any (bookingId,kind) already present in ReminderLog.
  - email.js gains `sendEventReminder(booking, kind)` that renders via renderEmail (NOTIF-01), embeds a QR image (bookingCode payload) as an inline/attachment part, attaches a valid VEVENT `.ics` built from event startDate+startTime/endDate+endTime+venue, and includes a Google Maps directions link derived from `event.venueAddress || event.venue` (URL-encoded).
  - Each successful send inserts a ReminderLog row inside the same path; the `@@unique([bookingId,kind])` prevents duplicate sends even if two sweeps overlap (duplicate insert is caught, not fatal).
  - index.js schedules the sweep on an interval fine enough to hit the T-1h window (e.g. every 15 min), unref'd and skipped under NODE_ENV=test.
  - Cancelled/refunded bookings and free (₹0) bookings still receive reminders only if COMPLETED; a booking with no email is skipped without error.
- **Risks:** startTime is a free-text String in schema (Event.startTime) while startDate is a DateTime — reminder/.ics time assembly must parse defensively and fall back to date-only if startTime is unparseable. Timezone: assume IST (en-IN) to match existing formatting; document the assumption. New deps (qrcode + an ics builder) add to backend package.json. Windowing must tolerate the sweep interval so a reminder isn't missed between ticks.

### NOTIF-09 — Notification preferences + one-click unsubscribe  `M`

**Depends on:** NOTIF-01; signed-token-uses-JWT_SECRET

Non-transactional mail (reminders, sales digest, recovery, sales alerts) needs a lawful opt-out. Add per-category preference flags on User, a signed unsubscribe token, RFC 8058 List-Unsubscribe headers/footer, a preferences screen, and a public one-click unsubscribe endpoint — all checked before any non-transactional send.

- **Data model:** Add category preference booleans to User (schema.prisma model User): e.g. `notifyReminders Boolean @default(true)`, `notifySalesDigest Boolean @default(true)`, `notifyMarketing Boolean @default(true)` (and `notifySalesAlerts` to supersede NOTIF-05's interim flag). No token column needed: unsubscribe tokens are HMAC-signed (JWT_SECRET) over `{userId, category}`. `prisma db push`.
- **API:** GET /api/notifications/preferences (authenticateUser → returns the caller's flags); PUT /api/notifications/preferences (authenticateUser → updates flags). GET /api/unsubscribe?token=... (PUBLIC, no auth → verifies the signed token, flips the named category off, renders a confirmation) and POST /api/unsubscribe (PUBLIC → same, for RFC 8058 List-Unsubscribe-Post one-click). Bare-object envelope to match the /api/notifications router (NOTIF-08).
- **Frontend:** A preferences screen (e.g. /settings/notifications or a section in the host/admin dashboard) with a checkbox per category, loaded/saved via apiFetch to /api/notifications/preferences and showToast on save. A public `/unsubscribe` page that reads the token from the URL and confirms the opt-out (no login required).
- **Acceptance:**
  - email.js sets `List-Unsubscribe: <mailto:...>, <https://.../api/unsubscribe?token=...>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers plus a visible footer unsubscribe link on all non-transactional emails (reminders NOTIF-03, digest/alerts NOTIF-05, recovery NOTIF-02).
  - Before every non-transactional send, the sender checks the recipient User's matching category flag and skips if opted out; transactional mail (booking confirmation, cancellation, payment receipt) is always sent regardless of prefs.
  - GET /api/unsubscribe with a valid signed token flips exactly the named category to false and shows a confirmation without requiring login; an invalid/expired/tampered token is rejected (no change); POST one-click behaves identically for RFC 8058 clients.
  - The preferences screen loads current flags and persists changes via PUT, reflected immediately on next fetch.
  - Guest recipients (no User row) fall back to a booking-code-scoped unsubscribe or are documented as email-only; a signed token cannot be forged to unsubscribe another user (HMAC verified with JWT_SECRET).
- **Risks:** Legal correctness hinges on the transactional-vs-marketing split — misclassifying a receipt as marketing would suppress required mail; enumerate categories explicitly. Signed tokens should be long-lived (unsubscribe links live in old emails) so avoid short JWT expiry; consider a version/nonce if revocation is ever needed. One-click POST must not require CSRF/auth. Guests lack a User row, so their opt-out needs a booking-scoped signature.

### NOTIF-05 — Organizer new-sale alerts + daily sales digest  `L`

**Depends on:** NOTIF-01; NOTIF-09

Hosts/admins have no push signal when tickets sell. Email the event's host and the fest ADMIN a 'New sale' notice on each booking completion, plus a once-a-day per-fest digest (tickets sold, net revenue, remaining inventory), respecting the recipient's opt-out.

- **Data model:** No new model strictly required for new-sale alerts. For the digest, add `lastSalesDigestAt DateTime?` on User (schema.prisma model User) to prevent double-send within a day, and reuse NOTIF-09 preference flags for opt-out; if NOTIF-09 not yet shipped, add a boolean `salesAlertsOptOut Boolean @default(false)` on User as an interim gate. `prisma db push`.
- **API:** none for MVP (internal). Opt-out toggling is provided by NOTIF-09's /api/notifications/preferences.
- **Frontend:** none required (optional: a toggle in host dashboard settings, deferred to NOTIF-09's preferences screen).
- **Acceptance:**
  - email.js gains `sendNewSaleAlert(booking, recipients)` and `sendSalesDigest(fest, recipients, stats)` built via renderEmail; recipients are resolved from `event.hostId` (the host User) plus the fest ADMIN (User where managedFestId === event.festId).
  - All three completion paths in bookings.js fire the new-sale alert non-blocking alongside sendBookingConfirmation: verify-payment (~line 639), PUT /:id/complete (~line 742), and the free-booking branch (~line 426). The alert includes event name, buyer name, ticket count, and booking total.
  - A new exported `sendDailySalesDigests()` sweep aggregates, per fest, COMPLETED bookings' tickets sold, net revenue, and remaining inventory (TicketType.quantity - sold), emails each fest's host+admin at most once per calendar day (guarded by lastSalesDigestAt), and is scheduled from index.js (interval or a cron helper) skipped under NODE_ENV=test.
  - A recipient who has opted out of sales notifications (NOTIF-09 pref or salesAlertsOptOut) receives neither the per-sale alert nor the digest.
  - A fest with zero completed sales in the period is skipped (no empty digest).
- **Risks:** High-volume events could spam per-sale alerts — consider batching/threshold, note as tunable. 'Daily' needs a fixed timezone (IST) and idempotency so a restart mid-day doesn't double-send. Net revenue must reuse the same Float/round2 accounting as bookings.js stats (lines 1131, 1206) to match the dashboard. If NOTIF-09 ships after this, wire the opt-out check as a single shared helper to avoid drift.

### NOTIF-07 — SMS / WhatsApp ticket delivery  `M`

**Depends on:** NOTIF-04

The app already collects buyer phone (Booking.guestPhone / User.phone) but never uses it. Add a graceful-degradation SMS/WhatsApp helper that, on booking completion, texts the buyer their booking code plus a link to view/download tickets — optional and silently skipped when unconfigured, mirroring the SMTP pattern.

- **Data model:** none required for MVP (optional: an SmsLog analogous to NOTIF-04's EmailLog for auditability — deferred/noted).
- **API:** none — internal, fired from completion paths.
- **Acceptance:**
  - New `backend/src/utils/sms.js` exports `sendSms({to, body})` and `sendWhatsApp({to, body})` behind a provider selected by `SMS_PROVIDER` env (msg91 | gupshup | twilio); when the selected provider's keys are unset it returns `{sent:false, reason:'not_configured'}` and never throws (mirrors email.js getTransport at lines 26/38).
  - All three completion paths in bookings.js (verify-payment ~639, PUT complete ~742, free ~426) fire a non-blocking ticket text to `booking.guestPhone || booking.user?.phone` containing the bookingCode and a `${FRONTEND_URL}/booking-confirmation?bookingCode=...` link.
  - Phone numbers are normalized to E.164 (default country +91) before send; an unparseable/missing number is skipped without error.
  - Sends are fire-and-forget with .catch logging and add no measurable latency to the completion response.
  - New env (SMS_PROVIDER + per-provider keys, SMS_DEFAULT_COUNTRY) is documented in backend/.env.example.
- **Risks:** India DLT: transactional SMS requires pre-registered sender IDs + templates (MSG91/Gupshup); free-form bodies may be rejected — spec a templated message. WhatsApp requires approved template messages and opt-in. Per-message cost and abuse — gate to completion only. Must degrade exactly like email (no config → skip).

### NOTIF-08 — In-app notification center with a header bell  `L`

**Depends on:** NOTIF-05

Logged-in users (buyers, hosts, admins) have no in-app signal for sales, role-request decisions, or booking-status changes. Add a Notification model written at those events, GET/PATCH endpoints, and a header bell with an unread badge and dropdown in Header.tsx.

- **Data model:** New model `Notification { id Int @id @default(autoincrement()) userId Int type String title String body String? linkUrl String? read Boolean @default(false) readAt DateTime? createdAt DateTime @default(now()) user User @relation(fields:[userId],references:[id],onDelete:Cascade) @@index([userId, read]) @@index([userId, createdAt]) }` plus back-relation `notifications Notification[]` on User. `prisma db push`.
- **API:** New router mounted at /api/notifications (alongside /api/role-requests in index.js) using the bare-object envelope (matches user/roleRequests neighbors): GET /api/notifications (authenticateUser; returns `{ notifications:[...], unreadCount }`, newest first, paginated via ?limit&?cursor); PATCH /api/notifications/:id (authenticateUser, owner-only, `{read:true}` → marks read, sets readAt); PATCH /api/notifications/read-all (authenticateUser → marks all caller's unread as read). All scoped to req.user.userId; acting on another user's notification → 403.
- **Frontend:** New `frontend/components/NotificationBell.tsx` (client): bell button with unread-count badge, dropdown list of recent notifications each linking to `linkUrl`, 'mark all read' action, fetched via apiFetch on mount + light polling. Render it in Header.tsx next to the account dropdown, only when `showUser` (lines ~125-167), reusing the existing outside-click/Escape patterns.
- **Acceptance:**
  - A `createNotification({userId,type,title,body,linkUrl})` helper is invoked at: booking completion (bookings.js completion paths → notify buyer/host), role-request approve/deny (roleRequests.js PATCH ~lines 184-211 → notify the requester), and booking status changes (cancel/expiry).
  - GET /api/notifications returns only the caller's notifications with a correct unreadCount; PATCH endpoints only mutate the caller's own rows and 403 on someone else's id.
  - The header bell shows an accurate unread badge, opens a dropdown listing recent notifications, marks them read on open/click (readAt set), and the badge clears after read-all — reusing Header's mounted/outside-click/Escape handling so there's no SSR hydration mismatch.
  - Clicking a notification navigates to its linkUrl (e.g. /bookings, /host/dashboard, /admin/dashboard).
  - Guests/logged-out users see no bell (gated on showUser); notification writes for guest bookings (no userId) are simply skipped.
- **Risks:** Polling interval vs. load — pick a modest interval and pause when tab hidden. Role changes bump tokenVersion and revoke refresh tokens (roleRequests.js lines 198-208), so a just-approved user is logged out before seeing the in-app notice — the email/notice is the durable channel; document that the bell is best-effort for currently-active sessions. Envelope choice must match the file it's mounted near (bare objects), not the {success,data} used by bookings.

### PAY-08 — Waitlist for sold-out ticket types with auto-notify on release  `L`

**Depends on:** PAY-02 (refund release point); release hooks in cancel + expireStalePendingBookings

When a ticket type is sold out (available = quantity - sold = 0) buyers hit a dead end — TicketSelector (components/TicketSelector.tsx) just caps the counter at 0. Add a per-ticket-type waitlist: buyers join when availability is 0, and whenever inventory is released (cancel, sweep-expire, or refund) the oldest waiter is emailed a time-boxed claim link, so freed seats recirculate instead of silently reopening to whoever refreshes first.

- **Data model:** New model Waitlist { id Int @id @default(autoincrement()); eventId Int; ticketTypeId Int; userId Int?; email String; name String?; status WaitlistStatus @default(WAITING); claimToken String? @unique; claimExpiresAt DateTime?; notifiedAt DateTime?; createdAt DateTime @default(now()) } with @@index([ticketTypeId, status, createdAt]) for oldest-first selection, and enum WaitlistStatus { WAITING NOTIFIED CLAIMED EXPIRED CANCELLED }. claimToken is an unguessable cuid mirroring the bookingCode pattern.
- **API:** POST /api/events/:eventId/waitlist — optionalAuthenticate (guest or logged-in), body { ticketTypeId, email, name? }; only accepted when that ticket type currently has available <= 0 (else 400 with 'tickets are available, just book'); dedupes an existing WAITING row per email+ticketType. A new internal helper releaseToWaitlist(ticketTypeId, tx) is called at every inventory-release point: cancel (bookings.js:1007-1012), expireStalePendingBookings (bookings.js:1270-1275), and PAY-02 refund — it picks the oldest WAITING row, sets it NOTIFIED with a fresh claimToken + claimExpiresAt (e.g. now+30min), and fires a new email (a waitlistClaim template in email.js). GET /api/waitlist/claim/:claimToken returns the reserved ticket-type/event for the claim page; the buyer then books normally within the window. Optionally a claim-consumes step that decrements the held seat only for that token until it expires (then it re-releases to the next waiter). Host: GET /api/events/:eventId/waitlist to view/manage the queue (host/admin scoped via callerCanViewEvent).
- **Frontend:** TicketSelector (components/TicketSelector.tsx): when ticket.available <= 0, replace the +/- stepper with a 'Join waitlist' button that opens a small email/name capture calling the waitlist endpoint. Add a claim landing page frontend/app/waitlist/claim/[token] that validates the token (not expired) and deep-links into the booking flow for that event/ticket type. email.js: add sendWaitlistClaim(waiter, event, ticketType, claimUrl) mirroring the styling of sendBookingConfirmation (email.js:93).
- **Acceptance:**
  - Joining the waitlist for a sold-out ticket type creates a WAITING row; attempting to join when seats are actually available is rejected.
  - Cancelling/expiring/refunding a booking that frees seats notifies the OLDEST WAITING waiter exactly once (status → NOTIFIED, claimToken + claimExpiresAt set) and emails them a claim link.
  - The claim link works only within claimExpiresAt; after expiry it is rejected and the seat re-releases to the next waiter.
  - A waiter who books via the claim link consumes the reservation and their row becomes CLAIMED.
  - Duplicate join attempts by the same email for the same ticket type do not create a second WAITING row.
  - A host can view the waitlist queue for their own event (fest-scoped), and a non-owner cannot.
- **Risks:** The hardest part is atomically 'holding' a freed seat for the notified waiter so a random buyer doesn't grab it first — either notify with a soft claim window (simplest; seat may be lost to a walk-in, acceptable) or add a per-token reservation that temporarily reduces effective availability (complex, needs its own expiry sweep, similar to the PENDING hold). Email is optional/graceful (SMTP may be unset) — if the notify email can't send, the claim window is effectively wasted; log and consider re-releasing. Notifying inside the cancel/refund $transaction risks holding the tx open on email I/O — enqueue the notify AFTER commit (non-blocking, like sendBookingConfirmation). Race: multiple simultaneous releases must not notify the same waiter twice (guard the WAITING→NOTIFIED transition with updateMany).

### AUTH-06 — Magic-link (passwordless) email login  `M`

**Depends on:** AUTH-01 email plumbing (sendMail builders); SMTP configured for real delivery

Add passwordless email login: POST /api/auth/magic-link stores a hashed, single-use, short-TTL token and emails the link via sendMail; a verify endpoint consumes it once and issues the normal token pair. Enumeration-safe, reusing the hashToken() and generic-response patterns already in auth.js.

- **Data model:** Add model MagicLinkToken { id Int @id @default(autoincrement()) token String @unique userId Int expiresAt DateTime usedAt DateTime? createdAt DateTime @default(now()) user User @relation(fields:[userId],references:[id],onDelete:Cascade) @@index([userId]) } and the back-relation on User. A dedicated table (single-use + TTL) is cleaner than overloading emailVerifyToken. Requires `npx prisma db push`.
- **API:** POST /api/auth/magic-link { email } (public, writeLimiter): if the user exists, create a token = crypto.randomBytes(32) stored as hashToken() (auth.js:20) with a 15-min expiry and email FRONTEND_URL/auth/magic?token=… via sendMail; ALWAYS return the generic 200 'If this email exists, a link was sent' (mirror forgot-password auth.js:592). POST /api/auth/magic-link/verify { token } (public): guard typeof token === 'string' (mirror reset-password auth.js:620 to block Prisma filter-object bypass), look up by hashToken(token) where usedAt is null and expiresAt >= now, set usedAt, then issue access+refresh exactly like signin (auth.js:263-303) and return the signin-shaped body; invalid/expired/used → generic 400. Bare-object convention.
- **Frontend:** AuthForm.tsx: add an 'Email me a sign-in link' action that POSTs /api/auth/magic-link and shows a generic 'check your email' confirmation. New app/auth/magic/page.tsx reads ?token, POSTs /magic-link/verify, on success setAuth + role redirect (reuse AuthForm 84-94 logic), on failure shows expired + a resend option.
- **Acceptance:**
  - Requesting a link for an existing email sends exactly one email with a single-use token; a non-existent email returns the identical response (no enumeration).
  - The link signs the user in and cannot be reused (usedAt) or used after 15 minutes.
  - A non-string or absent token is rejected without matching an arbitrary user (same guard as reset-password).
  - With SMTP unset the endpoint still returns the generic 200 and logs the link in dev, matching the graceful-degradation pattern.
- **Risks:** Token must be hashed at rest, single-use, and short-TTL; rate-limit /magic-link to prevent mailbombing. Real delivery needs SMTP (dev log fallback only). Must not leak whether the email exists.

### AUTH-05 — Real Google sign-in (replace disabled buttons)  `M`

**Depends on:** Google OAuth client id (GOOGLE_CLIENT_ID / NEXT_PUBLIC_GOOGLE_CLIENT_ID)

Replace the disabled 'coming soon' Google buttons (AuthForm.tsx SocialButton 10-24; signup/page.tsx 188-198) with Google Identity Services and add POST /api/auth/google that verifies a Google ID token server-side, finds-or-creates the user by verified email (schema already allows password-less User.password), and issues the normal access+refresh pair.

- **Data model:** User.password is already String? (schema.prisma:15) so password-less accounts work. Recommended: add User.googleId String? @unique (link by stable sub, not just email) and optionally User.avatarUrl String?; Google users get emailVerified:true. Requires `npx prisma db push` if googleId is added.
- **API:** POST /api/auth/google { idToken } (public, loginLimiter): verify with google-auth-library OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken, read email/email_verified/name/sub; reject if email_verified is false (401); find user by googleId or email, else create (role VIEWER, password null, emailVerified true, googleId=sub); then issue tokens exactly like signin (auth.js:263-303) — JWT with tokenVersion, a RefreshToken row with userAgent/ip, cleanupRefreshTokens — and return the same body shape as /signin. Return 503 when GOOGLE_CLIENT_ID is unset (graceful, mirrors the Razorpay-optional pattern). Add google-auth-library to backend deps.
- **Frontend:** AuthForm.tsx: replace SocialButton (10-24, 105-110) with a real GIS button (render google.accounts.id, credential callback POSTs /api/auth/google then setAuth + the existing role-based redirect at 84-94). signup/page.tsx: same for its Google button (188-198). Gate on NEXT_PUBLIC_GOOGLE_CLIENT_ID and keep the disabled state when unset. GIS script loaded like the existing Turnstile script-injection pattern.
- **Acceptance:**
  - With GOOGLE_CLIENT_ID set, Google sign-in returns a valid session for a brand-new email (user auto-created, emailVerified true) and links (not duplicates) an existing email.
  - The backend rejects a forged/invalid idToken (401) and a Google account whose email_verified is false.
  - With GOOGLE_CLIENT_ID / NEXT_PUBLIC_GOOGLE_CLIENT_ID unset, the buttons stay disabled and the endpoint 503s without crashing (dev/E2E unaffected).
  - Tokens issued by /api/auth/google work with the existing apiFetch/refresh flow (identical response shape to /signin).
- **Risks:** Email-based linking can hijack a password account sharing that email — mitigate by only linking when email_verified and/or by binding to googleId. Adds google-auth-library dependency and an external GIS script (CSP/next config). Forgot-password/change-password behavior must degrade sanely for password-null (Google-only) accounts.

### AUTH-08 — Optional TOTP two-factor for ADMIN/HOST  `L`

Add opt-in TOTP two-factor (authenticator app) with QR enrollment, hashed backup codes, a second step at sign-in, and an account/security page to enable/disable — optionally mandatory for ADMIN, whose accounts control an entire fest's data.

- **Data model:** User += twoFactorEnabled Boolean @default(false), twoFactorSecret String? (encrypted at rest, not plaintext), twoFactorPendingSecret String? (during enrollment), and backup codes as either twoFactorBackupCodes String[] (hashed) or a separate BackupCode table. Requires `npx prisma db push`.
- **API:** New handlers (auth.js, bare-object convention), add otplib (or speakeasy) + a QR lib. POST /api/auth/2fa/setup (authenticateUser): generate a secret, store as twoFactorPendingSecret, return the otpauth:// URL + a QR data URL. POST /api/auth/2fa/enable { code } (authenticateUser): verify TOTP against the pending secret, move it to twoFactorSecret, set twoFactorEnabled, generate + return 10 one-time backup codes (store hashed), bump tokenVersion. POST /api/auth/2fa/disable { code|password } (authenticateUser): verify, clear secret + backup codes. Modify POST /api/auth/signin (auth.js:216+): on password success, if twoFactorEnabled do NOT issue the real tokens — return { twoFactorRequired:true, challengeToken } (a short-lived, single-purpose signed token). Add POST /api/auth/2fa/verify { challengeToken, code|backupCode } that validates and only then issues access+refresh via the existing block (auth.js:263-303), consuming a backup code if used.
- **Frontend:** New app/account/security/page.tsx: enable flow (show QR + otpauth secret, verify a code, then display/download one-time backup codes) and disable flow. AuthForm.tsx: when signin returns twoFactorRequired, render a 6-digit code step (with 'use a backup code' fallback) that calls /api/auth/2fa/verify then setAuth + role redirect. If 2FA is mandated for ADMIN, force enrollment before the admin dashboard is reachable.
- **Acceptance:**
  - A user can enroll via QR, confirm a TOTP code, and receive 10 one-time backup codes shown once.
  - After enabling, signin returns twoFactorRequired and issues no tokens until a valid TOTP (or backup code) is supplied; wrong codes are rejected and rate-limited.
  - A backup code works exactly once and is then consumed.
  - Disabling 2FA requires a valid second factor or password and removes the stored secret.
  - If mandated for ADMIN, an ADMIN without 2FA is routed through enrollment before reaching /admin/dashboard.
- **Risks:** Store the TOTP secret encrypted, not plaintext; allow a small clock-skew window. The challengeToken must be single-purpose and short-lived so it can never act as a full session. Preserve the lockout/enumeration guarantees on the second-factor step. Making it mandatory could lock out existing admins — ship opt-in first, then enforce. Adds otplib + QR dependencies.

---

## Phase 6: SSR, SEO & cross-fest discovery

**Goal:** Server-render public pages and build the discovery/sharing surface for organic growth.

**Why now:** Server-rendering the three public pages is the gateway dependency: JSON-LD, dynamic OG images, the related-events rail, the global Discover page and category landing pages all require SSR + generateMetadata. Trending ranking feeds the homepage strip; sitemap/robots and the referral share loop complete crawlability and viral distribution. Grouping SEO after the product is feature-complete means share cards and structured data reflect the final ticket/price model.

**Exit criteria:** Event, fest-events and fests-index pages are async Server Components with per-page generateMetadata (title/description/canonical/OG/Twitter) and client islands for interactivity; schema.org/Event JSON-LD and dynamic 1200x630 OG cards render per event/fest; dynamic sitemap.xml (PUBLIC/PUBLISHED URLs, lastModified) + robots.txt disallowing operational routes are served; a global /events Discover page with facets and /events/category/[category] landing pages exist on a shared curated category list validated on create/update; event detail shows more-at-fest + similar rails; sort=trending ranks by COMPLETED bookings with an 'N going' badge; homepage fake badge is replaced by data-driven Trending/Upcoming rails; post-booking WhatsApp/native/copy share carries and attributes a ?ref= code.

Specs (10): SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, SEO-06, SEO-07, SEO-08, SEO-09, SEO-10

### SEO-01 — Server-render event & fest pages with per-page generateMetadata + canonicals  `L`

**Depends on:** server-fetch-helper (frontend/lib/serverApi.ts)

The three public pages (frontend/app/events/[id]/page.tsx, frontend/app/fests/[festId]/events/page.tsx, frontend/app/fests/page.tsx) are all `"use client"` with client-only fetch, so crawlers get an empty shell and no per-page title/description. Convert each to an async Server Component that fetches on the server, exports generateMetadata (title, description, canonical, per-page OpenGraph/Twitter), and delegates all interactivity to an extracted client-island child.

- **API:** No new endpoints. Server components fetch the existing public reads: GET /api/events/:id, GET /api/fests/:id, GET /api/fests (all already public, {success,data,...}). Add frontend/lib/serverApi.ts with a server-side fetch helper that resolves the base URL from an internal env (e.g. INTERNAL_API_URL) falling back to NEXT_PUBLIC_API_URL (getApiUrl reads only NEXT_PUBLIC_API_URL), with `cache: 'no-store'` or a short `next: { revalidate }`.
- **Frontend:** For each of events/[id], fests/[festId]/events, fests: rename current component body into a co-located client island (e.g. EventDetailClient.tsx / FestEventsClient.tsx / FestsListClient.tsx keeping `"use client"`, useParams/useState/geocode logic), and make page.tsx a server component that (a) awaits params, (b) fetches the record, (c) exports `generateMetadata` returning title/description/`alternates.canonical` (built from NEXT_PUBLIC_SITE_URL via layout's metadataBase) + openGraph/twitter, (d) calls notFound() (returning Next 404 + noindex) for missing/DRAFT/PRIVATE/soft-deleted records, (e) renders the island passing server-fetched initialData to avoid a double fetch. Reuse layout.tsx metadata template `%s | FesTicket`.
- **Acceptance:**
  - `curl` / view-source of /events/{publishedId} contains a populated <title> with the event name and a <meta name="description"> derived from the event, with no `"use client"` directive at the top of the three page.tsx files.
  - Each page emits `<link rel="canonical">` pointing at its own NEXT_PUBLIC_SITE_URL-based URL.
  - A DRAFT/PRIVATE/soft-deleted event id renders Next's notFound() (HTTP 404, robots noindex) instead of a client 'Event not found' shell.
  - The booking CTA, category filters, search, sort, pagination and Leaflet map still work after the interactive JSX moves into the client island.
  - generateMetadata for a fest page yields a fest-specific title/description (e.g. '{Fest} Events | FesTicket'), verified in the rendered <head>.
- **Risks:** Backend must be reachable from the Next server runtime (env/URL differ from the browser origin); removing `"use client"` means useParams/useSearchParams/localStorage/geocode must live only in the island; must preserve the existing 404-vs-transient-error distinction; choose revalidate window carefully so published edits aren't stale for long.

### SEO-02 — JSON-LD Event structured data for Google rich results  `S`

**Depends on:** SEO-01

Emit schema.org/Event JSON-LD on the event detail page so Google can render event rich results (date, venue, price, availability). Data comes straight from GET /api/events/:id which already returns dates, image, venue/venueAddress, isOnline/onlineLink, fest/host, and ticketTypes ordered by price asc.

- **API:** none (reuse GET /api/events/:id from SEO-01's server fetch).
- **Frontend:** In the events/[id] server shell (SEO-01), render a `<script type="application/ld+json">` with an Event object: name, startDate/endDate (ISO, omit when null), image (absolutized event.image), description (shortDescription||description), organizer (fest.name || host.name — never host.email), eventStatus (map stored CANCELLED → https://schema.org/EventCancelled), eventAttendanceMode + location (isOnline → OnlineEventAttendanceMode + VirtualLocation{url:onlineLink}; else OfflineEventAttendanceMode + Place{name:venue,address:venueAddress}), and offers as an AggregateOffer with lowPrice=min(ticketTypes.price), priceCurrency 'INR', availability InStock when any ticketType has sold<quantity else SoldOut, url=canonical, validFrom=createdAt.
- **Acceptance:**
  - The event page's JSON-LD passes Google's Rich Results Test with no errors for a typical paid, offline event.
  - An event with isOnline=true emits OnlineEventAttendanceMode + VirtualLocation with onlineLink and no physical Place.
  - offers.lowPrice equals the cheapest ticketTypes.price and availability flips to SoldOut when every ticket has sold>=quantity.
  - A CANCELLED event serializes eventStatus https://schema.org/EventCancelled.
  - The host email is never present anywhere in the JSON-LD payload.
- **Risks:** startDate/endDate/image can be null — omit rather than emit invalid values; event.image may be a data: URI or an /uploads relative path and must be absolutized (or dropped) for a valid image URL; free events (price 0) are valid offers; Rich Results eligibility needs a valid image + offer.

### SEO-03 — Dynamic OpenGraph share images per event & fest  `M`

**Depends on:** SEO-01

Generate branded 1200x630 share cards so links pasted into WhatsApp/Instagram/Twitter show the event poster, name, dates, venue and a 'from ₹X' price chip instead of the single static site OG. layout.tsx already sets twitter card 'summary_large_image' and metadataBase, so per-route images are picked up automatically.

- **API:** none (server-side fetch of GET /api/events/:id and GET /api/fests/:id).
- **Frontend:** Add frontend/app/events/[id]/opengraph-image.tsx and frontend/app/fests/[festId]/opengraph-image.tsx using `ImageResponse` from 'next/og' with `export const size = { width:1200, height:630 }` and contentType image/png. Compose: event/fest name (large), formatted date range, venue/college, and a 'from ₹{minPrice}' chip (min ticketTypes.price; 'Free' when 0); use the poster (event.image/fest.image) as background when it is an absolute fetchable URL, else a branded gradient fallback using the FesTicket palette (#29104A→#522C5D). Embed a bundled font via fs read. Re-export the same module as twitter-image.tsx (or rely on OG fallback). For DRAFT/PRIVATE/missing records, return the generic branded fallback (no data leak).
- **Acceptance:**
  - GET /events/{id}/opengraph-image returns a 200 image/png that is exactly 1200x630 and shows the event name, date range, venue and price chip.
  - GET /fests/{festId}/opengraph-image returns a branded 1200x630 card with the fest name + college.
  - An event with no poster (or a data:/relative image) renders the gradient fallback template rather than erroring.
  - Pasting an event URL into a link-preview debugger (e.g. Facebook/Twitter validator) shows the generated card, and the twitter card type stays 'summary_large_image'.
  - A DRAFT/PRIVATE event's OG endpoint returns the generic fallback and never exposes the private name.
- **Risks:** Remote poster fetch can fail/timeout (must catch → fallback); event.image is frequently a data: URI or an /uploads relative path that ImageResponse cannot load without an absolute origin; font must be embedded (no external CSS/font fetch); pick runtime (node vs edge) that can reach the backend and read the bundled font.

### SEO-04 — sitemap.xml + robots.txt for crawl coverage  `M`

There is no sitemap or robots file today, so crawlers can't efficiently discover public fest/event URLs and can wander into private booking/admin areas. Add a dynamic sitemap of all PUBLIC/PUBLISHED fest and event URLs with lastModified, plus a robots policy that allows public content and disallows operational routes.

- **API:** Reuse GET /api/fests (max limit 50) and GET /api/events (max limit 100) — the sitemap route pages through them server-side collecting ids + updatedAt. Optionally add a lightweight public GET /api/events/sitemap → { success, data: [{ id, updatedAt }] } (published+public only) and the fest equivalent to avoid many paginated round-trips.
- **Frontend:** Add frontend/app/sitemap.ts exporting a default async function returning MetadataRoute.Sitemap: home, /fests, each /fests/{id}/events, each /events/{id}, plus /events (SEO-05) and category landing pages (SEO-10) if present, with `lastModified` from updatedAt and a base URL from NEXT_PUBLIC_SITE_URL. Add frontend/app/robots.ts exporting MetadataRoute.Robots: allow '/', disallow ['/admin','/host','/signin','/signup','/forgot','/reset','/bookings','/booking-confirmation','/events/*/booking','/events/*/payment'], and reference `${NEXT_PUBLIC_SITE_URL}/sitemap.xml`.
- **Acceptance:**
  - /sitemap.xml returns valid XML listing every published+public event and every non-deleted fest that has a public event, each with a <lastmod>.
  - No DRAFT/PRIVATE event, soft-deleted fest, or admin/host/booking/payment/auth URL appears in the sitemap.
  - /robots.txt Allows / and Disallows /admin, /host, /events/*/booking, /events/*/payment and the auth routes, and lists the sitemap URL.
  - Both files use NEXT_PUBLIC_SITE_URL as the origin (no hardcoded localhost).
  - A newly published event appears in /sitemap.xml after the configured revalidation window.
- **Risks:** GET endpoints cap at 50/100 per page so the sitemap must loop pages (perf at scale) — the optional dedicated endpoint mitigates this; ensure the backend visibility filters are trusted so nothing private leaks; keep sitemap cached/revalidated to avoid a DB hit per crawler request.

### SEO-05 — Global cross-fest Discover Events page with facets  `L`

**Depends on:** SEO-01

Today an attendee can only browse events fest-by-fest (frontend/app/fests/[festId]/events). Add a global /events browse page that lists PUBLISHED+PUBLIC events across all fests with faceted filters (category, date range, online-only, city, free), backed by extending GET /api/events which currently supports only category/festId/hostId/search/sort/page.

- **Data model:** none — filters reuse existing columns (Event.category, Event.startDate, Event.isOnline, TicketType.price) and Fest.college as the city proxy. A dedicated Event.city field is deferred (noted in risks).
- **API:** Extend GET /api/events (backend/src/routes/events.js, the where-builder around lines 261-289): add `dateFrom`/`dateTo` → where.startDate gte/lte (safeDate-parsed), `isOnline` ('true'/'false') → where.isOnline, `college` → where.fest.college contains (insensitive) for the city facet, and `free`=true → `NOT: { ticketTypes: { some: { price: { gt: 0 } } } }` (with `some` ticketTypes to exclude no-ticket events). Keep the public visibility gate (PUBLISHED+PUBLIC+fest not deleted) and the existing {success,data,pagination} shape and sort options.
- **Frontend:** Add frontend/app/events/page.tsx (server shell + client facet island, per SEO-01) with a facet sidebar (category chips from the SEO-10 shared list, date-range inputs, an Online-only toggle, a Free toggle, a city/college select or search) that maps to the new query params, renders results with the existing components/card.tsx grid, and reuses the existing pagination pattern. Repoint the homepage 'Discover Events' button (frontend/app/page.tsx line ~36) and the confirmation page 'Discover more events' link from /fests to /events.
- **Acceptance:**
  - /events lists published+public events from multiple fests in one grid with working pagination.
  - Selecting a category, toggling Online-only, and setting a date range each narrow results and combine correctly (AND semantics) via the extended GET /api/events.
  - The Free toggle returns only events whose every ticket type is priced 0 (and excludes events with no ticket types).
  - The city/college facet filters events down to fests whose college matches.
  - An empty filter combination shows a friendly empty state, not an error, and the visibility gate still hides DRAFT/PRIVATE events.
- **Risks:** Fest.college is only an approximation of 'city' — a true Event.city column is future work; the `free` filter must handle events with zero ticket types; only category/status/visibility are indexed today, so date/college/price filters may table-scan at scale; combining facets must not override the anonymous visibility gate.

### SEO-06 — Homepage happening-now trending & upcoming strip  `M`

**Depends on:** SEO-08; SEO-05

frontend/app/page.tsx is fully static and shows a fabricated 'Trusted by 3000+ event organizers' badge (lines 15-19) with no real content or internal links to events. Replace the fake badge and add data-driven Trending and Upcoming rails built from GET /api/events (+ optionally GET /api/fests) using components/card.tsx, giving the homepage real, crawlable event links.

- **API:** Reuse GET /api/events: Trending → `?sort=trending&limit=8` (SEO-08), Upcoming → `?sort=date&dateFrom={now}&limit=8` (dateFrom from SEO-05). Falls back to `?sort=newest` if trending isn't available yet.
- **Frontend:** Make frontend/app/page.tsx an async Server Component (or add a server-fetched rails island) that renders two horizontally-scrollable rails ('Trending now' and 'Upcoming') of Card items linking to /events/{id}; remove/replace the hardcoded '3000+' badge with either a real aggregate or a neutral tagline; keep the existing hero, features and CTA sections. Each rail shows a graceful empty/CTA state when no events are returned.
- **Acceptance:**
  - The homepage renders a Trending rail and an Upcoming rail populated from live GET /api/events data, server-side (present in view-source).
  - The fabricated 'Trusted by 3000+' badge is removed or replaced with a non-fabricated element.
  - Cards link to /events/{id} and navigate correctly.
  - The Upcoming rail only contains events whose startDate is in the future.
  - When the API returns no events, each rail shows a friendly empty state / CTA instead of a broken/blank strip.
- **Risks:** page.tsx becomes async/server-fetching — avoid layout shift and handle backend-unreachable gracefully; 'Upcoming' needs the dateFrom filter from SEO-05 (or client-side date filtering as a fallback); trending ordering depends on SEO-08 landing first, otherwise fall back to newest.

### SEO-07 — More-at-this-fest + related events rail on event detail  `M`

**Depends on:** SEO-01

The event detail page dead-ends after the ticket CTA — there are no internal links onward, which hurts discovery and dwell time. Add two rails ('More at {fest.name}' and 'Similar {category} events') sourced from GET /api/events?festId= and ?category=, excluding the current event.

- **API:** Reuse GET /api/events?festId={event.festId}&limit=8 and GET /api/events?category={event.category}&limit=8. Since the endpoint has no exclude param, filter out the current event id client-side (or optionally add an `excludeId` query param to the where-builder).
- **Frontend:** Add a RelatedEvents client component rendered on the events/[id] page (below the 'About this event'/venue section), showing up to N Card items for same-fest events and up to N for same-category events (deduped, current event removed). Hide the fest rail when event.festId is null and hide either rail when it resolves to zero others.
- **Acceptance:**
  - An event that belongs to a fest shows a 'More at {fest name}' rail with other published events from that fest.
  - An event with a category shows a 'Similar {category} events' rail across fests.
  - The current event never appears in either rail and duplicates across the two rails are removed.
  - Each rail is hidden entirely when there are no other qualifying events (no empty headers).
  - Clicking a related card navigates to that event's detail page.
- **Risks:** Events with no fest skip the fest rail; the two rails can overlap and need deduping; without an excludeId param the current event must be filtered in the UI; adds up to two extra requests per detail view (cache/limit them).

### SEO-08 — Trending ranking + X-going social-proof badges  `M`

Add a sort=trending option that ranks events by COMPLETED-booking count and surface a 'N going' social-proof badge on cards and the event detail page. Note the existing `_count.bookings` include counts ALL bookings (any status), so trending must be computed from COMPLETED-only counts.

- **Data model:** none (computed via aggregation). Optional future denormalization: an Event.goingCount / soldCount counter maintained on booking completion — noted in risks, not required.
- **API:** Extend backend/src/routes/events.js: (1) add `sort=trending` — because Prisma orderBy on a relation `_count` cannot be filtered by status, compute per-event COMPLETED counts via `prisma.booking.groupBy({ by:['eventId'], where:{ status:'COMPLETED', eventId:{ in: pageIds } }, _count:true })` and order by that (tie-break by startDate asc via eventOrderBy). (2) Include a `goingCount` (COMPLETED bookings only) on each event in GET /api/events and GET /api/events/:id. Preserve the {success,data,pagination} shape.
- **Frontend:** Add an optional `going?: number` prop to components/card.tsx that renders a subtle 'N going' badge when >0, and pass event.goingCount from the fest events list, /events discover grid, homepage rails and related rails. On events/[id], show 'N going' near the title/tickets.
- **Acceptance:**
  - GET /api/events?sort=trending returns events ordered by descending COMPLETED-booking count, with startDate as the tie-breaker.
  - Each event in list and detail responses includes goingCount reflecting only COMPLETED bookings (PENDING/CANCELLED excluded).
  - components/card.tsx shows a 'N going' badge only when goingCount > 0.
  - The event detail page displays the going count.
  - An event with only PENDING/held bookings shows goingCount 0 and is not boosted by trending.
- **Risks:** groupBy adds a query per list page (bounded to the page's ids); PENDING inventory holds must not inflate the count; very small counts may feel like weak social proof (consider a threshold before showing); if traffic grows, a denormalized counter updated in the booking-completion transaction (bookings.js verify/complete) is the scalable follow-up.

### SEO-09 — Referral / WhatsApp share loop after booking  `M`

Turn confirmed buyers into a distribution channel: add a 'Bring your friends' share panel on the booking-confirmation surface (and an 'Invite friends' action on event detail) with WhatsApp / native-share / copy-link buttons that link back to the event carrying a ?ref= code, and attribute that ref on any resulting booking.

- **Data model:** Add `referredByCode String?` to the Booking model (backend/prisma/schema.prisma) to record the referring booking/user code. MVP can ship share links first and add the column when attribution is wired.
- **API:** Extend POST /api/bookings (backend/src/routes/bookings.js) to accept an optional `ref` in the body and persist it to Booking.referredByCode inside the existing $transaction (no change to money math). No new endpoint required for MVP; a referral-report endpoint is future work.
- **Frontend:** Add a SharePanel component used on frontend/app/booking-confirmation/page.tsx (near the existing actions, lines ~242-255) and optionally on events/[id]: a WhatsApp deep link `https://wa.me/?text={encoded message + url}`, a native `navigator.share()` button (feature-detected), and a Copy link button (navigator.clipboard + showToast from lib/toast). The share URL is `${NEXT_PUBLIC_SITE_URL}/events/{eventId}?ref={bookingCode}`. The event booking flow reads `ref` from the query string and forwards it in the POST /api/bookings body.
- **Acceptance:**
  - The booking-confirmation page shows a share panel with WhatsApp and Copy-link buttons (and native share where supported).
  - The generated share URL points to the event page and includes ?ref={bookingCode}.
  - Copy-link writes the URL to the clipboard and shows a success toast; failure shows an error toast.
  - A booking created after arriving via a ?ref= link persists referredByCode on the new Booking.
  - The share text contains no PII (no attendee email/phone), and the money/booking totals are unchanged.
- **Risks:** Instagram has no reliable web share intent — fall back to copy-link; must ignore self-referral and validate/sanitize the ref before storing; guest vs authenticated bookings both need to carry ref; keep ref optional so bookings without it are unaffected.

### SEO-10 — Curated category taxonomy + category landing pages  `L`

**Depends on:** SEO-05; SEO-01

Event.category is a free-text String? (schema line 95) set from a hardcoded chip list in components/event-create/DescribeEvent.tsx, so categories drift and there are no category landing pages to rank for queries like 'concerts near me'. Introduce a single curated category list shared by frontend + backend, validate on create/update, and generate /events/category/[category] landing pages with generateMetadata.

- **Data model:** Keep Event.category as String (avoid a breaking enum migration on existing rows) but constrain values to a curated set. Define a shared CATEGORIES constant (frontend/lib/categories.ts) mirrored by a zod enum in the event validator. Optional future step: convert to a Prisma enum EventCategory with a data backfill (deferred, see risks).
- **API:** Enforce the curated list in createEventSchema (and the update path) in backend/src/validators/eventValidator.js so POST/PUT reject an out-of-list category with the standard 400 {message,errors}. GET /api/events?category= already filters by category. Optionally add GET /api/events/categories → { success, data: [{ category, count }] } (published+public counts) to drive chips and landing-page headers.
- **Frontend:** Create the shared list frontend/lib/categories.ts (slug + label) and consume it in DescribeEvent.tsx (replace the inline `categories` array lines 18-29) and the fest events category chips. Add frontend/app/events/category/[category]/page.tsx as a server component that exports generateMetadata (unique <title> e.g. 'Concerts on FesTicket', description, canonical) and lists published+public events in that category reusing the SEO-05 discover grid/facets; link category chips/badges throughout to these landing pages; unknown/invalid slug → notFound().
- **Acceptance:**
  - POST/PUT /api/events rejects a category outside the curated list with a 400 and validation error.
  - DescribeEvent chips and the fest/discover category filters are all driven by the single shared categories module (no divergent hardcoded lists).
  - /events/category/{slug} renders published+public events for that category with a unique <title>, <meta description> and canonical link.
  - An unknown category slug returns Next notFound() (404) rather than an empty page.
  - Category landing pages are reachable from event/discover category chips and are included in the sitemap (SEO-04).
- **Risks:** Existing rows hold arbitrary/legacy category strings (casing, 'Other', nulls) that need normalization/backfill and a case-insensitive slug↔label mapping so old events still surface; if later promoted to a Prisma enum, the migration must map/backfill legacy values; renaming a category orphans old links — keep slugs stable.

---

## Phase 7: Frontend performance & UX polish

**Goal:** Modernize the data layer, caching, media, i18n and accessibility across the app.

**Why now:** A focused frontend-quality increment layered on the now-server-rendered pages. The SWR data layer (FE-02) underpins ISR and prefetch-pagination; next/image + skeletons + scoped Leaflet CSS + server-side geocoding + server redirect cut bytes and CLS; dark mode, i18n, header/ticket-selector a11y and the mobile sticky checkout bar (all pairing with the Phase-1 formatter) finish the UX. Done after SEO so caching/ISR decisions account for the SSR pages already shipped.

**Exit criteria:** Posters use next/image with configured remotePatterns; a typed useApi/useApiMutation SWR layer replaces the hand-rolled fetch pattern; public read pages serve via ISR with prefetched pagination that keeps prior results visible; Leaflet CSS loads only on the map island; shared skeletons + per-route loading.tsx are in place; venue lat/lng is geocoded server-side and stored; the fest→event route uses a server redirect(); cards render as prefetched next/link anchors; mobile sticky checkout bar shows the live total; theme-token dark mode with a persisted Header toggle works; next-intl i18n ships English with a locale switcher driving <html lang>; Header menu/mobile sheet meet focus/ARIA norms; TicketSelector has 44px targets, inputMode, and aria-live quantity announcements.

Specs (14): FE-01, FE-02, FE-03, FE-04, FE-05, FE-06, FE-07, FE-08, FE-09, FE-10, FE-11, FE-12, FE-14, FE-15

### FE-01 — Adopt next/image and configure images.remotePatterns  `M`

Replace the raw <img> poster tags in Card and the event-detail hero with next/image so posters serve as lazy AVIF/WebP with reserved space (no CLS), and enumerate the allowed remote hosts in the currently-empty next.config.ts. This cuts the ~400px-tall Unsplash/uploads posters (the heaviest asset on every grid and detail page) to a fraction of their bytes.

- **API:** none — images continue to load from the existing sources (Unsplash fallback URL used in frontend/app/fests/page.tsx line 146 and fests/[festId]/events/page.tsx line 277, and event.image which is a backend /uploads URL served from NEXT_PUBLIC_API_URL's host).
- **Frontend:** next.config.ts (currently an empty NextConfig, lines 3-5): add `images.remotePatterns` for `images.unsplash.com` and the backend uploads host (derive from NEXT_PUBLIC_API_URL origin, e.g. localhost:4000 / prod API host), plus `images.formats: ['image/avif','image/webp']`. components/card.tsx: swap the `<img>` at lines 57-61 for `<Image fill sizes="(max-width:640px) 50vw,(max-width:1024px) 33vw,25vw" className="object-cover ...">` inside the existing `relative w-full h-80` wrapper (line 56). app/events/[id]/page.tsx: swap the hero `<img>` at lines 265-269 for `<Image fill priority sizes="(max-width:1024px) 100vw,66vw">` in the existing `h-64 w-full` box (line 264) since it is above the fold.
- **Acceptance:**
  - `next.config.ts` defines `images.remotePatterns` covering images.unsplash.com and the uploads host, and `formats` includes avif+webp
  - No raw `<img>` remains in card.tsx or events/[id]/page.tsx — both use next/image with `fill` + `sizes`
  - Requesting a poster returns `content-type: image/avif` (or webp) via the /_next/image optimizer on a modern browser
  - Card grid reserves the poster box height before load — Lighthouse CLS for /fests is ~0 and no layout jump on slow network
  - `npm run build` succeeds with no 'hostname not configured' image errors
- **Risks:** next/image hard-fails the build/render for any remote host not in remotePatterns, so every image origin must be enumerated (Unsplash fallback + uploads host, and any host organizers paste into event.image — consider a permissive uploads pattern or `unoptimized` escape hatch). Data-URL/base64 posters (if any organizer pastes one) are not optimizable by next/image and need a passthrough branch. The two list pages share the same Unsplash fallback string — centralize it to avoid drift.

### FE-02 — Introduce a typed data layer (SWR) wrapping apiFetch  `L`

**Depends on:** FE-08 (keepPreviousData/prefetch build on this)

Replace the hand-rolled `useState(loading/error/data)+useEffect(fetch)` pattern duplicated across ~14 client pages with a small typed `useApi`/`useApiMutation` layer over SWR, plus a global provider, to dedup concurrent requests, cache between navigations, and standardize error/loading handling. Today every page re-implements debounce+fetch+error+reload-key bookkeeping (see fests/page.tsx lines 41-70).

- **API:** none — reuses existing endpoints and the {success,data,error}/bare-object envelopes.
- **Frontend:** Add `swr` dependency (lighter than React Query for this app). New lib/api.ts: `useApi<T>(path, opts)` calling `apiFetch` (from lib/auth.ts) as the fetcher, unwrapping `{success,data}` vs bare bodies, and surfacing `{data,error,isLoading,mutate}`; `useApiMutation` for POST/PUT/PATCH honoring the same refresh/redirect semantics. Mount `<SWRConfig>` in app/_ClientRoot.tsx (already a client boundary). Migrate the data-loading pages identified by grep: app/fests/page.tsx, app/fests/[festId]/events/page.tsx, app/events/[id]/page.tsx, app/host/dashboard/page.tsx, app/host/marketing/page.tsx, app/admin/dashboard/page.tsx, app/bookings/page.tsx, app/booking-confirmation/page.tsx (start with the two fests pages).
- **Acceptance:**
  - `lib/api.ts` exposes `useApi`/`useApiMutation` that go through `apiFetch` so access-token injection + single-flight refresh (lib/auth.ts lines 128-198) still work
  - `<SWRConfig>` provider wraps the app once in _ClientRoot; hooks are client-only and never run during SSR
  - Two components mounting the same key (e.g. /api/fests?page=1) fire a single network request (dedup verified in the Network panel)
  - fests and fests/[festId]/events pages migrated to `useApi` with identical loading/empty/error UX to today (including the retry affordance)
  - Navigating away and back to /fests renders cached data instantly then revalidates (stale-while-revalidate)
- **Risks:** apiFetch returns a raw Response (not parsed JSON) and some routes use {success,data} while auth/user/roleRequests return bare objects — the fetcher must branch on shape. Auth-dependent responses must not be cached across users (key by token or clear cache on logout in clearAuth). Adds a client dependency to the bundle; keep the wrapper thin. Do not cache one-shot mutations (booking creation) as GETs.

### FE-03 — Enable ISR / route caching for public read pages  `L`

**Depends on:** FE-02; money-note: sold/inventory must stay near-real-time

Serve the popular public pages (fests index, fest events list, event detail) as cached HTML via Incremental Static Regeneration instead of the current fully client-side fetch, so first paint shows real content and search engines get crawlable markup. Today all three are `"use client"` with a client `useEffect` fetch (fests/page.tsx line 1, events/[id]/page.tsx line 1), meaning empty HTML + a loading flash on every visit.

- **API:** none new — server components fetch the same GET /api/fests, GET /api/fests/:id, GET /api/events/:id, GET /api/events?festId=. Server-side fetch reads NEXT_PUBLIC_API_URL (available server-side too) or a new server-only API base.
- **Frontend:** Refactor each page into a server shell + client island: server component fetches the initial payload with `fetch(url,{next:{revalidate:120}})` and `export const revalidate = 120`, then passes data to a `"use client"` child that keeps the interactive bits (search/category/sort/pagination in fests + fests/[festId]/events, book button in events/[id]). Add `generateStaticParams` to app/events/[id] (top/published event ids) and app/fests/[festId]/events (active fest ids) so hot pages prebuild. Keep auth/personalized calls in the client island.
- **Acceptance:**
  - app/fests/page.tsx, app/fests/[festId]/events/page.tsx, and app/events/[id]/page.tsx each `export const revalidate` and render initial data server-side (view-source shows fest/event names, not an empty shell)
  - `generateStaticParams` returns known fest/event ids and those routes are statically prerendered at build
  - After the revalidate window, an updated event name appears within one background regeneration
  - Search, category filter, sort, and pagination still work in the client island with no regressions
  - Ticket `sold`/availability shown on the detail page is re-fetched client-side (or revalidate kept short) so a cached page never sells a sold-out ticket
- **Risks:** Large refactor: the pages are 100% client today (hooks, useRouter, localStorage geocode) and must be split so only the server-fetchable shell is cached. Personalization (Authorization header) cannot run at build/ISR time — keep it in the client island. Inventory (`sold`) is time-sensitive; balance revalidate interval vs a client refetch to avoid showing stale availability. Server-side fetch needs a base URL reachable from the Next server (not a browser-only localhost assumption).

### FE-04 — Scope Leaflet CSS out of the global bundle  `S`

Move the global `import "leaflet/dist/leaflet.css"` (app/layout.tsx line 2) into a dedicated dynamically-imported map component so the map stylesheet only loads on the one page that renders a map (events/[id]) instead of on every route. This trims the global CSS payload shipped to every visitor who never opens an event.

- **Frontend:** Remove line 2 of app/layout.tsx. Create components/EventMap.tsx (a `"use client"` module) that `import "leaflet/dist/leaflet.css"` at its top and renders the MapContainer/TileLayer/Marker (moving the three per-component `dynamic(...)` imports from events/[id]/page.tsx lines 77-88 into it). In app/events/[id]/page.tsx, replace the inline map JSX (lines 341-353) with `const EventMap = dynamic(()=>import('@/components/EventMap'),{ssr:false})` and render `<EventMap lat lng />`. Fix the default Leaflet marker icon inside EventMap (set `L.Icon.Default` iconUrl/iconRetinaUrl/shadowUrl) so the pin is visible.
- **Acceptance:**
  - `leaflet/dist/leaflet.css` is no longer imported in layout.tsx (or any always-loaded module)
  - Visiting /fests or /signin does not download leaflet.css (verify in Network/coverage)
  - The event-detail map still renders fully styled with a visible marker
  - leaflet.css loads only after the dynamic EventMap chunk is requested on events/[id]
- **Risks:** Leaflet's default marker icons resolve to image assets that break under Next's bundler — must set L.Icon.Default paths (or a custom icon) inside EventMap or markers render blank. Ensure the CSS import lives in the dynamically-imported module so it is code-split (importing it in a statically-imported file would re-globalize it). Verify no other component imports the map without the CSS.

### FE-05 — Shared skeleton system with per-route loading.tsx  `M`

**Depends on:** FE-03; FE-01

Extract the copy-pasted skeleton markup into reusable `CardGridSkeleton` and `EventDetailSkeleton` components and add `loading.tsx` for the public routes so route transitions show a layout-matched placeholder instead of bare 'Loading…' text (fests/page.tsx line 123) or a hand-rolled pulse block (events/[id]/page.tsx lines 191-195).

- **Frontend:** New components/skeletons/CardGridSkeleton.tsx (grid of pulse cards mirroring the `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` layout in fests/page.tsx line 139) and EventDetailSkeleton.tsx (mirrors the 2fr/1fr detail layout, extracted from events/[id]/page.tsx lines 186-199, and reused by the existing redirect skeleton in fests/[festId]/events/[eventId]/page.tsx lines 29-33). Add app/fests/loading.tsx, app/fests/[festId]/events/loading.tsx, app/events/[id]/loading.tsx rendering those skeletons under `<Header/>`. Replace the inline 'Loading events...' / 'Loading fests...' text states with the shared components.
- **Acceptance:**
  - `CardGridSkeleton` and `EventDetailSkeleton` exist and are used by both their loading.tsx and the in-page loading states
  - loading.tsx present for /fests, /fests/[festId]/events, and /events/[id] and renders during navigation before the page's data resolves
  - Skeleton dimensions match the loaded layout so there is no content shift when data arrives
  - Skeletons honor `prefers-reduced-motion` (globals.css lines 146-155 already disables the pulse animation)
- **Risks:** Next `loading.tsx` only fires for server-component/Suspense navigations — it is most effective after FE-03 converts these pages to server shells; on today's fully-client pages it renders only briefly during the route transition. Keep the skeleton markup in sync with any layout change (single source via the shared components mitigates this).

### FE-06 — Precompute venue geocoordinates server-side  `M`

**Depends on:** backend schema change; Nominatim usage policy (User-Agent + throttle)

Geocode an event's venue once when an organizer saves it and persist lat/lng on the Event, so the detail-page map renders instantly from stored coordinates instead of every viewer hitting Nominatim on load. Today geocoding happens client-side per viewer with a localStorage cache (events/[id]/page.tsx lines 42-74, 119-148), which is slow, rate-limit-prone, and empty on first view.

- **Data model:** Prisma schema.prisma Event model (lines 85+): add `latitude Float?`, `longitude Float?`, `geocodedAt DateTime?`. Run `npx prisma db push`. Optional one-off backfill script under backend/src/scripts to geocode existing events.
- **API:** Backend events.js: on POST /api/events (create, ~line 500) and PUT /api/events/:id (update, ~line 650), when `venue`/`venueAddress` is present and changed, best-effort geocode via a new backend/src/utils/geocode.js (Nominatim, with a descriptive User-Agent header + throttle, non-blocking like the email util) and write latitude/longitude/geocodedAt. GET /api/events/:id already returns the full event — include the new fields (add to any select if needed).
- **Frontend:** app/events/[id]/page.tsx: initialize `coords` from `event.latitude/longitude` when present and render the map immediately; keep the existing client Nominatim path (lines 119-148) only as a fallback when stored coords are null. The `EventData` interface (lines 19-40) gains `latitude?`/`longitude?`.
- **Acceptance:**
  - Event has `latitude`/`longitude`/`geocodedAt` columns after db push
  - Creating or updating an event with a venue/address populates lat/lng (verify in Prisma Studio)
  - GET /api/events/:id returns latitude/longitude and the detail-page map centers on them with zero client Nominatim requests when present
  - When geocoding fails or coords are absent, the page falls back to the existing client geocode / 'couldn't place this venue' message without erroring
  - Event save is never blocked or failed by a slow/failed geocode call
- **Risks:** Nominatim ToS requires a valid User-Agent and ~1 req/s — throttle and make it fire-and-forget (mirror the non-blocking email pattern in src/utils/email.js) so save latency/availability is unaffected. Existing events have null coords until backfilled — the client fallback covers this. Address edits must re-geocode (compare against geocodedAt/venue). Consider a provider swap path if Nominatim volume grows.

### FE-07 — Replace the client-side redirect route with a server redirect  `S`

Convert the fest-scoped event route from a client component that hydrates and calls `router.replace` into a server component that issues `redirect()`, so the browser is sent straight to the canonical /events/[id] with zero JS, no Header/skeleton flash, and a real HTTP redirect. Currently the page mounts, renders a skeleton, and only redirects after hydration (fests/[festId]/events/[eventId]/page.tsx lines 14-38).

- **Frontend:** Rewrite app/fests/[festId]/events/[eventId]/page.tsx as a server component (drop `"use client"`, useParams, useRouter, useEffect): `export default async function Page({params}) { const {eventId} = await params; redirect(`/events/${eventId}`); }` using `redirect` from next/navigation. Delete the skeleton markup and Header/Footer render.
- **Acceptance:**
  - Navigating to /fests/:festId/events/:eventId results in a server redirect to /events/:eventId (RSC/HTTP 3xx), not a client-side replace
  - No Header or skeleton is painted before the redirect (no flash)
  - The redirect works with JavaScript disabled
  - A missing/invalid eventId is handled (redirect target or notFound) without a runtime error
- **Risks:** In Next 16 `params` is a Promise and must be awaited. `redirect()` intentionally throws NEXT_REDIRECT — do not wrap it in a try/catch that swallows it. The current skeleton flash disappears (desired). Confirm no other code relied on this route rendering UI.

### FE-08 — Prefetch pagination and keep prior results visible  `M`

**Depends on:** FE-02

Stop blanking the grid to a 'Loading…' text state on every page change and instead keep the current results visible while the next page loads, and prefetch the adjacent page so Next/Prev feels instant. Today changing `page` sets loading true and the grid is replaced by plain text (fests/page.tsx lines 49-70/122-123; fests/[festId]/events/page.tsx lines 114-144/263-264).

- **API:** none — same GET /api/fests?page= and GET /api/events?festId=&page= calls.
- **Frontend:** In app/fests/page.tsx and app/fests/[festId]/events/page.tsx: with SWR (FE-02) use `keepPreviousData` so the previous page's cards stay mounted with a subtle inline spinner/opacity while fetching, and call SWR `preload`/`mutate` for page±1 after the current page settles (guarded so the last page isn't prefetched). Without SWR, retain a ref of the last successful list and overlay a loading affordance instead of unmounting. Reset prefetch when the debounced search/category/sort changes.
- **Acceptance:**
  - Clicking Next/Prev keeps the current cards on screen with a loading indicator — the grid never flashes to empty/'Loading' text
  - The adjacent page (page+1) is fetched in the background before the user clicks (visible as a prior network request in DevTools)
  - Rapid Next clicks do not render a stale page (results are keyed to the requested page)
  - Changing search/category/sort still resets to page 1 and clears prefetched state
  - Prefetch is skipped when already on the last page
- **Risks:** Prefetch spends bandwidth that may go unused (skip on last page / throttle). Race conditions on fast pagination — key responses to their page number and ignore out-of-order results. Page state is not currently in the URL; optionally add `?page=` for shareable/back-button behavior, but that is a scope addition. Depends on FE-02 for the cleanest keepPreviousData/preload implementation.

### FE-09 — Render cards as next/link anchors for navigation  `M`

Give Card an optional `href` so navigational cards render as real `<Link>` anchors (prefetched, middle-click/ctrl-click to open in a new tab, crawlable) instead of a `div` with `role=button` + `router.push`. Today Card is a click-handler div (card.tsx lines 28-43) and callers navigate via `router.push` (fests/page.tsx line 84, fests/[festId]/events/page.tsx line 147), so links aren't real URLs.

- **Frontend:** components/card.tsx: add an optional `href?: string` prop; when present, render the root as `<Link href={href}>` (next/link) preserving all styling/badge/hover; keep the existing `onClick` div+button semantics (lines 19-43) as the fallback for non-navigational cards so nothing breaks. app/fests/page.tsx: replace `onClick={()=>handleFestClick(fest.id)}` (line 147) with `href={`/fests/${fest.id}/events`}`; app/fests/[festId]/events/page.tsx: replace `onClick={()=>handleEventClick(event.id)}` (line 282) with `href={`/events/${event.id}`}` (drop the now-unused router handlers).
- **Acceptance:**
  - Fest and event cards render as `<a href=…>` in the DOM and are keyboard-focusable natively
  - Ctrl/Cmd-click or middle-click opens the target in a new tab; hovering prefetches the route
  - Card visual design, discount badge, and hover overlay are unchanged
  - Cards still passed only an `onClick` (non-nav usages) keep working as before
  - No `router.push` remains for card navigation on the two list pages
- **Risks:** Card is currently a client button — keep backward compatibility for any `onClick`-only callers (don't require href). Avoid nested interactive elements inside the anchor. `Link` prefetch on long lists can be heavy; set `prefetch={false}` if grid sizes grow. Ensure the focus-visible ring styling (card.tsx line 40) still applies to the anchor.

### FE-10 — Mobile sticky checkout bar with live total  `M`

**Depends on:** FE-13

Pin a bottom bar on mobile that shows the live grand total and the primary CTA (Proceed to Payment / Pay) so users on phones don't have to scroll past the ticket list and forms to the right-column summary to act. On the booking page the summary+CTA live in an aside that drops below the fold on mobile (booking/page.tsx lines 479-593); the payment page's Pay button is similarly buried (payment/page.tsx lines 249-258).

- **Frontend:** app/events/[id]/booking/page.tsx: add a `lg:hidden fixed bottom-0 inset-x-0` bar showing the computed `total` (lines 157-163) and a Proceed button that calls the existing `handleProceedToPayment` (disabled when `!isValid` / submitting, mirroring lines 566-573); add bottom padding to `<main>` so content isn't hidden behind it and use `env(safe-area-inset-bottom)`. app/events/[id]/payment/page.tsx: add the same pattern with the Pay ₹total CTA wired to `payWithRazorpay` (lines 249-256). Reuse the FE-13 currency formatter for the amount.
- **Acceptance:**
  - On viewports below `lg`, a fixed bottom bar shows the current total and the primary CTA on both the booking and payment pages
  - The total updates live as ticket quantities change (single source of truth = existing computed total, no duplicated math)
  - The CTA's enabled/disabled state mirrors the existing `isValid`/`processing` gates and triggers the same handler
  - The bar is hidden on desktop (`lg:` and up) where the aside is already visible
  - Page content is not obscured by the bar (bottom padding) and the bar respects the iOS safe-area inset
- **Risks:** Must reuse the existing total and submit handlers — do not re-derive fee/GST math (it must stay byte-identical to backend, see booking/page.tsx lines 151-163). Watch z-index against the sticky Header (globals header z-40) and the mobile keyboard pushing/overlapping the bar. Avoid two competing submit buttons causing double submits (share the `submitting` flag).

### FE-11 — Optional dark mode via theme tokens with a header toggle  `L`

Parameterize the hardcoded purple/cream palette into light/dark CSS-variable tokens with a persisted Header toggle (defaulting to prefers-color-scheme), and remove the `!important` global input overrides that currently make theming impossible. Today colors are hardcoded in globals.css (:root vars lines 16-31, plus `input/select/textarea{…!important}` lines 72-88) and tailwind.config.js (lines 10-42), and there is no toggle.

- **Frontend:** globals.css: extend the existing `:root` token block with a `[data-theme="dark"]` (and `@media (prefers-color-scheme:dark)`) override of --bg/--bg-card/--text-*/--accent/--border; replace the `!important` input rules (lines 72-88) with token-based, non-important styles so dark mode can restyle inputs. tailwind.config.js: set `darkMode:'class'` and point the semantic colors at the CSS vars. components/Header.tsx: add a theme toggle button that flips `data-theme` on `<html>` and persists to localStorage; add a tiny inline no-flash script in app/layout.tsx `<head>`/before body to set the class pre-hydration.
- **Acceptance:**
  - A visible toggle in the Header switches between light and dark and the choice persists across reloads (localStorage)
  - On first visit with no stored choice, the theme follows `prefers-color-scheme`
  - No FOUC: the correct theme is applied before hydration via an inline script (no light->dark flash)
  - Inputs/selects/textareas are styled via tokens (no `!important`) and remain legible in both themes
  - Text/background contrast meets WCAG AA in both light and dark
- **Risks:** Many components use hardcoded hex utilities (e.g. `bg-[#fdfdff]`, `text-[#29104A]`, header gradient) rather than tokens — a complete dark mode requires sweeping those to semantic classes, which is the bulk of the effort and touches most pages. Removing `!important` may subtly change the current light appearance; verify forms. The pre-hydration class script must run before first paint to avoid flash. Ships behind a toggle so it can land incrementally.

### FE-12 — Introduce an i18n framework with a locale switcher  `XL`

**Depends on:** FE-13

Adopt next-intl with typed message dictionaries, extract hardcoded UI copy into them, drive `<html lang>` from the active locale, and add a locale switcher — shipping English first with the structure ready for Hindi. Today all copy is inline English and `<html lang="en">` is hardcoded (app/layout.tsx line 41).

- **Frontend:** Add `next-intl`. Create messages/en.json (+ messages/hi.json stub) and wire the provider: set up locale via cookie or `[locale]` segment + middleware, wrap the tree in `NextIntlClientProvider`, and make app/layout.tsx render `<html lang={locale}>` dynamically instead of the hardcoded `en` (line 41). Extract copy from Header (nav labels lines 22-25, Support/Sign In), fests/events pages, booking/payment, and shared components into the dictionary via `useTranslations`. Add a locale switcher control in components/Header.tsx. Use the FE-13 formatter for locale-aware currency/number and route date formatting through Intl with the active locale (replacing the hardcoded `en-US` toLocaleDateString calls, e.g. fests/page.tsx lines 75-80).
- **Acceptance:**
  - next-intl is configured (cookie- or segment-based) and an `en` dictionary drives at least Header, /fests, and /events copy via `useTranslations`
  - `<html lang>` reflects the active locale rather than a hardcoded value
  - A Header locale switcher changes the active locale and re-renders translated copy plus locale-aware date/number formatting
  - messages/hi.json exists and is selectable (even if only partially translated) without breaking the app
  - No user-facing English strings remain inline in the migrated surfaces (they come from the dictionary)
- **Risks:** High effort: copy extraction spans nearly every page/component and is easy to do incompletely. App Router i18n needs a routing or cookie strategy plus middleware decisions (SEO vs simplicity). Dozens of `toLocaleDateString('en-US',…)` calls are hardcoded and must be routed through the locale. Actual Hindi translation is out of scope here (structure + English only); pluralization/RTL not required for en/hi but keep the API ready.

### FE-14 — Complete keyboard/ARIA on the Header menu and mobile nav  `M`

Bring the Header account dropdown and mobile nav sheet up to menu/dialog a11y norms: focus the first item on open, arrow-key roaming between items, close-and-restore focus when Tab leaves, and body-scroll lock + focus trap on the mobile sheet — mirroring the trap already implemented in CompleteProfileModal. Today the account menu only handles Escape and outside-click (Header.tsx lines 52-76) with no focus management, and the mobile sheet (lines 199-253) neither traps focus nor locks scroll.

- **Frontend:** components/Header.tsx: when the account menu opens (state at line 33), move focus to the first `role=menuitem` (lines 147-164) and implement ArrowUp/Down roving-tabindex between items; on Tab-out, close the menu and restore focus to the toggle button (line 127-140). For the mobile sheet (`mobileOpen`, lines 199-253): lock `document.body` scroll while open and trap focus within `#mobile-nav`, restoring focus to `mobileButtonRef` (line 37) on close — reusing the Tab-trap approach from components/CompleteProfileModal.tsx (lines 62-93). Escape handling (lines 52-64) already exists and stays.
- **Acceptance:**
  - Opening the account menu moves focus to the first menu item; ArrowUp/Down cycle through items (roving tabindex)
  - Tabbing out of the open account menu closes it and returns focus to the trigger button
  - Opening the mobile nav sheet locks body scroll and traps focus inside it; closing restores focus to the hamburger button and unlocks scroll
  - Escape still closes both the menu and the sheet (existing behavior preserved)
  - A keyboard-only / axe pass on the Header reports no focus-order or ARIA violations for the menu
- **Risks:** Body-scroll lock must be reliably released on close/unmount (and on route change) or the page becomes unscrollable. Outside-click already closes the account menu (lines 67-76) — coordinate with the new Tab-out close to avoid double-handling. Respect the existing `mounted` SSR gating (lines 88,125,223) so focus calls never run server-side. Keep roving-tabindex simple; a full APG menu widget may be more than needed.

### FE-15 — TicketSelector mobile ergonomics + live quantity announcement  `S`

**Depends on:** FE-13

Make the ticket stepper touch- and screen-reader-friendly: enlarge the +/- buttons to the 44px minimum tap target, set a numeric input mode, and announce the new quantity and line total via an aria-live region. Today the buttons are 36px (`w-9 h-9`, TicketSelector.tsx lines 24-48), the number input has no `inputMode`, and quantity changes are silent to assistive tech.

- **Frontend:** components/TicketSelector.tsx: bump the decrement/increment buttons (lines 24-30, 42-48) to `min-w-11 min-h-11` (>=44px) while keeping the existing aria-labels; add `inputMode="numeric"` + `pattern="[0-9]*"` to the `type=number` input (lines 32-40) and guard NaN in `onChange`; add a visually-hidden `aria-live="polite"` region that announces the current quantity and line total (`qty × price`, formatted with FE-13's `formatCurrency`) whenever `value` changes. Preserve the clamp-to-available logic and the disabled-at-max behavior.
- **Acceptance:**
  - The +/- buttons are at least 44x44 CSS px tap targets
  - The quantity input triggers a numeric keypad on mobile (`inputMode="numeric"`)
  - Changing the quantity updates an aria-live region announcing the new count and line total (e.g. '2 tickets, ₹1,000')
  - Clamping to `available` and the existing decrease/increase bounds still work; non-numeric input does not produce NaN
  - Existing aria-labels for the buttons and input are retained
- **Risks:** aria-live can be chatty on rapid +/- taps — use `polite` and consider debouncing the announcement. `type=number` plus `inputMode` interplay varies by browser; validate on mobile. The increment button uses `bg-primary-500` (tailwind.config), so verify contrast/appearance holds at the larger size on narrow cards. Line-total announcement depends on FE-13's formatter (fall back to a simple format if built first).

---

## Phase 8: Organizer analytics & finance tooling

**Goal:** Turn headline totals into a full analytics, budgeting, sponsor-CRM and settlement suite.

**Why now:** Analytics builds on stable, paise-clean money (Phase 2) and the aggregate/pagination groundwork, so it lands late for accuracy. The time-series endpoint is the base for the date-range filter and live refresh; per-event comparison + ticket-type sell-through feed the multi-sheet export; funnel, budget-vs-actual, sponsor pipeline and the paise-dependent settlement report complete organizer finance visibility. High organizer value, no downstream blockers.

**Exit criteria:** A fest-scoped day-bucketed time-series endpoint powers trend charts with a Today/7d/Fest/Custom date-range picker rescoping every card; a per-status funnel (started/completed %/cancelled/refunded/₹ held in PENDING) is shown; a sortable per-event comparison table and fest-wide ticket-type sell-through with low-inventory flags exist; an Export workbook builds a multi-sheet XLSX (Summary/Events/Ticket-types/Sponsors); per-category budgets show budget-vs-actual with over-budget badges; the sponsor pipeline board shows per-column totals + weighted value + outstanding rollup; a settlement card reconciles gross, 2% fee, 18% GST, discounts and refunds into net payout; opt-in 30s live refresh with a sold-in-last-hour delta pauses when the tab is hidden.

Specs (10): ANL-01, ANL-02, ANL-03, ANL-04, ANL-05, ANL-06, ANL-07, ANL-08, ANL-09, ANL-10

### ANL-01 — Sales trend time-series endpoint + trend charts  `M`

Add a fest-scoped time-series endpoint that buckets COMPLETED bookings by day (revenue, tickets, bookings) so the admin and host dashboards can render a real sales trend chart instead of only the single headline totals returned today by GET /api/events/analytics/fest/:festId (events.js:336).

- **Data model:** none. Reads Booking.purchaseDate, Booking.subtotal, Booking.discount, and BookingItem.quantity for events in the fest. Existing @@index([eventId]) on Booking (schema.prisma:188) covers the query; no new columns.
- **API:** NEW GET /api/events/analytics/fest/:festId/timeseries in backend/src/routes/events.js, placed next to the existing analytics route (events.js:336) and reusing its guards: authenticateUser + canAccessFest(festId, await callerFests(req)) else forbid(res); 400 VALIDATION_ERROR on NaN festId. Query params: interval=day|week (default day), from/to (ISO date, optional), tz (optional, default 'Asia/Kolkata'). Impl: resolve eventIds = events.findMany({where:{festId}}) then group COMPLETED bookings with purchaseDate != null. Since Prisma groupBy cannot date_trunc, fetch minimal rows (findMany select purchaseDate, subtotal, discount, items:{select:{quantity:true}}) filtered by eventId in ids + status COMPLETED (+ purchaseDate gte/lte when from/to given) and bucket in JS by yyyy-mm-dd. Zero-fill every day in [from,to] (or [firstSale,today]) so the line is continuous. Response envelope like the other events routes: {success:true, data:{interval, points:[{date, revenue, ticketsSold, bookings}]}}, where revenue = round2(sum(subtotal - discount)) to stay consistent with the existing endpoint's income definition (events.js:366-372).
- **Frontend:** NEW components/analytics/SalesTrendChart.tsx: theme-aware inline-SVG area/line chart (no external chart lib; follow the dataviz skill), props {points}. Wire into frontend/app/admin/dashboard/page.tsx: add a fetch of the timeseries in the managedFestId effect (alongside the existing analytics/expenses/sponsors fetches at lines 89-130 via apiFetch(getApiUrl()+...)) and render the chart in a new card just under the stat grid (after line 345). Optionally mirror in host dashboard (frontend/app/host/dashboard/page.tsx). Show the existing 'No sales yet' style empty state when points sum to 0.
- **Acceptance:**
  - GET /api/events/analytics/fest/:festId/timeseries returns 200 with data.points for a fest the caller manages/edits, 403 for another fest, 400 for a non-numeric id
  - Each point's revenue equals round2(sum(subtotal-discount)) of that day's COMPLETED bookings and bookings equals that day's COMPLETED booking count; PENDING/CANCELLED bookings are excluded
  - Days with no sales inside the requested range appear as zero-valued points (continuous line, no gaps)
  - Admin dashboard renders the trend chart populated from the endpoint and shows an empty state when there are no completed bookings
  - Chart is legible in both light and dark theme and does not cause horizontal page scroll on mobile
- **Risks:** purchaseDate is null for PENDING bookings so they must be excluded from bucketing; timezone choice shifts day boundaries (IST vs UTC) — pick one and apply consistently; an unbounded zero-fill (no from/to and one very old sale) could generate a large point array, so cap the default window (e.g. last 90 days).

### ANL-02 — Date-range filter across the analytics dashboard  `M`

**Depends on:** ANL-01

Add from/to date params to the fest analytics aggregate plus a preset picker (Today / Last 7 days / Fest dates / Custom) on the admin dashboard that rescopes every headline card and the trend chart to the selected window.

- **Data model:** none.
- **API:** Extend GET /api/events/analytics/fest/:festId (events.js:336) to accept from/to ISO query params and apply them to the booking.aggregate where as purchaseDate:{gte:from, lte:to}. IMPORTANT: ticketsSold today is derived from cumulative TicketType.sold (events.js:354-357), which is NOT date-scoped and will ignore the filter; when from/to are present, compute ticketsSold instead from COMPLETED BookingItem quantities within the range (sum quantities of items whose booking is COMPLETED + purchaseDate in range). eventsCount stays total. Same {success,data:{revenue,ticketsSold,eventsCount,bookingsCount}} shape. Reuse the same from/to on the ANL-01 timeseries endpoint.
- **Frontend:** frontend/app/admin/dashboard/page.tsx: add from/to state + a preset segmented control above the stat grid (~line 291). Thread from/to into the analytics fetch and the ANL-01 timeseries fetch (lines 89-130). Fest-dates preset uses the fest.startDate/endDate already fetched at lines 76-84. NOTE the expenses (line 105) and sponsors (line 118) endpoints are not date-aware — either leave Spend/Net fest-wide with a 'lifetime' label, or filter client-side by expense.paymentDate / sponsor.createdAt; pick and label clearly so Net Balance math stays honest.
- **Acceptance:**
  - Selecting 'Last 7 days' re-fetches analytics with from/to and the Income/Tickets/Bookings cards drop to the 7-day figures
  - Within a date range, ticketsSold reflects only tickets from COMPLETED bookings in that window (not the cumulative TicketType.sold)
  - 'Fest dates' preset uses the managed fest's startDate/endDate and 'Custom' exposes two date inputs
  - The trend chart (ANL-01) rescopes to the same range as the cards
  - Cards that cannot be date-filtered (Spend/Net) are visibly labeled so the user isn't misled about the period
- **Risks:** Changing ticketsSold semantics under a range is a behavior change vs the lifetime number; Fest-dates preset breaks if the fest has null dates (fall back to all-time); mixing date-scoped income with non-scoped spend makes Net Balance ambiguous unless labeled.

### ANL-03 — Booking conversion funnel (holds, abandonment, Rs stuck)  `M`

Expose per-status booking counts and rupee sums for a fest (started, completed with conversion %, cancelled, refunded, and value currently held in PENDING) so admins can see abandonment and money stuck by the 'hold-at-creation' inventory model.

- **Data model:** none. Uses Booking.status (PENDING/COMPLETED/CANCELLED/REFUNDED, schema.prisma:224-229) and Booking.total/subtotal/discount.
- **API:** NEW GET /api/events/analytics/fest/:festId/funnel in events.js, same auth/scope as events.js:336. Impl: eventIds for fest, then prisma.booking.groupBy({by:['status'], where:{eventId:{in:eventIds}}, _count:true, _sum:{total:true, subtotal:true, discount:true}}). Response {success,data:{started, completed, cancelled, refunded, conversionRate, valueHeldPending, valueCompleted, valueCancelled}} where started = total bookings, conversionRate = completed/started (guard divide-by-zero), valueHeldPending = round2(sum(total) of PENDING). This generalizes the per-event status counts already computed inline for one event at bookings.js:1126-1136.
- **Frontend:** NEW components/admin/BookingFunnel.tsx (horizontal funnel/bar with counts + rupee subtitles) fetched in the admin dashboard managedFestId effect and rendered as a panel. Highlight valueHeldPending in an amber 'stuck in pending' callout since inventory is held at booking creation (bookings.js POST at line 106).
- **Acceptance:**
  - Endpoint returns counts and rupee sums for each of the four statuses for the caller's fest, 403 for others
  - conversionRate = completed/started and is 0 (not NaN) when there are zero bookings
  - valueHeldPending equals round2(sum of total) across PENDING bookings for the fest
  - Admin funnel panel shows Started → Completed → Cancelled with per-stage counts and amounts
  - A distinct 'held in pending' indicator surfaces the stuck-rupees figure
- **Risks:** Because inventory is decremented on booking creation, long-lived PENDING rows inflate 'held' — acceptable but must be explained; REFUNDED is rarely produced today (no refund flow), so that bucket is usually 0; groupBy returns only present statuses, so zero-fill the missing ones.

### ANL-04 — Per-event comparison table on the admin dashboard  `L`

Add a fest endpoint returning per-event metrics (revenue, tickets sold, capacity + sell-through %, bookings, conversion %) and a sortable comparison table on the admin dashboard so organizers can rank events at a glance.

- **Data model:** none. Aggregates Event.ticketTypes (quantity, sold) and per-event Booking rows.
- **API:** NEW GET /api/events/analytics/fest/:festId/events in events.js, auth/scope per events.js:336. Impl efficiently (avoid N+1): (1) events.findMany({where:{festId}, select:{id,name,ticketTypes:{select:{quantity,sold,price}}}}); (2) booking.groupBy({by:['eventId','status'], where:{eventId:{in:ids}}, _count, _sum:{subtotal,discount,total}}). Compose per event: capacity=sum(quantity), ticketsSold=sum(sold), sellThrough=ticketsSold/capacity, revenue=round2(sum(subtotal-discount) of COMPLETED), bookings=COMPLETED count, started=all-status count, conversion=completed/started. Response {success,data:[{eventId,name,revenue,ticketsSold,capacity,sellThrough,bookings,conversion}]}.
- **Frontend:** NEW components/admin/EventComparisonTable.tsx: sortable columns (click header toggles asc/desc, default revenue desc), sell-through rendered as the existing progress-bar style used in the manage page (ticket bars, manage/page.tsx:942-947) and Expenses breakdown. Render as a new panel or inside the admin 'Events' section (admin/dashboard/page.tsx:348). Fetch via apiFetch(getApiUrl()+/api/events/analytics/fest/:id/events).
- **Acceptance:**
  - Endpoint returns one row per event in the fest with revenue, ticketsSold, capacity, sellThrough, bookings, conversion
  - revenue uses subtotal-discount of COMPLETED bookings (matches the fest headline income definition), not booking.total
  - Table is sortable by each numeric column and defaults to revenue descending
  - sellThrough is capped at 100% display and shows 0 when capacity is 0 (no divide-by-zero)
  - Rendering the table issues at most a small constant number of DB queries regardless of event count
- **Risks:** TicketType.sold includes tickets held by still-PENDING bookings, so sell-through can exceed completed-ticket counts — decide and label whether sell-through means 'held' or 'paid'; groupBy over eventId+status must be zero-filled for events with no bookings.

### ANL-05 — Fest-wide analytics export (multi-sheet XLSX)  `M`

**Depends on:** ANL-04; ANL-09

Add an 'Export workbook' button on the admin dashboard that builds a multi-sheet XLSX (Summary, Events, Ticket-types, Sponsors) client-side, fetching the underlying analytics on demand.

- **Data model:** none.
- **API:** none new — consumes existing/other-spec endpoints: GET /api/events/analytics/fest/:id (Summary), ANL-04 .../events (Events sheet), ANL-09 .../ticket-types (Ticket-types sheet), and GET /api/events/marketing/fest/:id/sponsors (Sponsors sheet).
- **Frontend:** NEW frontend/lib/export/workbook.ts exposing exportFestWorkbook(festId) that lazily loads SheetJS INSIDE the handler: const XLSX = await import('xlsx'). REALITY CHECK: the manage page deliberately abandoned xlsx because a top-level `import * as XLSX from 'xlsx'` crashed the Turbopack compile worker and 500'd the page (see the comment at host/events/[eventId]/manage/page.tsx:5-7); it now emits CSV. So this export MUST use a dynamic import only, must be verified to compile under Turbopack, and must fall back to emitting several CSVs (reuse the Blob download in components/admin/Expenses.tsx handleExportCsv, lines 168-203) if the dynamic import throws. Add the button next to the fest-key/financial header in admin/dashboard/page.tsx (~line 292); disable while fetching.
- **Acceptance:**
  - Clicking Export downloads a single .xlsx with four named sheets: Summary, Events, Ticket-types, Sponsors
  - xlsx is imported only via dynamic import() inside the click handler (no top-level import) and the dashboard still compiles/serves under Turbopack
  - Each sheet's rows match the corresponding endpoint's data for the current managed fest
  - If the xlsx dynamic import fails, the user still gets the data as CSV downloads and sees a toast (showToast) explaining the fallback
  - Export is disabled/space-guarded when the fest has no events or sponsors
- **Risks:** xlsx + Turbopack is a known crasher in this repo — dynamic import mitigates but must be tested; large fests produce big workbooks (acceptable, client-side); currency cells should be plain numbers, not '₹' strings, so Excel can sum them.

### ANL-06 — Expense budget-vs-actual with over-budget alerts  `L`

Introduce a per-fest, per-category Budget so the Expenses views can show budget-vs-actual progress bars and an over-budget badge against the existing expense category sums.

- **Data model:** NEW Prisma model Budget { id Int @id @default(autoincrement()); festId Int; category ExpenseCategory?; amount Float; createdAt; updatedAt; fest Fest @relation(fields:[festId], references:[id]); @@unique([festId, category]); @@index([festId]) }. A null category means an overall fest budget. Add budgets Budget[] to Fest. Apply with `npx prisma db push` (repo uses db push, no migration files).
- **API:** NEW routes under the existing marketing guard (events.js:132, authed + EDITOR/HOST/ADMIN): GET /api/events/marketing/fest/:festId/budgets, POST (upsert by festId+category), DELETE /api/events/marketing/budgets/:id. Reuse canAccessFest(festId, await callerFests(req)) + forbid for ownership, mirroring the expense routes (events.js:1485-1701). Consider restricting write to ADMIN of the fest. Response envelope {success,data}.
- **Frontend:** components/admin/Expenses.tsx: it already computes expensesByCategory (lines 145-150) and renders a category breakdown (lines 529-552) — extend each category card with a budget bar (actual/budget), an over-budget red badge when actual>budget, and an inline budget editor. Add the same to the host marketing expenses tab (frontend/app/host/marketing/page.tsx). New components/admin/BudgetEditor.tsx modal.
- **Acceptance:**
  - Creating a budget for (fest, category) then viewing Expenses shows a progress bar of actual÷budget for that category
  - A category whose summed expenses exceed its budget shows an 'Over budget' badge and the bar is capped/colored to signal overrun
  - Budgets are fest-scoped: a caller cannot read or write budgets for a fest they don't manage (403)
  - POST is idempotent per (festId, category) via the @@unique constraint (updates rather than duplicating)
  - An optional overall (category=null) budget renders as a fest-total bar against total expenses
- **Risks:** Enum vs display-label mismatch — Budget.category stores the ExpenseCategory enum while the UI uses labels (Expenses.tsx CATEGORY_LABELS map at lines 40-58), so key both off the enum; decide whether editors or only ADMIN may set budgets; Float money is consistent with the rest of the app but shares its rounding caveats.

### ANL-07 — Sponsor CRM pipeline board + outstanding-receivables view  `M`

Group sponsors by status into a pipeline board with per-column totals, a weighted pipeline value, and an outstanding (committed − received) rollup, upgrading the flat sponsor list in host marketing and the admin Companies view.

- **Data model:** none. Uses Sponsor.status (NEGOTIATING/PENDING/CONFIRMED, schema.prisma:292-296), sponsorshipAmount, receivedAmount.
- **API:** none new for read — reuse GET /api/events/marketing/fest/:festId/sponsors (events.js:1229). Column moves (drag a sponsor to a new status) reuse the existing PUT /api/events/marketing/sponsors/:id (events.js:1340), which already enforces cross-tenant ownership.
- **Frontend:** components/admin/Companies.tsx: add a board layout (three columns keyed by status) alongside/replacing the current list (lines 120-198), each column header showing count + Σ sponsorshipAmount. Add summary tiles: weighted pipeline = Σ(sponsorshipAmount × weight[status]) with client-side weights (e.g. Negotiating 0.3, Pending 0.6, Confirmed 1.0) and Outstanding = Σ(sponsorshipAmount − receivedAmount). Mirror the board + outstanding tile in the host marketing sponsors tab (frontend/app/host/marketing/page.tsx, sponsors table around lines 805-877). Optional drag-to-move calls the existing PUT and optimistically updates state.
- **Acceptance:**
  - Sponsors render in three status columns with per-column count and committed-amount subtotals
  - A 'Weighted pipeline' tile shows Σ(amount×status weight) and updates when a sponsor's status changes
  - An 'Outstanding' tile shows Σ(committed − received) across sponsors and matches the per-row 'Pending' hint already shown in host marketing (marketing/page.tsx:834-838)
  - Moving a sponsor between columns persists via PUT /marketing/sponsors/:id and survives reload
  - Totals are consistent with the fest-scoped sponsor list (no host-vs-fest mismatch)
- **Risks:** Only three statuses exist (no WON/LOST), so weighted pipeline includes confirmed deals unless you treat Confirmed as realized rather than pipeline; weights are arbitrary/product-defined and should be centralized; drag interactions must be keyboard-accessible.

### ANL-08 — Payout / settlement reconciliation report  `M`

Add a settlement endpoint that reconciles gross sales, the 2% platform fee, 18% GST, discounts, and cancelled/refunded amounts into a clear net-payout-to-organizer figure, surfaced as an admin settlement card.

- **Data model:** none. Uses Booking.subtotal/discount/platformFee/tax/total by status (schema.prisma:170-176); optionally Payment.status.
- **API:** NEW GET /api/events/analytics/fest/:festId/settlement in events.js, auth/scope per events.js:336. Impl: eventIds, then booking.groupBy({by:['status'], where:{eventId:{in:ids}}, _sum:{subtotal:true, discount:true, platformFee:true, tax:true, total:true}}). Compose from COMPLETED: grossCollected=Σtotal, platformFees=ΣplatformFee, gst=Σtax, discounts=Σdiscount, netToOrganizer=round2(Σ(subtotal-discount)) (this equals the dashboard's income definition and excludes the pass-through fee+GST, per the note at events.js:366-372). Also return refundedTotal (Σtotal REFUNDED) and cancelledTotal. Response {success,data:{grossCollected, platformFees, gst, discounts, netToOrganizer, refundedTotal, cancelledTotal}}.
- **Frontend:** NEW components/admin/SettlementCard.tsx: a receipt-style breakdown (Gross → less platform fee → less GST → = net payout, plus refunds/cancelled lines) fetched in the admin dashboard managedFestId effect and rendered near the financial header (admin/dashboard/page.tsx ~line 291). Reuse ₹ toLocaleString formatting already used across that page.
- **Acceptance:**
  - Endpoint returns grossCollected, platformFees, gst, discounts, netToOrganizer, refundedTotal, cancelledTotal for the caller's fest (403 for others)
  - netToOrganizer equals round2(Σ(subtotal-discount)) over COMPLETED bookings and matches the dashboard Income card for the same fest
  - grossCollected minus platformFees minus gst reconciles to netToOrganizer within rounding tolerance
  - Cancelled and refunded amounts are reported separately and excluded from net payout
  - The settlement card renders each line with correct ₹ formatting and a bold net total
- **Risks:** Platform fee and GST are pass-through (not organizer income) so labeling must make clear net payout excludes them; per-booking Float sums can drift a paise from a recomputed figure — reconcile with round2 and a tolerance; no real refund pipeline exists yet so refundedTotal is usually 0.

### ANL-09 — Fest-wide ticket-type sell-through + low-inventory alerts  `M`

Aggregate every ticket type across all fest events to show the revenue mix and sell-through %, and flag near-sold-out and low-selling types so organizers can react on pricing/inventory.

- **Data model:** none. Uses TicketType.quantity/sold/price (schema.prisma:141-158) and event start dates for the low-selling heuristic.
- **API:** NEW GET /api/events/analytics/fest/:festId/ticket-types in events.js, auth/scope per events.js:336. Impl: events.findMany({where:{festId}, select:{id,name,startDate,ticketTypes:{select:{id,name,quantity,sold,price}}}}). For each ticket type emit {ticketTypeId, eventId, eventName, name, price, quantity, sold, available:quantity-sold, sellThrough:sold/quantity, revenue:round2(sold*price)}. Compute flags server-side or client-side: nearSoldOut when sellThrough>=0.9, lowSelling when sellThrough<0.2 and the event starts within N days. Response {success,data:[...]}.
- **Frontend:** NEW components/admin/TicketTypePanel.tsx: a table/bar list of types with sell-through bars (reuse the bar style at manage/page.tsx:942-947), a revenue-mix summary (share of total ticket revenue per type), and colored badges for 'Near sold out' and 'Low selling'. Render as a panel on the admin dashboard.
- **Acceptance:**
  - Endpoint returns one row per ticket type across all events in the fest with quantity, sold, available, sellThrough and revenue
  - sellThrough is sold÷quantity, shown as 0 when quantity is 0, and revenue is round2(sold×price)
  - Types at ≥90% sell-through show a 'Near sold out' badge; low-sell-through types near their event date show a 'Low selling' badge
  - The panel shows each type's share of total ticket revenue (revenue mix)
  - Ticket types from other fests never appear (fest-scoped)
- **Risks:** TicketType.sold counts tickets held by PENDING bookings (inventory is reserved at creation), so sell-through reflects holds not just paid — label accordingly; the low-selling flag needs a time reference (days-to-event) to avoid flagging brand-new events; many ticket types across a big fest could make the list long (paginate or group by event).

### ANL-10 — Near-real-time dashboard refresh with sold-in-last-hour  `M`

**Depends on:** ANL-01

Add opt-in 30-second polling of the analytics endpoints with a 'live' indicator and an 'sold in the last hour' delta, automatically paused when the browser tab is hidden.

- **Data model:** none.
- **API:** none strictly required — reuse GET /api/events/analytics/fest/:festId and the ANL-01 timeseries. For the hourly delta, either request the aggregate with from=now-1h (needs ANL-02 date params) or read the most recent hour from the ANL-01 timeseries with interval=day plus a since param; simplest is a lightweight GET .../analytics/fest/:festId?from=<now-1h> returning ticketsSold/bookingsCount for the last hour.
- **Frontend:** frontend/app/admin/dashboard/page.tsx: add a 'Live' toggle near the financial header (~line 291). When enabled, a setInterval(30000) re-runs the analytics fetch(es); store the previous snapshot to compute the hourly delta and render a pulsing live dot + '+N sold in last hour'. Pause polling when document.visibilityState !== 'visible' (add a visibilitychange listener) and resume on focus. Clear the interval and listener on unmount / when toggled off (guard against React strict-mode double effects). Mirror the toggle on the host dashboard (frontend/app/host/dashboard/page.tsx). All requests go through apiFetch so token refresh/rotation is handled.
- **Acceptance:**
  - Enabling Live starts 30s polling that updates the headline cards without a full page reload
  - Polling stops while the tab is hidden (verified via visibilitychange) and resumes when it becomes visible
  - A live indicator (pulsing dot) is shown only while polling is active
  - 'Sold in last hour' shows the delta in completed tickets over the trailing 60 minutes and updates on each poll
  - Navigating away / toggling off clears the interval and listener (no leaked timers, no duplicate intervals under strict mode)
- **Risks:** Uncleared intervals or duplicate effects (React strict mode) leak timers and double the request rate; polling adds steady DB load — keep the polled query cheap and consider a short cache; the hourly delta depends on purchaseDate accuracy and the chosen timezone; apiFetch auth failures during polling must not bounce a validly-signed-in admin (match the existing redirectOnAuthFailure:false pattern at admin/dashboard/page.tsx:61).

---

## Phase 9: CI/CD, observability & release ops

**Goal:** Harden the pipeline, add production observability, and stand up staging→prod promotion.

**Why now:** Deliberately last: these guard and operate the now-complete product. Coverage gates, blocking E2E over the real money paths, load/soak of the oversell guard, Sentry/Prometheus/uptime monitoring, CI hardening, and a staging environment with promote-to-prod all wrap around finished features and endpoints rather than moving targets. Placing them at the end means the money-path E2E and load tests exercise the final webhook/refund/waitlist flows.

**Exit criteria:** Both vitest configs enforce coverage thresholds and CI runs test:coverage with lcov uploaded; @sentry/node + @sentry/nextjs are wired (no-op without DSN) tagging req.id/userId; a Prometheus /api/metrics endpoint exposes process + HTTP-duration + business counters with a committed Grafana dashboard; an external monitor pages on /api/health and /api/ready; the E2E job is blocking, caches browsers, and covers guest checkout, cancel-restore, role-approval and event-create; a k6/artillery soak fires N>capacity concurrent bookings asserting no oversell with p50/p95/p99; CI has a concurrency group, npm audit/Dependabot, secret scanning and path filters; a backend Dockerfile + Vercel config deploy to a Neon-branch staging with smoke tests, gating manual promotion of the same artifact to production.

Specs (8): OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-07, OPS-08

### OPS-01 — Enforce coverage thresholds in CI  `S`

Both vitest configs run coverage but neither enforces a floor, and the CI backend/frontend jobs run `npm test` (no coverage) — so coverage can silently rot. Add `coverage.thresholds` to both configs, switch CI to `test:coverage`, and upload lcov/html so the number is visible and gated.

- **Frontend:** Config only, no runtime UI. frontend/vitest.config.ts (lines 15-22 `test:{}`) currently has NO coverage block — add `coverage: { provider: 'v8', reporter: ['text','lcov','html'], include: ['app/**','components/**','lib/**'], exclude: ['**/*.test.{ts,tsx}','**/*.spec.ts','.next/**','**/*.d.ts'], thresholds: { lines, functions, branches, statements } }`. `@vitest/coverage-v8` is already in frontend devDependencies and `test:coverage` already exists in package.json.
- **Acceptance:**
  - backend/vitest.config.js gains a `coverage.thresholds` block and its reporter includes `lcov`; frontend/vitest.config.ts gains a full `coverage` block with thresholds (it has none today).
  - CI backend job (.github/workflows/ci.yml lines 46-47) and frontend job (lines 76-77) run `npm run test:coverage` instead of `npm test`.
  - `npm run test:coverage` exits non-zero in each app when any metric falls below its configured threshold; running it on the current tree still passes (thresholds set at/just below measured %, not aspirational).
  - Each job uploads the coverage report (lcov.info + html dir) via actions/upload-artifact with `if: always()` and a sensible retention.
  - Thresholds are documented (a comment noting they are a ratchet floor to be raised over time).
- **Risks:** Setting a threshold above current coverage breaks the build on the first run — measure current % first (run test:coverage locally) and set the floor at/just below it. Frontend include globs must exclude Next-generated and .d.ts files or 0%-coverage generated code will dilute the number. Integration/e2e code is out of scope for these unit-coverage numbers.

### OPS-02 — Add Sentry error tracking (backend + frontend)  `M`

Server faults currently only reach `console.error` (index.js error handler line 191, plus the `unhandledRejection`/`uncaughtException` handlers lines 237-243) and browser errors vanish into the client console. Wire @sentry/node on the backend and @sentry/nextjs on the frontend, both fully no-op unless a DSN env var is set, tagging events with req.id and userId.

- **API:** No new endpoints. Instrument the EXISTING surfaces: call `Sentry.init({ dsn, environment, tracesSampleRate })` right after `dotenv.config()` at the top of backend/index.js, gated on `process.env.SENTRY_DSN` (init is skipped entirely when unset). In the 500 branch of the error handler (index.js:191-201) call `Sentry.captureException(err)` inside a scope that sets tag `request_id=req.id` and `user.id=req.user?.userId` — do NOT report the 400/413 client-error branches (lines 170-189). Also `captureException` in the `uncaughtException`/`unhandledRejection` handlers before the existing console.error/shutdown. Add SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_TRACES_SAMPLE_RATE to backend/.env.example.
- **Frontend:** Add @sentry/nextjs. Because this is Next 16 App Router, use the instrumentation hooks: `frontend/instrumentation.ts` (server/edge init) + `frontend/instrumentation-client.ts` (browser init), each gated on the presence of `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`. Add `app/global-error.tsx` that calls `Sentry.captureException`. Wrap the export in frontend/next.config.ts with `withSentryConfig` (source-map upload only when SENTRY_AUTH_TOKEN is present, so local/CI builds without the token still succeed).
- **Acceptance:**
  - With no DSN set, backend boot and a forced 500 are byte-for-byte unchanged (still returns `{success:false,error:{code:'SERVER_ERROR'...}}`) and no Sentry network calls occur; frontend builds and runs identically.
  - With a DSN set, an unhandled route error hits the 500 branch and produces one Sentry event tagged with `request_id` and (when authenticated) the user id.
  - The 400 (INVALID_REQUEST_BODY) and 413 (PAYLOAD_TOO_LARGE) client-error branches do NOT create Sentry events.
  - Backend `uncaughtException`/`unhandledRejection` are captured before the existing console.error/graceful shutdown runs.
  - Frontend client and server component errors are captured via @sentry/nextjs; a build without SENTRY_AUTH_TOKEN still succeeds (no source-map upload).
  - A `beforeSend` scrubber strips known PII/secrets (guestEmail, Authorization header, tokens) from events.
- **Risks:** Never leak PII — booking payloads carry guestEmail/guestName/guestPhone; add a beforeSend scrubber and don't attach raw request bodies. captureException must not alter the response contract or throw. Next 16 uses instrumentation hooks, not the legacy sentry.client.config in _app. A Sentry.init failure (bad DSN) must be caught so it can never block server boot.

### OPS-03 — Expose a Prometheus /api/metrics endpoint + Grafana dashboard  `M`

The only telemetry today is the per-request JSON access log (requestLogger.js). Add prom-client: default process metrics, an HTTP request-duration histogram, and business counters (bookings_created, payment_success, payment_failed, stale_expired) incremented at their real call sites in bookings.js, exposed at GET /api/metrics with a committed Grafana dashboard JSON.

- **API:** New: `GET /api/metrics` — registered next to /api/health and /api/ready in backend/index.js (lines 119-140). Returns `Content-Type: text/plain` Prometheus exposition. Guard in production behind a `METRICS_TOKEN` bearer check (or document network-policy-only exposure); open in dev. Mount a duration-histogram middleware AFTER requestLogger (index.js:88) that records `http_request_duration_seconds{method,route,status_code}` using the matched route template (`req.route?.path`), not the raw URL. Counters live at module scope in a shared metrics module (mirrors the prisma singleton pattern) and are imported by bookings.js.
- **Acceptance:**
  - GET /api/metrics returns 200 text/plain containing default process metrics, `http_request_duration_seconds`, and the four business counters.
  - Histogram labels use the route template (e.g. `/api/bookings/:id/complete`) so cardinality stays bounded — no per-booking/per-user labels.
  - `bookings_created` increments on a successful POST /api/bookings (both paid and free paths, bookings.js ~432); `payment_success` on verify-payment (~641) and demo complete (~744); `payment_failed` on the VERIFY_FAILED branches; `stale_expired` increments by the `expired` count returned from `expireStalePendingBookings` (~1276).
  - A test that creates a booking then scrapes /metrics observes the corresponding counter increase.
  - In production the endpoint is not scrapeable without the configured token/guard.
  - `ops/grafana/festicket-dashboard.json` is committed and imports cleanly, rendering request-rate/latency plus the business-counter panels.
- **Risks:** Label cardinality is the main trap — never label by bookingId/userId/email. /metrics leaks the internal route inventory, so it must be guarded in prod. Counters must be module-scoped singletons (not re-created per request) or values reset. Under NODE_ENV=test the stale sweep interval is skipped (index.js:210), so `stale_expired` must be testable by calling expireStalePendingBookings directly.

### OPS-04 — External uptime + readiness alerting on /api/ready  `S`

`/api/ready` (index.js:132-140) already runs a cheap `SELECT 1` and returns 503 when the DB is unreachable, and `/api/health` (line 126) is a DB-free liveness check — but nothing watches either. Point an external monitor (UptimeRobot/Better Stack, or a scheduled GitHub Actions curl fallback) at them with paging, optionally deepening the readiness probe to flag Razorpay/SMTP degradation.

- **API:** Reuses GET /api/health (liveness, always 200) and GET /api/ready (readiness, 503 on DB down). Optional enhancement: accept `GET /api/ready?deep=1` that additionally checks Razorpay key presence and `transporter.verify()` for SMTP, but reports those as a soft `degraded` field and NEVER 503s solely on an optional-service outage (preserves the graceful-degradation contract from CLAUDE.md). Add a committed `.github/workflows/uptime.yml` on a `schedule` cron that curls /api/ready and fails (paging via the job's notification) when it is not 200.
- **Acceptance:**
  - An external monitor (or the scheduled Actions job) polls /api/ready on a fixed interval and alerts on non-200 or timeout.
  - Liveness (/api/health) and readiness (/api/ready) are monitored as separate checks so a transient DB blip pages ops without triggering an orchestrator process restart.
  - Alerts route to a real, documented channel (email/Slack/PagerDuty); the paging secret is stored in the monitor/repo secrets, not committed.
  - The optional `?deep=1` check reports Razorpay/SMTP problems as `degraded` (warning), never as a hard 503.
  - A runbook (ops/README.md or similar) documents the expected responses, alert thresholds, and who is paged.
- **Risks:** The deep check must use a short timeout so a slow SMTP host cannot wedge the readiness probe. Keep the polling interval reasonable — /api/ready is not rate-limited but excessive polling still costs a DB round-trip. Do not couple prod uptime to a third-party free-tier monitor without the Actions fallback.

### OPS-05 — Make E2E blocking, expand money-path journeys, cache browsers  `M`

The e2e job is `continue-on-error: true` (ci.yml:146) so failures are ignored, and it reinstalls Playwright browsers every run. Drop continue-on-error, cache the browser binaries, and add the missing critical journeys (guest checkout, cancel-restore, role-approval, event-create) on top of the existing booking->complete->confirmation spec so the pipeline truly guards the money paths.

- **API:** none (drives existing endpoints: POST /api/bookings, PUT /api/bookings/:id/cancel, GET /api/bookings/code/:bookingCode, PATCH /api/role-requests/:id, POST /api/events).
- **Frontend:** none (drives existing pages: /events/[id]/booking, /events/[id]/payment, booking-confirmation, /host/fests/[festId]/events/create, /admin/dashboard).
- **Acceptance:**
  - ci.yml e2e job no longer has `continue-on-error`; a failing e2e spec fails the pipeline.
  - Playwright browser binaries are cached (actions/cache on `~/.cache/ms-playwright`, keyed off e2e/package-lock.json); on a warm run the `playwright install` step is a no-op/skipped.
  - New guest-checkout spec: an unauthenticated user books and the booking is retrievable via GET /api/bookings/code/:bookingCode (asserting on server state, reusing _helpers.ts).
  - New cancel-restore spec: create a booking, PUT /:id/cancel, then assert the event's ticketType.sold returned to its pre-booking value (not just booking status).
  - New role-approval spec: a student RoleRequest is approved by an ADMIN (PATCH /api/role-requests/:id) and the user's editorFestId is set; new event-create spec: a HOST creates a PUBLISHED event that then appears on discovery.
  - Suite stays deterministic across rapid re-runs (reuses the token-priming helpers to stay under the 5-signins/min limit) and retries:1 on CI is retained with trace/report uploaded on failure.
- **Risks:** Making e2e blocking exposes any latent flakiness — stabilize dialog/timeout handling before flipping the gate. role-approval needs a real ADMIN token but there is no public promotion API; seed via the signJwt helper in _helpers.ts or a setup script. cancel-restore must assert on ticketType.sold, not booking status alone. CORS/port-drift is already handled in playwright.config.ts.

### OPS-06 — Load/soak test the booking inventory hot path  `M`

The oversell guard (the atomic guarded `updateMany` with `sold <= quantity - qty` in bookings.js POST, lines 380-389, backed by the `ticket_sold_lte_quantity` CHECK in constraints.sql) is only unit/integration tested, never under real concurrency. Add a k6/artillery scenario firing N>capacity concurrent bookings at a low-stock event against a real Postgres, asserting no oversell and capturing p50/p95/p99.

- **API:** Exercises POST /api/bookings (create, guest path — no auth needed) and seeds one event via POST /api/events (requires a host token; reuse the JWT-signing approach from e2e/_helpers.ts). No new endpoints.
- **Acceptance:**
  - A committed `ops/load/booking-hot-path.js` (k6) or artillery YAML seeds a single ticket type with capacity C and fires >C concurrent qty-1 guest bookings.
  - Exactly C bookings return 201 and the remainder return 409 SOLD_OUT; a post-run GET /api/events/:id asserts ticketType.sold === C and never exceeds quantity.
  - p50/p95/p99 latency are captured and enforced via k6 `thresholds` so the job fails if p95 regresses past the configured budget.
  - Runs on a nightly `schedule` in a dedicated workflow (not per-PR) against a postgres:16 service, mirroring the integration job's DATABASE_URL/JWT_SECRET + `prisma db push` + `psql -f prisma/constraints.sql` setup.
  - The CHECK constraint is applied so a would-be oversell fails at the DB layer even if application logic regressed.
- **Risks:** High VU counts can exhaust the pg/Neon connection pool — tune pool size and VUs, and use a throwaway isolated DB. The guarded updateMany losing the race returns 409 (not 500), so assert on the SOLD_OUT code. k6 is not an npm dep — install it via a CI action or binary. Keep the scenario off the per-PR path so normal CI stays fast.

### OPS-07 — CI hardening: concurrency-cancel, dependency audit, secret scanning  `M`

ci.yml has no concurrency group (rapid pushes stack duplicate runs), no dependency vulnerability scan across the three lockfiles, no secret scanning, and runs every heavy job even on docs-only diffs. Add a top-level concurrency group, npm audit + Dependabot for backend/frontend/e2e, gitleaks/trufflehog, and path filters.

- **Acceptance:**
  - ci.yml has a top-level `concurrency: { group: <workflow>-<ref>, cancel-in-progress: true }`, so a second push to the same ref cancels the in-progress run.
  - A new `security` job runs `npm audit --audit-level=high` in EACH of backend/, frontend/, and e2e/ (none omitted); a `.github/dependabot.yml` declares all three npm ecosystems and opens update PRs.
  - A gitleaks (or trufflehog) step scans the checkout with full history (fetch-depth:0) and fails the run on a committed secret.
  - A docs-only change (only `*.md`/PENDING-TASKS.md touched) skips the backend, frontend, integration, and e2e jobs via a path filter, while still running lightweight checks.
  - Audit level and any documented exception list are captured so transitive false-positives don't permanently red the pipeline.
- **Risks:** npm audit is noisy on transitive deps — pin the audit level and maintain a documented allowlist. Path filters must NOT skip a job when a shared/config file changes. gitleaks needs full git history (fetch-depth:0). cancel-in-progress scoped to ref avoids cancelling a nearly-finished required run on main.

### OPS-08 — Stand up a staging environment with promote-to-prod pipeline  `L`

**Depends on:** OPS-04; migrate-vs-push decision

There are no deploy manifests (no Dockerfile, no vercel.json) and no staging environment. Add a backend Dockerfile + frontend Vercel config, deploy on merge to a staging environment backed by its own Neon branch that runs schema sync + constraints.sql + smoke tests, then gate promotion of the SAME artifact to production behind manual approval.

- **Data model:** none (deploy/infra only). Note: the repo uses `prisma db push` with NO migration files — the pipeline must decide push-vs-`migrate deploy` for production and re-apply constraints.sql after every push (db push does not manage the CHECK constraint).
- **API:** Reuses GET /api/health, /api/ready, and /api/hello as post-deploy smoke checks. No new endpoints.
- **Frontend:** Build/deploy config only: add `frontend/vercel.json` (or Vercel project settings) wiring `NEXT_PUBLIC_API_URL` per environment (staging vs prod). Frontend promotes via Vercel preview -> production.
- **Acceptance:**
  - `docker build backend/` produces a runnable image (node:20, `npm ci`, `prisma generate`, `node index.js`, EXPOSE PORT, HEALTHCHECK on /api/health) that boots respecting index.js env validation (DATABASE_URL + JWT_SECRET>=32).
  - Merge to main auto-deploys the backend to a staging environment backed by a SEPARATE Neon branch (never prod data), running schema sync + `psql -f prisma/constraints.sql` before serving.
  - Staging deploy passes `/api/ready` plus a smoke subset before it is eligible to promote.
  - Production promotion requires explicit manual approval via a GitHub Environments protection rule.
  - The artifact promoted to prod is byte-identical to the one validated on staging (no rebuild between stages).
  - All per-environment secrets (DATABASE_URL, JWT_SECRET, FRONTEND_URL for CORS, Razorpay/SMTP) live in GitHub Environments, not committed.
- **Risks:** The repo has no migration history (db push only) — for prod either adopt `prisma migrate` or accept push's drift/data-loss risk; constraints.sql must be re-applied after every push. FRONTEND_URL must be set per environment or CORS blocks the staging frontend. Neon branch lifecycle/cleanup needs a policy. Guard the demo-payment `PUT /:id/complete` path stays disabled in prod (Razorpay keys set) — verify env parity.

---

