import { describe, it, expect } from "vitest";
import {
  isBackRowPosition,
  BACK_ROW_ZONES,
  getZoneCoords,
  findNearestZone,
  isLineupComplete,
  captureLineupFromRotations,
  readLineupFromRotations,
  lineupToPositions,
  positionsToLineup,
  placeLiberoInRotation,
  rotateZone,
  rotateLineup,
  assignPlayerToZone,
  removePlayerFromZone,
} from "./rotationLogic";
import type { RotationPositions } from "../types/rotationTable";
import type { MatchPlayer } from "../types/match";
import type { LineupSnapshot } from "../types/scoresheet";

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

// isLineupComplete 是「先發排好了沒」的共用判定（issue #37），輪轉表 hasRotations 跟
// 計分表 hasLineup 都靠它，門檻是「至少一輪站滿 6 人」，不強制指定自由球員。
describe("isLineupComplete", () => {
  // 產生一個有 n 個站位的輪次（座標無所謂，這裡只看人數）。
  const rot = (n: number): RotationPositions => ({
    positions: Array.from({ length: n }, (_, i) => ({ playerId: String(i), x: 0, y: 0 })),
    liberoReplacement: null,
  });

  it("rejects an empty or partial lineup (< 6 on court)", () => {
    expect(isLineupComplete([])).toBe(false);
    expect(isLineupComplete([rot(0), rot(0)])).toBe(false);
    expect(isLineupComplete([rot(5), rot(5)])).toBe(false); // 舊的寬鬆判定會誤放行
  });

  it("accepts once at least one rotation has a full 6 on court", () => {
    expect(isLineupComplete([rot(6)])).toBe(true);
    expect(isLineupComplete([rot(3), rot(6), rot(0)])).toBe(true);
  });
});

