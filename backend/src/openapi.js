// ARCH-04: OpenAPI 3.0 document for the tiqr API.
//
// Request-body schemas are derived from the SAME zod validators the routes
// enforce (src/validators/*), via zod v4's native `z.toJSONSchema`. This keeps
// the contract honest — change a validator and the generated doc changes too —
// without the zod-to-openapi adapter (which lags zod v4). The document is
// hand-authored at the path level and served behind Swagger UI in index.js.
import { z } from "zod";
import { signupSchema, signinSchema } from "./validators/authValidator.js";
import { createBookingSchema } from "./validators/bookingValidator.js";
import { createEventSchema, ticketTypeSchema } from "./validators/eventValidator.js";
import { createFestSchema } from "./validators/festValidator.js";
import { createSponsorSchema, createExpenseSchema } from "./validators/marketingValidator.js";
import { completeProfileSchema } from "./validators/userValidator.js";

// Convert a zod schema to an OpenAPI-3.0-flavoured JSON Schema (no $schema key,
// draft-04-compatible constructs). `unrepresentable: "any"` keeps refinements /
// transforms from throwing — they simply widen to `any` in the doc.
function toSchema(zodSchema) {
  return z.toJSONSchema(zodSchema, { target: "openApi3", unrepresentable: "any" });
}

// Standard success/error envelopes (ARCH-01). Documented once and referenced.
const ENVELOPE_SCHEMAS = {
  ApiError: {
    type: "object",
    properties: {
      success: { type: "boolean", example: false },
      requestId: { type: "string" },
      error: {
        type: "object",
        properties: {
          code: { type: "string", example: "NOT_FOUND" },
          message: { type: "string" },
          details: { type: "object", nullable: true },
        },
        required: ["code", "message"],
      },
    },
    required: ["success", "error"],
  },
  ApiSuccess: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      requestId: { type: "string" },
      data: {},
    },
    required: ["success"],
  },
};

// Reusable response objects.
const jsonEnvelope = (ref) => ({
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});
const OK = (desc = "Success") => ({ description: desc, ...jsonEnvelope("ApiSuccess") });
const ERR = (desc) => ({ description: desc, ...jsonEnvelope("ApiError") });
const COMMON_ERRORS = {
  400: ERR("Validation failed"),
  401: ERR("Missing or invalid token"),
  403: ERR("Not authorised"),
  404: ERR("Not found"),
};

// A JSON request body backed by a named component schema.
const bodyRef = (ref) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

// bearer-JWT security requirement.
const SECURED = [{ bearerAuth: [] }];

