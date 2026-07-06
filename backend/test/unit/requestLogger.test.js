import { describe, it, expect, vi, beforeEach } from "vitest";

// requestLogger now emits through the shared pino logger via a per-request child
// (req.log), not console.log. Mock the logger so we can assert on the emitted line.
// vi.hoisted so the spies exist before the (hoisted) vi.mock factory runs.
const { infoSpy, childSpy } = vi.hoisted(() => {
  const infoSpy = vi.fn();
  const childSpy = vi.fn(() => ({ info: infoSpy }));
  return { infoSpy, childSpy };
});
vi.mock("../../src/utils/logger.js", () => ({
  default: { child: childSpy },
}));

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
  beforeEach(() => {
    infoSpy.mockClear();
    childSpy.mockClear();
  });

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

  it("attaches a per-request child logger bound to the request id", () => {
    const { req, res } = makeReqRes();
    requestLogger(req, res, vi.fn());

    expect(childSpy).toHaveBeenCalledWith({ requestId: req.id });
    expect(req.log).toBeTruthy();
    expect(typeof req.log.info).toBe("function");
  });

  it("emits one structured access line on finish with method/url/status/durationMs", () => {
    const { req, res } = makeReqRes({ method: "POST", originalUrl: "/api/bookings" });
    requestLogger(req, res, vi.fn());
    res.statusCode = 201;
    res.emit("finish");

    expect(infoSpy).toHaveBeenCalledOnce();
    const [obj, msg] = infoSpy.mock.calls[0];
    expect(obj).toMatchObject({ method: "POST", url: "/api/bookings", status: 201 });
    expect(typeof obj.durationMs).toBe("number");
    expect(msg).toBe("request");
  });

  it("skips the access line for /uploads static requests but still sets id/header", () => {
    const { req, res } = makeReqRes({ originalUrl: "/uploads/proof.png" });
    requestLogger(req, res, vi.fn());
    res.emit("finish");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(res.headers["X-Request-Id"]).toBe(req.id);
  });
});
