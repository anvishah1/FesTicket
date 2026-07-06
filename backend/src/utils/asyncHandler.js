// backend/src/utils/asyncHandler.js
// Wrap an async route handler so a rejected promise is forwarded to Express's
// error middleware (next(err)). Express 5 already forwards async rejections, so
// this is mostly for explicitness and parity with older-style handlers; the real
// value of ARCH-03 is the AppError type + centralized mapping in index.js.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
