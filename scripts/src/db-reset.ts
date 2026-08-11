// `pnpm run db:reset` 的本體（issue #341）。
//
// ── 這支腳本存在的理由 ──
//
// 原本 root package.json 裡的 db:reset 就是一行 shell：
//
//     pnpm --filter @workspace/db run push && pnpm --filter @workspace/db run seed
//
// 對「只新增、不刪除」的 schema diff 這樣完全夠用。問題出在**破壞性** diff：schema 拿掉
// 一個欄位或一張表時，`drizzle-kit push` 會停下來用互動式選單問「這是刪除還是改名？」
// 「確定要接受資料遺失嗎？」——那時整個指令就掛在那裡等一個答案，而畫面上（因為選單是用
// ANSI 重繪的）常常什麼有用的提示都看不到。
//
// 刻意**不**改成 `push --force`：那等於把「你要刪掉這張表喔」的確認靜靜拿掉。這支指令
// 本身已經是破壞性的（seed 會 TRUNCATE 整個資料庫），再把最後一道人工確認也拆掉不是好
// 交易。這裡選的是另一條路：**讓人答得到那個問題，答不到的時候明確失敗並說下一步**。
//
// ── 為什麼 stdin 一定要 inherit（踩過的坑，別改回去）──
//
// 第一版想得很自然：把子行程的 stdin 設成 "ignore"，這樣它就算跳出選單也不會偷吃使用者
// 之後敲的鍵。實際讀了 drizzle-kit 打包出來的 bin.cjs 才發現這會壞事——它的互動元件長這樣：
//
//     if (this.stdin.isTTY) this.stdin.setRawMode(true);
//     this.stdin.on("keypress", ...)   // 答案只從 keypress 事件來
//
// stdin 設成 "ignore" 的話，子行程一開始就讀到 EOF：`keypress` 永遠不會發生，那顆等答案的
// Promise 永遠不 resolve——而**未 resolve 的 Promise 不會讓 Node 繼續活著**。事件迴圈一空，
// 行程就以離開碼 **0** 正常結束，schema 變更根本沒套用。也就是說 "ignore" 把「看得見的卡住」
// 換成了「安靜的成功假象」，比原本的問題更糟。
//
// 所以 stdin 走 inherit。實務上 db:reset 幾乎都是從真的終端機跑的，stdin.isTTY 為真，
// 使用者會**直接看到選單並且答得了**——#341 的主要情境到這裡其實就解掉了。
//
// ── 那底下的「沉默偵測」還在防什麼 ──
//
// 兩種 inherit 也救不了的情況：
//
//   1. 從沒有 TTY 的地方跑（管線、CI、某些 IDE 的終端模擬）：isTTY 為假，選單畫得出來卻
//      收不到答案，還是會卡住。
//   2. DATABASE_URL 用到 Neon 的 **pooled** 連線字串（主機名稱帶 `-pooler`）：push 會永遠
//      卡在「Pulling schema from database…」不報錯（見 docs/deploy.md，部署那輪在這卡很久）。
//
// 偵測方式刻意**不**去比對 drizzle-kit 的提示文案（那是它的內部 UI，版本一升就可能變，
// 比對失敗我們就又退回安靜掛住）。改用一個跟文案無關的訊號：**沉默**——子行程還活著，但
// 已經連續 STALL_TIMEOUT_MS 沒有吐出任何一個位元組。正常跑完的 push 會持續有輸出；等人的
// push 則是印完問題後完全安靜。而使用者若真的在跟選單互動，每次按鍵都會讓畫面重繪、
// 也就重置了計時器，不會被誤殺。
import { spawn } from "node:child_process";

// 多久沒有任何輸出就判定「它卡住了」。抓得很寬（兩分鐘）有兩個理由：push 中間確實有幾段是
// 純等待（建立連線、內省既有 schema），慢的網路要留餘裕；而且真人讀一則「你要刪掉這張表」
// 的確認訊息、決定要不要按下去，本來就該有從容的時間。寧可誤判慢，不要誤殺。
const STALL_TIMEOUT_MS = 120_000;

