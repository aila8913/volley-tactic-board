import { describe, it, expect, vi } from "vitest";
import { createWriteLog, newRowId, type WriteLogEntry } from "./writeLog";

// write log 的合約測試（#64 PR2 / #230）。
//
// 為什麼這幾條特別值得測：舊寫法裡「undo 刪掉的一定是剛剛那一筆」只是因為 promise 佇列
// 剛好把 create 排在 delete 前面——一個沒有型別、也沒有測試守著的隱性性質。既然這次把它
// 收斂成一個 module，就把那個性質變成可執行的斷言，之後誰改 drain 策略都會被擋下來。

/** 產生一個「要等我們手動放行才會 resolve」的 executor，用來觀察送出的先後與併發。 */
function makeControllableExecutor() {
  const started: WriteLogEntry[] = [];
  const releases: Array<(err?: Error) => void> = [];
  const execute = (entry: WriteLogEntry) => {
    started.push(entry);
    return new Promise<void>((resolve, reject) => {
      releases.push((err) => (err ? reject(err) : resolve()));
    });
  };
  return { started, releases, execute };
}

/** 讓已排定的 microtask 跑完（append 之後的送出是非同步的）。 */
const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createWriteLog", () => {
  it("依 append 順序序列化送出：前一筆沒結束就不會開始下一筆", async () => {
    const { started, releases, execute } = makeControllableExecutor();
    const log = createWriteLog(1, execute);

    log.append({ kind: "delete", table: "rallies", id: "a" });
    log.append({ kind: "delete", table: "rallies", id: "b" });
    await flushMicrotasks();

    // 只有第一筆開跑——這就是「序列化」：不是效能取捨，而是 rallyNumber / substitutions.seq
    // 這些靠插入順序的欄位的正確性前提。
    expect(started.map((e) => e.id)).toEqual(["a"]);

    releases[0]!();
    await flushMicrotasks();
    expect(started.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("同一筆 row 的 delete 一定排在它的 create 之後（#230 的核心性質）", async () => {
    const order: string[] = [];
    const log = createWriteLog(1, async (entry) => {
      order.push(`${entry.kind}:${entry.id}`);
    });

    const rallyId = "rally-1";
    log.append({
      kind: "create",
      table: "rallies",
      id: rallyId,
      parentId: "set-1",
      payload: {
        id: rallyId,
        rallyNumber: 1,
        homeScore: 0,
        awayScore: 0,
        homeRotation: 0,
        awayRotation: 0,
        winner: "home",
      },
    });
    // 使用者馬上按「復原」——即使 create 的請求還在飛，delete 也不會超車。
    log.append({ kind: "delete", table: "rallies", id: rallyId });
    await flushMicrotasks();

    expect(order).toEqual([`create:${rallyId}`, `delete:${rallyId}`]);
  });

  it("一筆失敗只把該筆標成 error，不會卡住後面的寫入", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { started, releases, execute } = makeControllableExecutor();
    const log = createWriteLog(1, execute);

    const first = log.append({ kind: "delete", table: "timeouts", id: "t1" });
    const second = log.append({ kind: "delete", table: "timeouts", id: "t2" });
    await flushMicrotasks();

    releases[0]!(new Error("網路掛了"));
    await flushMicrotasks();

    expect(first.status).toBe("error");
    expect(first.lastError).toBe("網路掛了");
    // 鏈沒有斷：第二筆照常被送出。（沒有這個保證的話，一次離線就會讓整場比賽之後的
    // 寫入全部靜靜地停掉。）
    expect(started.map((e) => e.id)).toEqual(["t1", "t2"]);

    releases[1]!();
    await flushMicrotasks();
    expect(second.status).toBe("synced");
    consoleError.mockRestore();
  });

  it("entry 帶上遞增的 seq 與 matchId，狀態從 pending 走到 synced", async () => {
    const { releases, execute } = makeControllableExecutor();
    const log = createWriteLog(42, execute);

    const entry = log.append({ kind: "delete", table: "substitutions", id: "s1" });
    expect(entry.seq).toBe(1);
    expect(entry.matchId).toBe(42);
    expect(entry.status).toBe("pending");
    expect(log.append({ kind: "delete", table: "substitutions", id: "s2" }).seq).toBe(2);

    await flushMicrotasks();
    expect(entry.status).toBe("syncing");
    releases[0]!();
    await flushMicrotasks();
    expect(entry.status).toBe("synced");
    // pendingCount 是之後（PR4）「N 筆未同步」指示器要讀的數字：只剩第二筆還沒送成功。
    expect(log.pendingCount()).toBe(1);
  });
});

describe("newRowId", () => {
  it("產生互不相同的 uuid 形狀字串", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newRowId()));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });
});
