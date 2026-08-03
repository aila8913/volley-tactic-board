import type { WriteLogEntry } from "./writeLog";

// ────────────────────────────────────────────────────────────────────────────
// write log 的「落地層」：把還沒送到後端的寫入存進 IndexedDB（#64 PR3）。
//
// PR2 的 log 只活在記憶體：關掉分頁 = 沒送出去的東西全丟。#75 的可靠性契約說
// rallies/events/substitutions/timeouts 是「保證不掉」的，所以 log 必須撐過 reload。
//
// 為什麼用 IndexedDB 而不是 localStorage？
//   - localStorage 是同步 API，寫入會卡住 UI 執行緒；記分時每一分都要寫，卡頓看得出來。
//   - localStorage 只能存字串，每次都要 JSON.stringify 整份陣列再寫回去（O(n) 重寫）；
//     IndexedDB 是逐筆 key-value，加一筆就只寫那一筆。
//   - 容量：localStorage 大約 5MB，IndexedDB 通常是數百 MB 起跳。
// 代價是 IndexedDB 的 API 很囉嗦（事件回呼、事務），所以下面包一層薄薄的 promise 版。
//
// 這裡刻意定義成 interface + 兩種實作（IndexedDB / 記憶體），而不是讓 writeLog.ts 直接
// 呼叫 indexedDB：測試環境（jsdom）沒有 IndexedDB，注入記憶體版就能把「重放、取消、
// 序號延續」這些真正的邏輯測起來，不必為此多裝一個 fake-indexeddb 套件。
// ────────────────────────────────────────────────────────────────────────────

export interface WriteLogStore {
  /** 讀回這場比賽所有還沒送成功的 entry（順序不保證，呼叫端自己依 seq 排）。 */
  load: (matchId: number) => Promise<WriteLogEntry[]>;
  /** 寫入/覆寫一筆 entry。 */
  put: (entry: WriteLogEntry) => Promise<void>;
  /** 刪掉一筆 entry（送成功或被取消時）。 */
  remove: (matchId: number, seq: number) => Promise<void>;
  /** 讀回下一個可用的 seq（**同步**，理由見檔案下方「序號游標」）。 */
  loadSeq: (matchId: number) => number;
  /** 記下下一個可用的 seq。 */
  saveSeq: (matchId: number, nextSeq: number) => void;
}

const DB_NAME = "volley-write-log";
const DB_VERSION = 1;
const STORE_NAME = "entries";

/** 把 IndexedDB 的事件式請求包成 promise。 */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // onupgradeneeded 是 IndexedDB 版本遷移的鉤子：只有在資料庫不存在、或版本號變大時才跑。
    // 之後要改結構（加索引、加 object store）就把 DB_VERSION + 1，再在這裡補對應的建立程式碼。
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // 複合主鍵 [matchId, seq]：一場比賽內 seq 唯一，所以這組合能唯一指到一筆 entry，
        // 而且同一場的資料在索引上天然相鄰，用 range 就能一次撈完（見 load）。
        db.createObjectStore(STORE_NAME, { keyPath: ["matchId", "seq"] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/**
 * 建立 IndexedDB 版的 store。在沒有 IndexedDB 的環境（jsdom 測試、SSR）回傳 null，
 * 呼叫端就退回「純記憶體 log」＝ PR2 的行為，功能不會壞、只是不耐 reload。
 */
export function createIndexedDbWriteLogStore(): WriteLogStore | null {
  if (typeof indexedDB === "undefined") return null;

  return {
    load: async (matchId) => {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readonly");
      // 主鍵是 [matchId, seq]，所以「這場的所有 entry」就是 [matchId, -∞] 到 [matchId, +∞]
      // 這段範圍。IDBKeyRange.bound 讓我們一次撈完，不用全表掃描再過濾。
      const range = IDBKeyRange.bound([matchId, -Infinity], [matchId, Infinity]);
      const rows = await promisify(tx.objectStore(STORE_NAME).getAll(range));
      return rows as WriteLogEntry[];
    },
    put: async (entry) => {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      await promisify(tx.objectStore(STORE_NAME).put(entry));
    },
    remove: async (matchId, seq) => {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      await promisify(tx.objectStore(STORE_NAME).delete([matchId, seq]));
    },
    loadSeq: loadSeqCursor,
    saveSeq: saveSeqCursor,
  };
}

/** 測試用的記憶體實作：介面一樣，但資料只活在這個物件裡。 */
export function createMemoryWriteLogStore(seed: WriteLogEntry[] = []): WriteLogStore {
  const rows = new Map<string, WriteLogEntry>();
  for (const entry of seed) rows.set(`${entry.matchId}:${entry.seq}`, entry);
  const cursors = new Map<number, number>();
  // 種子資料代表「上一次分頁留下的東西」，所以游標也要跟著往前，
  // 不然新 append 會從 seq 1 開始、撞掉種子那幾筆——正是真實 reload 會踩到的坑。
  for (const entry of seed) {
    cursors.set(entry.matchId, Math.max(cursors.get(entry.matchId) ?? 1, entry.seq + 1));
  }
  return {
    load: async (matchId) => [...rows.values()].filter((e) => e.matchId === matchId),
    // 存副本，避免測試裡改到記憶體 log 的物件時連帶「改到已落地的那份」，
    // 讓假的持久層表現得跟真的 IndexedDB 一樣（IndexedDB 存的是結構化複製）。
    put: async (entry) => {
      rows.set(`${entry.matchId}:${entry.seq}`, { ...entry });
    },
    remove: async (matchId, seq) => {
      rows.delete(`${matchId}:${seq}`);
    },
    loadSeq: (matchId) => cursors.get(matchId) ?? 1,
    saveSeq: (matchId, nextSeq) => {
      cursors.set(matchId, nextSeq);
    },
  };
}

// ── 序號游標 ──────────────────────────────────────────────────────────────
//
// entry 的 seq 決定重放順序，而且它是主鍵的一部分——所以 reload 之後**絕對不能從 1 重來**，
// 否則新的一筆會把還沒送出的舊 entry 直接蓋掉（同一組 [matchId, seq]）。
//
// 但 seq 必須在 `append` 當下**同步**取得（append 是同步函式，動作端不能等 promise），
// 而 IndexedDB 全部是非同步的——所以游標不能存在 IndexedDB 裡。localStorage 剛好互補：
// 它同步、而且我們只存一個小數字，前面嫌它的兩個缺點（阻塞、整包重寫）在這裡都不成立。
//
// 一句話：**大資料放 IndexedDB（非同步），必須同步讀到的小游標放 localStorage。**

const SEQ_KEY_PREFIX = "volley:writeLog:seq:";

export function loadSeqCursor(matchId: number): number {
  try {
    const raw = localStorage.getItem(`${SEQ_KEY_PREFIX}${matchId}`);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch {
    // Safari 無痕模式等情境會讓 localStorage 直接 throw。退回從 1 開始：
    // 那種環境通常 IndexedDB 也不能用，等於整個持久層失效、退化成 PR2 的記憶體 log。
    return 1;
  }
}

export function saveSeqCursor(matchId: number, nextSeq: number): void {
  try {
    localStorage.setItem(`${SEQ_KEY_PREFIX}${matchId}`, String(nextSeq));
  } catch {
    // 同上，寫不進去就算了——最壞情況是 reload 後序號重來，而那時 IndexedDB 多半也是空的。
  }
}
