import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import { signToken } from "../helpers/auth.js";
import router from "../../src/routes/events.js";

vi.mock("@prisma/client");

// Mock the file-storage util so tests never touch disk. saveDataUrl returns a
// deterministic /uploads URL for any inline base64 payload.
vi.mock("../../src/utils/storage.js", () => ({
  saveDataUrl: vi.fn(async (_dataUrl, opts) => ({
    url: "/uploads/mock-file.png",
    fileName: opts?.fileName || "mock-file.png",
    size: 123,
    mimeType: "image/png",
  })),
}));

const app = makeApp(router, "/api/events");

beforeEach(resetPrismaMock);

// ==================== GET /api/events ====================
// VIS-1: anonymous/cross-tenant callers only see PUBLISHED + PUBLIC events; a
// caller scoped to their own hostId or their own fest bypasses that filter.
describe("GET /api/events", () => {
  it("forces PUBLISHED+PUBLIC for an anonymous caller (no filters)", async () => {
    const events = [{ id: 1, name: "Event A" }];
    prismaMock.event.findMany.mockResolvedValue(events);
    prismaMock.event.count.mockResolvedValue(1);

    const res = await request(app).get("/api/events");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: events,
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });
    // public listing forces PUBLISHED+PUBLIC and excludes soft-deleted fests
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PUBLISHED",
          visibility: "PUBLIC",
          OR: [{ festId: null }, { fest: { isDeleted: false } }],
        },
        orderBy: { startDate: "asc" },
        skip: 0,
        take: 12,
      })
    );
  });

  it("applies search (name contains, case-insensitive), sort, and pagination", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.event.count.mockResolvedValue(30);

    const res = await request(app)
      .get("/api/events")
      .query({ search: "Rock", sort: "name", page: "2", limit: "10" });

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 30, totalPages: 3 });
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: "Rock", mode: "insensitive" },
        }),
        orderBy: { name: "asc" },
        skip: 10,
        take: 10,
      })
    );
    // count uses the same where clause as the list query
    expect(prismaMock.event.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: { contains: "Rock", mode: "insensitive" } }),
      })
    );
  });

  it("applies category/festId/hostId filters and still forces PUBLISHED+PUBLIC (anonymous)", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/events")
      .query({ status: "DRAFT", category: "Music", festId: "3", hostId: "4" });

    expect(res.status).toBe(200);
    // even a DRAFT status query is overridden to PUBLISHED+PUBLIC for anon callers
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category: "Music",
          festId: 3,
          hostId: 4,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          OR: [{ festId: null }, { fest: { isDeleted: false } }],
        },
      })
    );
  });

  it("lets a HOST scoped to their own hostId see their DRAFT/PRIVATE events (bypass filter)", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/events")
      .query({ hostId: "50", status: "DRAFT" })
      .set("Authorization", `Bearer ${signToken({ userId: 50, role: "HOST" })}`);

    expect(res.status).toBe(200);
    // no forced visibility filter; the caller's own status query is honoured
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hostId: 50, status: "DRAFT" } })
    );
  });

  it("lets an ADMIN scoped to their managed fest see non-public events (bypass filter)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.event.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/events")
      .query({ festId: "7" })
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`);

    expect(res.status).toBe(200);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { festId: 7 } })
    );
  });

  it("still forces the public filter for a caller asking about a fest they do not own", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 8, editorFestId: null });
    prismaMock.event.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/events")
      .query({ festId: "7" })
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`);

    expect(res.status).toBe(200);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          festId: 7,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          OR: [{ festId: null }, { fest: { isDeleted: false } }],
        },
      })
    );
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.event.findMany.mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/events");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: "FETCH_ERROR", message: "Failed to fetch events" },
    });
  });
});

// ==================== GET /api/events/:id ====================
describe("GET /api/events/:id", () => {
  it("returns 200 with a PUBLISHED+PUBLIC event for an anonymous caller", async () => {
    const event = { id: 5, name: "Solo", status: "PUBLISHED", visibility: "PUBLIC" };
    prismaMock.event.findUnique.mockResolvedValue(event);

    const res = await request(app).get("/api/events/5");

    expect(res.status).toBe(200);
    // a PUBLISHED event with no dates derives effectiveStatus UPCOMING
    expect(res.body).toEqual({ success: true, data: { ...event, effectiveStatus: "UPCOMING" } });
    expect(prismaMock.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 } })
    );
  });

  it("VIS-1: returns 404 for a DRAFT event to an anonymous caller (existence not leaked)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      name: "Secret",
      status: "DRAFT",
      visibility: "PUBLIC",
      hostId: 10,
      festId: 7,
    });
    const res = await request(app).get("/api/events/5");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("VIS-1: returns 404 for a PRIVATE event to a non-owner", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      status: "PUBLISHED",
      visibility: "PRIVATE",
      hostId: 999,
      festId: 7,
    });
    const res = await request(app)
      .get("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 10, role: "HOST" })}`);
    expect(res.status).toBe(404);
  });

  it("VIS-1: lets the owning host see their own DRAFT event", async () => {
    const event = { id: 5, name: "Draft", status: "DRAFT", visibility: "PRIVATE", hostId: 10, festId: 7 };
    prismaMock.event.findUnique.mockResolvedValue(event);
    const res = await request(app)
      .get("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 10, role: "HOST" })}`);
    expect(res.status).toBe(200);
    // DRAFT is returned unchanged as the effectiveStatus (no lifecycle derivation)
    expect(res.body.data).toEqual({ ...event, effectiveStatus: "DRAFT" });
  });

  it("VIS-1: lets an ADMIN of the event's fest see a non-public event", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      status: "DRAFT",
      visibility: "PUBLIC",
      hostId: 999,
      festId: 7,
    });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    const res = await request(app)
      .get("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
  });

  it("LEAK-1: selects only safe fest columns (no adminKey) and safe host columns", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 5, status: "PUBLISHED", visibility: "PUBLIC" });
    await request(app).get("/api/events/5");
    const arg = prismaMock.event.findUnique.mock.calls[0][0];
    // fest is a bounded select (never `fest: true`) and omits adminKey
    expect(arg.include.fest.select).toBeDefined();
    expect(arg.include.fest.select.adminKey).toBeUndefined();
    expect(arg.include.fest.select.name).toBe(true);
    // host select never exposes password/token columns
    expect(arg.include.host.select).toEqual({ id: true, name: true, email: true });
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/api/events/999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Event not found" },
    });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.event.findUnique.mockRejectedValue(new Error("boom"));

    const res = await request(app).get("/api/events/5");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== POST /api/events ====================
