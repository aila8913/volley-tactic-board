import type {
  NewSet,
  UpdateSet,
  NewRally,
  NewEvent,
  NewSubstitution,
  NewTimeout,
  NewLineup,
} from "@workspace/api-client-react";
import type { WriteLogStore } from "./writeLogStore";

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
// 為什麼這個形狀值得做：它就是離線佇列要的形狀（#75 定案的可靠性契約）。entry 的每個欄位
// 都刻意是**可序列化的純資料**（沒有函式、沒有 Promise、沒有物件參照），所以 PR3 才能原封
// 不動地把它塞進 IndexedDB（見 writeLogStore.ts）——動作端一行都不用改。
//
// PR3 補上的三件事：
//   1. 落地：每筆 entry 先寫進 IndexedDB 才送，送成功才刪掉（「至少送一次」）。
//   2. 重放：開頁時把上一輪沒送完的讀回來、依 seq 補送，計分頁等它跑完才用後端資料重建。
//   3. 取消：還沒送出的 create 被「復原」時直接作廢，而不是留下「建了又刪」兩筆。
// 還沒做的是 PR4 的自動重送迴圈（上線/離線事件、backoff）與「N 筆未同步」指示器。
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
// cancelled：送出前就被「復原」抵銷掉了（見 cancelPending），這輩子不會送。
// 現階段（PR3）還沒有自動重送，error 是終點；PR4 的重送迴圈會讓它回到 pending。
export type WriteStatus = "pending" | "syncing" | "synced" | "error" | "cancelled";

export type WriteLogEntry = WriteOp & {
  // 本機遞增序號，決定重放/送出順序，同時是 IndexedDB 裡的主鍵的一半（[matchId, seq]）。
  // 它必須跨 reload 遞增，所以游標另外存在 localStorage（見 writeLogStore.ts 的說明）。
  // 之後有真的使用者（Google OAuth，#77/#26）時主鍵會擴成 (userId, matchId, seq)；現在
  // 還是 mockAuth，與其塞一個假 userId 汙染 schema，不如等 OAuth 落地時一次補上。
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
  /**
   * 把「還沒送出」的 create 直接作廢（連同掛在它底下、也還沒送出的子項）。
   * 回傳是否真的取消掉了；false 代表那筆已經送出／正在送，呼叫端要改用 delete 來抵銷。
   */
  cancelPending: (table: WriteTable, id: string) => boolean;
  /** 還沒送成功的筆數（不含被取消的）。PR4 的「N 筆未同步」指示器會讀它。 */
  pendingCount: () => number;
  /** 目前整份 log（唯讀）。給測試與之後的持久化用。 */
  entries: () => readonly WriteLogEntry[];
  /**
   * 「上一輪留下來的 entry 都處理完了」——resolve 出重放了幾筆。
   * 計分頁靠它決定何時可以安全地用後端資料重建畫面（見 useScoreSheetController）。
   */
  replayed: Promise<number>;
}

