// 一次性資料回填腳本：把 #213 之前建立的 players 列補上 personId。
//
// 背景：people 表（lib/db/src/schema/people.ts）是「人」的跨場唯一身分，players.personId
// 指回它，讓同一個人跨比賽/跨球隊的紀錄可以串起來（球員生涯分析的基礎）。#213 把 people
// 接上前端之後，只有「之後新送出」的名單會自動建 person 並綁上 personId
// （見 artifacts/volleyball-tactics/src/components/MatchFormDialog.tsx）；#213 之前
// 建立的 players 列 personId 還是 null，永遠不會出現在跨場分析裡——這支腳本就是在補這個洞。
//
// 為什麼是一次性腳本、不是後端 endpoint：
//   這是「資料遷移」而不是「產品功能」。MatchFormDialog 現在建立名單的當下就會自動建 person，
//   代表從 #213 上線之後就不會再產生新的 null-personId 名單列——每個環境（本機、雲端 DB）只需要
//   跑這支腳本一次就能把歷史資料補齊，之後不會再需要跑第二次（除非又手動塞資料進 DB）。
//   如果把這個邏輯做成一個永久掛著的 API endpoint，它平常什麼用都沒有，卻多一個要維護、
//   要防範濫用的攻擊面——純粹是死程式碼。用 tsx 跑的一次性腳本，需要時手動執行、跑完即棄，
//   比較符合它「遷移」的本質。
//
// 回填策略：每一個「沒綁定的名單列」各自建一筆全新的 person，不做任何同名自動合併。
//   這是 #213 當初定下的判準：「能不能自動化」取決於「猜錯的方向會不會產生錯誤答案」。
//   如果自動合併同名列（例如把兩場比賽裡都叫「王小明」的名單列，自動認定成同一個 person），
//   一旦系隊裡真的有兩個不同的王小明（同名同姓在系隊情境並不罕見），資料就會被錯誤地永久
//   混在一起——之後很難反悔，因為兩個人的生涯數據已經疊在同一筆 person 底下，沒辦法乾淨切開。
//   反過來，「不合併、每列各自建一個 person」最壞的結果只是「同一個人被拆成好幾筆身分」，
//   這種狀態底層資料仍然正確（只是還沒串起來），可以留給使用者透過 #221 規劃的「人員合併 UI」
//   自己確認、自己合併——猜錯不會製造假資料，只是需要多一步人工確認，所以可以放心自動做。
//
// 例外：同一場比賽內的名單列彼此互不合併，因為一場比賽的名單裡不可能同一個人出現兩次
//   （每個人這場比賽只會有一個背號/位置），所以「一列一個 person」本來就是正確答案，
//   不需要額外的邏輯去判斷「這幾列是不是同一場的同一個人」。

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 單純 `import "dotenv/config"` 只會去「執行時的 process.cwd()」找 .env——但這支腳本是用
// `pnpm --filter @workspace/scripts run backfill-person-ids` 執行的，pnpm 會把 cwd 切到
// scripts/ 這個子套件目錄，不是 repo 根目錄，所以找不到放在根目錄的 .env（DATABASE_URL 就讀不到）。
// 這裡改成用「這支腳本檔案自己的路徑」往上兩層算出 repo 根目錄（scripts/src → scripts → 根目錄），
// 不管使用者是從哪個目錄下指令執行，都能穩定找到同一個 .env——概念上跟 api-server 的
// `--env-file-if-exists=../../.env`（見 artifacts/api-server/package.json 的 start script）
// 是同一件事，只是那邊是靠 package.json 裡固定的相對路徑，這裡靠腳本檔案位置自己算。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(repoRoot, ".env") });

// @workspace/db 的 index.ts 在「被 import 的當下」就會立刻檢查 process.env.DATABASE_URL 存不存在
// （見 lib/db/src/index.ts）；一般的 `import { db } from "@workspace/db"` 屬於 import 宣告，
// ES module 規範規定所有 import 宣告要在檔案最上面、且在其他程式碼跑之前就先被解析執行——
// 這代表就算把它寫在上面 loadEnv() 呼叫「之後」的那一行，實際執行順序還是會比 loadEnv() 早，
// DATABASE_URL 還沒被讀進 process.env 就先炸了。用 dynamic import（`await import(...)`）
// 把它改成一般的「執行到這一行才載入」，才能確保 loadEnv() 真的先跑完。
const { eq, isNull, isNotNull } = await import("drizzle-orm");
const { db, pool, playersTable, matchesTable, peopleTable } = await import("@workspace/db");

// process.argv 前兩個固定是「node 執行檔路徑」跟「這支腳本的路徑」，實際帶的參數從第三個開始。
// 預設 dry-run（不寫入）是刻意的：這是一次性、不可逆的資料寫入操作（一旦建了 person 並綁上
// personId，就會影響之後的生涯分析統計），跑之前應該先看報告確認「範圍/量級符合預期」，
// 而不是不小心執行到就真的寫進資料庫——寧可多打一次指令，也不要不小心寫錯資料。
const shouldApply = process.argv.includes("--apply");