// POST now requires authenticateUser + authorizeRoles("EDITOR","HOST","ADMIN").
// hostId is always taken from the token (any body hostId is ignored), and a
// supplied festId must be the caller's own fest (resolved via user.findUnique).
describe("POST /api/events", () => {
  const hostToken = signToken({ userId: 50, role: "HOST" });
  const hostAuth = ["Authorization", `Bearer ${hostToken}`];

  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/events").send({ name: "X", festId: 1 });
    expect(res.status).toBe(401);
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a VIEWER (role not allowed to create events)", async () => {
    const res = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${signToken({ userId: 5, role: "VIEWER" })}`)
      .send({ name: "X" });
    expect(res.status).toBe(403);
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app).post("/api/events").set(...hostAuth).send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Event name is required" },
    });
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("creates an event (201) with hostId from the token and encodes the field-mapping quirks", async () => {
    // HOST owns editorFestId; the requested festId must match it.
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: null, editorFestId: 3 });
    prismaMock.event.create.mockResolvedValue({ id: 100 });
    prismaMock.event.findUnique.mockResolvedValue({ id: 100, name: "My Event", ticketTypes: [] });

    const res = await request(app).post("/api/events").set(...hostAuth).send({
      festId: "3",
      hostId: 999, // must be ignored in favour of the token
      name: "My Event",
      description: "desc",
      audience: "Everyone",
      address: "123 St",
      eventType: "ONLINE",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { id: 100, name: "My Event", ticketTypes: [] },
      message: "Event created successfully",
    });
    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        festId: 3,
        // hostId comes from the token (50), NOT the body hostId (999)
        hostId: 50,
        name: "My Event",
        description: "desc",
        // aboutEvent stays null (not sent); audience now has its own column
        aboutEvent: null,
        audience: "Everyone",
        // venueAddress falls back to `address`
        venueAddress: "123 St",
        // isOnline is derived from eventType === "ONLINE"
        isOnline: true,
        visibility: "PUBLIC",
        status: "PUBLISHED",
        discount: 0,
      }),
    });
    // no ticket types provided -> createMany not called
    expect(prismaMock.ticketType.createMany).not.toHaveBeenCalled();
  });

  it("creates ticket types in the transaction when provided", async () => {
    prismaMock.event.create.mockResolvedValue({ id: 100 });
    prismaMock.ticketType.createMany.mockResolvedValue({ count: 1 });
    prismaMock.event.findUnique.mockResolvedValue({ id: 100, ticketTypes: [{ id: 1 }] });

    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({
        name: "With Tickets",
        ticketTypes: [{ name: "VIP", price: "100", quantity: "5", description: "d" }],
      });

    expect(res.status).toBe(201);
    expect(prismaMock.ticketType.createMany).toHaveBeenCalledWith({
      data: [
        { eventId: 100, name: "VIP", price: 100, quantity: 5, description: "d" },
      ],
    });
  });

  it("persists startTime, endTime, and each ticket's description", async () => {
    prismaMock.event.create.mockResolvedValue({ id: 101 });
    prismaMock.ticketType.createMany.mockResolvedValue({ count: 1 });
    prismaMock.event.findUnique.mockResolvedValue({ id: 101, ticketTypes: [] });

    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({
        name: "Timed Event",
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        startTime: "14:30",
        endTime: "18:00",
        ticketTypes: [
          { name: "VIP", price: "100", quantity: "5", description: "Front row" },
        ],
      });

    expect(res.status).toBe(201);
    // start/end time are whitelisted onto the event row
    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Timed Event",
        startTime: "14:30",
        endTime: "18:00",
      }),
    });
    // ticket description is persisted via createMany
    expect(prismaMock.ticketType.createMany).toHaveBeenCalledWith({
      data: [
        { eventId: 101, name: "VIP", price: 100, quantity: 5, description: "Front row" },
      ],
    });
  });

  it("derives hostId from the token and ignores any body hostId (HOST)", async () => {
    prismaMock.event.create.mockResolvedValue({ id: 102 });
    prismaMock.event.findUnique.mockResolvedValue({ id: 102 });

    const res = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${signToken({ userId: 7, role: "HOST" })}`)
      .send({ name: "Owned2", hostId: 999 });

    expect(res.status).toBe(201);
    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hostId: 7 }),
    });
  });

  it("sets hostId to the ADMIN's own userId when no fest is supplied", async () => {
    prismaMock.event.create.mockResolvedValue({ id: 103 });
    prismaMock.event.findUnique.mockResolvedValue({ id: 103 });

    const res = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${signToken({ userId: 99, role: "ADMIN" })}`)
      .send({ name: "AdminEvent" }); // no festId

    expect(res.status).toBe(201);
    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hostId: 99 }),
    });
  });

  it("returns 403 when the festId is not the caller's fest", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: null, editorFestId: 99 });

    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({ name: "Wrong Fest", festId: "3" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("returns 500 (with details) when creation throws", async () => {
    prismaMock.event.create.mockRejectedValue(new Error("insert failed"));

    const res = await request(app).post("/api/events").set(...hostAuth).send({ name: "Boom" });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("CREATE_ERROR");
    expect(res.body.error.details).toBe("insert failed");
  });
});

// ==================== M1: zod body validation (defense-in-depth) ====================
// The route's own inline checks stay the primary gate (they keep the
// {success,error} envelope); zod rejects genuinely malformed/oversized/wrong-type
// bodies up front with validate()'s { message, errors } shape.
describe("M1 zod validation", () => {
  const hostAuth = ["Authorization", `Bearer ${signToken({ userId: 50, role: "HOST" })}`];

  it("rejects a non-whitelisted event status before the handler runs", async () => {
    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({ name: "X", status: "BOGUS" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("rejects an oversized event name", async () => {
    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({ name: "x".repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("rejects a wrong-type ticket-type name before ownership is checked", async () => {
    const res = await request(app)
      .post("/api/events/5/ticket-types")
      .set(...hostAuth)
      .send({ name: 123, price: 1, quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.ticketType.create).not.toHaveBeenCalled();
  });
});

// ==================== PUT /api/events/:id (auth + ownership) ====================
describe("PUT /api/events/:id", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });

  it("returns 401 without a token", async () => {
    const res = await request(app).put("/api/events/5").send({ name: "X" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "X" });
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: "NOT_FOUND", message: "Event not found" });
  });

  it("returns 403 when a non-owner non-admin tries to update", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999 });
    const res = await request(app)
      .put("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "X" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 200 when the owner updates", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 10 });
    const updated = { id: 5, name: "Updated" };
    prismaMock.event.update.mockResolvedValue(updated);

    const res = await request(app)
      .put("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: updated,
      message: "Event updated successfully",
    });
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 } })
    );
  });

  it("allows an ADMIN of the event's fest to update it", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.event.update.mockResolvedValue({ id: 5, name: "A" });
    const res = await request(app)
      .put("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`)
      .send({ name: "A" });
    expect(res.status).toBe(200);
  });

  it("returns 403 for an ADMIN of a different fest (tenant scoping)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 8, editorFestId: null });
    const res = await request(app)
      .put("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`)
      .send({ name: "A" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it("returns 404 when Prisma throws P2025 on update", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 10 });
    const err = new Error("no record");
    err.code = "P2025";
    prismaMock.event.update.mockRejectedValue(err);

    const res = await request(app)
      .put("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "X" });

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: "NOT_FOUND", message: "Event not found" });
  });

  it("returns 500 on other errors", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 10 });
    prismaMock.event.update.mockRejectedValue(new Error("db"));

    const res = await request(app)
      .put("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "X" });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("UPDATE_ERROR");
  });
});

