import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
import { initSentry } from "./sentry";

initSentry();

// PayPage is loaded lazily — it's only rendered when the URL path is /pay
// (the customer-facing channel-picker route reached from Pay-it-now reminders).
// Keeping it out of the main bundle means shopkeepers never download it.
const PayPage = lazy(() => import("./components/PayPage.jsx"));

if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  } else {
    const updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent("gebya:pwa-update-ready"));
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent("gebya:pwa-offline-ready"));
      },
    });

    (
      window as Window & {
        __gebyaUpdateServiceWorker?: (reloadPage?: boolean) => Promise<void> | void;
      }
    ).__gebyaUpdateServiceWorker = updateServiceWorker;
  }
}

// Simple path-based routing — no router library. The /pay route is a
// standalone, public, customer-facing page (no Dexie, no auth) and the
// rest of the URL space goes to the main shopkeeper app.
const isJoinRoute = typeof window !== "undefined" && /^\/join\/.+/.test(window.location.pathname);

const isPayRoute = typeof window !== "undefined" && window.location.pathname === "/pay";

const JoinPage = lazy(() => import("./components/JoinPage.jsx"));

// Minimal fallback for the lazy-loaded PayPage. Plain inline styles so it
// renders before any CSS chunk loads.
function PayPageFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafaf9",
        color: "#6b7280",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "28px", marginBottom: "8px" }}>💛</div>
        <p style={{ fontSize: "14px", margin: 0 }}>Loading payment options…</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {isJoinRoute ? (
      <Suspense fallback={<PayPageFallback />}>
        <JoinPage />
      </Suspense>
    ) : isPayRoute ? (
      <Suspense fallback={<PayPageFallback />}>
        <PayPage />
      </Suspense>
    ) : (
      <App />
    )}
  </ErrorBoundary>
);
