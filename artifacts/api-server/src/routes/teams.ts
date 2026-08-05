import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, teamsTable, playersTable, matchesTable, peopleTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { teamBelongsToUser } from "../lib/ownership";
import { handler } from "../lib/handler";
import {
  CreateTeamBody,
  UpdateTeamParams,
  UpdateTeamBody,
  DeleteTeamParams,
  ListTeamRosterSuggestionsParams,
} from "@workspace/api-zod";

// 球隊（team）的 CRUD。team 只是「分組標籤」——標記一場比賽是哪支隊伍打的，之後才能
// 按球隊切片統計（#65 視圖二）。跟 tournaments 同一套 requireAuth + userId 擁有權隔離。
//
// 跟 tournaments 兩處刻意不同：
//   1. teams.id 是 serial 整數（DB 自動遞增），不是 client-mintable 的 uuid，所以 POST
//      不收 body.id、URL 參數用整數。整數 id 對「標籤」這種輕量分組已足夠，也讓
//      matches.teamId 這個外鍵是便宜的整數比對。
//   2. DELETE 不 cascade：matches.teamId 的外鍵是 onDelete: "set null"（見
//      lib/db/src/schema/matches.ts），刪掉一支球隊只會把指著它的比賽 teamId 設回 null
//      （變「未分類」），比賽本體不受影響——標籤沒了不該牽連比賽紀錄。
const router: IRouter = Router();
router.use(requireAuth);

// GET /teams — 列出目前使用者的所有球隊。teams 沒有 createdAt 欄位，用 serial id 排序
// 當作「建立順序」的近似（id 遞增＝越後面建立）。
// owns: "public" ——理由跟 matches.ts 的 GET /matches 一樣：這支路由查的是
// 「這個 userId 名下的球隊」，擁有權篩選發生在下面的 where 條件
// （eq(teamsTable.userId, ...)），不是靠單一資源的 owns 檢查擋。owns 是必填欄位
// （見 handler.ts 的說明），所以用 "public" 明講。
router.get(
  "/teams",
  handler({ owns: "public" }, async ({ req, res }) => {
    const teams = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.userId, req.userId))
      .orderBy(teamsTable.id);

    res.json(teams);
  }),
);

// POST /teams — 建立球隊。userId 由後端從 auth 注入，不是 client 送的；id 交給 DB 的 serial
// 自動遞增（不像 tournaments 收 client 生的 uuid）。
// owns: "public" ——這裡是建立一筆全新的資源、掛在 req.userId 底下，沒有既有資料要驗
// 擁有權（不像 matches.ts 的 POST 要驗 body.tournamentId / body.teamId 是不是這個使用者的），
// 所以跟 GET 一樣明講 "public"，而不是留白讓人誤以為漏寫。
router.post(
  "/teams",
  handler({ body: CreateTeamBody, owns: "public" }, async ({ res, body, userId }) => {
    const [created] = await db
      .insert(teamsTable)
      .values({
        userId,
        name: body.name,
      })
      .returning();

    res.status(201).json(created);
  }),
);

