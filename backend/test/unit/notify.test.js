import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "@prisma/client";
import { createNotification } from "../../src/utils/notify.js";

vi.mock("@prisma/client");

beforeEach(() => resetPrismaMock());

describe("createNotification (NOTIF-08)", () => {
  it("writes a notification for a registered user", async () => {
    prismaMock.notification.create.mockResolvedValue({ id: 1 });
    await createNotification({ userId: 7, type: "new_sale", title: "Sold", body: "b", linkUrl: "/x" });
    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: { userId: 7, type: "new_sale", title: "Sold", body: "b", linkUrl: "/x" },
    });
  });

  it("is a no-op for a guest (no userId)", async () => {
    const result = await createNotification({ userId: null, type: "x", title: "y" });
    expect(result).toBeNull();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("never throws — a write failure returns null", async () => {
    prismaMock.notification.create.mockRejectedValue(new Error("db down"));
    await expect(createNotification({ userId: 7, type: "x", title: "y" })).resolves.toBeNull();
  });
});
