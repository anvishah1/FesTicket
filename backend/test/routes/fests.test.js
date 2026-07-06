import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import { signToken } from "../helpers/auth.js";
import router from "../../src/routes/fests.js";

vi.mock("@prisma/client");

const app = makeApp(router, "/api/fests");

// Silence the route's console.error noise on the intentional error-path tests.
beforeEach(() => {
  resetPrismaMock();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const adminToken = () => signToken({ userId: 1, role: "ADMIN" });
const adminAuth = () => ["Authorization", `Bearer ${adminToken()}`];
const viewerAuth = () => ["Authorization", `Bearer ${signToken({ userId: 2, role: "VIEWER" })}`];

// ---------------------------------------------------------------------------
// GET /api/fests  (list, public, paginated)
// ---------------------------------------------------------------------------
describe("GET /api/fests", () => {
  it("returns paginated fests with default page/limit", async () => {
    const fests = [{ id: 1, name: "Fest A" }, { id: 2, name: "Fest B" }];
    prismaMock.fest.count.mockResolvedValue(3);
    prismaMock.fest.findMany.mockResolvedValue(fests);

    const res = await request(app).get("/api/fests");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
    expect(res.body.totalPages).toBe(1); // Math.ceil(3/10)
    // Also exposes the pagination envelope per the search/pagination contract.
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
    expect(res.body.data).toEqual(fests);

    expect(prismaMock.fest.count).toHaveBeenCalledWith({
      where: { isDeleted: false, events: { some: { visibility: "PUBLIC", status: "PUBLISHED" } } },
    });
    expect(prismaMock.fest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, events: { some: { visibility: "PUBLIC", status: "PUBLISHED" } } },
        skip: 0,
        take: 10,
        orderBy: { startDate: "desc" },
      })
    );
  });

  it("computes skip/take and totalPages from page & limit query params", async () => {
    prismaMock.fest.count.mockResolvedValue(12);
    prismaMock.fest.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/fests?page=2&limit=5");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
    expect(res.body.totalPages).toBe(3); // Math.ceil(12/5)
    expect(prismaMock.fest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }) // (2-1)*5
    );
  });

  it("caps limit at 50", async () => {
    prismaMock.fest.count.mockResolvedValue(0);
    prismaMock.fest.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/fests?limit=100");

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(50);
    expect(prismaMock.fest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it("falls back to defaults when page/limit are non-numeric", async () => {
    prismaMock.fest.count.mockResolvedValue(0);
    prismaMock.fest.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/fests?page=abc&limit=xyz");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
    expect(prismaMock.fest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 })
    );
  });

  it("applies a case-insensitive OR search on name/college and passes it to count & findMany", async () => {
    prismaMock.fest.count.mockResolvedValue(1);
    prismaMock.fest.findMany.mockResolvedValue([{ id: 1, name: "Tech Fest" }]);

    const res = await request(app).get("/api/fests?search=tech");

    expect(res.status).toBe(200);
    const expectedWhere = {
      isDeleted: false,
      events: { some: { visibility: "PUBLIC", status: "PUBLISHED" } },
      OR: [
        { name: { contains: "tech", mode: "insensitive" } },
        { college: { contains: "tech", mode: "insensitive" } },
      ],
    };
    expect(prismaMock.fest.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prismaMock.fest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("omits the OR search filter when no search term is provided", async () => {
    prismaMock.fest.count.mockResolvedValue(0);
    prismaMock.fest.findMany.mockResolvedValue([]);

    await request(app).get("/api/fests?search=%20%20");

    // Whitespace-only search trims to empty, so no OR clause is added.
    const noSearchWhere = { isDeleted: false, events: { some: { visibility: "PUBLIC", status: "PUBLISHED" } } };
    expect(prismaMock.fest.count).toHaveBeenCalledWith({ where: noSearchWhere });
    expect(prismaMock.fest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: noSearchWhere })
    );
  });

  it("still omits adminKey from listed fests on the public read", async () => {
    prismaMock.fest.count.mockResolvedValue(1);
    prismaMock.fest.findMany.mockResolvedValue([
      { id: 1, name: "Fest A", adminKey: "SECRET-KEY" },
    ]);

    const res = await request(app).get("/api/fests");

    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty("adminKey");
    expect(res.body.data[0]).toEqual({ id: 1, name: "Fest A" });
  });

  it("returns 500 with FETCH_ERROR when the query throws", async () => {
    prismaMock.fest.count.mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/fests");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch fests" },
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/fests/:id  (single, public)
// ---------------------------------------------------------------------------
describe("GET /api/fests/:id", () => {
  it("returns 400 INVALID_ID for a non-numeric id", async () => {
    const res = await request(app).get("/api/fests/not-a-number");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: "INVALID_ID", message: "Invalid fest ID" },
    });
    expect(prismaMock.fest.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 NOT_FOUND when the fest does not exist", async () => {
    prismaMock.fest.findFirst.mockResolvedValue(null);

    const res = await request(app).get("/api/fests/5");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Fest not found" },
    });
  });

  it("returns 404 for a soft-deleted fest (isDeleted:false is in the where)", async () => {
    // A soft-deleted fest is filtered out by the where clause, so findFirst
    // resolves null and the public detail path 404s.
    prismaMock.fest.findFirst.mockResolvedValue(null);

    const res = await request(app).get("/api/fests/5");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.fest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, isDeleted: false } })
    );
  });

  it("returns the fest with its events on success", async () => {
    const fest = { id: 5, name: "Fest A", events: [] };
    prismaMock.fest.findFirst.mockResolvedValue(fest);

    const res = await request(app).get("/api/fests/5");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: fest });
    expect(prismaMock.fest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, isDeleted: false } })
    );
  });

  it("only includes PUBLISHED + PUBLIC events on the public fest detail (hides DRAFT/PRIVATE)", async () => {
    prismaMock.fest.findFirst.mockResolvedValue({ id: 5, name: "Fest A", events: [] });

    await request(app).get("/api/fests/5");

    const arg = prismaMock.fest.findFirst.mock.calls[0][0];
    expect(arg.include.events.where).toEqual({ status: "PUBLISHED", visibility: "PUBLIC" });
  });

  it("returns 500 FETCH_ERROR when the query throws", async () => {
    prismaMock.fest.findFirst.mockRejectedValue(new Error("boom"));

    const res = await request(app).get("/api/fests/5");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ---------------------------------------------------------------------------
// POST /api/fests  (create, ADMIN only)
// ---------------------------------------------------------------------------
describe("POST /api/fests", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request(app)
      .post("/api/fests")
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("No token provided");
    expect(prismaMock.fest.create).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set("Authorization", "Bearer garbage")
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("returns 403 when the caller is not an ADMIN", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set(...viewerAuth())
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied");
    expect(prismaMock.fest.create).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when name is missing", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ college: "C" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Name and college are required" },
    });
    expect(prismaMock.fest.create).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when college is missing", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "F" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 INVALID_DATE for an unparseable date (both dates present)", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "F", college: "C", startDate: "not-a-date", endDate: "also-bad" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: "INVALID_DATE", message: "Invalid date format" },
    });
    expect(prismaMock.fest.create).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_DATE when the start date is in the past", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "F", college: "C", startDate: "2000-01-01", endDate: "2001-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "INVALID_DATE",
      message: "Start date cannot be in the past",
    });
  });

  it("returns 400 INVALID_DATE when the end date is before the start date", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "F", college: "C", startDate: "2999-06-01", endDate: "2999-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "INVALID_DATE",
      message: "End date must be after start date",
    });
  });

  it("skips date validation when only startDate is provided (both required) — quirk", async () => {
    prismaMock.fest.create.mockResolvedValue({ id: 1 });

    // A past start date that WOULD be rejected if endDate were also present.
    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "F", college: "C", startDate: "2000-01-01" });

    expect(res.status).toBe(201);
    expect(prismaMock.fest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startDate: new Date("2000-01-01"),
        endDate: null,
      }),
    });
  });

  it("creates a fest with null dates/description/image when only name+college given", async () => {
    const created = { id: 10, name: "Tech Fest", college: "MIT" };
    prismaMock.fest.create.mockResolvedValue(created);

    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "  Tech Fest  ", college: "  MIT  " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: created,
      message: "Fest created successfully",
    });
    expect(prismaMock.fest.create).toHaveBeenCalledWith({
      data: {
        name: "Tech Fest",
        college: "MIT",
        description: null,
        image: null,
        startDate: null,
        endDate: null,
      },
    });
  });

  it("trims/sanitizes fields and stores Date objects on the happy path", async () => {
    prismaMock.fest.create.mockResolvedValue({ id: 11 });

    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({
        name: "  Tech Fest  ",
        college: "  MIT  ",
        description: "  A great fest  ",
        image: "  http://img.png  ",
        startDate: "2999-01-01",
        endDate: "2999-02-01",
      });

    expect(res.status).toBe(201);
    expect(prismaMock.fest.create).toHaveBeenCalledWith({
      data: {
        name: "Tech Fest",
        college: "MIT",
        description: "A great fest",
        image: "http://img.png", // image is trimmed but NOT html-escaped
        startDate: new Date("2999-01-01"),
        endDate: new Date("2999-02-01"),
      },
    });
  });

  it("stores raw (un-escaped) text — no HTML-entity escaping at rest", async () => {
    prismaMock.fest.create.mockResolvedValue({ id: 12 });

    await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({
        name: "St. Xavier's Fest",
        college: "M&M",
        description: "<b>hi</b>",
      });

    // Text is stored verbatim (only trimmed). React escapes at render, so the DB
    // must hold the raw characters, not "&#x27;" / "&amp;" / "&lt;".
    const data = prismaMock.fest.create.mock.calls[0][0].data;
    expect(data.name).toBe("St. Xavier's Fest");
    expect(data.college).toBe("M&M");
    expect(data.description).toBe("<b>hi</b>");
  });

  // ---- M1: zod body validation rejects oversized/wrong-type input up front.
  // The inline "Name and college are required" check stays the gate for missing
  // fields; zod adds length/type caps and returns validate()'s unified envelope
  // { success:false, error:{ code, message, details }, requestId } (ARCH-01).
  it("returns 400 (zod) for an oversized name, before the handler runs", async () => {
    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "x".repeat(201), college: "C" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(prismaMock.fest.create).not.toHaveBeenCalled();
  });

  it("returns 500 CREATE_ERROR when create throws", async () => {
    prismaMock.fest.create.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .post("/api/fests")
      .set(...adminAuth())
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("CREATE_ERROR");
  });
});