// ==================== DELETE /api/events/:id (auth + ownership) ====================
describe("DELETE /api/events/:id", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });

  it("returns 401 without a token", async () => {
    const res = await request(app).delete("/api/events/5");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 for a non-owner non-admin", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999 });
    const res = await request(app)
      .delete("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 200 when the owner deletes", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 10 });
    prismaMock.event.delete.mockResolvedValue({ id: 5 });

    const res = await request(app)
      .delete("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Event deleted successfully" });
    expect(prismaMock.event.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("allows an ADMIN of the event's fest to delete it", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.event.delete.mockResolvedValue({ id: 5 });
    const res = await request(app)
      .delete("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
  });

  it("returns 403 for an ADMIN of a different fest (tenant scoping)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 8, editorFestId: null });
    const res = await request(app)
      .delete("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`);
    expect(res.status).toBe(403);
    expect(prismaMock.event.delete).not.toHaveBeenCalled();
  });

  it("returns 500 on other errors", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 10 });
    prismaMock.event.delete.mockRejectedValue(new Error("db"));

    const res = await request(app)
      .delete("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DELETE_ERROR");
  });
});

// ==================== GET /api/events/:id/ticket-types ====================
describe("GET /api/events/:id/ticket-types", () => {
  // L1: the endpoint now loads the event first and hides ticket types for a
  // non-public event, so a PUBLISHED+PUBLIC event must be stubbed.
  const publicEvent = () =>
    prismaMock.event.findUnique.mockResolvedValue({
      status: "PUBLISHED",
      visibility: "PUBLIC",
      hostId: 1,
      festId: 1,
      fest: { isDeleted: false },
    });

  it("returns 200 with ticket types ordered by price", async () => {
    publicEvent();
    const tts = [{ id: 1, price: 50 }];
    prismaMock.ticketType.findMany.mockResolvedValue(tts);

    const res = await request(app).get("/api/events/5/ticket-types");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: tts });
    expect(prismaMock.ticketType.findMany).toHaveBeenCalledWith({
      where: { eventId: 5 },
      orderBy: { price: "asc" },
    });
  });

  it("returns 404 for a DRAFT/PRIVATE event to an anonymous caller", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      status: "DRAFT",
      visibility: "PRIVATE",
      hostId: 1,
      festId: 1,
      fest: { isDeleted: false },
    });
    const res = await request(app).get("/api/events/5/ticket-types");
    expect(res.status).toBe(404);
    expect(prismaMock.ticketType.findMany).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    publicEvent();
    prismaMock.ticketType.findMany.mockRejectedValue(new Error("db"));

    const res = await request(app).get("/api/events/5/ticket-types");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== POST /api/events/:id/ticket-types ====================
