import { describe, it, expect } from "vitest";
import {
  isBackRowPosition,
  BACK_ROW_ZONES,
  getZoneCoords,
  findNearestZone,
  lineupToPositions,
  rotateZone,
  rotateLineup,
  assignPlayerToZone,
  removePlayerFromZone,
  deriveRotation,
  filterLineupToRoster,
  isLineupFull,
} from "./rotationLogic";
import type { MatchPlayer } from "../types/match";
import type { LineupZones } from "../types/scoresheet";

// isBackRowPosition 是自由球員「能不能上這個位置」的共用判定，輪轉表跟計分表都靠它，
// 所以規則要釘死（issue #43：以前計分表自己寫 y<=0.75，跟輪轉表的 BACK_ROW_ZONES 各判各的）。
describe("isBackRowPosition", () => {
  it("treats the three back-row zones (1/5/6) as legal libero positions", () => {
    for (const zone of [1, 5, 6]) {
      const { x, y } = getZoneCoords(zone);
      expect(isBackRowPosition(x, y)).toBe(true);
    }
  });

  it("treats the three front-row zones (2/3/4) as illegal", () => {
    for (const zone of [2, 3, 4]) {
      const { x, y } = getZoneCoords(zone);
      expect(isBackRowPosition(x, y)).toBe(false);
    }
  });

  it("stays consistent with BACK_ROW_ZONES for every zone (single source of truth)", () => {
    // 直接對照：吸附到的號位在 BACK_ROW_ZONES 裡 ⇔ isBackRowPosition 回 true。
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      const { x, y } = getZoneCoords(zone);
      expect(isBackRowPosition(x, y)).toBe(BACK_ROW_ZONES.has(findNearestZone(x, y)));
    }
  });

  it("snaps a slightly-off coordinate to the nearest zone before judging", () => {
    // 拖放不會剛好落在格子正中心：靠近 6 號位(0.5, 0.85, 後排)的點仍算後排。
    expect(isBackRowPosition(0.52, 0.83)).toBe(true);
    // 靠近 3 號位(0.5, 0.6, 前排)的點算前排。
    expect(isBackRowPosition(0.48, 0.62)).toBe(false);
  });
});

describe("lineupToPositions", () => {
  const FULL = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };

  it("places each starter at its own zone coords at rotation 0", () => {
    const positions = lineupToPositions(FULL, 0);
    expect(positions).toHaveLength(6);
    expect(positions.find((p) => p.playerId === "1")).toEqual({
      playerId: "1",
      ...getZoneCoords(1),
    });
  });

  it("shifts starters by the rotation formula for other rotations", () => {
    // 起始 1 號位的人，轉 1 次後落在 rotateZone(1, 1) 的座標。
    const positions = lineupToPositions(FULL, 1);
    expect(positions.find((p) => p.playerId === "1")).toEqual({
      playerId: "1",
      ...getZoneCoords(rotateZone(1, 1)),
    });
  });
});

// rotateLineup 是換局換輪視窗（issue #120）的核心純函式，沒有碰任何 store/網路，
// 最適合用單元測試把「搬 key 不搬 value」這條行為釘住——這條規則很容易在之後改動時
// 不小心寫反（例如誤把 value 搬來搬去，變成搬錯人），測試能第一時間抓到。
describe("rotateLineup", () => {
  const LINEUP: LineupZones = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };

  it("轉 6 格（一整圈）等於原樣，因為排球輪轉是 6 格一個循環", () => {
    expect(rotateLineup(LINEUP, 6)).toEqual(LINEUP);
  });

  it("轉 1 格後，原本站在 1 號位的人會落在 rotateZone(1, 1) 這個號位（也就是 6 號位）", () => {
    const rotated = rotateLineup(LINEUP, 1);
    expect(rotateZone(1, 1)).toBe(6);
    expect(rotated[rotateZone(1, 1)]).toBe("p1");
  });

  it("轉 +1 再轉 -1，應該完全回到原樣（互為逆運算）", () => {
    const roundTrip = rotateLineup(rotateLineup(LINEUP, 1), -1);
    expect(roundTrip).toEqual(LINEUP);
  });

  it("轉完之後仍然是六個不重複的號位，不會塌成 5 個或更少", () => {
    const rotated = rotateLineup(LINEUP, 2);
    const zones = Object.keys(rotated);
    expect(zones).toHaveLength(6);
    // 六個號位 key 本身也不重複（Set 去重後長度不變才代表沒有兩個 key 撞在一起）。
    expect(new Set(zones).size).toBe(6);
    // 六個球員也都還在，沒有人在轉的過程中憑空消失。
    expect(new Set(Object.values(rotated)).size).toBe(6);
  });
});

