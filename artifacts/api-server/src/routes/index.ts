import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import telegramRouter from "./telegram.js";
import transcribeRouter from "./transcribe.js";
import identityRouter from "./identity.js";
import eventsRouter from "./events.js";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/health", healthRouter);
router.use("/telegram", telegramRouter);
router.use("/transcribe", transcribeRouter);
// Shop Sync v1 (PR 1A): identity, shop, staff, device, settings endpoints.
router.use("/", identityRouter);
// Shop Sync v1 (PR 1B1): core staff event push foundation.
router.use("/", eventsRouter);

export default router;