describe("POST /api/events/:id/ticket-types", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });
  const asOwner = () => prismaMock.event.findUnique.mockResolvedValue({ hostId: 10 });

  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/events/5/ticket-types").send({ name: "VIP", price: 100, quantity: 10 });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${ownerToken}`).send({ name: "VIP", price: 100, quantity: 10 });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-owner non-admin", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999 });
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${ownerToken}`).send({ name: "VIP", price: 100, quantity: 10 });
    expect(res.status).toBe(403);
    expect(prismaMock.ticketType.create).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    asOwner();
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${ownerToken}`).send({ price: 100, quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.ticketType.create).not.toHaveBeenCalled();
  });

  it("returns 400 when quantity is missing (falsy)", async () => {
    asOwner();
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${ownerToken}`).send({ name: "VIP", price: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a negative price", async () => {
    asOwner();
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${ownerToken}`).send({ name: "VIP", price: -5, quantity: 10 });
    expect(res.status).toBe(400);
    expect(prismaMock.ticketType.create).not.toHaveBeenCalled();
  });

  it("allows price 0 for the owner", async () => {
    asOwner();
    const created = { id: 1, name: "Free", price: 0, quantity: 10 };
    prismaMock.ticketType.create.mockResolvedValue(created);
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${ownerToken}`).send({ name: "Free", price: 0, quantity: 10 });
    expect(res.status).toBe(201);
    expect(prismaMock.ticketType.create).toHaveBeenCalledWith({
      data: { eventId: 5, name: "Free", price: 0, quantity: 10, description: undefined },
    });
  });

  it("allows an ADMIN of the event's fest to add a ticket type", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.ticketType.create.mockResolvedValue({ id: 2 });
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`).send({ name: "V", price: 1, quantity: 1 });
    expect(res.status).toBe(201);
  });

  it("returns 403 for an ADMIN of a different fest (tenant scoping)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 8, editorFestId: null });
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`).send({ name: "V", price: 1, quantity: 1 });
    expect(res.status).toBe(403);
    expect(prismaMock.ticketType.create).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    asOwner();
    prismaMock.ticketType.create.mockRejectedValue(new Error("db"));
    const res = await request(app).post("/api/events/5/ticket-types").set("Authorization", `Bearer ${ownerToken}`).send({ name: "VIP", price: 100, quantity: 10 });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("CREATE_ERROR");
  });
});

// ==================== PUT /api/events/:eventId/ticket-types/:ticketId ====================
describe("PUT /api/events/:eventId/ticket-types/:ticketId", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });
  const asOwner = () => prismaMock.ticketType.findUnique.mockResolvedValue({ eventId: 5, event: { hostId: 10 } });

  it("returns 401 without a token", async () => {
    const res = await request(app).put("/api/events/5/ticket-types/9").send({ price: 0 });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the ticket type does not exist", async () => {
    prismaMock.ticketType.findUnique.mockResolvedValue(null);
    const res = await request(app).put("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`).send({ price: 0 });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the ticket belongs to a different event", async () => {
    prismaMock.ticketType.findUnique.mockResolvedValue({ eventId: 77, event: { hostId: 10 } });
    const res = await request(app).put("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`).send({ price: 0 });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-owner non-admin (blocks price tampering)", async () => {
    prismaMock.ticketType.findUnique.mockResolvedValue({ eventId: 5, event: { hostId: 999 } });
    const res = await request(app).put("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`).send({ price: 0 });
    expect(res.status).toBe(403);
    expect(prismaMock.ticketType.update).not.toHaveBeenCalled();
  });

  it("rejects a negative price", async () => {
    asOwner();
    const res = await request(app).put("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`).send({ price: -1 });
    expect(res.status).toBe(400);
    expect(prismaMock.ticketType.update).not.toHaveBeenCalled();
  });

  it("returns 200 on successful update by the owner", async () => {
    asOwner();
    const updated = { id: 9, name: "New" };
    prismaMock.ticketType.update.mockResolvedValue(updated);
    const res = await request(app).put("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`).send({ name: "New", price: 150, quantity: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: updated, message: "Ticket type updated successfully" });
    expect(prismaMock.ticketType.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { name: "New", price: 150, quantity: 20, description: undefined },
    });
  });

  it("returns 500 when the database throws", async () => {
    asOwner();
    prismaMock.ticketType.update.mockRejectedValue(new Error("db"));
    const res = await request(app).put("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`).send({ name: "New" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("UPDATE_ERROR");
  });
});

// ==================== DELETE /api/events/:eventId/ticket-types/:ticketId ====================
describe("DELETE /api/events/:eventId/ticket-types/:ticketId", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });
  const asOwner = () => prismaMock.ticketType.findUnique.mockResolvedValue({ eventId: 5, event: { hostId: 10 } });

  it("returns 401 without a token", async () => {
    const res = await request(app).delete("/api/events/5/ticket-types/9");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-owner non-admin", async () => {
    prismaMock.ticketType.findUnique.mockResolvedValue({ eventId: 5, event: { hostId: 999 } });
    const res = await request(app).delete("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
    expect(prismaMock.ticketType.delete).not.toHaveBeenCalled();
  });

  it("returns 200 on successful delete by the owner", async () => {
    asOwner();
    prismaMock.ticketType.delete.mockResolvedValue({ id: 9 });
    const res = await request(app).delete("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Ticket type deleted successfully" });
    expect(prismaMock.ticketType.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it("returns 500 when the database throws", async () => {
    asOwner();
    prismaMock.ticketType.delete.mockRejectedValue(new Error("db"));
    const res = await request(app).delete("/api/events/5/ticket-types/9").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DELETE_ERROR");
  });
});

// ==================== GET /api/events/host/:hostId ====================
describe("GET /api/events/host/:hostId", () => {
  it("returns 200, but scopes an anonymous caller to PUBLISHED+PUBLIC events (M1)", async () => {
    const events = [{ id: 1 }];
    prismaMock.event.findMany.mockResolvedValue(events);

    const res = await request(app).get("/api/events/host/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: events });
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostId: 42, status: "PUBLISHED", visibility: "PUBLIC" },
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("shows the host their own DRAFT/PRIVATE events (no visibility filter) (M1)", async () => {
    prismaMock.event.findMany.mockResolvedValue([{ id: 1 }]);
    const res = await request(app)
      .get("/api/events/host/42")
      .set("Authorization", `Bearer ${signToken({ userId: 42, role: "HOST" })}`);
    expect(res.status).toBe(200);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hostId: 42 } })
    );
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.event.findMany.mockRejectedValue(new Error("db"));

    const res = await request(app).get("/api/events/host/42");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== GET /api/events/:id/buyers ====================
// Now requires auth + event ownership (host, or ADMIN of the event's fest).
describe("GET /api/events/:id/buyers", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });
  const ownerAuth = ["Authorization", `Bearer ${ownerToken}`];
  const asOwner = () => prismaMock.event.findUnique.mockResolvedValue({ hostId: 10, festId: 7 });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/events/5/buyers");
    expect(res.status).toBe(401);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/events/5/buyers").set(...ownerAuth);
    expect(res.status).toBe(404);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-owner non-admin", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    const res = await request(app).get("/api/events/5/buyers").set(...ownerAuth);
    expect(res.status).toBe(403);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with COMPLETED bookings formatted for the dashboard (owner)", async () => {
    asOwner();
    const bookings = [
      {
        id: 10,
        bookingCode: "BK-1",
        user: { id: 1, name: "Alice", email: "a@x.com", phone: "111" },
        guestName: null,
        guestEmail: null,
        guestPhone: null,
        items: [
          { quantity: 2, ticketType: { name: "VIP", price: 100 } },
          { quantity: 1, ticketType: { name: "GA", price: 50 } },
        ],
        attendees: [{ id: 1 }],
        total: 250,
        purchaseDate: "2024-01-01T00:00:00.000Z",
      },
      {
        id: 11,
        bookingCode: "BK-2",
        user: null,
        guestName: "Bob",
        guestEmail: "bob@x.com",
        guestPhone: "222",
        items: [{ quantity: 3, ticketType: { name: "GA", price: 50 } }],
        attendees: [],
        total: 150,
        purchaseDate: "2024-02-01T00:00:00.000Z",
      },
    ];
    prismaMock.booking.findMany.mockResolvedValue(bookings);

    const res = await request(app).get("/api/events/5/buyers").set(...ownerAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 5, status: "COMPLETED" },
      })
    );
    expect(res.body).toEqual({
      success: true,
      data: [
        {
          id: 10,
          bookingId: "BK-1",
          name: "Alice",
          email: "a@x.com",
          phone: "111",
          ticketType: "VIP, GA",
          quantity: 3,
          amountPaid: 250,
          purchaseDate: "2024-01-01T00:00:00.000Z",
          attendees: [{ id: 1 }],
        },
        {
          id: 11,
          bookingId: "BK-2",
          name: "Bob",
          email: "bob@x.com",
          phone: "222",
          ticketType: "GA",
          quantity: 3,
          amountPaid: 150,
          purchaseDate: "2024-02-01T00:00:00.000Z",
          attendees: [],
        },
      ],
    });
  });

  it("allows an ADMIN of the event's fest", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.booking.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/events/5/buyers")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it("returns 500 when the database throws", async () => {
    asOwner();
    prismaMock.booking.findMany.mockRejectedValue(new Error("db"));

    const res = await request(app).get("/api/events/5/buyers").set(...ownerAuth);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== GET /api/events/:id/stats ====================
// Now requires auth + event ownership (host, or ADMIN of the event's fest).
describe("GET /api/events/:id/stats", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });
  const ownerAuth = ["Authorization", `Bearer ${ownerToken}`];

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/events/5/stats");
    expect(res.status).toBe(401);
    expect(prismaMock.booking.aggregate).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-owner non-admin", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 5, hostId: 999, festId: 7, ticketTypes: [] });
    const res = await request(app).get("/api/events/5/stats").set(...ownerAuth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.booking.aggregate).not.toHaveBeenCalled();
  });

  it("returns 200 with aggregated stats (owner)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      hostId: 10,
      festId: 7,
      ticketTypes: [
        { name: "VIP", price: 100, quantity: 100, sold: 20 },
        { name: "GA", price: 50, quantity: 50, sold: 10 },
      ],
    });
    prismaMock.booking.aggregate.mockResolvedValue({ _sum: { total: 5000 }, _count: 12 });

    const res = await request(app).get("/api/events/5/stats").set(...ownerAuth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        totalTickets: 150,
        ticketsSold: 30,
        ticketsAvailable: 120,
        totalRevenue: 5000,
        totalBookings: 12,
        ticketTypes: [
          { name: "VIP", price: 100, quantity: 100, sold: 20, available: 80 },
          { name: "GA", price: 50, quantity: 50, sold: 10, available: 40 },
        ],
      },
    });
    expect(prismaMock.booking.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 5, status: "COMPLETED" },
      })
    );
  });

  it("defaults totalRevenue to 0 when _sum.total is null", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 5, hostId: 10, festId: 7, ticketTypes: [] });
    prismaMock.booking.aggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 });

    const res = await request(app).get("/api/events/5/stats").set(...ownerAuth);

    expect(res.status).toBe(200);
    expect(res.body.data.totalRevenue).toBe(0);
    expect(res.body.data.totalTickets).toBe(0);
  });

  it("allows an ADMIN of the event's fest", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 5, hostId: 999, festId: 7, ticketTypes: [] });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.booking.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: 0 });
    const res = await request(app)
      .get("/api/events/5/stats")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/api/events/999/stats").set(...ownerAuth);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.booking.aggregate).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.event.findUnique.mockRejectedValue(new Error("db"));

    const res = await request(app).get("/api/events/5/stats").set(...ownerAuth);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

