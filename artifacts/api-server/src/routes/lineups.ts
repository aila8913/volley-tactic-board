import { Router, type IRouter } from "express";
import { eq, getTableColumns } from "drizzle-orm";
import { db, lineupsTable, setsTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { setBelongsToUser, matchBelongsToUser, playerBelongsToSetMatch } from "../lib/ownership";
import type { EveryColumnOnInsert } from "../lib/everyColumn";
import { ListMatchLineupsParams, PutSetLineupParams, PutSetLineupBody } from "@workspace/api-zod";

// 一局（set）的起始先發：我方六個號位各站哪個球員（見 lib/db/src/schema/lineups.ts）。
// 這是計分表「先發名單」的持久層——比分/輪轉能從 rally 序列重放，但「第 3 輪 4 號位站誰」
// 需要一個推不出來的種子，就是這張表。前端在教練選好先發方（開賽）那一刻寫入，reload 時讀回，
// 讓計分表擁有自己一份跟戰術板/輪轉表解耦的先發快照（issue #115）。
//
// 讀（bulk）掛在 /matches/:matchId/lineups 底下（先驗 match 擁有權）；
// 寫掛在 /sets/:setId/lineup 底下（先驗 set 擁有權，往上追到 match.userId）。
const router: IRouter = Router();
router.use(requireAuth);

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

  // ── 自由球員兩欄的把關（#359）────────────────────────────────────────────────
  // body 沒帶就是 null（＝這局沒排 L），`?? null` 讓「沒帶」與「明確傳 null」收斂成同一個值，
  // 下面三道檢查與寫入都只要處理 null 一種「沒有」。
  const startingLiberoId = body.startingLiberoId ?? null;
  const liberoReplacesPlayerId = body.liberoReplacesPlayerId ?? null;

  // (1) 頂替總得有人來頂：只有 replaces 沒有 starting 是無效狀態（見 schema 的三種合法組合）。
  if (liberoReplacesPlayerId !== null && startingLiberoId === null) {
    res.status(400).json({ error: "liberoReplacesPlayerId requires startingLiberoId" });
    return;
  }

  // (2) 被頂替的人必須是這六個號位裡的其中一個，而 L 本人必須**不在**六個號位裡。
  // 這兩條是同一件事的兩面：L 不佔號位、它是頂替某個佔號位的人上場。少了這道，
  // 前端一個 bug 就能寫進「L 站在 3 號位」或「頂替一個根本沒上場的人」這種推導不出畫面的資料。
  if (liberoReplacesPlayerId !== null && !ids.includes(liberoReplacesPlayerId)) {
    res.status(400).json({ error: "liberoReplacesPlayerId must be one of the six zone players" });
    return;
  }
  if (startingLiberoId !== null && ids.includes(startingLiberoId)) {
    res.status(400).json({ error: "startingLiberoId must not occupy a zone" });
    return;
  }

  // (3) 擁有權／脈絡合法性（ADR-0009）：body 帶進來的球員 id，驗的是「在不在這一局所屬比賽的
  // 名單裡」，不是「是不是這個使用者的球員」。前者更嚴，而且自動蘊含後者（set 的擁有權上面
  // 已經驗過）。回 404 而不是 400，跟其他擁有權失敗共用同一種回覆，不外洩「這個 id 存在」。
  const bodyPlayerIds = [startingLiberoId, liberoReplacesPlayerId].filter(
    (pid): pid is string => pid !== null,
  );
  for (const pid of bodyPlayerIds) {
    if (!(await playerBelongsToSetMatch(pid, setId))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }

  // 這個 values 物件同時餵給 insert 跟 onConflictDoUpdate 的 set（見下方）——兩種情境剛好
  // 都是「把六個號位整組寫成新的一份」，值完全相同，所以共用同一個物件沒有問題。
  // 型別標註用 EveryColumnOnInsert（而不是 OnUpdate）：insert 這邊的窮舉檢查較嚴格
  // （少列一欄就編譯不過），能滿足它，自然也能滿足較寬鬆的 update 用法。
  const values: EveryColumnOnInsert<typeof lineupsTable> = {
    // id 是 serial 主鍵，交給資料庫自動遞增；lineups 沒有 client-mintable id 的設計。
    id: undefined,
    setId,
    zone1PlayerId: body.zone1PlayerId,
    zone2PlayerId: body.zone2PlayerId,
    zone3PlayerId: body.zone3PlayerId,
    zone4PlayerId: body.zone4PlayerId,
    zone5PlayerId: body.zone5PlayerId,
    zone6PlayerId: body.zone6PlayerId,
    // #359：兩欄一律寫入（PUT 是整份覆寫），沒帶就寫 null——不能用「有帶才寫」的 patch 語意，
    // 否則教練把 L 拿掉之後重存，舊的指派會留在 DB 裡，變成畫面說沒有、資料庫說有。
    startingLiberoId,
    liberoReplacesPlayerId,
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