export interface WriteLogOptions {
  /** 落地層。給 null／不給就是純記憶體 log（撐不過 reload），等同 PR2 的行為。 */
  store?: WriteLogStore | null;
  /** 任何 entry 狀態變動時呼叫，讓 UI 能重畫「N 筆未同步」。 */
  onChange?: () => void;
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
 * drain 的策略是「序列化」：一次只送一筆、前一筆結束才送下一筆。這不是效能考量而是
 * 正確性考量——rally 的 rallyNumber、substitutions 的 seq 都靠插入順序，而 delete 一定要
 * 排在對應的 create 之後。並行送出會兩個都毀掉。
 *
 * PR2 的序列化是靠一條 promise 鏈（append 時接在鏈尾）；PR3 改成「每次挑 seq 最小的 pending
 * 來送」的 drain 迴圈。原因是重放：從 IndexedDB 讀回來的 entry 是**非同步**才進得了 log，
 * 而使用者可能在讀完之前就按下第一個動作。promise 鏈會照「誰先接上鏈尾」決定順序，那就變成
 * 新動作插到舊 entry 前面；改成看 seq，順序就由資料自己決定，跟誰先排隊無關。
 *
 * 失敗處理維持現階段的「本地優先」：標成 error、記 log、留在 IndexedDB 裡等 PR4 的重送迴圈，
 * 不回滾畫面。
 */
export function createWriteLog(
  matchId: number,
  execute: WriteExecutor,
  options: WriteLogOptions = {},
): WriteLog {
  const { store = null, onChange } = options;
  const entries: WriteLogEntry[] = [];
  // 序號從上一次留下的游標接下去（沒有 store 就是全新的一條記憶體 log，從 1 開始）。
  let nextSeq = store ? store.loadSeq(matchId) : 1;

  const persist = (entry: WriteLogEntry) => {
    store?.put(entry).catch((err) => console.error("[writeLog] 落地失敗：", entry.seq, err));
  };
  const forget = (entry: WriteLogEntry) => {
    store
      ?.remove(matchId, entry.seq)
      .catch((err) => console.error("[writeLog] 清除已同步的 entry 失敗：", entry.seq, err));
  };

  const runEntry = async (entry: WriteLogEntry) => {
    entry.status = "syncing";
    try {
      await execute(entry);
      entry.status = "synced";
      // 送成功才從落地層刪掉——這個順序就是「至少送一次」的保證：如果在「後端已收」跟
      // 「本地刪掉」中間斷電，重放會再送一次，靠後端的冪等寫入（同 id 不重複建立）吃掉。
      // 反過來先刪再送的話，斷在中間就是永久掉一筆，那才是不可回復的。
      forget(entry);
    } catch (err) {
      entry.status = "error";
      entry.lastError = err instanceof Error ? err.message : String(err);
      persist(entry);
      console.error("[writeLog] 背景寫入後端失敗：", entry.kind, entry.table, entry.id, err);
    }
    onChange?.();
  };

  // 從落地層把上一輪沒送完的 entry 讀回來。狀態一律重設成 pending：上次可能停在 syncing
  // （送出去了但不知道後端收到沒）或 error，兩種都該重送一次，重複由後端的冪等寫入處理。
  let replayedCount = 0;
  const ready: Promise<void> = store
    ? store
        .load(matchId)
        .then((rows) => {
          for (const row of rows) {
            entries.push({ ...row, status: "pending" });
            nextSeq = Math.max(nextSeq, row.seq + 1);
          }
          replayedCount = rows.length;
          if (rows.length > 0) onChange?.();
        })
        .catch((err) => {
          console.error("[writeLog] 讀取未送出的寫入失敗：", err);
        })
    : Promise.resolve();

  const nextPending = () => {
    let best: WriteLogEntry | undefined;
    for (const entry of entries) {
      if (entry.status !== "pending") continue;
      if (!best || entry.seq < best.seq) best = entry;
    }
    return best;
  };

  const drain = async () => {
    // 先等落地層讀完，重放的 entry 才保證都已經在 entries 裡、能一起參與「挑 seq 最小的」。
    await ready;
    for (let entry = nextPending(); entry; entry = nextPending()) {
      await runEntry(entry);
    }
  };

  // 同一時間只有一輪 drain 在跑：把每次 kick 接在同一條鏈上，天然互斥。
  // catch 是必要的：鏈一旦變成 rejected，之後每一筆都不會再被送出。
  let chain: Promise<void> = Promise.resolve();
  const kick = () => {
    chain = chain.then(drain).catch(() => {});
  };

  // 開機就先把重放的 entry 送出去；replayed 在這一輪 drain 結束時 resolve。
  kick();
  const replayed = chain.then(() => replayedCount);

  const cancel = (entry: WriteLogEntry) => {
    entry.status = "cancelled";
    forget(entry);
  };

  return {
    append: (op) => {
      const entry: WriteLogEntry = { ...op, seq: nextSeq++, matchId, status: "pending" };
      entries.push(entry);
      // 先落地再送：中間斷電時，這筆還在 IndexedDB 裡，reload 會重放它。
      persist(entry);
      store?.saveSeq(matchId, nextSeq);
      onChange?.();
      kick();
      return entry;
    },

    // 「復原」時的抵銷。分兩種情況：
    //   - 那筆 create 還沒送出（離線、或連點很快）：直接作廢，後端從頭到尾不會知道有這件事。
    //   - 已經送出／正在送：回 false，呼叫端改 append 一筆 delete（序列化保證它排在 create 之後）。
    // 為什麼要有前者：不然離線記一分再馬上復原，會在 outbox 裡留下「建了又刪」的兩筆，
    // 恢復連線時白跑一趟；更糟的是 create 若因故失敗，那筆 delete 就會打到不存在的 row。
    cancelPending: (table, id) => {
      const target = entries.find(
        (e) => e.status === "pending" && e.kind === "create" && e.table === table && e.id === id,
      );
      if (!target) return false;
      cancel(target);
      // 子項要一起作廢：rally 底下那筆 event 的 parentId 就是這個 rally 的 id，
      // 留著它就會 POST 到一個永遠不存在的 rally 底下（FK 失敗）。
      for (const child of entries) {
        if (child.status !== "pending") continue;
        if ("parentId" in child && child.parentId === id) cancel(child);
      }
      onChange?.();
      return true;
    },

    pendingCount: () =>
      entries.filter((e) => e.status !== "synced" && e.status !== "cancelled").length,
    entries: () => entries,
    replayed,
  };
}