// ==================== MARKETING: SPONSORS ====================
// All /api/events/marketing/* routes now require auth (router.use). Host routes
// require hostId === caller; fest routes require the fest to be the caller's
// managed/editor fest (resolved via prisma.user.findUnique -> callerFests()).
const mktToken = signToken({ userId: 42, role: "HOST" });
const mktAuth = ["Authorization", `Bearer ${mktToken}`];
const asFest = (fid) => prismaMock.user.findUnique.mockResolvedValue({ managedFestId: fid, editorFestId: null });

describe("GET /api/events/marketing/host/:hostId/sponsors", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/events/marketing/host/42/sponsors");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a different host (cross-tenant)", async () => {
    const res = await request(app).get("/api/events/marketing/host/999/sponsors").set(...mktAuth);
    expect(res.status).toBe(403);
  });

  it("returns 200 with sponsors for the host", async () => {
    const sponsors = [{ id: 1, companyName: "Acme" }];
    prismaMock.sponsor.findMany.mockResolvedValue(sponsors);
    const res = await request(app).get("/api/events/marketing/host/42/sponsors").set(...mktAuth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: sponsors });
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.sponsor.findMany.mockRejectedValue(new Error("db"));
    const res = await request(app).get("/api/events/marketing/host/42/sponsors").set(...mktAuth);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("FETCH_ERROR");
  });
});

describe("GET /api/events/marketing/fest/:festId/sponsors", () => {
  it("returns 403 when the fest is not the caller's", async () => {
    asFest(999);
    const res = await request(app).get("/api/events/marketing/fest/7/sponsors").set(...mktAuth);
    expect(res.status).toBe(403);
  });

  it("returns 200 with sponsors linked to the caller's fest", async () => {
    asFest(7);
    const sponsors = [{ id: 2 }];
    prismaMock.sponsor.findMany.mockResolvedValue(sponsors);
    const res = await request(app).get("/api/events/marketing/fest/7/sponsors").set(...mktAuth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: sponsors });
  });

  it("returns 500 when the database throws", async () => {
    asFest(7);
    prismaMock.sponsor.findMany.mockRejectedValue(new Error("db"));
    const res = await request(app).get("/api/events/marketing/fest/7/sponsors").set(...mktAuth);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/events/marketing/host/:hostId/sponsors", () => {
  it("returns 400 when companyName or contactPerson missing", async () => {
    const res = await request(app).post("/api/events/marketing/host/42/sponsors").set(...mktAuth).send({ companyName: "Acme" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.sponsor.create).not.toHaveBeenCalled();
  });

  it("creates a sponsor (201) with defaults applied", async () => {
    asFest(7); // H1: caller must manage the target fest
    const created = { id: 3, companyName: "Acme" };
    prismaMock.sponsor.create.mockResolvedValue(created);
    const res = await request(app).post("/api/events/marketing/host/42/sponsors").set(...mktAuth).send({ companyName: "Acme", contactPerson: "Jane", festId: "7" });
    expect(res.status).toBe(201);
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ festId: 7, companyName: "Acme", contactPerson: "Jane" }),
    });
  });

  it("forbids creating a sponsor in a fest the caller does not manage (H1)", async () => {
    asFest(7); // caller manages fest 7 only...
    const res = await request(app)
      .post("/api/events/marketing/host/42/sponsors")
      .set(...mktAuth)
      .send({ companyName: "Acme", contactPerson: "Jane", festId: "1" }); // ...but targets fest 1
    expect(res.status).toBe(403);
    expect(prismaMock.sponsor.create).not.toHaveBeenCalled();
  });

  it("forbids creating a sponsor with no fest/event (H1)", async () => {
    asFest(7);
    const res = await request(app)
      .post("/api/events/marketing/host/42/sponsors")
      .set(...mktAuth)
      .send({ companyName: "Acme", contactPerson: "Jane" });
    expect(res.status).toBe(403);
    expect(prismaMock.sponsor.create).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    asFest(7);
    prismaMock.sponsor.create.mockRejectedValue(new Error("db"));
    const res = await request(app).post("/api/events/marketing/host/42/sponsors").set(...mktAuth).send({ companyName: "Acme", contactPerson: "Jane", festId: "7" });
    expect(res.status).toBe(500);
  });
});

// IDOR-1: sponsor PUT/DELETE now load the row and verify the caller owns its
// fest (or is the host of its event) before mutating.
const ownSponsor = (festId = 7) => {
  prismaMock.sponsor.findUnique.mockResolvedValue({ festId, event: null });
  prismaMock.user.findUnique.mockResolvedValue({ managedFestId: festId, editorFestId: null });
};
const foreignSponsor = () => {
  prismaMock.sponsor.findUnique.mockResolvedValue({ festId: 999, event: null });
  prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
};

