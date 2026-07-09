// OPS-03: Prometheus metrics — exposition, counter→scrape wiring, bounded route
// labels, and the production token guard.
import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  metricsMiddleware,
  metricsHandler,
  bookingsCreated,
  paymentSuccess,
  paymentFailed,
  staleExpired,
  routeLabel,
} from "../../src/utils/metrics.js";

function makeMetricsApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.id = "test-req";
    next();
  });
  app.use(metricsMiddleware);
  app.get("/widgets/:id", (_req, res) => res.json({ ok: true }));
  app.get("/metrics", metricsHandler);
  return app;
}

// Pull a single counter's current value out of the scrape body.
function counterValue(body, name) {
  const m = body.match(new RegExp(`^${name}\\s+(\\d+(?:\\.\\d+)?)`, "m"));
  return m ? Number(m[1]) : null;
}

describe("metrics endpoint (OPS-03)", () => {
  const savedEnv = process.env.NODE_ENV;
  const savedToken = process.env.METRICS_TOKEN;
  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
    if (savedToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = savedToken;
  });

  it("exposes default process metrics, the duration histogram and the four business counters", async () => {
    const res = await request(makeMetricsApp()).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    // A default process/runtime metric is present.
    expect(res.text).toMatch(/nodejs_|process_cpu/);
    expect(res.text).toContain("http_request_duration_seconds");
    expect(res.text).toContain("bookings_created_total");
    expect(res.text).toContain("payment_success_total");
    expect(res.text).toContain("payment_failed_total");
    expect(res.text).toContain("stale_expired_total");
  });

  it("a counter increment is reflected in the very next scrape", async () => {
    const app = makeMetricsApp();
    const before = counterValue((await request(app).get("/metrics")).text, "bookings_created_total") ?? 0;
    bookingsCreated.inc();
    paymentSuccess.inc(2);
    paymentFailed.inc();
    staleExpired.inc(3);
    const after = (await request(app).get("/metrics")).text;
    expect(counterValue(after, "bookings_created_total")).toBe(before + 1);
    // The others merely need to be present and numeric (values accumulate across
    // the shared module singleton, so assert >= what we just added).
    expect(counterValue(after, "payment_success_total")).toBeGreaterThanOrEqual(2);
    expect(counterValue(after, "stale_expired_total")).toBeGreaterThanOrEqual(3);
  });

  it("labels the duration histogram by the route TEMPLATE, never the raw id", async () => {
    const app = makeMetricsApp();
    await request(app).get("/widgets/12345"); // record one timed request
    const body = (await request(app).get("/metrics")).text;
    expect(body).toContain('route="/widgets/:id"');
    expect(body).not.toContain('route="/widgets/12345"');
  });

  it("routeLabel collapses unmatched requests to a single bucket", () => {
    expect(routeLabel({ route: { path: "/:id/complete" }, baseUrl: "/api/bookings" })).toBe(
      "/api/bookings/:id/complete"
    );
    expect(routeLabel({})).toBe("unmatched");
  });

  describe("production access guard", () => {
    it("is open in development (no token needed)", async () => {
      process.env.NODE_ENV = "development";
      const res = await request(makeMetricsApp()).get("/metrics");
      expect(res.status).toBe(200);
    });

    it("fails closed in production when METRICS_TOKEN is unset", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.METRICS_TOKEN;
      const res = await request(makeMetricsApp()).get("/metrics");
      expect(res.status).toBe(403);
    });

    it("in production requires the correct Bearer token", async () => {
      process.env.NODE_ENV = "production";
      process.env.METRICS_TOKEN = "super-secret-scrape-token";
      const app = makeMetricsApp();
      expect((await request(app).get("/metrics")).status).toBe(403);
      expect(
        (await request(app).get("/metrics").set("Authorization", "Bearer wrong")).status
      ).toBe(403);
      const ok = await request(app).get("/metrics").set("Authorization", "Bearer super-secret-scrape-token");
      expect(ok.status).toBe(200);
      expect(ok.text).toContain("bookings_created_total");
    });
  });
});
