import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tacticsRouter from "./tactics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tacticsRouter);

export default router;