// issue #115：計分表先發快照的擷取/換算是解耦的核心，最容易踩的是「id 對不上這場球員時
// 該不該收」——這正是跨場導航/載入存檔把先發掃空的根因，用測試把它釘死。
describe("captureLineupFromRotations", () => {
  // 6 個非自由球員 id "1"~"6"，外加一個自由球員 "7"。
  // personId: null——這裡測的是輪轉/先發快照邏輯，不看 personId，給 null 只是滿足型別。
  const roster: MatchPlayer[] = [
    { id: "1", name: "A", number: 1, role: "OH", personId: null },
    { id: "2", name: "B", number: 2, role: "MB", personId: null },
    { id: "3", name: "C", number: 3, role: "S", personId: null },
    { id: "4", name: "D", number: 4, role: "OH", personId: null },
    { id: "5", name: "E", number: 5, role: "MB", personId: null },
    { id: "6", name: "F", number: 6, role: "OPP", personId: null },
    { id: "7", name: "L", number: 7, role: "L", personId: null },
  ];

  // 把「號位→球員 id」擺成 rotation 0 的 positions（座標用該號位中心，findNearestZone 才吸得準）。
  const rot0 = (zoneToId: Record<number, string>): RotationPositions => ({
    positions: Object.entries(zoneToId).map(([z, playerId]) => ({
      playerId,
      ...getZoneCoords(Number(z)),
    })),
    liberoReplacement: null,
  });

  const FULL = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };

  it("captures the 6 starting zones from rotation 0", () => {
    expect(captureLineupFromRotations([rot0(FULL)], roster)).toEqual(FULL);
  });

  it("returns null when positions are keyed by another match's ids (cross-match nav / loaded save)", () => {
    // 站位排好了（6 個），但 id 是別場球員（101~106）——全都是幽靈站位，不屬於這場 roster。
    const foreign = rot0({ 1: "101", 2: "102", 3: "103", 4: "104", 5: "105", 6: "106" });
    expect(captureLineupFromRotations([foreign], roster)).toBeNull();
  });

  it("returns null when only partially valid (< 6 zones survive filtering)", () => {
    expect(captureLineupFromRotations([rot0({ ...FULL, 6: "999" })], roster)).toBeNull();
  });

  it("restores the player covered by a libero so all 6 zones are counted", () => {
    const c1 = getZoneCoords(1);
    const covered: RotationPositions = {
      positions: [
        { playerId: "7", x: c1.x, y: c1.y }, // L 蓋住 1 號位
        ...[2, 3, 4, 5, 6].map((z) => ({ playerId: String(z), ...getZoneCoords(z) })),
      ],
      liberoReplacement: { liberoId: "7", replacedPosition: { playerId: "1", x: c1.x, y: c1.y } },
    };
    // L 不列入六個號位，被蓋的 "1" 還原成 1 號位先發。
    expect(captureLineupFromRotations([covered], roster)).toEqual(FULL);
  });

  it("returns null for an empty rotation set", () => {
    expect(captureLineupFromRotations([], roster)).toBeNull();
  });

  // 「排到一半」的中間狀態：把關用的 capture 要回 null（還不能開賽），但顯示用的 read 要
  // 照實回報。這組測試釘的是右欄「點了放不上去」那顆 bug 的根因——當時顯示也接在 capture
  // 上，排第一個人就被判成 null、面板變空，形成「要看到 1 個人得先有 6 個人」的死結。
  describe("readLineupFromRotations (顯示用，部分先發照實回報)", () => {
    it("reports a partially filled lineup instead of null", () => {
      expect(readLineupFromRotations([rot0({ 3: "3" })], roster)).toEqual({ 3: "3" });
    });

    it("still filters out ghost positions from another match", () => {
      expect(readLineupFromRotations([rot0({ 3: "3", 4: "999" })], roster)).toEqual({ 3: "3" });
    });

    it("returns an empty object (not null) when nothing is placed yet", () => {
      expect(readLineupFromRotations([], roster)).toEqual({});
    });

    it("agrees with captureLineupFromRotations once all 6 zones are filled", () => {
      expect(readLineupFromRotations([rot0(FULL)], roster)).toEqual(FULL);
    });
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

// positionsToLineup 是 lineupToPositions 的反向操作（#231 PR2）：把座標吸附回號位。
// 這支函式取代了原本 useRotationTable 私有的 positionsToZoneMap（回傳 Map），
// 換成回傳 LineupSnapshot 之後 store 才能直接複用 assignPlayerToZone，不用再手刻一次
// 「交換 vs 擠位」的規則——round-trip 測試釘住「跟 lineupToPositions 互為逆運算」這件事，
// 這正是這次重構敢動 store 內部演算法的底氣（兩支函式合起來要跟以前的 Map 版本行為一致）。
describe("positionsToLineup", () => {
  const FULL = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };

  it("round-trips with lineupToPositions：先展開成座標、再吸附回號位要拿回原本的快照", () => {
    const positions = lineupToPositions(FULL, 0);
    expect(positionsToLineup(positions)).toEqual(FULL);
  });

  it("拖放放開時的座標不會剛好在格子正中心，要吸附到最近的號位", () => {
    // 跟 findNearestZone 自己的測試用同一組偏移座標（isBackRowPosition 那組），
    // 靠近 6 號位（0.5, 0.85）的點應該吸附進 6 號位。
    expect(positionsToLineup([{ playerId: "p1", x: 0.52, y: 0.83 }])).toEqual({
      6: "p1",
    });
  });

  it("空陣列 → 空物件", () => {
    expect(positionsToLineup([])).toEqual({});
  });

  it("兩個座標吸附到同一個號位時，後面的蓋過前面的（跟它取代的 Map.set 覆寫行為一致）", () => {
    const zone1 = getZoneCoords(1);
    const positions = [
      { playerId: "first", x: zone1.x, y: zone1.y },
      { playerId: "second", x: zone1.x, y: zone1.y },
    ];
    expect(positionsToLineup(positions)).toEqual({ 1: "second" });
  });
});

// placeLiberoInRotation 是「L 上場頂替」的完整邏輯，從 useRotationTable.ts 搬出來
//（#231 PR2）才有辦法不啟動整個 store 就直接測。這裡釘住的三個分支正是 issue #14
// 「場上同時出現兩個 L」那個 bug 的根源——L 的身分分散在 positions/liberoReplacement 兩處，
// 任何一步漏還原就會讓兩個人疊在同一格。
describe("placeLiberoInRotation", () => {
  const roster: MatchPlayer[] = [
    { id: "p1", name: "P1", number: 1, role: "OH", personId: null },
    { id: "l1", name: "L1", number: 7, role: "L", personId: null },
    { id: "l2", name: "L2", number: 8, role: "L", personId: null },
  ];

  const c1 = getZoneCoords(1);
  const rotWithP1AtZone1: RotationPositions = {
    positions: [{ playerId: "p1", x: c1.x, y: c1.y }],
    liberoReplacement: null,
  };

  it("L 頂替一個後排格：占格的人進 liberoReplacement，L 出現在 positions、被頂替的人不再出現", () => {
    const next = placeLiberoInRotation(rotWithP1AtZone1, roster, "l1", 1);

    const ids = next.positions.map((p) => p.playerId);
    expect(ids).toContain("l1");
    expect(ids).not.toContain("p1");
    expect(next.liberoReplacement).toEqual({
      liberoId: "l1",
      replacedPosition: { playerId: "p1", x: c1.x, y: c1.y },
    });
  });

  it("換第二位 L 上場：第一位 L 頂替掉的人要先被還原，replacedPosition 記的是原本那個非自由球員，不是前一位 L", () => {
    const afterL1 = placeLiberoInRotation(rotWithP1AtZone1, roster, "l1", 1);

    const afterL2 = placeLiberoInRotation(afterL1, roster, "l2", 1);

    const ids = afterL2.positions.map((p) => p.playerId);
    expect(ids).not.toContain("l1"); // l1 已經被換下場，不會跟 l2 同時出現在場上
    expect(ids).toContain("l2");
    expect(afterL2.liberoReplacement).toEqual({
      liberoId: "l2",
      replacedPosition: { playerId: "p1", x: c1.x, y: c1.y }, // 記的是 p1，不是 l1
    });
  });

  it("L 頂替一個空格：沒有人被替換，liberoReplacement 是 null", () => {
    const emptyRot: RotationPositions = { positions: [], liberoReplacement: null };

    const next = placeLiberoInRotation(emptyRot, roster, "l1", 5);

    expect(next.positions.map((p) => p.playerId)).toEqual(["l1"]);
    expect(next.liberoReplacement).toBeNull();
  });
});

// rotateLineup 是換局換輪視窗（issue #120）的核心純函式，沒有碰任何 store/網路，
// 最適合用單元測試把「搬 key 不搬 value」這條行為釘住——這條規則很容易在之後改動時
// 不小心寫反（例如誤把 value 搬來搬去，變成搬錯人），測試能第一時間抓到。
describe("rotateLineup", () => {
  const LINEUP: LineupSnapshot = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };

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
  const LINEUP: LineupSnapshot = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };

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
    const partial: LineupSnapshot = { 1: "p1", 2: "p2", 4: "p4", 5: "p5", 6: "p6" };
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
  const LINEUP: LineupSnapshot = { 1: "p1", 2: "p2", 3: "p3", 4: "p4", 5: "p5", 6: "p6" };

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
