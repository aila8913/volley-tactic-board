import { Router, type IRouter } from "express";
import { and, eq, asc } from "drizzle-orm";
import {
  db,
  matchesTable,
  teamsTable,
  peopleTable,
  seedDemoData,
  type DbOrTx,
} from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { handler } from "../lib/handler";

// #336：試用者一登入就能按一顆「載入示範資料」，把一整份示範比賽（球隊/人員/比賽/局分/
// 戰術）灌進**他自己的帳號**，不用面對空白畫面就要自己摸索怎麼建第一場比賽。這三支路由
// 是 PR2（後端端點）——真正「怎麼建構一份示範資料」的邏輯早在 PR1 就抽成純函式
// seedDemoData（見 lib/db/src/demoData.ts），這裡只是負責「查有沒有」「刪」「重種」。
const router: IRouter = Router();
router.use(requireAuth);

// owns: "public" ——這三支路由操作的都是「這個 userId 名下的示範資料」，擁有權隔離發生在
// 下面查詢/刪除的 where 條件裡（永遠帶 eq(userId)），不是靠 handler 的單一資源 owns 檢查擋。
// 跟 GET /teams、POST /teams 是同一個理由（見 routes/teams.ts 開頭那兩支的註解）：owns 是
// 必填欄位，想公開整支路由（不檢查單一資源擁有權）也得明講 "public"，不能留白讓人以為漏寫。

// where 條件永遠是「這個使用者的」+「標了 isDemo」兩者都要——白名單寫法，理由見
// deleteDemoDataFor 下面的大段說明。這裡抽成小工具，POST/DELETE/查詢都用它，避免兩處各寫
// 一次、其中一處漏掉某個條件（例如漏了 isDemo，變成刪光使用者所有比賽）。
function isUserDemoMatch(userId: string) {
  return and(eq(matchesTable.userId, userId), eq(matchesTable.isDemo, true));
}
function isUserDemoTeam(userId: string) {
  return and(eq(teamsTable.userId, userId), eq(teamsTable.isDemo, true));
}
function isUserDemoPerson(userId: string) {
  return and(eq(peopleTable.userId, userId), eq(peopleTable.isDemo, true));
}

// 刪掉「這個使用者名下」的示範資料。POST（載入／重設）跟 DELETE 都呼叫這支，兩處共用同一份
// 刪除邏輯，不會出現「POST 的清除邏輯」跟「DELETE 的清除邏輯」各自維護、日後改一處忘了改
// 另一處的風險。
//
// ── 刪除順序是 matches → teams → people，不能顛倒 ──
// 這是整支路由最需要小心的地方：
//   1. matches 刪掉會 cascade 掉 players / sets / rallies / events / lineups /
//      substitutions / timeouts / tactics（見 schema 裡各表 onDelete: "cascade" 的外鍵），
//      所以刪 matches 這一步順便把示範比賽底下的所有巢狀資料都清乾淨了。
//   2. 但 players.personId 的外鍵是 **onDelete: "set null"**（不是 cascade），
//      matches.teamId 也是 **onDelete: "set null"**（見 schema/players.ts、schema/matches.ts）。
//      如果先刪 people/teams，會先把「使用者自己的比賽」裡指向示範人員的 personId、
//      指向示範球隊的 teamId 洗成 null，才輪到刪示範比賽本身——順序顛倒不會噴錯誤（set null
//      本來就是合法操作），只會安靜地弄壞使用者自己的資料，事後很難追查。所以一定要先刪
//      matches（此時它自己的 players 也還沒被任何人碰過），再刪 teams/people。
//
// ── 已知的邊界情況（set null 是設計選擇，不是 bug） ──
// 如果使用者把示範人員（例如林小美）指派到**他自己建的**比賽當名單成員，刪除示範資料時
// 那筆 players 列的 personId 會被 set null——球員名單列本身還在（名字/背號/位置都留著），
// 只是「這個人跟哪個 people 身分綁在一起」這件事被清掉了。這正是 onDelete: "set null" 這個
// 外鍵設計本來就要達成的行為：保留「這個球員存在過」的事實，只是失去了跨場身分的錨點，跟
// 「刪掉一個 team 只會把 matches.teamId 設回 null」是同一套取捨（見 schema/teams.ts）。
async function deleteDemoDataFor(exec: DbOrTx, userId: string): Promise<void> {
  await exec.delete(matchesTable).where(isUserDemoMatch(userId));
  await exec.delete(teamsTable).where(isUserDemoTeam(userId));
  await exec.delete(peopleTable).where(isUserDemoPerson(userId));
}

