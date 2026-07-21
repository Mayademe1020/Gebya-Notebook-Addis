import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import telegramRouter from "./telegram.js";
import syncRouter from "./sync.js";
import authRouter from "./auth.js";
import backupRouter from "./backup.js";
import businessRouter from "./business.js";
import remindersRouter from "./reminders.js";
import identityRouter from "./identity.js";
import auditRouter from "./audit.js";
import pushSubscriptionsRouter from "./pushSubscriptions.js";
import notificationsRouter from "./notifications.js";
import analyticsRouter from "./analytics.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/health", healthRouter);
router.use("/telegram", telegramRouter);
router.use("/sync", syncRouter);
router.use("/auth", authRouter);
router.use("/backup", backupRouter);
router.use("/business", businessRouter);
router.use("/telegram/reminders", remindersRouter);
// Identity routes: defines /shops, /shops/join, /shops/:shop_id/staff etc.
// Mounted at root so full paths become /api/shops, /api/shops/join etc.
router.use("/", identityRouter);
// Audit routes: owner violation log
router.use("/audit", auditRouter);
// Push notification subscription management
router.use("/push", pushSubscriptionsRouter);
// Notification list and read status
router.use("/notifications", notificationsRouter);
// Bank analytics — merchant consent + bank-facing reports + NBE aggregation
router.use("/analytics", analyticsRouter);
// Platform admin dashboard
router.use("/admin", adminRouter);

export default router;
