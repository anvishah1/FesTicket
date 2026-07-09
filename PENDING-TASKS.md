# Pending Tasks: Full Complete Booking App

A checklist of what’s left to make FesTicket a full, production-ready event booking app.  
**Already in place:** Auth (signup/signin, refresh, forgot/reset password), admin flow (signup → AdminRequest → approval script, dashboard scoped by fest), editor flow (fest key → RoleRequest → approval → host dashboard), events & ticket types, fest/event discovery pages, booking UI (select tickets, attendees, guest info), payment UI (simulated complete), cancel booking, host event management, marketing (sponsors/expenses), admin view of events/expenses/sponsors/role requests.

---

## Critical (blocking core booking)

1. **Mount bookings API**  
   `backend/src/routes/bookings.js` exists but is **not** registered in `backend/index.js`. Add `app.use("/api/bookings", bookingsRouter)` and import the router so create booking, complete, cancel, and get-booking endpoints work.

2. **Use configurable API URL in frontend**  
   Replace all hardcoded `http://localhost:4000` in frontend with `getApiUrl()` from `@/lib/auth` (or a shared config). Affects: `events/[id]/page.tsx`, `events/[id]/booking/page.tsx`, `events/[id]/payment/page.tsx`, `fests/page.tsx`, `fests/[festId]/events/page.tsx`, `host/events/[eventId]/manage/page.tsx`, and any other fetch to the backend.

---

## Payments

3. **Integrate a real payment gateway**  
   Right now payment is simulated (e.g. `transactionId: TXN-${Date.now()}`). Integrate Razorpay, Stripe, or another provider: create order when user proceeds to pay, verify webhook/success, then call existing `PUT /api/bookings/:id/complete` and create `Payment` record. Handle failure and retries.

4. **Optional: hold inventory only on payment success**  
   Currently `sold` is incremented when the booking is created (PENDING). Consider moving the ticket-count increment to when the booking is completed (after payment success) so abandoned carts don’t hold inventory. If you do, add a cleanup job or TTL for old PENDING bookings.

---

## Email

5. **Send transactional emails**  
   - **Password reset:** Forgot-password flow says “we sent a link” but no email is sent. Implement sending (e.g. Nodemailer, Resend, SendGrid) with reset link.  
   - **Booking confirmation:** After payment success, send a confirmation to the buyer/guest email with booking code, event details, and (later) ticket/QR link.  
   - **Ticket / QR email:** Optionally send a second email with tickets or PDF/QR when booking is completed.  
   - **Email verification:** Signup has `emailVerifyToken` and verify-email route; actually send the verification email on signup.

---

## Post-booking experience

6. **Booking confirmation / “My tickets” page**  
   After payment, redirect to a dedicated success page that shows booking code, event, and ticket summary. Optionally: “My bookings” (by user id or guest email) so users can view past bookings and booking details.

7. **QR codes / check-in**  
   Generate a unique code or QR per booking (or per ticket) and store it. Add a check-in page or scanner (host/admin) to mark attendees as checked in. Optionally add an `Attendee.checkInAt` or similar and show check-in status in host dashboard.

8. **Refunds**  
   Schema has `BookingStatus.REFUNDED` and `PaymentStatus.REFUNDED`. Implement: (a) Refund via payment provider where possible, (b) Update booking and payment status to REFUNDED, (c) Decrement ticket `sold` counts. Expose in admin/host dashboard for eligible bookings.

---

## Discovery and UX

9. **Public event listing and filters**  
   Fests and fest events pages exist; add or improve: search by name, filter by date/category/fest, sort by date. Improve discovery (search, filters, sort) as needed.

   **Event URL consistency:** The app has two possible URLs for viewing one event:
   - **`/events/[id]`** — Used by the fest events list (click event → goes here). This page **already** fetches real data from `GET /api/events/:id` and has a “Book now” → `/events/[id]/booking`. This is the main, working path.
   - **`/fests/[festId]/events/[eventId]`** — A separate event-detail page that currently uses **fake sample data** (see item 11). If you keep this URL (e.g. for “event in fest context”), it should fetch from the same API and show the same event; otherwise consider always linking to `/events/[id]` so there’s one canonical event URL.

