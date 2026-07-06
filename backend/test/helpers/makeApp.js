import express from "express";

/**
 * Build a minimal Express app that mounts a single router for supertest.
 * Mirrors the real app: JSON body parsing + the router under `basePath`.
 *
 * @param {import("express").Router} router
 * @param {string} basePath e.g. "/api/auth"
 */
export function makeApp(router, basePath = "/") {
  const app = express();
  app.use(express.json());
  app.use(basePath, router);
  return app;
}

/**
 * Build an app and optionally inject a fake authenticated user by stubbing the
 * Authorization header path. Most tests instead pass a real signed JWT.
 */
export default makeApp;