// GET /teams/:teamId/roster-suggestions — #287：新增比賽時，球隊帶出「這支球隊之前登錄過的
// 人」當建議清單，讓使用者用「勾選＋微調」取代每場都重打一次名單。
//
// 這支刻意寫在 PATCH/DELETE /teams/:teamId 之前——理由跟 people.ts 的
// GET /people/merge-candidates 那段註解一樣：Express 是照路由「註冊順序」一個一個試，不是照
// 路徑特異度排序，如果 PATCH/DELETE /teams/:teamId 先註冊（雖然是不同 HTTP 方法，這裡還踩不到），
// 為了讓順序規則保持一致、之後有人在 :teamId 底下加更多動詞路由時不用回頭搬，這支寫死的
// /teams/:teamId/roster-suggestions 一律排在含萬用參數的 /teams/:teamId 之前。
//
// owns 用 teamBelongsToUser（不是 "public"）：這支吃 path param 指定的單一資源（某支球隊），
// 要先確認這支球隊是這個使用者的，跟 PATCH/DELETE /teams/:teamId 用同一套 owns 檢查。
//
// 查詢＋彙整邏輯：players ⋈ matches（同一場比賽）⋈ people（拿人名），where 條件鎖
// matches.teamId = 這支球隊、matches.userId = 這個使用者、players.personId 非 null——
// 沒有跨場身分的名單列沒辦法拿來當「這是同一個人」的建議。
//
// 用「一次查詢＋JS 端 Map 彙整」而不是在 SQL 裡直接 groupBy：跟 people.ts 的
// getPersonSummaries() 同一個判準——這是單一使用者幾十列量級的小資料（一支球隊登錄過的人
// 不會有幾千筆），JS 端用 Map 彙整可讀性明顯更好，跟 ADR-0003「分析頁的大量聚合留在 SQL」
// 並不衝突，那條講的是分析頁對大量 rally/event 做統計聚合，這裡是小量識別資訊的彙整，
// 是不同量級下的取捨。
//
// name 取 players.name（那場名單上實際登錄的名字），不是 people.name——理由跟上面 openapi.yaml
// 的 RosterSuggestion 註解一樣：people.name 只是跨場身分的標籤，name 要跟 number/role
// 同一列來源（players）才一致，否則可能出現「people.name 是『小明』但那場名單登記的是『阿明』」
// 這種顯示跟建議來源對不起來的怪狀況。
router.get(
  "/teams/:teamId/roster-suggestions",
  handler(
    {
      params: ListTeamRosterSuggestionsParams,
      owns: ({ params, userId }) => teamBelongsToUser(params.teamId, userId),
    },
    async ({ res, params, userId }) => {
      const rows = await db
        .select({
          personId: playersTable.personId,
          name: playersTable.name,
          number: playersTable.number,
          role: playersTable.role,
          matchId: matchesTable.id,
          matchDate: matchesTable.date,
        })
        .from(playersTable)
        .innerJoin(matchesTable, eq(playersTable.matchId, matchesTable.id))
        .innerJoin(peopleTable, eq(playersTable.personId, peopleTable.id))
        // 沒有 personId IS NOT NULL 這個條件，是因為上面 innerJoin peopleTable 已經保證了：
        // personId 是 null 的名單列 join 不到任何 people 列，本來就不會出現在 rows 裡。
        .where(and(eq(matchesTable.teamId, params.teamId), eq(matchesTable.userId, userId)));

      // 在 JS 端依 personId 把上面的扁平列表彙整成「這個人在這支球隊出賽幾場（去重
      // matchId）、最近一場比賽的名字/背號/位置/時間是什麼」——同一個人可能在這支球隊打過
      // 好幾場，會在 rows 裡重複出現好幾次。
      const byPersonId = new Map<
        number,
        {
          personId: number;
          name: string;
          number: number;
          role: "S" | "OH" | "MB" | "OPP" | "L";
          matchIds: Set<number>;
          lastPlayedAt: Date;
        }
      >();
      for (const row of rows) {
        // TypeScript 看不出上面 innerJoin peopleTable 已經保證 personId 非 null，
        // 這裡再判一次讓型別窄化，順便當一層防禦。
        if (row.personId === null) continue;

        let entry = byPersonId.get(row.personId);
        // 只有「還沒看過這個人」或「這一列的比賽日期比目前記錄的更新」才覆寫
        // name/number/role/lastPlayedAt——理由見 openapi.yaml 的 RosterSuggestion 註解：
        // 背號/位置會換季換人變，最近一次最可能還是對的，所以要拿「最新一場」的那一列。
        // 覆寫時把既有的 matchIds 接手過來，不然「出賽幾場」會在遇到更新的一場時被歸零。
        if (entry === undefined || row.matchDate > entry.lastPlayedAt) {
          entry = {
            personId: row.personId,
            name: row.name,
            number: row.number,
            role: row.role,
            matchIds: entry?.matchIds ?? new Set(),
            lastPlayedAt: row.matchDate,
          };
          byPersonId.set(row.personId, entry);
        }
        entry.matchIds.add(row.matchId);
      }

      const suggestions = [...byPersonId.values()]
        .map((entry) => ({
          personId: entry.personId,
          name: entry.name,
          number: entry.number,
          role: entry.role,
          matchCount: entry.matchIds.size,
          lastPlayedAt: entry.lastPlayedAt.toISOString(),
        }))
        // lastPlayedAt 由新到舊，同時間再依 name 排序，保持結果穩定、可預期。
        .sort((a, b) => {
          if (a.lastPlayedAt !== b.lastPlayedAt) {
            return a.lastPlayedAt > b.lastPlayedAt ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      res.json(suggestions);
    },
  ),
);

// PATCH /teams/:teamId — 改名（球隊目前也只有名稱可改）。
// owns 檢查直接查一次「這個 teamId 是不是這個 userId 的」，跟原本 where 裡的
// and(eq(id), eq(userId)) 邏輯等價，只是挪到 owns closure 裡先驗證一次（同 matches.ts）。
// owns 已經先確認過這支球隊存在且是這個使用者的，所以不再像遷移前那樣另外判斷
// `if (!updated)` 404——跟 matches.ts 的 PATCH 一致，兩者都選擇信任 owns 檢查、
// 不重複防禦（DELETE 則保留 returning-length 檢查，理由見下方 DELETE 的註解）。
router.patch(
  "/teams/:teamId",
  handler(
    {
      params: UpdateTeamParams,
      body: UpdateTeamBody,
      owns: ({ params, userId }) => teamBelongsToUser(params.teamId, userId),
    },
    async ({ res, params, body, userId }) => {
      const [updated] = await db
        .update(teamsTable)
        .set({
          // 沿用 matches/tournaments 的「欄位在 body 才寫」技巧，判斷 !== undefined。
          ...(body.name !== undefined && { name: body.name }),
        })
        .where(and(eq(teamsTable.id, params.teamId), eq(teamsTable.userId, userId)))
        .returning();

      res.json(updated);
    },
  ),
);

// DELETE /teams/:teamId — 刪球隊標籤。DB 外鍵 onDelete: "set null" 會把指著這支球隊的
// matches.teamId 自動設回 null（比賽變「未分類」），不會連帶刪比賽——跟 tournaments 的
// cascade 刪除刻意相反（見上方檔案頂註解）。
router.delete(
  "/teams/:teamId",
  handler(
    {
      params: DeleteTeamParams,
      owns: ({ params, userId }) => teamBelongsToUser(params.teamId, userId),
    },
    async ({ res, params, userId }) => {
      // where 一樣綁 userId：別人的球隊刪不到。owns 檢查已經先確認過這支球隊存在
      // 且是這個使用者的，理論上這裡一定會刪到一列；.returning() + 長度檢查保留下來
      // 是不改變原本「靠實際刪掉幾列判斷成功與否」的防禦性寫法（同 matches.ts，#225 的教訓）。
      const deleted = await db
        .delete(teamsTable)
        .where(and(eq(teamsTable.id, params.teamId), eq(teamsTable.userId, userId)))
        .returning({ id: teamsTable.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.status(204).end();
    },
  ),
);

export default router;
