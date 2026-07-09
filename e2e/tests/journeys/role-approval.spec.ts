import { test, expect, APIRequestContext } from "@playwright/test";
import {
  apiContext,
  seedFestAdmin,
  signupUser,
  signSessionJwt,
  SeededFestAdmin,
  SignedUpUser,
} from "../_helpers";

// JOURNEY (OPS-05): a student self-requests EDITOR access with a fest key; the
// fest's ADMIN approves it (PATCH /api/role-requests/:id), which sets the
// student's role=EDITOR + editorFestId. There is no public API to mint an ADMIN
// who manages a fest, so the fest + admin are seeded via a backend script.
// Requires a database.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

let api: APIRequestContext;
let festAdmin: SeededFestAdmin;
let student: SignedUpUser;

test.beforeAll(async () => {
  api = await apiContext();
  festAdmin = seedFestAdmin(); // Fest (with adminKey) + ADMIN(managedFestId)
  student = await signupUser(api, { name: "Aspiring Editor" }); // VIEWER
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe("role-approval journey", () => {
  test("ADMIN approval promotes the student to EDITOR and sets editorFestId", async () => {
    // 1) Student self-requests EDITOR using the fest key -> PENDING RoleRequest.
    const reqRes = await api.post("/api/role-requests", {
      headers: { Authorization: `Bearer ${student.token}` },
      data: { festKey: festAdmin.adminKey, organization: "Student Council" },
    });
    expect(reqRes.status()).toBe(201);
    const requestId = (await reqRes.json()).data.id;
    expect(requestId).toBeTruthy();

    // 2) The ADMIN who manages this fest approves it.
    const adminToken = signSessionJwt(festAdmin.adminUserId, "ADMIN");
    const approve = await api.patch(`/api/role-requests/${requestId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: "APPROVED" },
    });
    expect(approve.status()).toBe(200);
    expect((await approve.json()).data.status).toBe("APPROVED");

    // 3) Approval bumps the student's tokenVersion (0 -> 1) and sets editorFestId.
    // Mint a fresh token at the new tokenVersion and read /api/user/me.
    const studentToken2 = signSessionJwt(student.userId, "EDITOR", 1);
    const me = await api.get("/api/user/me", {
      headers: { Authorization: `Bearer ${studentToken2}` },
    });
    expect(me.status()).toBe(200);
    const meData = (await me.json()).data;
    expect(meData.role).toBe("EDITOR");
    expect(meData.editorFestId).toBe(festAdmin.festId);
  });
});
