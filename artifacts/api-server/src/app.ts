// @ts-nocheck
import express, { type Express } from "express";
import cors from "cors";
// @ts-ignore
import helmet from "helmet";
// @ts-ignore
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";

const app: Express = express();
const isProduction = process.env.NODE_ENV === "production";

// Fail-fast: refuse to start in production with a weak/missing JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET || "";
if (isProduction) {
  if (!JWT_SECRET || JWT_SECRET === "gebya-dev-secret-change-me" || JWT_SECRET.length < 32) {
    console.error("[security] FATAL: JWT_SECRET is missing, default, or < 32 chars. Set a strong secret before deploying.");
    process.exit(1);
  }
}

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- CORS CONFIG ----
const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ...configuredOrigins,
].filter(Boolean) as string[];

function isAllowedOrigin(origin?: string | null) {
  if (!origin) {
    return true;
  }

  if (!isProduction && allowedOrigins.length === 0) {
    return true;
  }

  // Phase 5: In production, if no origins are configured, reject everything
  if (isProduction && allowedOrigins.length === 0) {
    console.error("[security] CORS_ORIGIN is not set in production. Rejecting all cross-origin requests.");
    return false;
  }

  return allowedOrigins.includes(origin);
}

// ---- SAFE HELMET ----
try {
  const h = (helmet as any)?.default ?? helmet;
  if (typeof h === "function") {
    app.use(h());
  }
} catch (e) {
  console.error("Helmet failed:", e);
}

// ---- CORS ----
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// ---- RATE LIMITS ----
let syncRateLimiter: any = (_req: any, _res: any, next: any) => next(); // passthrough fallback
try {
  const rl = (rateLimit as any)?.default ?? rateLimit;
  if (typeof rl === "function") {
    // Global: 200 req / 15 min
    app.use(rl({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } }));
    // Sync-specific: 60 req / 5 min per IP (prevents sync abuse)
    syncRateLimiter = rl({ windowMs: 5 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: "Sync rate limit exceeded. Slow down." } });
  }
} catch (e) {
  console.error("RateLimit failed:", e);
}
export { syncRateLimiter };

// ---- BODY PARSING ----
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ---- REQUEST CONTEXT ----
app.use((req, res, next) => {
  const requestId = createRequestId();
  const startedAt = Date.now();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    console.info("[api]", JSON.stringify({
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });

  next();
});

// ---- ROUTES ----
app.use("/", router);
app.use("/api", router);

// ---- ERROR HANDLER ----
app.use((err, req, res, _next) => {
  const requestId = res.locals.requestId || createRequestId();

  console.error("[api:error]", JSON.stringify({
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    message: err instanceof Error ? err.message : "Unhandled error",
  }));

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: "Internal server error",
    request_id: requestId,
  });
});

export default app;
