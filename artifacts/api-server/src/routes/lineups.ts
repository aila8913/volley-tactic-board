import { Router, type IRouter } from "express";
import { eq, getTableColumns } from "drizzle-orm";
import { db, lineupsTable, setsTable } from "@workspace/db";
import { mockAuth } from "../middleware/mockAuth";
import { setBelongsToUser, matchBelongsToUser } from "../lib/ownership";
import { ListMatchLineupsParams, PutSetLineupParams, PutSetLineupBody } from "@workspace/api-zod";

// 一局（set）的起始先發：我方六個號位各站哪個球員（見 lib/db/src/schema/lineups.ts）。
// 這是計分表「先發名單」的持久層——比分/輪轉能從 rally 序列重放，但「第 3 輪 4 號位站誰」
// 需要一個推不出來的種子，就是這張表。前端在教練選好先發方（開賽）那一刻寫入，reload 時讀回，
// 讓計分表擁有自己一份跟戰術板/輪轉表解耦的先發快照（issue #115）。
//
// 讀（bulk）掛在 /matches/:matchId/lineups 底下（先驗 match 擁有權）；
// 寫掛在 /sets/:setId/lineup 底下（先驗 set 擁有權，往上追到 match.userId）。
const router: IRouter = Router();
router.use(mockAuth);

// GET /matches/:matchId/lineups — 一次拿整場比賽所有局的先發（跨 set）。
// lineups 自己沒存 matchId，所以 join lineups→sets，用 sets.matchId 過濾；先驗 match 屬於這個 user。
// 跟 GET /matches/:matchId/substitutions 是同一種寫法、同一個「進頁重建時避免 N+1」的理由。
router.get("/matches/:matchId/lineups", async (req, res) => {
  const { matchId } = ListMatchLineupsParams.parse(req.params);

  if (!(await matchBelongsToUser(matchId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // getTableColumns(lineupsTable) 讓 join 後的 select 只回傳 lineups 的欄位（扁平形狀），
  // 不會變成 { lineups: {...}, sets: {...} } 的巢狀結構。依 setId 排序（＝依局數順序，
  // 因為 set row 是照局數建立的），前端照順序對回每一局即可。
  const rows = await db
    .select(getTableColumns(lineupsTable))
    .from(lineupsTable)
    .innerJoin(setsTable, eq(lineupsTable.setId, setsTable.id))
    .where(eq(setsTable.matchId, matchId))
    .orderBy(lineupsTable.setId);

  res.json(rows);
});

// PUT /sets/:setId/lineup — 設定（upsert）這一局的起始先發。
// 用 PUT 而非 POST：schema 的 setId 是 unique（一局一 row），教練重按先發或修正時，同一局
// 直接覆寫那一 row，不會長出第二筆。onConflictDoUpdate 把「已經有這局的先發就更新、沒有就新增」
// 這件事交給 DB 一次做完（atomic），應用層不用自己先查再決定 insert/update。
router.put("/sets/:setId/lineup", async (req, res) => {
  const { setId } = PutSetLineupParams.parse(req.params);
  const body = PutSetLineupBody.parse(req.body);

  if (!(await setBelongsToUser(setId, req.userId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // 「六人不得重複」DB 層沒有內建約束（見 lineups.ts 註解），在這裡擋掉：六個號位若指到
  // 同一個球員，就是無效的先發（一個人不能同時站兩個位置）。用 Set 去重後長度應為 6。
  const ids = [
    body.zone1PlayerId,
    body.zone2PlayerId,
    body.zone3PlayerId,
    body.zone4PlayerId,
    body.zone5PlayerId,
    body.zone6PlayerId,
  ];
  if (new Set(ids).size !== 6) {
    res.status(400).json({ error: "Lineup must have six distinct players" });
    return;
  }

  const values = {
    setId,
    zone1PlayerId: body.zone1PlayerId,
    zone2PlayerId: body.zone2PlayerId,
    zone3PlayerId: body.zone3PlayerId,
    zone4PlayerId: body.zone4PlayerId,
    zone5PlayerId: body.zone5PlayerId,
    zone6PlayerId: body.zone6PlayerId,
  };

  const [saved] = await db
    .insert(lineupsTable)
    .values(values)
    // 衝突鍵是 setId（unique）：已經有這局的先發就把六個號位整組更新成新的一份。
    .onConflictDoUpdate({ target: lineupsTable.setId, set: values })
    .returning();

  res.json(saved);
});

export default router;
