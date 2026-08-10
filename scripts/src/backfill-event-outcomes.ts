// 一次性資料回填腳本：把 #51 第一塊之前建立的 events 列補上 outcome。
//
// 背景：outcome 這個欄位早在 #102（見 lib/db/src/schema/events.ts）就已經建好，但一直
// 「有欄位、沒人寫」——即時記錄路徑（scoreSheetMapping.ts 的 pointRecordToEvent）跟示範資料
// （demoData.ts）都是這次（#51 第一塊）才開始真的填值。這代表在這次修好之前寫進 DB 的所有
// events 列，outcome 全部是 null——這支腳本就是在補這批歷史資料的洞。
//
// 為什麼是一次性腳本、不是後端 endpoint：理由跟 backfill-person-ids.ts 完全一樣（見那支腳本
// 開頭的說明）——這是「資料遷移」不是「產品功能」，修好之後的寫入路徑不會再產生新的
// null-outcome 列，每個環境跑一次就夠，不需要一直掛著一個 API endpoint。
//
// 回填規則：跟 pointRecordToEvent / demoData.ts 用同一條推導式（見
// docs/event-grammar-spec.md 決策 7）——outcome 是「以執行這球的一方（events.side）為基準」，
// 不是以我方為基準：
//   outcome = (events.side === rallies.winner) ? "point" : "loss"
// 這支腳本只處理簡易版留下的資料（一 rally 一 event，且不曾出現過 in_play），所以只會寫入
// point 或 loss，不會寫入 in_play——這跟 docs/event-grammar-spec.md 決策 7 的不變量一致
// （簡易版一個 rally 只記一顆決定球，所以 outcome 只會是 point/loss）。
//
// 安全閘門：只更新 `events.outcome IS NULL` 的列（白名單條件），絕對不會覆寫已經有值的列，
// 也絕對不會對整張表下無條件 UPDATE——就算這支腳本被重複執行、或執行時機晚於預期，最壞
// 結果也只是「查不到符合條件的列、什麼都不做」，不會有覆寫既有資料的風險。

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 同 backfill-person-ids.ts 的理由：pnpm --filter 執行時 cwd 會被切到 scripts/ 子套件，
// 不是 repo 根目錄，用腳本檔案自己的路徑往上兩層找 repo 根目錄的 .env，才能穩定讀到
// DATABASE_URL，不管使用者從哪個目錄下指令。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(repoRoot, ".env") });

// 同 backfill-person-ids.ts 的理由：@workspace/db 的 index.ts 一被 import 就會立刻檢查
// DATABASE_URL 存不存在，靜態 import 的解析時機比上面 loadEnv() 執行還早，得改用 dynamic
// import 確保 loadEnv() 真的先跑完。
const { eq, isNull } = await import("drizzle-orm");
const { db, pool, eventsTable, ralliesTable } = await import("@workspace/db");

// 預設 dry-run（不寫入），理由同 backfill-person-ids.ts：一次性、資料回填一去不好回頭，
// 跑之前應該先看報告確認範圍/量級符合預期，寧可多打一次指令也不要不小心跑錯。
const shouldApply = process.argv.includes("--apply");

async function main() {
  // 只掃「outcome 還是 null」的 events 列（白名單條件），join rallies 拿到誰贏這分，
  // 才能推出 outcome。events.rallyId 是 notNull 外鍵，理論上 innerJoin 不會漏掉任何列。
  const rows = await db
    .select({
      eventId: eventsTable.id,
      side: eventsTable.side,
      rallyId: eventsTable.rallyId,
      winner: ralliesTable.winner,
    })
    .from(eventsTable)
    .innerJoin(ralliesTable, eq(eventsTable.rallyId, ralliesTable.id))
    .where(isNull(eventsTable.outcome));

  console.log(`模式：${shouldApply ? "apply（會真的寫入）" : "dry-run（只印報告，不寫入）"}`);
  console.log("");
  console.log("== 掃描結果 ==");
  console.log(`outcome 為 null 的 events 列數：${rows.length}`);

  if (rows.length === 0) {
    // 天然冪等：只挑 outcome is null 的列，跑完第一次之後這些列全部有 outcome 了，
    // 第二次執行自然查不到符合條件的列。
    console.log("0 列需要回填 —— 這支腳本是冪等的，重複執行不會有副作用。");
    return;
  }

  const pointCount = rows.filter((r) => r.side === r.winner).length;
  const lossCount = rows.length - pointCount;
  console.log(`會寫入 point 的列數：${pointCount}`);
  console.log(`會寫入 loss 的列數：${lossCount}`);

  if (!shouldApply) {
    console.log("");
    console.log("這是 dry-run，沒有寫入任何資料。要真的執行回填，請加上 --apply 參數。");
    return;
  }

  // 整批包在一個 transaction 裡：理由同 backfill-person-ids.ts——這是「N 筆列一起更新」
  // 的單一邏輯操作，跑到一半斷線或某筆失敗不該留下「有些補了、有些沒補」的半吊子狀態。
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const outcome = row.side === row.winner ? ("point" as const) : ("loss" as const);
      await tx.update(eventsTable).set({ outcome }).where(eq(eventsTable.id, row.eventId));
    }
  });

  console.log("");
  console.log(`已完成：回填 ${rows.length} 筆 events.outcome。`);
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
