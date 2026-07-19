// @ts-nocheck
import express, { type Express } from "express";
import cors from "cors";
// @ts-ignore
import helmet from "helmet";
// @ts-ignore
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";

const app: Express = express();
// Trust the first proxy hop (Vercel) so req.ip reflects the real client IP
// behind X-Forwarded-For; required for accurate express-rate-limit behavior.
app.set("trust proxy", 1);
const isProduction = process.env.NODE_ENV === "production";

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
  process.env.FRONTEND_URL || null,
  "https://gebya-notebook-addis-gebya.vercel.app",
  ...configuredOrigins,
].filter(Boolean) as string[];

function isAllowedOrigin(origin?: string | null) {
  if (!origin) {
    return true;
  }
  if (!isProduction && allowedOrigins.length === 0) {
    return true;
  }
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

// ---- CORS PREFLIGHT HANDLER ----
// Vercel serverless intercepts OPTIONS before reaching cors middleware,
// so we handle it explicitly BEFORE cors middleware to ensure it returns 200.
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : "*";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(200).end();
  }
  next();
});

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
try {
  const rl = (rateLimit as any)?.default ?? rateLimit;
  if (typeof rl === "function") {
    app.use(rl({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } }));
  }
} catch (e) {
  console.error("RateLimit failed:", e);
}

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