// 查目前這個使用者名下有沒有示範資料，回傳 GET 要的 { present, matchIds } 形狀。
// POST 不呼叫這支——它剛種完，seedDemoData 的回傳值裡已經有 matchIds 了，再查一次資料庫
// 是白做工。兩邊回應的形狀仍然一致（openapi.yaml 的 DemoDataStatus 同一個 schema），
// 只是來源不同：GET 查資料庫，POST 用剛剛種出來的結果。
async function getDemoDataStatus(
  exec: DbOrTx,
  userId: string,
): Promise<{ present: boolean; matchIds: number[] }> {
  const rows = await exec
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(isUserDemoMatch(userId))
    .orderBy(asc(matchesTable.date));
  const matchIds = rows.map((r) => r.id);
  return { present: matchIds.length > 0, matchIds };
}

// GET /demo-data — 目前這個帳號有沒有示範資料。
router.get(
  "/demo-data",
  handler({ owns: "public" }, async ({ res, userId }) => {
    const status = await getDemoDataStatus(db, userId);
    res.json(status);
  }),
);

// POST /demo-data — 「載入示範資料」跟「重設示範資料」是同一支端點：不管示範資料存不存在，
// 一律先刪乾淨、再重種一份全新的。這樣使用者不用先自己判斷「我是不是已經載入過」——按下去
// 永遠拿到一份乾淨、跟 seedDemoData 定義完全一致的示範資料，不會因為重複按而累積出兩份
// （4 場變 8 場）。
//
// 整段包在 db.transaction 裡，把 tx 當成 exec 往下傳給 deleteDemoDataFor／seedDemoData：
// 「刪一半」或「種一半」都是很糟的狀態（前者可能把使用者自己的資料弄壞一半就中斷，後者是
// 帳號底下留一份殘缺的示範資料——球隊建好了但比賽沒建完之類）。transaction 保證這整段刪除
// ＋重種要嘛全部成功、要嘛一發生錯誤就整個 rollback，不會停在中間的狀態。lib/db/src/demoData.ts
// 的 seedDemoData 之所以吃 exec（DbOrTx）參數而不是直接 import 用 module 層的 db，
// 就是為了讓這裡能把 tx 傳進去（見那支檔案開頭的說明）。
router.post(
  "/demo-data",
  handler({ owns: "public" }, async ({ res, userId }) => {
    const summary = await db.transaction(async (tx) => {
      await deleteDemoDataFor(tx, userId);
      return seedDemoData(tx, userId);
    });
    res.status(201).json({ present: true, matchIds: summary.matchIds });
  }),
);

// DELETE /demo-data — 單純刪掉這個帳號的示範資料，不重種。不用包 transaction——
// deleteDemoDataFor 裡三個 delete 各自都是獨立、冪等的操作（就算中途失敗，已經刪掉的部分
// 也不會讓資料處於「無法辨識」的狀態，頂多是使用者需要再按一次刪除），跟 POST 那種
// 「刪了就一定要接著種回去」的複合操作不同，不需要用 transaction 綁在一起。
router.delete(
  "/demo-data",
  handler({ owns: "public" }, async ({ res, userId }) => {
    await deleteDemoDataFor(db, userId);
    res.status(204).end();
  }),
);

export default router;
