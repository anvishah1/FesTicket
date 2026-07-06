import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate } from "../../src/middleware/validate.js";
import respond from "../../src/middleware/respond.js";

const schema = z.object({
  email: z.string().email(),
  age: z.number().min(1, "Age must be positive"),
});

function buildApp() {
  const app = express();
  app.use(express.json());
  // validate() now emits its failure via res.fail (ARCH-01), so the respond
  // middleware must be mounted for the helper to exist.
  app.use(respond);
  app.post("/t", validate(schema), (req, res) => res.json({ ok: true, body: req.body }));
  return app;
}

describe("validate middleware", () => {
  it("passes a valid body and replaces req.body with parsed (stripped) data", async () => {
    const res = await request(buildApp())
      .post("/t")
      .send({ email: "a@b.com", age: 5, extra: "should be stripped" });
    expect(res.status).toBe(200);
    expect(res.body.body.email).toBe("a@b.com");
    expect(res.body.body.extra).toBeUndefined();
  });

  it("returns 400 with a per-field error map on an invalid body", async () => {
    const res = await request(buildApp()).post("/t").send({ email: "nope", age: 0 });
    expect(res.status).toBe(400);
    // Unified envelope: message + per-field map live under `error`.
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.email).toBeTruthy();
    expect(res.body.error.details.age).toBe("Age must be positive");
  });

  it("keeps only the first error per field", async () => {
    const res = await request(buildApp()).post("/t").send({ email: "nope", age: 0 });
    expect(typeof res.body.error.details.email).toBe("string");
  });
});
