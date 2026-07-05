import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tacticsRouter from "./tactics";
import matchesRouter from "./matches";
import playersRouter from "./players";
import setsRouter from "./sets";
import ralliesRouter from "./rallies";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tacticsRouter);
// 比賽紀錄相關路由。每個檔案都自己定義完整路徑（如 /matches/:matchId/players），
// 所以在這裡平掛在同一層就好，不需要用 mergeParams 做巢狀掛載。
router.use(matchesRouter);
router.use(playersRouter);
router.use(setsRouter);
router.use(ralliesRouter);
router.use(eventsRouter);

export default router;