// ---------------------------------------------------------------------------
// PUT /api/fests/:id  (update, ADMIN only)
// ---------------------------------------------------------------------------
describe("PUT /api/fests/:id", () => {
  beforeEach(() => prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 5 }));

  it("returns 403 for an admin who manages a different fest (cross-tenant)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 999 });
    const res = await request(app).put("/api/fests/5").set(...adminAuth()).send({ name: "F", college: "C" });
    expect(res.status).toBe(403);
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app)
      .put("/api/fests/5")
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(401);
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an ADMIN", async () => {
    const res = await request(app)
      .put("/api/fests/5")
      .set(...viewerAuth())
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(403);
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_ID for a non-numeric id", async () => {
    const res = await request(app)
      .put("/api/fests/abc")
      .set(...adminAuth())
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when name/college missing", async () => {
    const res = await request(app)
      .put("/api/fests/5")
      .set(...adminAuth())
      .send({ name: "F" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_DATE for unparseable dates", async () => {
    const res = await request(app)
      .put("/api/fests/5")
      .set(...adminAuth())
      .send({ name: "F", college: "C", startDate: "bad", endDate: "worse" });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "INVALID_DATE", message: "Invalid date format" });
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_DATE when end is before start", async () => {
    const res = await request(app)
      .put("/api/fests/5")
      .set(...adminAuth())
      .send({ name: "F", college: "C", startDate: "2999-06-01", endDate: "2999-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("End date must be after start date");
  });

  it("updates the fest and returns 200 on success", async () => {
    const updated = { id: 5, name: "New", college: "MIT" };
    prismaMock.fest.update.mockResolvedValue(updated);

    const res = await request(app)
      .put("/api/fests/5")
      .set(...adminAuth())
      .send({ name: "  New  ", college: "  MIT  " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: updated,
      message: "Fest updated successfully",
    });
    expect(prismaMock.fest.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        name: "New",
        college: "MIT",
        description: null,
        image: null,
        startDate: null,
        endDate: null,
      },
    });
  });

  it("returns 404 NOT_FOUND when Prisma throws P2025", async () => {
    prismaMock.fest.update.mockRejectedValue(
      Object.assign(new Error("record not found"), { code: "P2025" })
    );

    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 999 });
    const res = await request(app)
      .put("/api/fests/999")
      .set(...adminAuth())
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Fest not found" },
    });
  });

  it("returns 500 UPDATE_ERROR on a generic failure", async () => {
    prismaMock.fest.update.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .put("/api/fests/5")
      .set(...adminAuth())
      .send({ name: "F", college: "C" });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("UPDATE_ERROR");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/fests/:id  (soft-delete, ADMIN only)
// ---------------------------------------------------------------------------
describe("DELETE /api/fests/:id", () => {
  beforeEach(() => prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 5 }));

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).delete("/api/fests/5");

    expect(res.status).toBe(401);
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an ADMIN", async () => {
    const res = await request(app)
      .delete("/api/fests/5")
      .set(...viewerAuth());

    expect(res.status).toBe(403);
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_ID for a non-numeric id", async () => {
    const res = await request(app)
      .delete("/api/fests/abc")
      .set(...adminAuth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
    expect(prismaMock.fest.update).not.toHaveBeenCalled();
  });

  it("soft-deletes (isDeleted=true) and returns 200 on success", async () => {
    prismaMock.fest.update.mockResolvedValue({ id: 5, isDeleted: true });

    const res = await request(app)
      .delete("/api/fests/5")
      .set(...adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Fest archived successfully" });
    expect(prismaMock.fest.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isDeleted: true },
    });
  });

  it("returns 404 NOT_FOUND when Prisma throws P2025", async () => {
    prismaMock.fest.update.mockRejectedValue(
      Object.assign(new Error("record not found"), { code: "P2025" })
    );

    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 999 });
    const res = await request(app)
      .delete("/api/fests/999")
      .set(...adminAuth());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 500 DELETE_ERROR on a generic failure", async () => {
    prismaMock.fest.update.mockRejectedValue(new Error("db down"));

    const res = await request(app)
      .delete("/api/fests/5")
      .set(...adminAuth());

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DELETE_ERROR");
  });
});

