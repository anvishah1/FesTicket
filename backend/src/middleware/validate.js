export const validate = (schema) => {
  return (req, res, next) => {

    const result = schema.safeParse(req.body);

    if (!result.success) {

      const errors = {};

      result.error.issues.forEach((err) => {
        const field = err.path[0];

        // only keep the first error per field
        if (!errors[field]) {
          errors[field] = err.message;
        }
      });

      return res.fail(400, "VALIDATION_ERROR", "Validation failed", errors);
    }

    req.body = result.data;

    next();
  };
};
