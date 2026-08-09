// 常駐維護的測試資料種子腳本（#339 之前的舊註解說「非正式產出、用完即刪」，那份已過時——
// 這支腳本現在是「試驗沙盒資料庫」（scratch DB）工作流程的一部分，會被長期使用，不要刪掉）。
//
// 用途：清空整個資料庫，塞入 2 支球隊、4 場比賽、一位「跨兩隊」的球員，讓分析頁視圖②
// （跨場彙總）跟球隊篩選有東西可看；每一局也灌入看起來寫實（有領先互換、連續得分）但
// 100% 可重現的比分過程，並補上 events（每一分記一顆「決定球」），讓球員統計的
// 「決定球矩陣」（artifacts/volleyball-tactics/src/lib/statsMapping.ts 的 buildPlayerMatrix）
// 也有數字可看；另外還補上 lineups（起始先發）與 tactics（已存戰術），讓輪轉表／戰術板／
// 先發站位畫面重灌後也不是空的（#339）。
//
// #336：「建構這份示範資料」的實際邏輯（球隊/人員/比賽/局分/lineups/tactics 怎麼灌）已經
// 抽到 ./demoData.ts 的 seedDemoData()——這支腳本現在只負責「本機沙盒」專屬的部分：safety
// gate、TRUNCATE、印進度訊息、外加一場「別人的比賽」用來驗證 ownership 檢查。之所以抽出去，
// 是因為之後（#336 PR2）正式環境要加一顆「載入示範資料」按鈕，同一份資料要能種到任意使用者
// 的帳號底下，而不是只服務這支本機腳本；詳見 demoData.ts 檔頭的說明。
//
// 什麼時候該跑這支腳本：
//   - 想要一個「內容豐富、可預期」的資料庫來手動測試前端（例如驗證一個新畫面在有資料時
//     長什麼樣子），而且不想污染你平常開發用的那顆資料庫。
//   - schema 改過，想確認新欄位/新表在「完整資料」情境下能不能正常運作。
// 這是破壞性操作（會 TRUNCATE 整個資料庫再重灌）——DATABASE_URL 建議指向一顆專門的
// 「試驗沙盒」本機資料庫，跟平常開發用的那顆分開，才不會每次手動測試都把自己的開發資料
// 洗掉。詳見下方 assertSafeDatabaseHost 那段 production guard，以及 .env.example 裡
// DATABASE_URL 那段的說明。
//
// 執行方式：
//   pnpm run db:reset                    — 從 repo 根目錄跑，等同「schema push（含新表）
//                                           ＋清空＋重灌」，對著全新（連 table 都還沒建）
//                                           的資料庫也能一次跑完
//   pnpm --filter @workspace/db run seed — 只重灌資料，假設 schema 已經是最新的
//
// dotenv 要在最前面載入，因為 ./index.ts 一被載入就會檢查 DATABASE_URL，必須在那之前
// 先把 .env 讀進 process.env。不能用簡單的 `import "dotenv/config"`（它只會找
// process.cwd() 底下的 .env，而這支腳本的 cwd 會隨呼叫方式不同）。
//
// ⚠️ 這一行**必須是第一個 import**，而且不能改寫成「先呼叫某個函式再 import」——
// ES module 的 import 會被提升，任何頂層程式碼都比所有 import 晚執行，那樣寫的話
// 下面的 `./index` 會在 .env 被讀進來之前就載入並 throw。完整說明見 ./loadEnv.ts。
import "./loadEnv";

import { sql } from "drizzle-orm";
import { db, pool, matchesTable } from "./index";
import { seedDemoData } from "./demoData";

// mock auth 階段所有資料都掛在這個固定使用者底下（見 middleware/requireAuth.ts）。
const USER_ID = "mock-user-001";

// 第二個使用者，底下只掛一場空比賽，**不是給畫面看的**——它整場都不會出現在 UI 裡，
// 因為每一支查詢都綁 userId，user-001 登入時撈不到它。它的用途是當「別人的資料」：
// 拿這場的 id 去打 API，就能驗證 ownership 檢查真的擋得住跨使用者存取（#225／#232）。
// 這兩個字串跟 middleware/requireAuth.ts 的常數是刻意用抄的、沒有共用：lib/ 是被 artifacts/
// 匯入的下層，反過來 import 上層會把相依方向倒過來（見 CLAUDE.md 的 repo layout）。
const OTHER_USER_ID = "mock-user-002";

