import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { makeApp } from "../helpers/makeApp.js";
import { signToken } from "../helpers/auth.js";
import userRouter from "../../src/routes/user.js";

vi.mock("@prisma/client");

const app = makeApp(userRouter, "/api/user");

beforeEach(resetPrismaMock);

describe("GET /api/user/me", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app).get("/api/user/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid token", async () => {
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "VIEWER" })}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/i);
  });

  it("returns the current user on success", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: "a@b.com",
      name: "Aay",
      role: "VIEWER",
      profileCompleted: false,
      emailVerified: true,
      createdAt: new Date("2024-01-01"),
      managedFestId: null,
      editorFestId: null,
    });
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "VIEWER" })}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("a@b.com");
    expect(res.body.data.role).toBe("VIEWER");
  });

  it("returns a null admin managedFestId as null WITHOUT re-granting from an AdminRequest", async () => {
    // Revocation safety: an admin whose managedFestId was cleared must stay
    // revoked. /me must not silently repair it from an approved AdminRequest.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 2,
      email: "admin@x.com",
      name: null,
      role: "ADMIN",
      profileCompleted: true,
      emailVerified: true,
      createdAt: new Date("2024-01-01"),
      managedFestId: null,
      editorFestId: null,
    });

    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${signToken({ userId: 2, role: "ADMIN" })}`);

    expect(res.status).toBe(200);
    expect(res.body.data.managedFestId).toBe(null);
    // No lookup and no write — the revoked state is returned as-is.
    expect(prismaMock.adminRequest.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("does not attempt repair when admin already has a managedFestId", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 3,
      email: "admin2@x.com",
      name: "Admin",
      role: "ADMIN",
      profileCompleted: true,
      emailVerified: true,
      createdAt: new Date("2024-01-01"),
      managedFestId: 5,
      editorFestId: null,
    });
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${signToken({ userId: 3, role: "ADMIN" })}`);
    expect(res.status).toBe(200);
    expect(res.body.data.managedFestId).toBe(5);
    expect(prismaMock.adminRequest.findFirst).not.toHaveBeenCalled();
  });

  it("exposes managedFest (with adminKey) to the ADMIN who owns the fest", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 4,
      email: "owner@x.com",
      name: "Owner",
      role: "ADMIN",
      profileCompleted: true,
      emailVerified: true,
      createdAt: new Date("2024-01-01"),
      managedFestId: 7,
      editorFestId: null,
      managedFest: { id: 7, name: "Tech Fest", adminKey: "FEST-KEY-123" },
    });

    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${signToken({ userId: 4, role: "ADMIN" })}`);

    expect(res.status).toBe(200);
    expect(res.body.data.managedFest).toEqual({ id: 7, name: "Tech Fest", adminKey: "FEST-KEY-123" });
    // Confirms the /me select requested the owner-only managedFest.adminKey.
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          managedFest: { select: { id: true, name: true, adminKey: true } },
        }),
      })
    );
  });

  it("does NOT expose managedFest/adminKey to a non-admin caller", async () => {
    // Even if the relation is somehow populated, a non-owner role must not see it.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 5,
      email: "editor@x.com",
      name: "Editor",
      role: "EDITOR",
      profileCompleted: true,
      emailVerified: true,
      createdAt: new Date("2024-01-01"),
      managedFestId: null,
      editorFestId: 7,
      managedFest: { id: 7, name: "Tech Fest", adminKey: "FEST-KEY-123" },
    });

    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${signToken({ userId: 5, role: "EDITOR" })}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("managedFest");
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "VIEWER" })}`);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/user/complete-profile", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/user/complete-profile")
      .send({ firstName: "A", lastName: "B", organiserName: "Org", phone: "9999999999" });
    expect(res.status).toBe(401);
  });

  it("updates the profile, joins the name, and sets profileCompleted", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: 1,
      email: "a@b.com",
      name: "First Last",
      phone: "9999999999",
      organizationName: "Org",
      role: "VIEWER",
      profileCompleted: true,
    });

    const res = await request(app)
      .post("/api/user/complete-profile")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "VIEWER" })}`)
      .send({ firstName: "First", lastName: "Last", organiserName: "Org", phone: "9999999999" });

    expect(res.status).toBe(200);
    expect(res.body.data.profileCompleted).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          name: "First Last",
          phone: "9999999999",
          organizationName: "Org",
          profileCompleted: true,
        }),
      })
    );
  });

  it("returns 500 when the database throws", async () => {
    prismaMock.user.update.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .post("/api/user/complete-profile")
      .set("Authorization", `Bearer ${signToken({ userId: 1, role: "VIEWER" })}`)
      .send({ firstName: "A", lastName: "B", organiserName: "Org", phone: "9999999999" });
    expect(res.status).toBe(500);
  });
});