// Windows 上 pnpm 是 .cmd，不透過 shell 直接 spawn 會找不到執行檔（ENOENT）。這個 repo 的
// 開發機是 Windows，所以一律走 shell。指令是寫死的常數、沒有任何外部輸入拼進去，不存在
// 指令注入的問題。
const SHELL = true;

interface RunResult {
  code: number | null;
  stalled: boolean;
}

/**
 * 殺掉一整棵行程樹。
 *
 * 為什麼不能只用 `child.kill()`（踩過的坑）：我們是用 `shell: true` 啟動的，所以真正的
 * 行程鏈是 `cmd.exe → pnpm → drizzle-kit`。`child.kill()` 只殺得到最外層那顆 shell——
 * 孫行程照樣活著，而且**它還握著我們那兩根 pipe**，於是 `close` 事件永遠不會觸發，
 * 我們自己反而跟著一起卡死（本來是要偵測卡住的那支腳本卡住了，很諷刺）。
 *
 * Windows 沒有 POSIX 的行程群組可以一次送訊號，得靠內建的 taskkill：`/T` 是連同子孫、
 * `/F` 是強制。其他平台就走一般的 kill。
 */
function killTree(pid: number, child: { kill: () => void }) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill();
  }
}

/**
 * 跑一個子指令，並在它「活著但長時間完全沒有輸出」時中止它。
 *
 * stdout/stderr 走 pipe 是**必要的**——沉默偵測需要親眼看到每一塊輸出才能重置計時器，
 * 用 inherit 就看不到了。所以這裡邊收邊原封不動轉發到我們自己的 stdout/stderr，使用者
 * 看到的進度跟直接跑 drizzle-kit 一樣即時（包含互動選單的 ANSI 重繪）。
 */
function runGuarded(command: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: SHELL,
      // stdin 一定要 inherit，理由見檔頭那段「為什麼 stdin 一定要 inherit」。
      stdio: ["inherit", "pipe", "pipe"],
    });

    let settled = false;
    let timer: NodeJS.Timeout;

    // 只回報第一個發生的結局。判定卡住之後我們**不等** `close`：殺行程樹是非同步的
    // best-effort，萬一哪個孫行程賴著不死，等下去就等於前功盡棄。
    const settle = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (child.pid !== undefined) killTree(child.pid, child);
        settle({ code: null, stalled: true });
      }, STALL_TIMEOUT_MS);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      resetTimer();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      resetTimer();
    });

    child.on("close", (code) => settle({ code, stalled: false }));

    resetTimer();
  });
}

async function main() {
  const push = await runGuarded("pnpm --filter @workspace/db run push");

  if (push.stalled) {
    console.error(
      [
        "",
        "✖ db:reset 中止：`drizzle-kit push` 超過 2 分鐘沒有任何輸出，判定它卡住了。",
        "",
        "  最常見的兩個原因：",
        "",
        "  1. schema 有破壞性變更（拿掉欄位或表），push 正在用互動式選單問你要不要接受",
        "     資料遺失，但這裡收不到答案（例如目前不是在真的終端機底下跑）。請自己跑一次、",
        "     親自回答那些問題，再跑 seed：",
        "",
        "         pnpm --filter @workspace/db run push",
        "         pnpm --filter @workspace/db run seed",
        "",
        "  2. DATABASE_URL 用到了 Neon 的 pooled 連線字串（主機名稱帶 `-pooler`）。push",
        "     需要 Direct 連線，pooled 不會報錯、只會永遠卡在「Pulling schema from",
        "     database…」。詳見 docs/deploy.md。",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (push.code !== 0) {
    // push 自己已經把錯誤訊息印出來了，這裡不重複包裝，只把離開碼帶出去。
    process.exit(push.code ?? 1);
  }

  // seed 不會有互動（它的 production 安全閘門是直接判斷 DATABASE_URL 的主機名稱、不合格
  // 就 throw，不問使用者），所以不需要同一套守衛，直接繼承終端機即可。
  const seed = spawn("pnpm --filter @workspace/db run seed", {
    shell: SHELL,
    stdio: "inherit",
  });
  seed.on("close", (code) => process.exit(code ?? 1));
}

main();