// ── production 安全閘門（#339）──
//
// 這支腳本一開始就會 TRUNCATE 整個資料庫。如果哪天 .env 不小心指到正式環境的
// DATABASE_URL（例如複製貼上時貼錯、或部署平台不小心把正式環境的連線字串塞進本機
// shell），這支腳本會毫不猶豫地把正式資料全部洗掉——這個函式就是擋在 TRUNCATE 前面
// 的最後一道防線。
//
// ── 為什麼要用「白名單」而不是「黑名單」──
// 直覺上比較容易寫的版本是黑名單：`if (host !== "production") 才准跑`——但這種寫法的
// 邏輯漏洞在於，它只擋得住「剛好長得跟你寫的字串一樣」的那一種危險情況，對於任何
// 「沒被想到、但其實同樣危險」的值，一律預設放行。例如正式站的 host 其實叫
// `prod-db.example.com`，黑名單只擋 `"production"` 這個字，`prod-db.example.com`
// 完全不會被攔下來；又例如同事把測試站取名叫 `staging.example.com`，同樣會直接通過。
// 黑名單本質上是在窮舉「我想得到的壞情況」，而攻擊面/意外的種類永遠比你想得到的多。
//
// 白名單反過來：只窮舉「我確定安全的情況」（本機常見的幾種 host 名稱），其餘一律
// 當作不安全、擋下來，包含任何你根本沒想過的值。代價是「合法但沒被列進白名單」的情況
// 也會被誤擋（例如有人真的想拿一顆遠端的 scratch DB 測試），但這正是下面
// ALLOW_DESTRUCTIVE_SEED 逃生門存在的理由——安全機制寧可「預設拒絕、需要時手動放行」，
// 也不要「預設放行、只擋想得到的名字」。這是這個 repo 既有的安全閘門慣例
// （`=== "development"` 這種允許清單，而不是 `!== "production"` 這種拒絕清單）。
function assertSafeDatabaseHost(): void {
  // 逃生門：如果你的「試驗沙盒」資料庫本身就架在遠端（例如公司內網的一顆共用測試機），
  // 白名單擋不住它，這裡給一個「你必須手動、明確」表態的辦法。刻意要求完全等於
  // 字串 "yes"（不是任何 truthy 值，例如 "true"/"1" 都不算），是為了避免有人不小心把
  // 這個環境變數設成別的用途的值（例如某支 CI script 順手把一堆環境變數設成 "1"），
  // 意外繞過這道閘門。
  if (process.env.ALLOW_DESTRUCTIVE_SEED === "yes") {
    console.log(
      "⚠️  ALLOW_DESTRUCTIVE_SEED=yes，略過 production 安全檢查，直接對 DATABASE_URL 指向的資料庫執行 TRUNCATE。",
    );
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  // DATABASE_URL 沒設的情況交給 lib/db/src/index.ts 的既有檢查去丟錯（它在這支腳本
  // import { db } 的當下就會執行），這裡不用重複判斷、也不用在這裡就 process.exit。
  if (!databaseUrl) return;

  let host: string;
  try {
    // Node 內建的 URL 剖析器：postgres://user:pass@host:port/db 這種連線字串本來就是
    // 合法的 URL 格式，直接借用瀏覽器/Node 都有的 URL API 解析，不用自己手刻正規表達式
    // 去掰連線字串（連線字串裡帳號密碼含特殊字元時，手刻正規表達式很容易切錯）。
    const parsed = new URL(databaseUrl);
    // IPv6 的 host 在 URL 裡會被方括號包住（例如 "[::1]"），.hostname 讀出來也帶著
    // 方括號，這裡去掉方括號，才能跟下面白名單裡單純的 "::1" 字串精準比對。
    host = parsed.hostname.replace(/^\[|\]$/g, "");
  } catch {
    // 連線字串長得不像合法 URL（格式壞掉），沒辦法判斷它安不安全，一律當作不安全
    // ——同樣是「白名單」精神：無法確認安全，就不准跑。
    console.error(
      `[seed-testdata] 無法解析 DATABASE_URL，判斷不了它指向哪個 host，拒絕執行。\n` +
        `如果你確定這顆資料庫是安全的（例如你的試驗沙盒資料庫），可以設定\n` +
        `ALLOW_DESTRUCTIVE_SEED=yes 略過這道檢查。`,
    );
    process.exit(1);
  }

  // 白名單：只允許「明顯是本機」的幾種寫法。localhost/127.0.0.1/::1 是最常見的三種
  // 「這台機器自己」的寫法（分別是主機名稱、IPv4 loopback、IPv6 loopback）；
  // host.docker.internal 是 Docker Desktop 提供的慣例名稱，讓容器內部連回宿主機
  // （這個 repo 用 docker-compose 起本機 Postgres 時常見的連法）。
  const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
  if (ALLOWED_HOSTS.has(host)) return;

  console.error(
    `[seed-testdata] 拒絕執行：DATABASE_URL 指向的 host 是「${host}」，看起來不是本機資料庫。\n` +
      `這支腳本會 TRUNCATE 整個資料庫，只允許對著本機（localhost / 127.0.0.1 / ::1 /\n` +
      `host.docker.internal）執行，避免不小心洗掉正式環境的資料。\n\n` +
      `如果你確定「${host}」是安全的（例如它是你自己的遠端試驗沙盒資料庫），\n` +
      `可以設定環境變數 ALLOW_DESTRUCTIVE_SEED=yes 明確放行後再跑一次：\n` +
      `  ALLOW_DESTRUCTIVE_SEED=yes pnpm --filter @workspace/db run seed`,
  );
  // 刻意不呼叫 pool.end()：程式跑到這裡為止，這支腳本還沒有對資料庫發出任何一次查詢
  // （db.execute(sql\`TRUNCATE...\`) 是 main() 接下來才會做的第一件事），pg 的連線池
  // 只有在真的送出查詢時才會真正打開 socket，所以這裡沒有連線可以「掛著」需要收尾。
  // 直接結束行程即可。
  process.exit(1);
}

async function main() {
  // 0) production 安全閘門：確定 DATABASE_URL 指向的是本機資料庫，才繼續往下做任何事。
  assertSafeDatabaseHost();

  // 1) 清空所有資料。RESTART IDENTITY 讓 serial id 從 1 重來，CASCADE 連同 FK 依賴的
  // 子表一起清（players/sets/rallies/events/lineups…）。TRUNCATE 一次列出所有表最省事。
  console.log("清空資料庫…");
  await db.execute(sql`
    TRUNCATE TABLE
      tournaments, matches, players, sets, rallies, events,
      lineups, substitutions, timeouts, tactics, people, teams
    RESTART IDENTITY CASCADE
  `);

  // 2)~4) 灌一份完整的示範資料（球隊、人員、比賽、局分、events、lineups/tactics）到
  // USER_ID 底下——實際邏輯在 ./demoData.ts 的 seedDemoData()，這裡傳 module 層的 db
  // 進去（不需要 transaction：這支腳本本來就先 TRUNCATE 整顆資料庫重來，就算灌到一半
  // 失敗，反正下次重跑會再 TRUNCATE 一次，不像 #336 PR2 的正式環境按鈕要顧慮「灌一半」
  // 的殘留狀態）。
  //
  // 進度訊息只剩一行（以前是「建立球隊…」「建立人員…」…四行，隨著每一步印出來）。
  // 抽出 seedDemoData 之後那些步驟都在函式裡面，這裡沒辦法再逐步插話——與其把四行全部
  // 擠在呼叫之前一次印完（那會變成謊報：先發都還沒建就先印「建立先發…」），不如誠實地
  // 只印一行涵蓋整段。要恢復逐步回報的話，正確做法是讓 seedDemoData 收一個 onProgress
  // callback，但目前只有這支腳本在看終端機輸出，不值得為它加一個參數。
  console.log("建立示範資料（球隊、人員、比賽、局分、決定球 events、先發、戰術）…");
  const summary = await seedDemoData(db, USER_ID);

  // 5) 「別人的」比賽。刻意不走 seedDemoData（那支只種給它收到的那一個 userId，而且會連帶
  // 生名單/局/球，那些對這個用途完全用不到）——直接插一列最小的 match 就夠了，因為要驗的只有
  // 「這個 id 存在、但不是你的」。它不掛 teamId，避免混進 user-001 的球隊篩選語意。
  const [foreignMatch] = await db
    .insert(matchesTable)
    .values({
      userId: OTHER_USER_ID,
      name: null,
      opponent: "（其他使用者的比賽，勿在 UI 期待看到）",
      date: new Date("2026-07-10T19:00:00+08:00"),
      format: "best_of_3",
    })
    .returning({ id: matchesTable.id });

  console.log("\n完成！塞入內容：");
  console.log(`  球隊：${summary.teams.map((t) => `${t.name}(id=${t.id})`).join("、")}`);
  console.log(
    `  人員：${summary.peopleCount} 位（林小美 personId=${summary.crossTeamPersonId} 跨兩隊）`,
  );
  console.log("  比賽：4 場、全部三戰兩勝制");
  console.log("    1) A隊 vs 台大 2:1（決勝 15:11）  2) A隊 vs 政大 2:0 輾壓");
  console.log("    3) B隊 vs 師大 1:2 糾結（含 deuce 24:26、決勝 13:15）  4) A隊 vs 交大 進行中");
  console.log(
    "  每局比分過程用種子 PRNG（mulberry32，固定種子＝每次重灌結果相同）＋平衡配額＋連續得分動能，",
  );
  console.log("  勝方賽末點一定收在最後一球（不再出現達標後對手還在加分的假象）；並補上 events，");
  console.log("  球員統計的「決定球矩陣」現在有數字可看。");
  console.log("  比賽1、比賽3（湊得出 6 位非自由球員）各局都補了 lineups（起始先發），並各存一筆");
  console.log(
    "  tactics（先發站位快照）——輪轉表／戰術板／先發站位這幾個畫面重灌後不會是空的（#339）。",
  );
  console.log(`\n  另外掛在 ${OTHER_USER_ID} 底下：matchId=${foreignMatch.id}（UI 不會出現）`);
  console.log("  驗證跨使用者擁有權（需 NODE_ENV=development）：");
  console.log(
    `    curl -X POST localhost:3000/api/tactics -H 'Content-Type: application/json' \\\n` +
      `      -d '{"matchId":${foreignMatch.id},"name":"probe","data":{}}'   # 應回 404`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
