import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import telegramRouter from "./telegram.js";
import transcribeRouter from "./transcribe.js";
import syncRouter from "./sync.js";
import authRouter from "./auth.js";
import backupRouter from "./backup.js";
import businessRouter from "./business.js";
import remindersRouter from "./reminders.js";
import identityRouter from "./identity.js";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/health", healthRouter);
router.use("/telegram", telegramRouter);
router.use("/transcribe", transcribeRouter);
router.use("/sync", syncRouter);
router.use("/auth", authRouter);
router.use("/backup", backupRouter);
router.use("/business", businessRouter);
router.use("/telegram/reminders", remindersRouter);
// Identity routes: defines /shops, /shops/join, /shops/:shop_id/staff etc.
// Mounted at root so full paths become /api/shops, /api/shops/join etc.
router.use("/", identityRouter);

export default router;