async function main() {
  // 一次查出所有「沒綁定 personId」的 players 列，順便 inner join matches 拿到
  // 這一列所屬比賽的 userId（新建的 person 要歸屬到正確的使用者名下，不能寫死）。
  const unboundRows = await db
    .select({
      playerId: playersTable.id,
      playerName: playersTable.name,
      matchId: playersTable.matchId,
      matchUserId: matchesTable.userId,
    })
    .from(playersTable)
    .innerJoin(matchesTable, eq(playersTable.matchId, matchesTable.id))
    .where(isNull(playersTable.personId));

  // 已綁定的列數只是拿來做報告用的對照組（總列數 = 已綁定 + 沒綁定），不影響回填邏輯本身。
  const boundRows = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(isNotNull(playersTable.personId));

  // 理論上 matches.userId 是 notNull 欄位（見 schema），不應該出現 null/空字串，
  // 但這裡仍然防守性地檢查——萬一真的出現不正常資料，要跳過並在報告裡列出來，
  // 而不是硬塞一個沒有意義的 userId 進新建的 person。
  const skipped = unboundRows.filter((row) => !row.matchUserId || row.matchUserId.trim() === "");
  const toBackfill = unboundRows.filter((row) => row.matchUserId && row.matchUserId.trim() !== "");

  const distinctMatchIds = new Set(unboundRows.map((row) => row.matchId));

  // 依姓名分組，找出「同名出現最多次」的前 20 名——這些之後很可能是同一個人被拆成
  // 好幾筆 person，適合優先丟進 #221 的合併 UI 裡人工確認。
  const nameCounts = new Map<string, number>();
  for (const row of toBackfill) {
    nameCounts.set(row.playerName, (nameCounts.get(row.playerName) ?? 0) + 1);
  }
  const topNames = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  // ---- 印報告：dry-run 跟 apply 都會印，讓兩種模式看到的資訊一致，方便對照 ----
  console.log(`模式：${shouldApply ? "apply（會真的寫入）" : "dry-run（只印報告，不寫入）"}`);
  console.log("");
  console.log("== 掃描結果 ==");
  console.log(`沒綁定 personId 的列數：${unboundRows.length}`);
  console.log(`已綁定 personId 的列數：${boundRows.length}`);
  console.log(`players 總列數：${unboundRows.length + boundRows.length}`);
  console.log(`沒綁定的列散在 ${distinctMatchIds.size} 場比賽`);

  if (skipped.length > 0) {
    console.log("");
    console.log(`跳過（match.userId 為 null 或空字串，理論上不該出現）：${skipped.length} 列`);
    for (const row of skipped) {
      console.log(`  - playerId=${row.playerId} matchId=${row.matchId} name="${row.playerName}"`);
    }
  }

  console.log("");
  console.log(`會新建的 person 數：${toBackfill.length}`);

  if (toBackfill.length === 0) {
    // 這支腳本天然冪等：只挑 personId is null 的列，跑完第一次之後這些列全部都有
    // personId 了，第二次執行自然查不到任何符合條件的列。這裡明確印出來，
    // 讓使用者不用去猜「是不是漏跑了」還是「本來就沒事做」。
    console.log("0 列需要回填 —— 這支腳本是冪等的，重複執行不會有副作用。");
  }

  if (topNames.length > 0) {
    console.log("");
    console.log("== 同名出現最多次的前 20 名（依將回填的列統計）==");
    for (const [name, count] of topNames) {
      console.log(`  ${name}：${count} 次`);
    }
    console.log(
      "提醒：這裡列出的重複姓名，回填後會各自變成獨立的 person（不自動合併，理由見檔案頂端註解）。" +
        "如果其中有些其實是同一個人，之後請透過 #221 規劃的人員合併 UI 自行確認、手動合併。",
    );
  }

  if (!shouldApply) {
    console.log("");
    console.log("這是 dry-run，沒有寫入任何資料。要真的執行回填，請加上 --apply 參數。");
    return;
  }

  if (toBackfill.length === 0) {
    return;
  }

  // 整批包在一個 transaction 裡：這批操作本質上是「N 筆 person + N 筆 player 更新」
  // 一起成功或一起失敗的單一個邏輯操作——如果跑到一半斷線或某一筆寫入失敗，
  // 不應該留下「有些名單列綁好了、有些還沒」的中間狀態（那種半吊子狀態比完全沒跑更難排查）。
  // db.transaction 會把整個 callback 包進一個資料庫 transaction：只要 callback 內丟出例外，
  // Drizzle 就會自動 ROLLBACK，把這批操作內已經寫進去的東西全部復原，回到跑之前的樣子。
  await db.transaction(async (tx) => {
    for (const row of toBackfill) {
      const [person] = await tx
        .insert(peopleTable)
        .values({
          name: row.playerName,
          // 這裡刻意從 join 出來的 matches.userId 取值，而不是寫死某個固定字串——
          // 每一列名單本來就屬於某個使用者的某場比賽，新建的身分自然也該歸屬到同一個使用者。
          userId: row.matchUserId,
        })
        .returning({ id: peopleTable.id });

      await tx
        .update(playersTable)
        .set({ personId: person.id })
        .where(eq(playersTable.id, row.playerId));
    }
  });

  console.log("");
  console.log(`已完成：新建 ${toBackfill.length} 筆 person，並回填對應的 players.personId。`);
}

main()
  .catch((error: unknown) => {
    console.error("回填失敗：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // pg 的連線池不會自己關掉——腳本結束後如果不呼叫 pool.end()，
    // node process 會因為底層 socket 還開著而卡住不退出。
    await pool.end();
  });
