import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import staffSalesRouter from "./staffSales.js";
import telegramRouter from "./telegram.js";
import transcribeRouter from "./transcribe.js";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/health", healthRouter);
router.use("/staff-sales", staffSalesRouter);
router.use("/telegram", telegramRouter);
router.use("/transcribe", transcribeRouter);

export default router;
