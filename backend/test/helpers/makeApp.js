import express from "express";
import requestLogger from "../../src/middleware/requestLogger.js";

/**
 * Build a minimal Express app that mounts a single router for supertest.
 * Mirrors the real app: request-id/child-logger middleware (so handlers can use
 * `req.log`) + JSON body parsing + the router under `basePath`. The logger is
 * silent under NODE_ENV=test, so this adds no output.
 *
 * @param {import("express").Router} router
 * @param {string} basePath e.g. "/api/auth"
 */
export function makeApp(router, basePath = "/") {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.use(basePath, router);
  return app;
}

/**
 * Build an app and optionally inject a fake authenticated user by stubbing the
 * Authorization header path. Most tests instead pass a real signed JWT.
 */
export default makeApp;