// assignPlayerToZone 是「重新排位」實際在做的事，分支比 rotateLineup 多得多（點自己、
// 目標格有人、目標格空的、板凳球員頂替），是這次最容易出錯的一段。它原本寫在
// SetLineupDialog 元件裡，抽到這裡才有辦法在沒有 @testing-library/react（issue #168）
// 的情況下測到——「難測的程式碼通常是放錯地方」的典型例子。
describe("assignPlayerToZone", () => {
  const LINEUP: LineupZones = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };

  it("把場上球員指派到別的號位＝兩人互換，不會留下空格", () => {
    const next = assignPlayerToZone(LINEUP, 3, "p1");
    expect(next[3]).toBe("p1");
    // p3 被換到 p1 原本的 1 號位，而不是消失。
    expect(next[1]).toBe("p3");
    expect(Object.keys(next)).toHaveLength(6);
  });

  it("點球員自己原本就站的號位＝沒有變化", () => {
    expect(assignPlayerToZone(LINEUP, 1, "p1")).toEqual(LINEUP);
  });

  it("板凳球員指派到有人的號位＝頂替，原本那個人下場、仍維持六人滿編", () => {
    const next = assignPlayerToZone(LINEUP, 2, "bench");
    expect(next[2]).toBe("bench");
    // 被頂掉的 p2 整個離開快照（回板凳），不會被塞到別的號位去。
    expect(Object.values(next)).not.toContain("p2");
    expect(Object.keys(next)).toHaveLength(6);
  });

  it("目標號位是空的時候，場上球員換過去要清掉原號位、不留假資料", () => {
    // 五人的中途狀態（3 號位空著）：p1 換到 3 號位之後，1 號位必須真的空掉。
    const partial: LineupZones = { 1: "p1", 2: "p2", 4: "p4", 5: "p5", 6: "p6" };
    const next = assignPlayerToZone(partial, 3, "p1");
    expect(next[3]).toBe("p1");
    expect(next[1]).toBeUndefined();
    expect(Object.keys(next)).toHaveLength(5);
  });

  it("不會就地改動傳進來的那份快照（純函式，回傳新物件）", () => {
    const original = { ...LINEUP };
    assignPlayerToZone(LINEUP, 3, "p1");
    expect(LINEUP).toEqual(original);
  });
});

// removePlayerFromZone 是 assignPlayerToZone 的反向操作（issue #174 跨欄拖曳：
// 把人從號位拖回球員清單＝下場）。關鍵是「留空、不自動遞補」——見該函式的註解。
describe("removePlayerFromZone", () => {
  // 各個 describe 各自宣告一份滿編快照（跟上面幾個 block 的慣例一致）：測試之間不共用
  // 可變資料，才不會有「上一個 it 改到它、下一個 it 就莫名其妙掛掉」的順序相依。
  const LINEUP: LineupZones = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };

  it("把該號位清空，其他人原地不動", () => {
    const next = removePlayerFromZone(LINEUP, 3);
    expect(next[3]).toBeUndefined();
    expect(Object.keys(next)).toHaveLength(5);
    expect(next[1]).toBe(LINEUP[1]);
  });

  it("不會自動找人遞補（拿掉一個人就是 5 人，該補人的是使用者）", () => {
    expect(Object.values(removePlayerFromZone(LINEUP, 3))).not.toContain(LINEUP[3]);
  });

  it("號位本來就沒人時原樣回傳，呼叫端不用先檢查", () => {
    const partial = { 1: "p1" };
    expect(removePlayerFromZone(partial, 4)).toEqual(partial);
  });

  it("不會就地改動傳進來的那份快照", () => {
    const original = { ...LINEUP };
    removePlayerFromZone(LINEUP, 3);
    expect(LINEUP).toEqual(original);
  });
});

