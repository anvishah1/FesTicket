import { describe, it, expect, vi } from "vitest";
import AppError, { bookingError } from "../../src/utils/AppError.js";
import asyncHandler from "../../src/utils/asyncHandler.js";

describe("AppError", () => {
  it("carries status/code/message/expose and is an Error", () => {
    const e = new AppError(409, "SOLD_OUT", "gone");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(409);
    expect(e.code).toBe("SOLD_OUT");
    expect(e.message).toBe("gone");
    expect(e.expose).toBe(true);
  });

  it("static factories set the right status", () => {
    expect(AppError.badRequest("X", "m").status).toBe(400);
    expect(AppError.unauthorized("X", "m").status).toBe(401);
    expect(AppError.forbidden("X", "m").status).toBe(403);
    expect(AppError.notFound("X", "m").status).toBe(404);
    expect(AppError.conflict("X", "m").status).toBe(409);
  });

  it("bookingError is a drop-in returning an AppError with expose:true", () => {
    const e = bookingError(400, "VALIDATION_ERROR", "bad");
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(400);
    expect(e.code).toBe("VALIDATION_ERROR");
    expect(e.message).toBe("bad");
    expect(e.expose).toBe(true);
  });

  it("supports expose:false for internal errors", () => {
    const e = new AppError(500, "X", "secret", { expose: false });
    expect(e.expose).toBe(false);
  });
});

describe("asyncHandler", () => {
  it("forwards a rejected promise to next(err)", async () => {
    const err = new Error("boom");
    const next = vi.fn();
    await asyncHandler(async () => {
      throw err;
    })({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it("does not call next on success", async () => {
    const next = vi.fn();
    await asyncHandler(async () => {
      /* ok */
    })({}, {}, next);
    expect(next).not.toHaveBeenCalled();
  });
});
