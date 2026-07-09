import { describe, it, expect } from "vitest";
import { buildOpenApiDocument } from "../../src/openapi.js";

const doc = buildOpenApiDocument();

// Walk the document and collect every local "#/components/..." $ref.
function collectRefs(node, out = []) {
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

function resolveRef(ref) {
  // "#/components/schemas/Signup" -> doc.components.schemas.Signup
  return ref
    .replace(/^#\//, "")
    .split("/")
    .reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
}

describe("OpenAPI document (ARCH-04)", () => {
  it("is an OpenAPI 3.0 document with the required top-level fields", () => {
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info?.title).toBe("FesTicket API");
    expect(doc.info?.version).toBeTruthy();
    expect(doc.paths && typeof doc.paths).toBe("object");
  });

  it("serves both the versioned and unversioned prefixes", () => {
    const urls = doc.servers.map((s) => s.url);
    expect(urls).toContain("/api/v1");
    expect(urls).toContain("/api");
  });

  it("documents bearer-JWT auth", () => {
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  it("derives request-body schemas from the actual zod validators", () => {
    // Signup body mirrors signupSchema fields.
    const signup = doc.components.schemas.Signup;
    expect(signup.type).toBe("object");
    expect(signup.properties).toHaveProperty("email");
    expect(signup.properties).toHaveProperty("password");
    expect(signup.required).toContain("email");

    // CreateBooking reflects the CURRENT validator, including PAY-04's promoCode —
    // proof the doc tracks validator changes rather than a hand-copied shape.
    const booking = doc.components.schemas.CreateBooking;
    expect(booking.properties).toHaveProperty("promoCode");
    expect(booking.properties).toHaveProperty("tickets");

    // Converted schemas are OpenAPI-3.0 flavoured (no JSON-Schema $schema key).
    expect(signup).not.toHaveProperty("$schema");
  });

  it("marks the guest booking-code lookup as public and secures dashboard routes", () => {
    const publicGet = doc.paths["/bookings/code/{bookingCode}"].get;
    expect(publicGet.security).toBeUndefined();

    const securedGet = doc.paths["/user/me"].get;
    expect(securedGet.security).toEqual([{ bearerAuth: [] }]);
  });

  it("lists at least one endpoint for every documented area", () => {
    const tags = new Set(
      Object.values(doc.paths)
        .flatMap((item) => Object.values(item))
        .flatMap((op) => op.tags || [])
    );
    for (const area of ["Auth", "User", "Fests", "Events", "Bookings", "Role Requests"]) {
      expect(tags).toContain(area);
    }
  });

  it("has every $ref resolvable and every operation carrying responses", () => {
    for (const ref of collectRefs(doc.paths)) {
      expect(resolveRef(ref), `unresolved $ref ${ref}`).toBeTruthy();
    }
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        expect(op.responses, `${method.toUpperCase()} ${path} missing responses`).toBeTruthy();
        expect(Object.keys(op.responses).length).toBeGreaterThan(0);
      }
    }
  });
});