describe("deriveRotation（#231 PR3a 建立；#326 第三個參數改成「L 頂替誰」）", () => {
  const LINEUP: LineupZones = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };

  it("沒派 L 時＝lineupToPositions 的結果，liberoReplacement 為 null", () => {
    const rot = deriveRotation(LINEUP, null, null, 0);
    expect(rot.positions).toEqual(lineupToPositions(LINEUP, 0));
    expect(rot.liberoReplacement).toBeNull();
  });

  it("指定了 L 但沒有頂替對象（L 沒上場）→ 一樣不套替換", () => {
    const rot = deriveRotation(LINEUP, "l1", null, 0);
    expect(rot.positions.map((p) => p.playerId)).not.toContain("l1");
    expect(rot.liberoReplacement).toBeNull();
  });

  it("被頂替者在後排：他被替下，L 站上他的格子，場上仍是 6 人", () => {
    const rot = deriveRotation(LINEUP, "l1", "p1", 0);
    const ids = rot.positions.map((p) => p.playerId);
    expect(rot.positions).toHaveLength(6);
    expect(ids).toContain("l1");
    expect(ids).not.toContain("p1");
    expect(rot.liberoReplacement).toEqual({
      liberoId: "l1",
      replacedPosition: { playerId: "p1", ...getZoneCoords(1) },
    });
  });

  it("L 的號位是推導出來的：頂替對象不變，L 跟著他一起換格子", () => {
    // p1 第 0 輪站 1 號位，轉一輪後走到 6 號位（shiftSequence 1→6→5→4→3→2）。
    // 頂替關係沒變，所以 L 也從 1 號位跟到 6 號位——這正是 #326 的重點：使用者只決定
    // 「頂替誰」一件事，「站哪格」是每一輪各自算出來的。
    expect(deriveRotation(LINEUP, "l1", "p1", 0).positions).toContainEqual({
      playerId: "l1",
      ...getZoneCoords(1),
    });
    expect(deriveRotation(LINEUP, "l1", "p1", 1).positions).toContainEqual({
      playerId: "l1",
      ...getZoneCoords(6),
    });
  });

  it("⚠️ 被頂替者輪到前排 → L 不在場上，被頂替者自己站回去（#326 的核心規則）", () => {
    // 轉 5 輪之後 p1 落在 2 號位（前排）：1 →6 →5 →4 →3 →2。L 不能跟著輪到前排，所以
    // 他下場、留在場外——而且系統不會自動改去頂替後排的別人（那條啟發式已被推翻）。
    const rot = deriveRotation(LINEUP, "l1", "p1", 5);
    const ids = rot.positions.map((p) => p.playerId);
    expect(ids).not.toContain("l1");
    expect(ids).toContain("p1"); // 被頂替的人回到場上
    expect(rot.positions).toHaveLength(6);
    expect(rot.liberoReplacement).toBeNull();
  });

  it("頂替對象根本不在先發裡（名單被改過的殘留）→ 當作沒派 L，六人照站", () => {
    const rot = deriveRotation({ 2: "p2" }, "l1", "ghost", 0);
    expect(rot.positions.map((p) => p.playerId)).toEqual(["p2"]);
    expect(rot.liberoReplacement).toBeNull();
  });
});

describe("filterLineupToRoster（#231 PR3a：幽靈站位清理）", () => {
  const roster: MatchPlayer[] = [
    { id: "p1", name: "p1", number: 1, role: "OH", personId: null },
    { id: "p2", name: "p2", number: 2, role: "OH", personId: null },
  ];

  it("剔除已不在名單上的球員，其餘號位原樣保留", () => {
    const next = filterLineupToRoster({ 1: "p1", 2: "ghost", 3: "p2" }, roster);
    expect(next).toEqual({ 1: "p1", 3: "p2" });
  });

  it("沒有人被剔除時要回傳「原本那個物件參照」（toBe，不是 toEqual）", () => {
    // 這條是無限重繪防線：setRoster 會被 effect 反覆呼叫，沒清到東西卻換了參照，
    // 訂閱端就會重繪 → effect 再呼叫 → Maximum update depth exceeded（#69→#70）。
    // toEqual 測不出這件事——內容一樣就會過；只有 toBe 驗得出參照有沒有換。
    const lineup: LineupZones = { 1: "p1", 2: "p2" };
    expect(filterLineupToRoster(lineup, roster)).toBe(lineup);
  });

  it("名單整個空掉時回傳空快照", () => {
    expect(filterLineupToRoster({ 1: "p1" }, [])).toEqual({});
  });
});

// isLineupFull 是「可不可以開賽」這道門檻的唯一定義（issue #37 收斂、#231 PR3 換成吃
// LineupZones）。這組測試是 #231 PR4 補的：舊的 captureLineupFromRotations 靠「不滿六人
// 回 null」內建了同一道門檻，它的測試連帶把門檻釘住；PR4 刪掉那支函式時，如果不把門檻的
// 測試搬過來，就會在「刪死碼」的名義下悄悄少掉一條覆蓋——刪 code 可以，刪保護不行。
describe("isLineupFull（#231 PR4：從 captureLineupFromRotations 接手的開賽門檻）", () => {
  it("六個號位都有人才算滿", () => {
    expect(isLineupFull({ 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" })).toBe(true);
  });

  it("空的、或排到一半（1~5 人）都不算滿", () => {
    expect(isLineupFull({})).toBe(false);
    expect(isLineupFull({ 3: "p3" })).toBe(false);
    expect(isLineupFull({ 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5" })).toBe(false);
  });

  it("不要求名單裡一定要有自由球員——L 是替換上場的，不佔六個號位", () => {
    // 六個號位站滿一般球員就放行，跟有沒有指定 L 無關（產品決策，見函式註解）。
    const full = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };
    expect(isLineupFull(full)).toBe(true);
  });
});
