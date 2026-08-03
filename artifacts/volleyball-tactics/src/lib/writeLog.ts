import type {
  NewSet,
  UpdateSet,
  NewRally,
  NewEvent,
  NewSubstitution,
  NewTimeout,
  NewLineup,
} from "@workspace/api-client-react";

// ────────────────────────────────────────────────────────────────────────────
// 計分頁的「寫入紀錄簿」（write log）。issue #64 PR2 / 吃掉 #230。
//
// 以前這裡不存在：六個動作各自呼叫各自的 mutation，undo 靠三疊平行的 id ref
// （rallyIdsRef / subIdsRef / timeoutIdsRef）＋一個字串 switch 決定要 pop 哪一疊、刪哪張表。
// 那個做法有兩個根本問題：
//   1. 正確性只靠「佇列剛好把 create 排在 delete 前面」這個隱性巧合守著，沒有型別也沒有測試。
//   2. 每加一張表就要再長一疊 ref、switch 再多一個分支。
//
// 改法是把「使用者做了什麼寫入」記成**一條有序的 log**：每個動作只 append 一筆 entry，
// 一個集中的 executor 依序把 entry 翻成 API 呼叫。undo 不再是「pop 某一疊」，而是
// 「再 append 一筆 delete」——log 只增不改，順序就是真相。
//
// 為什麼這個形狀值得現在就做：它就是離線佇列要的形狀（#75 定案的可靠性契約）。
// 之後 PR3 把這個陣列從記憶體換成 IndexedDB、reload 時重放未送出的 entry，PR4 加上
// 重送迴圈與「N 筆未同步」指示器——都只是換掉 log 的存放處與 drain 策略，動作端不用再改。
// 所以 entry 的每個欄位都刻意是**可序列化的純資料**（沒有函式、沒有 Promise、沒有物件參照）。
//
// 前提條件：五張表的主鍵在 #64 PR1 已從自增整數改成 uuid，而且 API 在 PR2 開放 body 指定 id
// （見 openapi.yaml 的 NewSet.id 註解）。有了它，前端才能在**動作發生的當下同步鑄出 id**，
// 不必等 POST 回來——這正是三疊 id ref 能消失的原因：delete entry 自己就帶著要刪的 id。
// ────────────────────────────────────────────────────────────────────────────

// 這條 log 會碰到的表。前五張是 #75 定案的「保證不掉」契約範圍；lineups 不在契約內，
// 但它必須排在同一條 log 裡——因為 PUT lineup 掛在 setId 底下，要是它跑到 set 的 POST
// 前面就會 FK 失敗。換句話說 lineups 是「保證順序、不保證不掉」。
export type WriteTable = "sets" | "rallies" | "events" | "substitutions" | "timeouts" | "lineups";

// 可以被「復原」刪掉的表。undo 只會退掉使用者剛做的那一個動作，所以不含 sets/events/lineups：
//   - events 沒有自己的 delete 端點，靠 rally 的 FK cascade 一起走。
//   - sets 只在換局時建立，換局後 undo 堆疊本來就被清空（見 store 的 nextSet）。
//   - lineups 是一局一 row 的 upsert，沒有「退掉一筆」的語意。
export type DeletableTable = "rallies" | "substitutions" | "timeouts";

// 一筆寫入操作。用 discriminated union 而不是 `payload: unknown`，讓 executor 的 switch
// 能被 TypeScript 檢查到「每個分支拿到的 payload 型別正確、沒有漏掉分支」。
//
// parentId 是「這筆掛在誰底下」的 id（rallies/substitutions/timeouts → setId，events → rallyId）。
// 它跟 payload 分開放，是因為在 REST 合約裡 parent 走的是路徑、不是 body。
export type WriteOp =
  | { kind: "create"; table: "sets"; id: string; payload: NewSet }
  | { kind: "create"; table: "rallies"; id: string; parentId: string; payload: NewRally }
  | { kind: "create"; table: "events"; id: string; parentId: string; payload: NewEvent }
  | {
      kind: "create";
      table: "substitutions";
      id: string;
      parentId: string;
      payload: NewSubstitution;
    }
  | { kind: "create"; table: "timeouts"; id: string; parentId: string; payload: NewTimeout }
  | { kind: "patch"; table: "sets"; id: string; payload: UpdateSet }
  // lineups 一局一 row（setId unique），PUT 是 idempotent upsert，所以 id 這裡放的是 setId。
  | { kind: "put"; table: "lineups"; id: string; payload: NewLineup }
  | { kind: "delete"; table: DeletableTable; id: string };

