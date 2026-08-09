import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import tacticsRouter from "./tactics";
import tournamentsRouter from "./tournaments";
import teamsRouter from "./teams";
import peopleRouter from "./people";
import matchesRouter from "./matches";
import playersRouter from "./players";
import setsRouter from "./sets";
import ralliesRouter from "./rallies";
import eventsRouter from "./events";
import substitutionsRouter from "./substitutions";
import timeoutsRouter from "./timeouts";
import lineupsRouter from "./lineups";
import analysisRouter from "./analysis";
import demoDataRouter from "./demoData";

const router: IRouter = Router();

// auth 路由（/auth/google、/auth/me…）不能掛在 requireAuth 底下——使用者連身分都還沒
// 建立，要求他先證明自己是誰是邏輯倒反。所以刻意跟其他 router.use(...) 一樣平掛在這裡，
// 「不檢查擁有權」的決定是路由自己內部做的，不是靠漏掉一個 middleware 悄悄達成的。
router.use(authRouter);
router.use(healthRouter);
router.use(tacticsRouter);
router.use(tournamentsRouter);
router.use(teamsRouter);
router.use(peopleRouter);
// 比賽紀錄相關路由。每個檔案都自己定義完整路徑（如 /matches/:matchId/players），
// 所以在這裡平掛在同一層就好，不需要用 mergeParams 做巢狀掛載。
router.use(matchesRouter);
router.use(playersRouter);
router.use(setsRouter);
router.use(ralliesRouter);
router.use(eventsRouter);
router.use(substitutionsRouter);
router.use(timeoutsRouter);
router.use(lineupsRouter);
router.use(analysisRouter);
router.use(demoDataRouter);

export default router;
