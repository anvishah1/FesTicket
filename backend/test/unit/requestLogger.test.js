import { describe, it, expect, vi } from "vitest";
import requestLogger from "../../src/middleware/requestLogger.js";

function makeReqRes({ headers = {}, originalUrl = "/api/hello", method = "GET" } = {}) {
  const listeners = {};
  const req = { headers, originalUrl, method };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    on(event, cb) {
      listeners[event] = cb;
    },
    emit(event) {
      if (listeners[event]) listeners[event]();
    },
  };
  return { req, res };
}

describe("requestLogger middleware", () => {
  it("generates a request id and sets it on req and the response header", () => {
    const { req, res } = makeReqRes();
    const next = vi.fn();
    requestLogger(req, res, next);

    expect(typeof req.id).toBe("string");
    expect(req.id.length).toBeGreaterThan(0);
    expect(res.headers["X-Request-Id"]).toBe(req.id);
    expect(next).toHaveBeenCalledOnce();
  });

  it("reuses an incoming X-Request-Id header", () => {
    const { req, res } = makeReqRes({ headers: { "x-request-id": "abc-123" } });
    requestLogger(req, res, vi.fn());

    expect(req.id).toBe("abc-123");
    expect(res.headers["X-Request-Id"]).toBe("abc-123");
  });

  it("does not log under NODE_ENV=test but still sets id/header", () => {
    // vitest sets NODE_ENV=test
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { req, res } = makeReqRes();
    requestLogger(req, res, vi.fn());
    res.emit("finish");

    expect(spy).not.toHaveBeenCalled();
    expect(res.headers["X-Request-Id"]).toBe(req.id);
    spy.mockRestore();
  });

  it("logs a structured JSON line on finish when not in test mode", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { req, res } = makeReqRes({ method: "POST", originalUrl: "/api/bookings" });
      requestLogger(req, res, vi.fn());
      res.statusCode = 201;
      res.emit("finish");

      expect(spy).toHaveBeenCalledOnce();
      const logged = JSON.parse(spy.mock.calls[0][0]);
      expect(logged).toMatchObject({
        method: "POST",
        url: "/api/bookings",
        status: 201,
        requestId: req.id,
      });
      expect(typeof logged.durationMs).toBe("number");
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  it("skips logging for /uploads static requests", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { req, res } = makeReqRes({ originalUrl: "/uploads/proof.png" });
      requestLogger(req, res, vi.fn());
      res.emit("finish");

      expect(spy).not.toHaveBeenCalled();
      expect(res.headers["X-Request-Id"]).toBe(req.id);
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });
});
