# syntax=docker/dockerfile:1
# OPS-08: production image for the FesTicket backend. Multi-stage so the runtime layer
# carries only production deps + the generated Prisma client (no dev toolchain).

# ---- deps: install prod deps and generate the Prisma client ----
FROM node:20-slim AS deps
WORKDIR /app
# Prisma's query engine needs openssl at generate + runtime on slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# prisma (the CLI) is a regular dependency here, so --omit=dev still ships it.
RUN npm ci --omit=dev
# Generate the client against the committed schema (its own layer, so a schema
# change doesn't bust the npm ci layer).
COPY prisma ./prisma
RUN npx prisma generate

# ---- runner: minimal runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# openssl for the Prisma engine; curl for the HEALTHCHECK.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
# Bring the installed deps (incl. the generated Prisma client) from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
# App source (node_modules/.env/etc. excluded via .dockerignore).
COPY . .
# index.js creates UPLOADS_DIR (/app/uploads) at boot; /app is root-owned, so
# pre-create it writable by the unprivileged node user (the rest of /app stays
# read-only, which is all the app needs).
RUN mkdir -p /app/uploads && chown node:node /app/uploads
# Run as the built-in unprivileged user.
USER node
EXPOSE 4000
# Liveness: the DB-free /api/health endpoint (start-period covers Prisma connect).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-4000}/api/health" || exit 1
# index.js fails fast if DATABASE_URL / JWT_SECRET(>=32) are missing.
CMD ["node", "index.js"]
