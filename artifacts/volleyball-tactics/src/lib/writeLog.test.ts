import { describe, it, expect, vi } from "vitest";
import { createWriteLog, newRowId, type WriteLogEntry } from "./writeLog";
import { createMemoryWriteLogStore } from "./writeLogStore";

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

// ── 落地 / 重放 / 取消（#64 PR3）────────────────────────────────────────────
//
// 這幾條測的是「關掉分頁再打開」這件事：用記憶體版的 store 假裝上一輪留下的 IndexedDB。

/** 造一筆看起來像「上一輪沒送出去」的 entry。 */
function pendingDelete(matchId: number, seq: number, id: string): WriteLogEntry {
  return { kind: "delete", table: "rallies", id, seq, matchId, status: "pending" };
}

describe("createWriteLog 的持久化", () => {
  it("開頁時把上一輪沒送出的 entry 依 seq 補送，並回報重放了幾筆", async () => {
    const store = createMemoryWriteLogStore([
      pendingDelete(7, 2, "second"),
      pendingDelete(7, 1, "first"),
      pendingDelete(9, 1, "other-match"),
    ]);
    const sent: string[] = [];
    const log = createWriteLog(7, async (entry) => void sent.push(entry.id), { store });

    await expect(log.replayed).resolves.toBe(2);
    // 依 seq 而不是依讀出來的順序——store 不保證回傳順序，log 得自己排。
    // 別場比賽的 entry 不會被這條 log 撿走。
    expect(sent).toEqual(["first", "second"]);
    // 送成功就從落地層清掉，下次開頁不會再送一次。
    await expect(store.load(7)).resolves.toEqual([]);
  });

  it("新 append 的序號接在上一輪之後，不會蓋掉還沒送出的 entry", async () => {
    const store = createMemoryWriteLogStore([pendingDelete(7, 5, "old")]);
    const releases: Array<() => void> = [];
    const log = createWriteLog(7, () => new Promise<void>((r) => releases.push(r)), { store });

    // 重放那筆卡在網路上時，使用者又記了一分——它必須拿到 6，不能從 1 重來。
    // 從 1 重來的話，[matchId, seq] 這個主鍵就會把還沒送出的舊 entry 直接覆蓋掉。
    const fresh = log.append({ kind: "delete", table: "timeouts", id: "new" });
    expect(fresh.seq).toBe(6);
    expect(await store.load(7)).toHaveLength(2);
    releases.forEach((r) => r());
  });

  it("送失敗的 entry 留在落地層裡（等 PR4 重送），送成功的才清掉", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryWriteLogStore();
    const log = createWriteLog(
      7,
      async (entry) => {
        if (entry.id === "boom") throw new Error("網路掛了");
      },
      { store },
    );

    log.append({ kind: "delete", table: "rallies", id: "boom" });
    log.append({ kind: "delete", table: "rallies", id: "ok" });
    await flushMicrotasks();

    const left = await store.load(7);
    expect(left.map((e) => e.id)).toEqual(["boom"]);
    expect(left[0]!.status).toBe("error");
    expect(log.pendingCount()).toBe(1);
    consoleError.mockRestore();
  });
});

describe("cancelPending", () => {
  it("還沒送出的 create 被復原時直接作廢，連同它底下的子項", async () => {
    const store = createMemoryWriteLogStore();
    const { started, releases, execute } = makeControllableExecutor();
    const log = createWriteLog(7, execute, { store });

    // 第一筆佔住送出的位置（模擬離線／網路很慢），後面兩筆都還排在後面沒送。
    log.append({ kind: "delete", table: "rallies", id: "blocker" });
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
    log.append({
      kind: "create",
      table: "events",
      id: "event-1",
      parentId: rallyId,
      payload: { id: "event-1", sequence: 1, side: "home", action: "attack", source: "live" },
    });
    await flushMicrotasks();

    expect(log.cancelPending("rallies", rallyId)).toBe(true);
    // 掛在這個 rally 底下的 event 也一起作廢——留著它就會 POST 到一個永遠不存在的 rally。
    expect(
      log
        .entries()
        .filter((e) => e.status === "cancelled")
        .map((e) => e.id),
    ).toEqual([rallyId, "event-1"]);
    await expect(store.load(7)).resolves.toHaveLength(1); // 只剩擋著的那筆

    releases[0]!();
    await flushMicrotasks();
    // 被取消的兩筆從頭到尾沒有送出去過。
    expect(started.map((e) => e.id)).toEqual(["blocker"]);
    expect(log.pendingCount()).toBe(0);
  });

  it("已經送出去的 create 取消不掉，呼叫端得改用 delete 抵銷", async () => {
    const { releases, execute } = makeControllableExecutor();
    const log = createWriteLog(7, execute);

    log.append({
      kind: "create",
      table: "timeouts",
      id: "t1",
      parentId: "set-1",
      payload: { id: "t1", homeScore: 3, awayScore: 5, side: "home" },
    });
    await flushMicrotasks(); // 這筆進入 syncing

    expect(log.cancelPending("timeouts", "t1")).toBe(false);
    releases[0]!();
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
