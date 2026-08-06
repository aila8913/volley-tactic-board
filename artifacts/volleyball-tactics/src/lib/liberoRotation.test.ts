import { describe, it, expect } from "vitest";
import { resolveLiberoOnRotation, type LiberoState } from "./liberoRotation";
import { lineupToPositions } from "./rotationLogic";
import type { LineupSnapshot } from "../types/scoresheet";

// 這整支測試就是 issue #303 的目的：這段規則原本鎖在 ScoreSheet.tsx 的 useEffect 裡，
// 沒有 @testing-library/react（#168）就碰不到，抽成純函式之後才寫得出下面這些斷言。

// 一份固定的先發快照：號位 1~6 各站一個人，名字直接對應「起始號位」方便閱讀。
// 號位 1/5/6 是後排、2/3/4 是前排（BACK_ROW_ZONES）。
const lineup: LineupSnapshot = {
  1: "p1",
  2: "p2",
  3: "p3",
  4: "p4",
  5: "p5",
  6: "p6",
};

// 「轉了 n 輪之後，場上六個人各站哪」——跟計分表 effect 餵進去的是同一條換算。
const positionsAt = (rotation: number) => lineupToPositions(lineup, rotation);

// 輪轉方向（rotateZone）：轉 1 輪後，1 號位的人走到 6 號位、2 號位的人走到 1 號位……
// 也就是「原本站 2 號位（前排）的人會轉到 1 號位（後排）」，而「原本站 3 號位的人轉到 2 號位」。
// 下面的案例都靠這條：要讓某人「這一輪剛好輪到前排」，就挑轉完會落在 2/3/4 的那個人。

describe("resolveLiberoOnRotation", () => {
  it("沒有人被頂替時原樣回傳（L 不在場上，沒什麼要算）", () => {
    const state: LiberoState = { current: null, previousTarget: "p5" };
    expect(resolveLiberoOnRotation(state, positionsAt(0))).toBe(state);
  });

  it("被頂替者還在後排 → 不動狀態，且回傳同一個物件參照", () => {
    // rotation 0：p1 站 1 號位（後排），L 可以繼續頂替他。
    const state: LiberoState = { current: "p1", previousTarget: null };
    const next = resolveLiberoOnRotation(state, positionsAt(0));
    // toBe 而不是 toEqual：參照必須一樣，呼叫端靠這點跳過寫入（見函式說明的 render loop 註解）。
    expect(next).toBe(state);
  });

  it("被頂替者輪到前排、沒有前一個目標 → 清空（L 下場，不亂猜要頂替誰）", () => {
    // 轉 5 輪後 p1 落在 2 號位（前排）：1 →(1輪) 6 →5 →4 →3 →(5輪) 2。
    const positions = positionsAt(5);
    const next = resolveLiberoOnRotation({ current: "p1", previousTarget: null }, positions);
    expect(next).toEqual({ current: null, previousTarget: "p1" });
  });

  it("被頂替者輪到前排、前一個目標現在在後排 → 接替他", () => {
    // 同一輪（rotation 5）：p1 在 2 號位（前排），而 p4 落在 5 號位（後排）。
    // 4 →(1輪) 3 →2 →1 →6 →(5輪) 5。
    const next = resolveLiberoOnRotation({ current: "p1", previousTarget: "p4" }, positionsAt(5));
    expect(next).toEqual({ current: "p4", previousTarget: "p1" });
  });

  it("前一個目標也在前排 → 清空，不接替", () => {
    // rotation 5：p2 落在 3 號位（前排），所以不能拿他當接替對象。
    const next = resolveLiberoOnRotation({ current: "p1", previousTarget: "p2" }, positionsAt(5));
    expect(next).toEqual({ current: null, previousTarget: "p1" });
  });

  it("前一個目標就是現在這個人 → 清空（不會自己接替自己）", () => {
    const next = resolveLiberoOnRotation({ current: "p1", previousTarget: "p1" }, positionsAt(5));
    expect(next).toEqual({ current: null, previousTarget: "p1" });
  });

  it("被頂替者不在這一輪的六人裡 → 當作沒事發生，不動狀態", () => {
    // 例如名單被改過、或這個 id 根本不屬於這場比賽（幽靈站位）。
    const state: LiberoState = { current: "ghost", previousTarget: null };
    expect(resolveLiberoOnRotation(state, positionsAt(0))).toBe(state);
  });

  it("前一個目標不在這一輪的六人裡 → 退回清空，不會產生一個場上沒有的頂替對象", () => {
    const next = resolveLiberoOnRotation(
      { current: "p1", previousTarget: "ghost" },
      positionsAt(5),
    );
    expect(next).toEqual({ current: null, previousTarget: "p1" });
  });

  it("繞完一整圈六輪：L 頂替 p1，每一輪的結果都符合「p1 在後排就留著、到前排就換人」", () => {
    // 這條是整合式的回歸測試——把六輪跑一遍，確保上面幾條不是靠挑輪次湊出來的。
    let state: LiberoState = { current: "p1", previousTarget: null };
    const seen: (string | null)[] = [];
    for (let rotation = 0; rotation < 6; rotation++) {
      state = resolveLiberoOnRotation(state, positionsAt(rotation));
      seen.push(state.current);
    }
    // rotation 0~3：p1 依序在 1/6/5/4 號位……4 號位是前排，所以第 4 輪（index 3）該換掉。
    // 前三輪 p1 都在後排（1/6/5）＝留著；第 4 輪 p1 轉到 4 號位（前排），previousTarget 仍是
    // null（前三輪沒發生變化），所以走「清空」那條；之後 current 是 null，維持 null。
    expect(seen).toEqual(["p1", "p1", "p1", null, null, null]);
  });
});
