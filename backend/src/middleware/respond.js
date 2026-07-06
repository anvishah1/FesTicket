// backend/src/middleware/respond.js
// Response-shape helpers (ARCH-01) so every route can emit one enveloped body
// with a requestId. Mounted after requestLogger (needs req.id) and before routes.
//
//   res.ok(data, { status = 200, message })  -> { success:true, data, message?, requestId }
//   res.fail(status, code, message, details) -> { success:false, error:{code,message,details?}, requestId }
export default function respond(req, res, next) {
  res.ok = (data = null, { status = 200, message } = {}) => {
    const body = { success: true, requestId: req.id };
    if (data !== undefined) body.data = data;
    if (message) body.message = message;
    return res.status(status).json(body);
  };

  res.fail = (status, code, message, details) => {
    const error = { code, message };
    // `details` carries per-field validation info (see validate.js). Only attach
    // it when provided so plain errors stay { code, message }.
    if (details !== undefined) error.details = details;
    return res.status(status).json({
      success: false,
      requestId: req.id,
      error,
    });
  };

  next();
}