// pending：已 append、還沒送。syncing：正在送。synced：後端已收。error：送失敗。
// 現階段（PR2）沒有重送，error 是終點；PR4 的重送迴圈會讓它回到 pending。
export type WriteStatus = "pending" | "syncing" | "synced" | "error";

export type WriteLogEntry = WriteOp & {
  // 本機遞增序號，決定重放/送出順序。PR3 進 IndexedDB 後，(userId, matchId, seq) 就是主鍵；
  // 現在還沒有真的使用者（mockAuth，見 #77/#26），所以先不放 userId——與其塞一個假值進去
  // 汙染之後的 schema，不如等 Google OAuth 落地時一次補上。
  seq: number;
  matchId: number;
  status: WriteStatus;
  lastError?: string;
};

// 把一筆 entry 真的送到後端。由 controller 提供（那裡才拿得到 orval 產生的 mutation hooks），
// log 本身完全不知道 HTTP 的存在——這樣 PR3 換成 IndexedDB 版時，這個檔案不用碰。
export type WriteExecutor = (entry: WriteLogEntry) => Promise<void>;

export interface WriteLog {
  /** 追加一筆寫入操作，並（非同步地）開始送出。回傳剛建立的 entry。 */
  append: (op: WriteOp) => WriteLogEntry;
  /** 還沒送成功的筆數。PR4 的「N 筆未同步」指示器會讀它。 */
  pendingCount: () => number;
  /** 目前整份 log（唯讀）。給測試與之後的持久化用。 */
  entries: () => readonly WriteLogEntry[];
}

// 產生一個新的 row id。
//
// 用 crypto.randomUUID 而不是遞增數字：離線時前端沒辦法跟後端協調號碼，唯一能保證「不同裝置
// /不同分頁不會撞號」的做法就是隨機夠大的 uuid。它同時也是之後（PR3）冪等寫入的鑰匙——
// 重送同一筆時 id 相同，後端 ON CONFLICT DO NOTHING 就能吃掉重複。
//
// 有 fallback 是因為 crypto.randomUUID 需要 secure context（https 或 localhost），
// 測試環境（jsdom）也不保證有；退化版用 Math.random 拼一個 v4 形狀的字串，
// 隨機性較差但夠這個用途（單人、單場比賽數百筆）。
export function newRowId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 建立一條 write log。
 *
 * drain 的策略跟舊的 queueRef 一樣是「序列化」：一次只送一筆、前一筆結束才送下一筆。
 * 這不是效能考量而是正確性考量——rally 的 rallyNumber、substitutions 的 seq 都靠插入順序，
 * 而 delete 一定要排在對應的 create 之後。並行送出會兩個都毀掉。
 *
 * 失敗處理維持現階段的「本地優先」：標成 error、記 log，不回滾畫面、也不重送
 * （完整的 reconcile 是 #64 PR4 的事）。
 */
export function createWriteLog(
  matchId: number,
  execute: WriteExecutor,
  onChange?: () => void,
): WriteLog {
  const entries: WriteLogEntry[] = [];
  let nextSeq = 1;
  // 這條 promise 鏈就是序列化的本體：每 append 一筆就接在鏈尾，天然保證先進先送。
  let tail: Promise<unknown> = Promise.resolve();

  const runEntry = async (entry: WriteLogEntry) => {
    entry.status = "syncing";
    try {
      await execute(entry);
      entry.status = "synced";
    } catch (err) {
      entry.status = "error";
      entry.lastError = err instanceof Error ? err.message : String(err);
      console.error("[writeLog] 背景寫入後端失敗：", entry.kind, entry.table, entry.id, err);
    }
    onChange?.();
  };

  return {
    append: (op) => {
      const entry: WriteLogEntry = { ...op, seq: nextSeq++, matchId, status: "pending" };
      entries.push(entry);
      onChange?.();
      // catch 掛在鏈尾是必要的：runEntry 自己已經吞掉錯誤，但萬一它以外的地方拋了，
      // 沒有 catch 會讓整條鏈變成 rejected，之後每一筆都不會再被送出。
      tail = tail.then(() => runEntry(entry)).catch(() => {});
      return entry;
    },
    pendingCount: () => entries.filter((e) => e.status !== "synced").length,
    entries: () => entries,
  };
}