10. **Sponsor form backend (what “TODO” means here)**  
    In `frontend/app/sponsor/page.tsx`, on submit the code does:
    - `// TODO: Replace with actual API call`
    - `await new Promise(resolve => setTimeout(resolve, 1500));` (fake 1.5s delay)
    - `console.log("Sponsor registration:", formData);`
    - Then it shows the “Thank you” success screen.
    So **right now**: the form only simulates a submit (no data is saved or sent anywhere). Filling the form and clicking submit just waits 1.5 seconds and shows success. **To fix:** Add a backend endpoint (e.g. POST that creates a sponsor lead or contact request, or stores in DB) and call it from the form instead of the fake delay.

11. **Event page from fest (what “TODO” means here)**  
    In `frontend/app/fests/[festId]/events/[eventId]/page.tsx`, the page loads the event like this:
    - `// TODO: Replace with actual API call`
    - It looks up the event from a **hardcoded array** `sampleEvents` (about 8 fake events) and does `sampleEvents.find((e) => e.id === eventId && e.festId === festId)`.
    So **right now**: this URL only shows data for those fake events (e.g. id 1–8, festId 1). Real events from your DB never appear here. **To fix:** Replace that with `fetch(\`${getApiUrl()}/api/events/${eventId}\`)` (same as `/events/[id]` uses) and map the API response to the page’s state so real events load. Optionally you can then link to this URL from the fest events list instead of `/events/[id]` if you want the fest context in the URL.

---

## Auth and security

12. **Optional: Google (or other) OAuth**  
    Signup and AuthForm have TODOs for Google OAuth. Add OAuth flow (e.g. Passport or NextAuth) and map OAuth user to your User model (create or link account).

13. **Enforce auth and roles on sensitive routes**  
    Ensure all admin/host/editor APIs validate JWT and role (e.g. admin-only for fest-scoped data, host/editor for their events). Many routes already use middleware; audit any that still allow unauthenticated or cross-tenant access.

14. **Rate limiting and abuse**  
    You have a rate limiter for login; consider rate limiting booking creation and payment endpoints to prevent abuse and spam.

---

## Production readiness

15. **Database**  
    SQLite is fine for dev. For production, switch to PostgreSQL (or MySQL): change `datasource` in Prisma schema, set `DATABASE_URL`, run migrations. Optionally add connection pooling.

16. **Environment and config**  
    Use `.env` for all secrets (JWT, payment keys, email, DB URL). Ensure no secrets in repo; keep `.env.example` updated. Frontend: `NEXT_PUBLIC_API_URL` (or similar) for API base URL in production.

17. **File storage**  
    Event images, sponsor agreements, expense files: if not already using a bucket (S3, Cloudinary, etc.), add upload to object storage and store URLs in DB; avoid storing large binaries in SQLite.

18. **Logging and errors**  
    Replace or supplement `console.log`/`console.error` with a logger. In production, avoid logging sensitive data and consider error tracking (e.g. Sentry).

19. **Booking code lookup (public)**  
    Allow users to look up a booking by booking code + email (or similar) so they can view details and tickets without an account. Backend has `GET /api/bookings/code/:bookingCode`; add a simple frontend page (e.g. “Find my booking”) that uses it with minimal auth (e.g. email match).

---

## Nice to have

20. **Discount codes**  
    Schema has `Event.discount`; add optional discount codes (e.g. per-event or fest-wide codes) that reduce ticket price at checkout and validate on backend.

21. **Waitlist**  
    When an event is sold out, allow users to join a waitlist; notify them if tickets become available (e.g. after cancellations).

22. **Analytics**  
    Simple dashboards: sales over time, top events, conversion (views → bookings). Can be read-only from existing booking/event data.

23. **Notifications**  
    In-app or push notifications for: new role request (admin), booking confirmed (user), event reminder (attendee). Optional email digests for admins.

24. **Multi-language / i18n**  
    If targeting multiple languages, add i18n for all user-facing strings.

---

## Summary order of operations

| Priority | Task |
|----------|------|
| P0 | Mount bookings router in backend |
| P0 | Replace hardcoded API URL with getApiUrl() in frontend |
| P1 | Payment gateway integration |
| P1 | Email: password reset, booking confirmation (and optionally verification) |
| P1 | Booking success / “My tickets” and optional “My bookings” |
| P2 | QR / check-in flow |
| P2 | Refunds |
| P2 | Sponsor form API, fest event detail API |
| P2 | Production DB, env, file storage, logging |
| P3 | OAuth, rate limiting, booking lookup page, discount codes, waitlist, analytics |