describe("PUT /api/events/marketing/sponsors/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).put("/api/events/marketing/sponsors/3").send({ companyName: "X" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a VIEWER (finance data is off-limits to viewers)", async () => {
    const res = await request(app)
      .put("/api/events/marketing/sponsors/3")
      .set("Authorization", `Bearer ${signToken({ userId: 42, role: "VIEWER" })}`)
      .send({ companyName: "X" });
    expect(res.status).toBe(403);
    expect(prismaMock.sponsor.update).not.toHaveBeenCalled();
  });

  it("returns 400 when companyName is explicitly blank", async () => {
    const res = await request(app).put("/api/events/marketing/sponsors/3").set(...mktAuth).send({ companyName: "   ", contactPerson: "Jane" });
    expect(res.status).toBe(400);
    expect(prismaMock.sponsor.update).not.toHaveBeenCalled();
  });

  it("IDOR-1: returns 403 when a non-owner tries to update a sponsor in another fest", async () => {
    foreignSponsor();
    const res = await request(app).put("/api/events/marketing/sponsors/3").set(...mktAuth).send({ companyName: "Hacked" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.sponsor.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the sponsor does not exist", async () => {
    prismaMock.sponsor.findUnique.mockResolvedValue(null);
    const res = await request(app).put("/api/events/marketing/sponsors/3").set(...mktAuth).send({ companyName: "X" });
    expect(res.status).toBe(404);
    expect(prismaMock.sponsor.update).not.toHaveBeenCalled();
  });

  it("returns 200 on successful update by an owner", async () => {
    ownSponsor(7);
    const updated = { id: 3, companyName: "AcmeCo" };
    prismaMock.sponsor.update.mockResolvedValue(updated);
    const res = await request(app).put("/api/events/marketing/sponsors/3").set(...mktAuth).send({ companyName: "AcmeCo", sponsorshipAmount: "500" });
    expect(res.status).toBe(200);
    expect(prismaMock.sponsor.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: expect.objectContaining({ sponsorshipAmount: 500 }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    ownSponsor(7);
    prismaMock.sponsor.update.mockRejectedValue(new Error("db"));
    const res = await request(app).put("/api/events/marketing/sponsors/3").set(...mktAuth).send({ companyName: "X" });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/events/marketing/sponsors/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).delete("/api/events/marketing/sponsors/3");
    expect(res.status).toBe(401);
  });

  it("IDOR-1: returns 403 when a non-owner tries to delete a sponsor in another fest", async () => {
    foreignSponsor();
    const res = await request(app).delete("/api/events/marketing/sponsors/3").set(...mktAuth);
    expect(res.status).toBe(403);
    expect(prismaMock.sponsor.delete).not.toHaveBeenCalled();
  });

  it("returns 200 on successful delete by an owner", async () => {
    ownSponsor(7);
    prismaMock.sponsor.delete.mockResolvedValue({ id: 3 });
    const res = await request(app).delete("/api/events/marketing/sponsors/3").set(...mktAuth);
    expect(res.status).toBe(200);
    expect(prismaMock.sponsor.delete).toHaveBeenCalledWith({ where: { id: 3 } });
  });

  it("returns 500 when the database throws", async () => {
    ownSponsor(7);
    prismaMock.sponsor.delete.mockRejectedValue(new Error("db"));
    const res = await request(app).delete("/api/events/marketing/sponsors/3").set(...mktAuth);
    expect(res.status).toBe(500);
  });
});

// ==================== MARKETING: EXPENSES ====================
describe("GET /api/events/marketing/host/:hostId/expenses", () => {
  it("returns 200 with expenses for the host", async () => {
    const expenses = [{ id: 1 }];
    prismaMock.expense.findMany.mockResolvedValue(expenses);
    const res = await request(app).get("/api/events/marketing/host/42/expenses").set(...mktAuth);
    expect(res.status).toBe(200);
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { hostId: 42 } }));
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.expense.findMany.mockRejectedValue(new Error("db"));
    const res = await request(app).get("/api/events/marketing/host/42/expenses").set(...mktAuth);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/events/marketing/fest/:festId/expenses", () => {
  it("returns 403 when the fest is not the caller's", async () => {
    asFest(999);
    const res = await request(app).get("/api/events/marketing/fest/7/expenses").set(...mktAuth);
    expect(res.status).toBe(403);
  });

  it("returns 200 with expenses for the caller's fest", async () => {
    asFest(7);
    const expenses = [{ id: 2 }];
    prismaMock.expense.findMany.mockResolvedValue(expenses);
    const res = await request(app).get("/api/events/marketing/fest/7/expenses").set(...mktAuth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: expenses });
  });

  it("LEAK-1: includes host/fest via bounded selects (no password, no adminKey)", async () => {
    asFest(7);
    prismaMock.expense.findMany.mockResolvedValue([]);
    await request(app).get("/api/events/marketing/fest/7/expenses").set(...mktAuth);
    const arg = prismaMock.expense.findMany.mock.calls[0][0];
    // host is never `host: true` (which would leak password/token columns)
    expect(arg.include.host.select).toEqual({ id: true, name: true, email: true });
    // fest is a bounded select omitting adminKey
    expect(arg.include.fest.select).toBeDefined();
    expect(arg.include.fest.select.adminKey).toBeUndefined();
  });

  it("returns 500 when the database throws", async () => {
    asFest(7);
    prismaMock.expense.findMany.mockRejectedValue(new Error("db"));
    const res = await request(app).get("/api/events/marketing/fest/7/expenses").set(...mktAuth);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/events/marketing/host/:hostId/expenses", () => {
  it("returns 400 when description/category/vendor missing", async () => {
    const res = await request(app).post("/api/events/marketing/host/42/expenses").set(...mktAuth).send({ description: "Food" });
    expect(res.status).toBe(400);
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it("creates an expense (201) with files mapped to FileType and hostId from the caller", async () => {
    const created = { id: 5, files: [] };
    prismaMock.expense.create.mockResolvedValue(created);
    const res = await request(app).post("/api/events/marketing/host/42/expenses").set(...mktAuth).send({
      description: "Catering", category: "Food", vendor: "Acme Catering", amount: "1200",
      proofFiles: [{ name: "p.png", url: "http://x/p.png", size: 10, type: "image/png" }],
      billFiles: [{ name: "b.pdf" }],
    });
    expect(res.status).toBe(201);
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hostId: 42, amount: 1200 }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.expense.create.mockRejectedValue(new Error("db"));
    const res = await request(app).post("/api/events/marketing/host/42/expenses").set(...mktAuth).send({ description: "d", category: "c", vendor: "v" });
    expect(res.status).toBe(500);
  });
});

// IDOR-1: expense PUT/DELETE now load the row and verify the caller is its host
// or an ADMIN/editor of its fest before mutating.
const ownExpense = () => prismaMock.expense.findUnique.mockResolvedValue({ hostId: 42, festId: 7, event: null });
const foreignExpense = () => {
  prismaMock.expense.findUnique.mockResolvedValue({ hostId: 999, festId: 999, event: null });
  prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
};

describe("PUT /api/events/marketing/expenses/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).put("/api/events/marketing/expenses/5").send({ description: "X" });
    expect(res.status).toBe(401);
  });

  it("IDOR-1: returns 403 when a non-owner tries to update another host's expense", async () => {
    foreignExpense();
    const res = await request(app).put("/api/events/marketing/expenses/5").set(...mktAuth).send({ description: "Hacked" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the expense does not exist", async () => {
    prismaMock.expense.findUnique.mockResolvedValue(null);
    const res = await request(app).put("/api/events/marketing/expenses/5").set(...mktAuth).send({ description: "X" });
    expect(res.status).toBe(404);
    expect(prismaMock.expense.update).not.toHaveBeenCalled();
  });

  it("returns 200 on successful update by the owning host (replaces files via deleteMany)", async () => {
    ownExpense();
    const updated = { id: 5, files: [] };
    prismaMock.expense.update.mockResolvedValue(updated);
    const res = await request(app).put("/api/events/marketing/expenses/5").set(...mktAuth).send({ description: "Updated", amount: "999" });
    expect(res.status).toBe(200);
    expect(prismaMock.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: expect.objectContaining({ amount: 999, files: { deleteMany: {}, create: [] } }) })
    );
  });

  it("returns 500 when the database throws", async () => {
    ownExpense();
    prismaMock.expense.update.mockRejectedValue(new Error("db"));
    const res = await request(app).put("/api/events/marketing/expenses/5").set(...mktAuth).send({ description: "X" });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/events/marketing/expenses/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).delete("/api/events/marketing/expenses/5");
    expect(res.status).toBe(401);
  });

  it("IDOR-1: returns 403 when a non-owner tries to delete another host's expense", async () => {
    foreignExpense();
    const res = await request(app).delete("/api/events/marketing/expenses/5").set(...mktAuth);
    expect(res.status).toBe(403);
    expect(prismaMock.expense.delete).not.toHaveBeenCalled();
  });

  it("returns 200 on successful delete by the owning host", async () => {
    ownExpense();
    prismaMock.expense.delete.mockResolvedValue({ id: 5 });
    const res = await request(app).delete("/api/events/marketing/expenses/5").set(...mktAuth);
    expect(res.status).toBe(200);
    expect(prismaMock.expense.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("returns 500 when the database throws", async () => {
    ownExpense();
    prismaMock.expense.delete.mockRejectedValue(new Error("db"));
    const res = await request(app).delete("/api/events/marketing/expenses/5").set(...mktAuth);
    expect(res.status).toBe(500);
  });
});

// ==================== LIFECYCLE: derived effectiveStatus ====================
// The stored EventStatus never transitions, so responses expose a DERIVED
// `effectiveStatus` (UPCOMING/LIVE/PAST) for PUBLISHED events without changing
// the stored status. DRAFT/CANCELLED are returned unchanged.
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

describe("effectiveStatus (GET /api/events/:id)", () => {
  it("derives PAST for a PUBLISHED event whose endDate is in the past", async () => {
    const now = Date.now();
    const event = {
      id: 5,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      startDate: iso(now - 3 * DAY),
      endDate: iso(now - 2 * DAY),
      fest: { isDeleted: false },
    };
    prismaMock.event.findUnique.mockResolvedValue(event);
    const res = await request(app).get("/api/events/5");
    expect(res.status).toBe(200);
    expect(res.body.data.effectiveStatus).toBe("PAST");
    // stored status is untouched
    expect(res.body.data.status).toBe("PUBLISHED");
  });

  it("derives LIVE when now is between startDate and endDate", async () => {
    const now = Date.now();
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      startDate: iso(now - 1 * DAY),
      endDate: iso(now + 1 * DAY),
      fest: { isDeleted: false },
    });
    const res = await request(app).get("/api/events/5");
    expect(res.body.data.effectiveStatus).toBe("LIVE");
  });

  it("derives UPCOMING when startDate is in the future", async () => {
    const now = Date.now();
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      startDate: iso(now + 1 * DAY),
      endDate: iso(now + 2 * DAY),
      fest: { isDeleted: false },
    });
    const res = await request(app).get("/api/events/5");
    expect(res.body.data.effectiveStatus).toBe("UPCOMING");
  });

  it("derives UPCOMING for a PUBLISHED event with no dates", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      startDate: null,
      endDate: null,
      fest: { isDeleted: false },
    });
    const res = await request(app).get("/api/events/5");
    expect(res.body.data.effectiveStatus).toBe("UPCOMING");
  });
});

