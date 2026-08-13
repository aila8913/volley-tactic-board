import { describe, it, expect } from "vitest";
import { resolveLiberoOnRotation } from "./liberoRotation";
import { lineupToPositions } from "./rotationLogic";
import type { LineupZones } from "../types/scoresheet";

// 這整支測試就是 issue #303 的目的：這段規則原本鎖在 ScoreSheet.tsx 的 useEffect 裡，
// 沒有 @testing-library/react（#168）就碰不到，抽成純函式之後才寫得出下面這些斷言。
//
// ⚠️ issue #326 改了規則本身（不是重構）：原本有一條「接替」啟發式——被頂替者輪到前排時，
// 若上一輪的頂替目標現在在後排就自動改頂替他。PO 2026-08-07 判定那是在紀錄裡捏造一次
// 沒發生過的替換，整條刪掉。刪掉之後 previousTarget 這個輸入也沒有意義了，函式簽章跟著
// 從「吃一個 LiberoState 物件」收斂成「吃被頂替者的 id」。
// 底下那三條釘住接替行為的測試（前一個目標在後排/在前排/就是自己）也一併刪除——它們釘的
// 正是被推翻的那條規則，留著只會讓下一個人以為那還是規格。

// 一份固定的先發快照：號位 1~6 各站一個人，名字直接對應「起始號位」方便閱讀。
// 號位 1/5/6 是後排、2/3/4 是前排（BACK_ROW_ZONES）。
const lineup: LineupZones = {
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
  it("沒有人被頂替時回傳 null（L 不在場上，沒什麼要算）", () => {
    expect(resolveLiberoOnRotation(null, positionsAt(0))).toBeNull();
  });

  it("被頂替者還在後排 → 原樣回傳，L 可以繼續待著", () => {
    // rotation 0：p1 站 1 號位（後排）。
    expect(resolveLiberoOnRotation("p1", positionsAt(0))).toBe("p1");
  });

  it("被頂替者輪到前排 → 回傳 null，L 下場並留在場外", () => {
    // 轉 5 輪後 p1 落在 2 號位（前排）：1 →(1輪) 6 →5 →4 →3 →(5輪) 2。
    expect(resolveLiberoOnRotation("p1", positionsAt(5))).toBeNull();
  });

  it("後排有別人可以接替，也不會自動接替（#326 的重點）", () => {
    // rotation 5：p1 在 2 號位（前排），而 p4 落在 5 號位（後排）——舊規則會自動改成頂替 p4，
    // 新規則一律讓 L 下場。差別不在畫面，在紀錄：自動接替會寫下一次教練從沒做過的替換。
    expect(resolveLiberoOnRotation("p1", positionsAt(5))).toBeNull();
  });

  it("被頂替者不在這一輪的六人裡 → 當作沒事發生，不動狀態", () => {
    // 例如名單被改過、或這個 id 根本不屬於這場比賽（幽靈站位）。
    expect(resolveLiberoOnRotation("ghost", positionsAt(0))).toBe("ghost");
  });

  it("繞完一整圈六輪：L 頂替 p1，轉到前排那一刻下場，之後不會自己回來", () => {
    // 這條是整合式的回歸測試——把六輪跑一遍，確保上面幾條不是靠挑輪次湊出來的。
    let current: string | null = "p1";
    const seen: (string | null)[] = [];
    for (let rotation = 0; rotation < 6; rotation++) {
      current = resolveLiberoOnRotation(current, positionsAt(rotation));
      seen.push(current);
    }
    // rotation 0~2：p1 依序在 1/6/5 號位（都是後排）＝留著；第 4 輪（index 3）p1 轉到 4 號位
    // （前排）→ 清空。關鍵是後面三輪維持 null：即使 p1 之後又轉回後排，L 也不會自己上場。
    expect(seen).toEqual(["p1", "p1", "p1", null, null, null]);
  });
});
