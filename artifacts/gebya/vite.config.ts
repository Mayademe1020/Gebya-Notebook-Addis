import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

const rawPort = process.env.PORT ?? "4173";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const sentrySourceMaps = process.env.SENTRY_SOURCE_MAPS === "true";
const apiBase = process.env.VITE_API_BASE ?? process.env.VITE_API_BASE_URL ?? "";

const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;
const apiConnectOrigin = (() => {
  try {
    return apiBase ? new URL(apiBase).origin : null;
  } catch {
    return null;
  }
})();

function securityHeadersPlugin(): Plugin {
  const setSecurityHeaders = (res: { setHeader: (k: string, v: string) => void }, isDev: boolean) => {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        ["connect-src 'self' https:", apiConnectOrigin].filter(Boolean).join(" "),
        "worker-src 'self' blob:",
        "manifest-src 'self'",
      ].join("; ")
    );
  };

  return {
    name: "security-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        setSecurityHeaders(res, true);
        if (req.url && /\.(js|css|woff2?|png|ico|svg)$/.test(req.url)) {
          res.setHeader("Cache-Control", "no-store");
        } else if (req.url && /\.html?$/.test(req.url)) {
          res.setHeader("Cache-Control", "no-store");
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        setSecurityHeaders(res, false);
        if (req.url && /\.(js|css|woff2?|png|ico|svg)$/.test(req.url)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (req.url && /\.html?$/.test(req.url)) {
          res.setHeader("Cache-Control", "no-store");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: normalizedBasePath,
  envDir: "../../", // 👈 FIXED: load .env.local from repo root
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    securityHeadersPlugin(),
    VitePWA({
      // prompt, never autoUpdate: with autoUpdate the worker reloads the page
      // the moment a new build appears, which throws away a half-typed sale.
      // The banner in PwaInstallPanel applies the update when the user asks.
      registerType: "prompt",
      injectRegister: "auto",
      devOptions: { enabled: false },
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png", "opengraph.jpg"],
      manifest: {
        name: "Gebya - Business Notebook",
        short_name: "Gebya",
        description: "Track your business sales, expenses, and credit offline",
        id: normalizedBasePath,
        theme_color: "#1B4332",
        background_color: "#FAF8F5",
        display: "standalone",
        display_override: ["standalone", "minimal-ui", "browser"],
        orientation: "portrait",
        scope: normalizedBasePath,
        start_url: normalizedBasePath,
        categories: ["business", "finance", "productivity"],
        prefer_related_applications: false,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        importScripts: ['/sw-push.js'],
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-static-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // API calls - use NetworkFirst with background sync fallback
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "gebya-api-cache",
              networkTimeoutSeconds: 10,
              backgroundSync: {
                name: "gebya-sync-queue",
                options: {
                  maxRetentionTime: 24 * 60, // 24 hours
                },
              },
            },
          },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({ root: path.resolve(import.meta.dirname, "..") })
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: sentrySourceMaps,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        bank: path.resolve(import.meta.dirname, "bank.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom")) return "vendor-react";
          if (id.includes("node_modules/react")) return "vendor-react";
          if (id.includes("node_modules/scheduler")) return "vendor-react";
          if (id.includes("/src/db")) return "db";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true, deny: ["**/.*"] },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