describe("effectiveStatus (GET /api/events list)", () => {
  it("attaches effectiveStatus to each event in the public listing", async () => {
    const now = Date.now();
    prismaMock.event.findMany.mockResolvedValue([
      { id: 1, status: "PUBLISHED", startDate: iso(now - 3 * DAY), endDate: iso(now - 2 * DAY) },
      { id: 2, status: "PUBLISHED", startDate: iso(now + 1 * DAY), endDate: iso(now + 2 * DAY) },
    ]);
    const res = await request(app).get("/api/events");
    expect(res.status).toBe(200);
    expect(res.body.data[0].effectiveStatus).toBe("PAST");
    expect(res.body.data[1].effectiveStatus).toBe("UPCOMING");
  });
});

// ==================== SOFT-DELETE: hide events of a soft-deleted fest ====================
describe("soft-deleted fest visibility", () => {
  it("returns 404 to an anonymous caller for an event whose fest is soft-deleted", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      hostId: 10,
      festId: 7,
      fest: { isDeleted: true },
    });
    const res = await request(app).get("/api/events/5");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("still lets the owning host fetch an event whose fest is soft-deleted", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 5,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      hostId: 10,
      festId: 7,
      fest: { isDeleted: true },
    });
    const res = await request(app)
      .get("/api/events/5")
      .set("Authorization", `Bearer ${signToken({ userId: 10, role: "HOST" })}`);
    expect(res.status).toBe(200);
  });

  it("selects fest.isDeleted so the gate can see soft-deleted fests", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 5, status: "PUBLISHED", visibility: "PUBLIC" });
    await request(app).get("/api/events/5");
    const arg = prismaMock.event.findUnique.mock.calls[0][0];
    expect(arg.include.fest.select.isDeleted).toBe(true);
    // questions are included, ordered by `order`
    expect(arg.include.questions).toEqual({ orderBy: { order: "asc" } });
  });
});

// ==================== P2003: delete blocked by existing bookings ====================
describe("DELETE blocked by bookings (P2003 -> 409)", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });

  it("returns 409 HAS_BOOKINGS when deleting an event that has bookings", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ hostId: 10 });
    const err = new Error("FK violation");
    err.code = "P2003";
    prismaMock.event.delete.mockRejectedValue(err);
    const res = await request(app)
      .delete("/api/events/5")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("HAS_BOOKINGS");
  });

  it("returns 409 HAS_BOOKINGS when deleting a ticket type that has bookings", async () => {
    prismaMock.ticketType.findUnique.mockResolvedValue({ eventId: 5, event: { hostId: 10 } });
    const err = new Error("FK violation");
    err.code = "P2003";
    prismaMock.ticketType.delete.mockRejectedValue(err);
    const res = await request(app)
      .delete("/api/events/5/ticket-types/9")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("HAS_BOOKINGS");
  });
});