// ---------------------------------------------------------------------------
// GET /api/fests/:festId/events  (events for a fest, public)
// ---------------------------------------------------------------------------
describe("GET /api/fests/:festId/events", () => {
  it("returns 400 INVALID_ID for a non-numeric festId", async () => {
    const res = await request(app).get("/api/fests/abc/events");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: "INVALID_ID", message: "Invalid fest ID" },
    });
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });

  it("returns the fest's events on success", async () => {
    const events = [{ id: 1, name: "E1" }, { id: 2, name: "E2" }];
    prismaMock.event.findMany.mockResolvedValue(events);

    const res = await request(app).get("/api/fests/7/events");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: events });
    // Public list must be scoped to PUBLISHED + PUBLIC events of a live fest only.
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          festId: 7,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          fest: { isDeleted: false },
        },
        orderBy: { startDate: "asc" },
      })
    );
  });

  it("excludes events belonging to a soft-deleted fest (relation filter -> empty)", async () => {
    // The DB returns no rows because the fest:{isDeleted:false} relation filter
    // excludes a soft-deleted parent fest, so the public sub-list is empty.
    prismaMock.event.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/fests/7/events");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fest: { isDeleted: false } }),
      })
    );
  });

  it("returns an empty list when the fest has no events", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/fests/7/events");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it("returns 500 FETCH_ERROR when the query throws", async () => {
    prismaMock.event.findMany.mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/fests/7/events");

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "FETCH_ERROR", message: "Failed to fetch events" });
  });
});