export function buildOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "tiqr API",
      version: "1.0.0",
      description:
        "Event ticketing/booking API for college fests. Auth is a bearer JWT " +
        "(15-min access token from POST /auth/signin). Every route is served at " +
        "both /api/v1/* and /api/* (the unversioned path is a deprecation alias).",
    },
    servers: [
      { url: "/api/v1", description: "Versioned (preferred)" },
      { url: "/api", description: "Unversioned alias (deprecated)" },
    ],
    tags: [
      { name: "Auth", description: "Signup, login, token refresh, password reset" },
      { name: "User", description: "Current-user profile" },
      { name: "Fests", description: "Fest listing & management" },
      { name: "Events", description: "Event listing, creation & organiser data" },
      { name: "Bookings", description: "Ticket booking, payment & dashboards" },
      { name: "Role Requests", description: "Editor/host role approvals" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        ...ENVELOPE_SCHEMAS,
        Signup: toSchema(signupSchema),
        Signin: toSchema(signinSchema),
        CreateBooking: toSchema(createBookingSchema),
        CreateEvent: toSchema(createEventSchema),
        TicketType: toSchema(ticketTypeSchema),
        CreateFest: toSchema(createFestSchema),
        CreateSponsor: toSchema(createSponsorSchema),
        CreateExpense: toSchema(createExpenseSchema),
        CompleteProfile: toSchema(completeProfileSchema),
      },
    },
    paths: {
      "/auth/signup": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user (optionally request editor access)",
          requestBody: bodyRef("Signup"),
          responses: { 201: OK("User created"), 400: COMMON_ERRORS[400], 409: ERR("Email already registered") },
        },
      },
      "/auth/signin": {
        post: {
          tags: ["Auth"],
          summary: "Log in and receive access + refresh tokens",
          requestBody: bodyRef("Signin"),
          responses: { 200: OK("Authenticated"), 400: COMMON_ERRORS[400], 401: ERR("Invalid credentials"), 429: ERR("Too many attempts / locked") },
        },
      },
      "/auth/refresh-token": {
        post: {
          tags: ["Auth"],
          summary: "Rotate the refresh token and mint a new access token",
          responses: { 200: OK("Rotated"), 401: ERR("Invalid or expired refresh token") },
        },
      },
      "/user/me": {
        get: {
          tags: ["User"],
          summary: "Current user, including managedFestId / editorFestId",
          security: SECURED,
          responses: { 200: OK(), 401: COMMON_ERRORS[401] },
        },
      },
      "/user/complete-profile": {
        patch: {
          tags: ["User"],
          summary: "Fill in required profile fields",
          security: SECURED,
          requestBody: bodyRef("CompleteProfile"),
          responses: { 200: OK(), 400: COMMON_ERRORS[400], 401: COMMON_ERRORS[401] },
        },
      },
      "/fests": {
        get: {
          tags: ["Fests"],
          summary: "List fests",
          responses: { 200: OK() },
        },
        post: {
          tags: ["Fests"],
          summary: "Create a fest (ADMIN)",
          security: SECURED,
          requestBody: bodyRef("CreateFest"),
          responses: { 201: OK("Created"), 400: COMMON_ERRORS[400], 401: COMMON_ERRORS[401], 403: COMMON_ERRORS[403] },
        },
      },
      "/events": {
        get: {
          tags: ["Events"],
          summary: "List events (search, category, sort, pagination)",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "search", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: OK() },
        },
        post: {
          tags: ["Events"],
          summary: "Create an event with ticket types (HOST/ADMIN)",
          security: SECURED,
          requestBody: bodyRef("CreateEvent"),
          responses: { 201: OK("Created"), 400: COMMON_ERRORS[400], 401: COMMON_ERRORS[401], 403: COMMON_ERRORS[403] },
        },
      },
      "/events/{id}/buyers": {
        get: {
          tags: ["Events"],
          summary: "Paginated buyer list for an event (organiser only)",
          security: SECURED,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          ],
          responses: { 200: OK(), 401: COMMON_ERRORS[401], 403: COMMON_ERRORS[403], 404: COMMON_ERRORS[404] },
        },
      },
      "/bookings": {
        post: {
          tags: ["Bookings"],
          summary: "Create a PENDING booking (holds inventory; optional auth)",
          description: "Auth is optional — guests may book with guestName/guestEmail. A logged-in user is linked automatically.",
          requestBody: bodyRef("CreateBooking"),
          responses: { 201: OK("Booking created"), 400: COMMON_ERRORS[400], 409: ERR("Ticket sold out / promo exhausted") },
        },
      },
      "/bookings/code/{bookingCode}": {
        get: {
          tags: ["Bookings"],
          summary: "Look up a booking by its public code (no auth)",
          description: "Public endpoint — used by the confirmation page. No bearer token required.",
          parameters: [{ name: "bookingCode", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: OK(), 404: COMMON_ERRORS[404] },
        },
      },
      "/bookings/event/{eventId}": {
        get: {
          tags: ["Bookings"],
          summary: "Event dashboard: DB-aggregated stats + paginated bookings",
          security: SECURED,
          parameters: [
            { name: "eventId", in: "path", required: true, schema: { type: "integer" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "COMPLETED", "CANCELLED", "REFUNDED"] } },
          ],
          responses: { 200: OK(), 401: COMMON_ERRORS[401], 403: COMMON_ERRORS[403], 404: COMMON_ERRORS[404] },
        },
      },
      "/role-requests": {
        get: {
          tags: ["Role Requests"],
          summary: "List pending editor/host requests for the caller's fest (ADMIN)",
          security: SECURED,
          responses: { 200: OK(), 401: COMMON_ERRORS[401], 403: COMMON_ERRORS[403] },
        },
      },
    },
  };
}

export default buildOpenApiDocument;