// ==================== REGISTRATION QUESTIONS persistence ====================
describe("POST /api/events with questions", () => {
  const hostAuth = ["Authorization", `Bearer ${signToken({ userId: 50, role: "HOST" })}`];

  it("persists EventQuestion rows in the create transaction (whitelisted + defaulted)", async () => {
    prismaMock.event.create.mockResolvedValue({ id: 200 });
    prismaMock.eventQuestion = { createMany: vi.fn().mockResolvedValue({ count: 2 }) };
    prismaMock.event.findUnique.mockResolvedValue({ id: 200, questions: [] });

    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({
        name: "Q Event",
        questions: [
          { label: "Age", type: "number", required: true, order: 0 },
          { label: "Notes", options: "n/a", extraIgnored: "x" },
        ],
      });

    expect(res.status).toBe(201);
    expect(prismaMock.eventQuestion.createMany).toHaveBeenCalledWith({
      data: [
        { eventId: 200, label: "Age", type: "number", options: null, required: true, order: 0 },
        { eventId: 200, label: "Notes", type: "text", options: "n/a", required: false, order: 1 },
      ],
    });
  });

  it("does not touch eventQuestion when no questions are provided", async () => {
    prismaMock.event.create.mockResolvedValue({ id: 201 });
    prismaMock.eventQuestion = { createMany: vi.fn() };
    prismaMock.event.findUnique.mockResolvedValue({ id: 201 });
    const res = await request(app).post("/api/events").set(...hostAuth).send({ name: "No Q" });
    expect(res.status).toBe(201);
    expect(prismaMock.eventQuestion.createMany).not.toHaveBeenCalled();
  });

  it("rejects a question with a missing label (zod)", async () => {
    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({ name: "Bad Q", questions: [{ type: "text" }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });
});

// ==================== VALIDATION: inline ticket price/quantity ====================
describe("createEventSchema inline ticket validation", () => {
  const hostAuth = ["Authorization", `Bearer ${signToken({ userId: 50, role: "HOST" })}`];

  it("rejects a negative inline ticket price", async () => {
    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({ name: "X", ticketTypes: [{ name: "VIP", price: -5, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("rejects a missing inline ticket quantity (create must not silently default it)", async () => {
    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({ name: "X", ticketTypes: [{ name: "VIP", price: 10 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("rejects a non-integer inline ticket quantity", async () => {
    const res = await request(app)
      .post("/api/events")
      .set(...hostAuth)
      .send({ name: "X", ticketTypes: [{ name: "VIP", price: 10, quantity: "1.5" }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });
});

// ==================== PATCH /api/events/:id/status ====================
describe("PATCH /api/events/:id/status", () => {
  const ownerToken = signToken({ userId: 10, role: "HOST" });
  const ownerAuth = ["Authorization", `Bearer ${ownerToken}`];

  it("returns 401 without a token", async () => {
    const res = await request(app).patch("/api/events/5/status").send({ status: "PUBLISHED" });
    expect(res.status).toBe(401);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await request(app).patch("/api/events/5/status").set(...ownerAuth).send({ status: "BOGUS" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the event does not exist", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app).patch("/api/events/5/status").set(...ownerAuth).send({ status: "PUBLISHED" });
    expect(res.status).toBe(404);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-owner non-admin", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ status: "DRAFT", hostId: 999, festId: 7 });
    const res = await request(app).patch("/api/events/5/status").set(...ownerAuth).send({ status: "PUBLISHED" });
    expect(res.status).toBe(403);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it("publishes a DRAFT event for the owner (200) and returns effectiveStatus", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ status: "DRAFT", hostId: 10, festId: 7 });
    prismaMock.event.update.mockResolvedValue({ id: 5, status: "PUBLISHED", startDate: null, endDate: null });
    const res = await request(app).patch("/api/events/5/status").set(...ownerAuth).send({ status: "PUBLISHED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PUBLISHED");
    expect(res.body.data.effectiveStatus).toBe("UPCOMING");
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: { status: "PUBLISHED" } })
    );
  });

  it("rejects an invalid transition (CANCELLED -> PUBLISHED) with 400", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ status: "CANCELLED", hostId: 10, festId: 7 });
    const res = await request(app).patch("/api/events/5/status").set(...ownerAuth).send({ status: "PUBLISHED" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it("allows an ADMIN of the event's fest to cancel it", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ status: "PUBLISHED", hostId: 999, festId: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.event.update.mockResolvedValue({ id: 5, status: "CANCELLED" });
    const res = await request(app)
      .patch("/api/events/5/status")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "ADMIN" })}`)
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CANCELLED");
  });
});

// ==================== GET /api/events/analytics/fest/:festId ====================
describe("GET /api/events/analytics/fest/:festId", () => {
  const auth = ["Authorization", `Bearer ${signToken({ userId: 42, role: "HOST" })}`];

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/events/analytics/fest/7");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the fest is not the caller's", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 999, editorFestId: null });
    const res = await request(app).get("/api/events/analytics/fest/7").set(...auth);
    expect(res.status).toBe(403);
  });

  it("returns aggregated totals from COMPLETED bookings for the caller's fest", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.event.findMany.mockResolvedValue([
      { id: 1, ticketTypes: [{ sold: 20 }, { sold: 5 }] },
      { id: 2, ticketTypes: [{ sold: 10 }] },
    ]);
    prismaMock.booking.aggregate.mockResolvedValue({ _sum: { total: 12500 }, _count: 8 });

    const res = await request(app).get("/api/events/analytics/fest/7").set(...auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      revenue: 12500,
      ticketsSold: 35,
      eventsCount: 2,
      bookingsCount: 8,
    });
    expect(prismaMock.booking.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: { in: [1, 2] }, status: "COMPLETED" } })
    );
  });

  it("defaults revenue to 0 when there are no completed bookings", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.booking.aggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 });
    const res = await request(app).get("/api/events/analytics/fest/7").set(...auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revenue: 0, ticketsSold: 0, eventsCount: 0, bookingsCount: 0 });
  });
});

// ==================== FILE STORAGE: inline base64 -> /uploads URL ====================
describe("inline base64 uploads are stored and their /uploads URL persisted", () => {
  const mktAuth2 = ["Authorization", `Bearer ${signToken({ userId: 42, role: "HOST" })}`];

  it("stores an expense proof file's dataUrl and puts the /uploads URL in fileUrl", async () => {
    prismaMock.expense.create.mockResolvedValue({ id: 5, files: [] });
    const res = await request(app)
      .post("/api/events/marketing/host/42/expenses")
      .set(...mktAuth2)
      .send({
        description: "Catering",
        category: "Food",
        vendor: "Acme",
        amount: "100",
        proofFiles: [{ fileName: "receipt.png", dataUrl: "data:image/png;base64,aaaa" }],
      });

    expect(res.status).toBe(201);
    const createArg = prismaMock.expense.create.mock.calls[0][0];
    expect(createArg.data.files.create).toEqual([
      expect.objectContaining({ fileUrl: "/uploads/mock-file.png", fileType: "PROOF" }),
    ]);
  });

  it("stores a sponsor agreement dataUrl and puts the /uploads URL in agreementUrl", async () => {
    // H1: caller must manage the target fest
    prismaMock.user.findUnique.mockResolvedValue({ managedFestId: 7, editorFestId: null });
    prismaMock.sponsor.create.mockResolvedValue({ id: 3 });
    const res = await request(app)
      .post("/api/events/marketing/host/42/sponsors")
      .set(...mktAuth2)
      .send({
        companyName: "Acme",
        contactPerson: "Jane",
        festId: "7",
        agreementDataUrl: "data:application/pdf;base64,bbbb",
      });

    expect(res.status).toBe(201);
    expect(prismaMock.sponsor.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agreementUrl: "/uploads/mock-file.png" }) })
    );
  });
});
