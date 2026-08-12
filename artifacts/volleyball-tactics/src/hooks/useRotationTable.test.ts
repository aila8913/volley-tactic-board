import { describe, it, expect, beforeEach } from "vitest";
import { useRotationTable } from "./useRotationTable";
import { getZoneCoords, BACK_ROW_ZONES, deriveRotation } from "../lib/rotationLogic";
import type { MatchPlayer } from "../types/match";
import type { LineupZones } from "../types/scoresheet";

// ── 這份是什麼、為什麼長這樣（issue #231 PR1 建立、PR3 改寫）─────────────────────
//
// `useRotationTable.ts`（輪轉表 store）放著整個 app 最容易寫錯的領域邏輯：交換 vs 擠位、
// 六輪傳播公式、自由球員替補/還原、幽靈站位清理。這份是它的 characterization test
// （特徵化測試）：釘住「使用者觀察得到的行為」，好在重構時分辨「不小心改了行為」跟
// 「原本就這樣」。
//
// PR3 動了 store 的**內部儲存形狀**（六輪座標陣列 → 一份 LineupZones + L 各輪的號位），
// 所以這份測試跟著改了一件事、也只改了這件事：**怎麼把「這一輪誰站哪」讀出來**。
// 以前是 `dataByMatch[A].rotations[0].positions`（直接撈存好的），現在是
// `rotationOf(A, 0).positions`（用 deriveRotation 現算）。斷言本身——誰在哪個號位、有沒有
// 少人、被 L 蓋住的是誰——幾乎逐字保留，因為那些才是行為。
//
// 有三條是真的改了行為，各自在原地標了「⚠️ 行為變更」並寫了理由：
//   1. 一般球員拖到 L 站著的格子（原本會疊兩個人，現在只有一個）—— bug 修掉了
//   2. 「重置站位」從只清一輪變成清全部
//   3. setLineupZones 不再需要「展開成六輪」

// 一個最小的 MatchPlayer（跟 useTacticsBoard.test.ts 的 player() 同款寫法）。
// personId 給 null——這裡測的是輪轉表的站位邏輯，不看跨場身分對應。
const player = (id: string, role: MatchPlayer["role"] = "OH"): MatchPlayer => ({
  id,
  name: id,
  number: 1,
  role,
  personId: null,
});

const A = "match-A";
const B = "match-B";

const rt = () => useRotationTable.getState();

// 「這一輪誰站哪」——store 現在只存先發 + L 頂替誰，畫面上看到的站位是現算的，所以測試也
// 走同一條推導路徑來觀察。這正是這份測試該有的視角：使用者看得到的是球場上的圈圈，不是
// store 裡的欄位長相。省略 rotation 參數時看目前輪次。
const rotationOf = (matchId: string, rotation?: number) => {
  const m = rt().dataByMatch[matchId];
  const r = rotation ?? m.currentRotation;
  return deriveRotation(m.lineup, m.startingLiberoId, m.liberoReplacesPlayerId, r);
};

// store 是 module 級單例，每個 it() 之間會共用同一份記憶體，不重設的話上一個測試排的站位
// 會滲進下一個測試。這裡選擇直接重設 dataByMatch 為空物件（而不是逐一呼叫 resetAll(A)）——
// 因為好幾個測試要驗證「per-match 分片互不污染」（見最後一個 describe），乾脆一次把所有
// matchId 的分片都清空最省事，也最不容易漏掉某個測試裡用到的 matchId。
beforeEach(() => {
  useRotationTable.setState({ dataByMatch: {}, circleLabel: "name" });
});

describe("placePlayerOnCourt — 交換 vs 擠位（#231 清單 1）", () => {
  // 這段在測「拖到一個已經有人的格子」時，兩條分支選錯一條會怎樣：
  //   - 兩個都在場上的人互拖 → 應該是互換（誰也沒被踢出場）
  //   - 板凳的人拖去佔別人格子 → 應該是擠位（原本站那格的人直接離場，不會被安置到別的格子）
  // 這兩條路徑共用同一段程式碼（這個人本來在不在場上決定分岔），寫錯很容易讓「擠位」誤觸發
  // 成「互換」，或反過來把互換誤判成擠位、憑空少一個人。

  it("兩個都在場上的球員互拖 → 互換位置，場上仍是原班 6 人", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "p2", 2);

    // p1 拖去 p2 的格子（2 號位）
    rt().placePlayerOnCourt(A, "p1", 2);

    const positions = rotationOf(A, 0).positions;
    const byId = new Map(positions.map((p) => [p.playerId, p]));
    expect(positions).toHaveLength(2); // 互換不會少人也不會多人
    expect(byId.get("p1")).toEqual({ playerId: "p1", ...getZoneCoords(2) });
    expect(byId.get("p2")).toEqual({ playerId: "p2", ...getZoneCoords(1) }); // p2 被換去 p1 原本的 1 號位
  });

  it("板凳球員拖到場上球員的格子 → 擠位：占格的人直接離場，不會被安置到別的格子", () => {
    rt().setRoster(A, [player("p1"), player("p2"), player("p3")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "p2", 2);

    // p3 還在板凳（沒上過場），直接拖去 p2 的格子（2 號位）
    rt().placePlayerOnCourt(A, "p3", 2);

    const positions = rotationOf(A, 0).positions;
    const ids = positions.map((p) => p.playerId);
    expect(positions).toHaveLength(2); // 擠位：場上人數不變（p2 出場、p3 入場），不是 3 人
    expect(ids).toContain("p3");
    expect(ids).not.toContain("p2"); // p2 被擠掉，且沒有出現在任何其他格子
    expect(positions.find((p) => p.playerId === "p3")).toEqual({
      playerId: "p3",
      ...getZoneCoords(2),
    });
  });

  it("拖到自己原本站的格子 → 完全沒有變化（連參照都不變）", () => {
    rt().setRoster(A, [player("p1")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    const before = rt().dataByMatch[A];

    rt().placePlayerOnCourt(A, "p1", 1); // 拖回自己原本的格子

    // 程式碼在「這一格站的已經是他」時直接 `return m`（原封不動的舊物件），沒有 return
    // 新物件，所以連這一場的分片本身都是同一個參照，用 toBe 才驗得出「真的什麼都沒做」。
    expect(rt().dataByMatch[A]).toBe(before);
  });
});

describe("六輪傳播公式（#231 清單 2）：排好一輪，其他 5 輪自動推算", () => {
  // 教練只需要排「目前這一輪」的站位，其他 5 輪要照 1→6→5→4→3→2 逆時針的輪轉規則算出來
  // （lib/rotationLogic.ts 的 shiftSequence + rotateZone）。這條公式如果算錯方向或算錯輪次差，
  // 畫面上其他 5 輪的站位會整組錯掉但不容易一眼看出來（座標仍在球場範圍內，只是站錯號位），
  // 所以特別需要釘住幾個具體的號位換算數字。
  //
  // PR3 之後「其他 5 輪」不再是被寫進 state 的資料，而是 deriveRotation 現算的結果——
  // 但對使用者來說沒有差別（畫面一樣），所以這兩條斷言原封不動。

  it("在輪次 0（目前輪次預設值）排 1 號位，輪次 1 的座標要等於 6 號位（逆時針轉一格）", () => {
    rt().setRoster(A, [player("p1")]);
    rt().placePlayerOnCourt(A, "p1", 1); // 不傳 referenceRotation，用目前輪次（預設 0）

    expect(rotationOf(A, 1).positions[0]).toEqual({ playerId: "p1", ...getZoneCoords(6) });
  });

  it("以輪次 2 為基準排位，回推輪次 0 也要照公式推算正確（referenceRotation 參數）", () => {
    rt().setRoster(A, [player("p1")]);
    // 站在「輪次 2」時是 1 號位 → 回推輪次 0（往前推 2 格）：
    // shiftSequence = [1,6,5,4,3,2]，1 的 index 是 0，(0-2+6)%6=4，shiftSequence[4]=3 號位。
    rt().placePlayerOnCourt(A, "p1", 1, 2);

    expect(rotationOf(A, 2).positions[0]).toEqual({ playerId: "p1", ...getZoneCoords(1) }); // 基準輪次本身維持 1 號位
    expect(rotationOf(A, 0).positions[0]).toEqual({ playerId: "p1", ...getZoneCoords(3) });
  });
});

describe("自由球員上場/替補/還原（#231 清單 3）", () => {
  // 自由球員（L）跟一般球員的站位邏輯完全獨立：L 不參與六輪傳播；同時間只能有一位 L 在場上，
  // 上場時會「頂替」目標格原本站的人，該被頂替的人不會留在 positions 裡（Court.tsx 才不會
  // 畫出兩個人疊在同一格）。這一段是 issue #14 兩個 L 同時出現的 bug 根源。
  //
  // #326 之後 store 記的是「L 頂替誰」（liberoReplacesPlayerId），不是「L 站哪格」——下面
  // 這幾條的斷言完全不用改，因為它們一開始就只看使用者看得到的東西（誰在場上、誰被蓋住）。

  function setupSixOnCourt() {
    const roster = [
      player("p1"),
      player("p2"),
      player("p3"),
      player("p4"),
      player("p5"),
      player("p6"),
      player("l1", "L"),
      player("l2", "L"),
    ];
    rt().setRoster(A, roster);
    for (let zone = 1; zone <= 6; zone++) {
      rt().placePlayerOnCourt(A, `p${zone}`, zone);
    }
  }

  it("L 上場頂替後排某格：那格原本的人被蓋住，不再出現在場上位置清單裡", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1); // 1 號位是後排，p1 原本站這裡

    const rot0 = rotationOf(A, 0);
    const ids = rot0.positions.map((p) => p.playerId);
    expect(ids).toContain("l1");
    expect(ids).not.toContain("p1"); // p1 被頂替，不在場上位置清單裡
    expect(rot0.positions).toHaveLength(6); // 頂替不改變場上人數
    expect(rot0.liberoReplacement).toEqual({
      liberoId: "l1",
      replacedPosition: { playerId: "p1", ...getZoneCoords(1) },
    });
  });

  it("換另一位 L 上場：場上不會同時出現兩個 L、也不會少人", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1); // l1 先頂替 p1
    rt().placePlayerOnCourt(A, "l2", 1); // l2 換上同一格

    const rot0 = rotationOf(A, 0);
    const ids = rot0.positions.map((p) => p.playerId);
    expect(ids).not.toContain("l1"); // l1 已經被換下場
    expect(ids).toContain("l2");
    expect(ids).not.toContain("p1"); // p1 這次被 l2 頂替
    expect(rot0.positions).toHaveLength(6); // 全程都只有 6 人在場，不會多也不會少
    expect(rot0.liberoReplacement).toEqual({
      liberoId: "l2",
      // 關鍵：被替換的是 p1（先發裡站 1 號位的人），不是誤記成前一位自由球員 l1——
      // 舊模型要靠「先還原 l1 頂替的人、再讓 l2 頂替他」這串手續才做得對，新模型裡
      // l1 從來就沒進過先發，所以這件事不可能算錯。
      replacedPosition: { playerId: "p1", ...getZoneCoords(1) },
    });
  });

  it("removePlayerFromCourt(L)：解除頂替，被替換者回到場上", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1);

    rt().removePlayerFromCourt(A, "l1");

    const rot0 = rotationOf(A, 0);
    const ids = rot0.positions.map((p) => p.playerId);
    expect(ids).not.toContain("l1");
    expect(ids).toContain("p1"); // 被頂替的 p1 露出來（他其實一直都在先發裡）
    expect(rot0.positions).toHaveLength(6);
    expect(rot0.liberoReplacement).toBeNull();
  });

  it("拖 L 上場記的是「頂替誰」，不是「哪一格」（#326）", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1); // 目前輪次 0，1 號位站的是 p1

    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBe("p1");
  });

  it("在非 0 輪拖 L 上場：記的是那一格「當下站的人」，不是起始號位的人", () => {
    setupSixOnCourt();
    // 轉一輪之後，1 號位站的是原本排在 2 號位的 p2（shiftSequence 1→6→5→4→3→2）。
    // 這條在防的是「忘記把當下號位換算回起始號位」——那樣會誤記成頂替 p1。
    rt().setCurrentRotation(A, 1);
    rt().placePlayerOnCourt(A, "l1", 1);

    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBe("p2");
    expect(rotationOf(A, 1).liberoReplacement?.replacedPosition.playerId).toBe("p2");
  });

  it("⚠️ 被頂替者輪到前排的那一輪，L 不在場上（#326 的核心規則）", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1); // 頂替 p1

    // p1 從 1 號位轉 5 輪後落在 2 號位（前排）——L 不能跟到前排，所以那一輪他不在場上。
    const rot5 = rotationOf(A, 5);
    expect(rot5.positions.map((p) => p.playerId)).not.toContain("l1");
    expect(rot5.positions.map((p) => p.playerId)).toContain("p1");
    // 但頂替關係本身沒被清掉——只是這一輪算出來 L 不上場。轉回後排的輪次他就在場上，
    // 因為輪轉表是「同一份先發的六個切面」，不是六個各自獨立的時刻（計分表那邊才是時間軸，
    // 那裡由 ScoreSheet 的 effect 真的把替補狀態清成 null，見 lib/liberoRotation.ts）。
    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toContain("l1");
  });

  it("L 拖到「空的」後排格 → 忽略（沒有可頂替的對象）", () => {
    rt().setRoster(A, [player("l1", "L")]); // 先發一個人都沒有
    const before = rt().dataByMatch[A];

    rt().placePlayerOnCourt(A, "l1", 1);

    // 新模型只認得「L 頂替某個人」，「L 站在空格上」在規則上不存在，所以連 state 都不換。
    expect(rt().dataByMatch[A]).toBe(before);
  });
});

describe("自由球員後排限制（#231 清單 4）", () => {
  it("L 拖到前排號位（2/3/4）被拒絕，state 原封不動", () => {
    rt().setRoster(A, [player("l1", "L")]);
    const before = rt().dataByMatch[A];

    // BACK_ROW_ZONES 只有 1/5/6；用它導出「不是後排」的號位，不要手寫魔術數字，
    // 這樣如果哪天後排定義改了，這條測試會自動跟著對，而不是悄悄測錯規則。
    const frontZone = [1, 2, 3, 4, 5, 6].find((z) => !BACK_ROW_ZONES.has(z))!;
    rt().placePlayerOnCourt(A, "l1", frontZone);

    // 程式碼在 !BACK_ROW_ZONES.has(zone) 時直接 `return m`，連參照都不換。
    expect(rt().dataByMatch[A]).toBe(before);
  });
});

describe("排 L 時同步 startingLiberoId（#231 清單 5 / issue #14 bug 1 的修法）", () => {
  it("不管從板凳或備位區拖上場的是哪個 L，都要把它設成 startingLiberoId", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L"), player("l2", "L")]);
    // L 一定要落在「有人站著」的後排格（#326：拖曳的語意是「頂替這個人」），所以先排 p1。
    rt().placePlayerOnCourt(A, "p1", 1);

    rt().placePlayerOnCourt(A, "l1", 1);
    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");

    rt().placePlayerOnCourt(A, "l2", 1); // 換另一位 L 上場
    expect(rt().dataByMatch[A].startingLiberoId).toBe("l2"); // 備位區顯示要跟著換，不能停在 l1
  });
});

describe("⚠️ 行為變更：一般球員拖到自由球員正站著的格子（PR1 釘住的 bug，PR3 修掉）", () => {
  // PR1 這一條原本釘住的是一個**確認過的 bug**：兩個人會同時被寫進 1 號位的座標，畫面上
  // 兩顆圈疊在一起。成因是舊的 placePlayerOnCourt 在算「目標格有沒有人」之前，會先把所有
  // 自由球員的站位過濾掉——L 站的格子因此看起來是空的，不觸發互換也不觸發擠位。
  //
  // PR3 換掉表示法之後這個 bug 自然消失，不是「順手修了一行」：先發（lineup）裡本來就沒有
  // 自由球員，「那格有沒有人」只剩一個答案；L 是渲染時蓋在先發上面的一層，蓋子底下站著誰
  // 由 deriveRotation 現算。這正是 characterization test 存在的意義——行為變了，這條就會紅，
  // 逼這個 PR 明講「我改了這件事」，而不是讓它混在 diff 裡溜過去。
  //
  // ⚠️ 再變一次（#326）：被 L 頂替的人被擠出先發時，那次頂替不再成立，L 回到場外。舊版
  // （記號位）會讓 L 自動改成蓋住新來的 p7；新版不猜，理由跟刪掉「接替」啟發式一樣——
  // 教練沒說過要換頂替對象，系統替他寫下來就是在紀錄裡捏造一次替換。
  it("1 號位只會有一個人：p7 擠掉 p1 進先發，L 因為頂替對象離場而下場", () => {
    const roster = [
      player("p1"),
      player("p2"),
      player("p3"),
      player("p4"),
      player("p5"),
      player("p6"),
      player("p7"),
      player("l1", "L"),
    ];
    rt().setRoster(A, roster);
    for (let zone = 1; zone <= 6; zone++) {
      rt().placePlayerOnCourt(A, `p${zone}`, zone);
    }
    rt().placePlayerOnCourt(A, "l1", 1); // l1 頂替 1 號位

    rt().placePlayerOnCourt(A, "p7", 1); // 板凳的 p7 也被拖到 1 號位

    const rot0 = rotationOf(A, 0);
    const zone1 = getZoneCoords(1);
    const atZone1 = rot0.positions.filter((p) => p.x === zone1.x && p.y === zone1.y);
    expect(atZone1.map((p) => p.playerId)).toEqual(["p7"]); // ← 只有一個人，不再疊圈
    expect(rot0.liberoReplacement).toBeNull(); // 頂替對象 p1 離場，這次頂替不成立
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBeNull(); // 而且 store 裡不留殘值
    expect(rot0.positions.map((p) => p.playerId)).not.toContain("p1"); // p1 被 p7 擠掉了
  });
});

describe("setRoster 幽靈站位清理（#231 清單 6 / issue #35）", () => {
  it("被移出名單的一般球員，若還卡在先發裡會被掃掉", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "p2", 2);

    rt().setRoster(A, [player("p1")]); // p2 被移出名單

    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1"]);
  });

  it("被 L 蓋住的人若被移出名單，替補紀錄跟著消失（不會留下指向不存在球員的殘留）", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "l1", 1); // l1 蓋住 p1

    rt().setRoster(A, [player("l1", "L")]); // p1 被移出名單

    // 舊模型要特地去檢查 liberoReplacement 裡有沒有卡到已刪除的球員；新模型只要 p1 從
    // 先發被掃掉，「被蓋住的人」現算的結果自然就是 null，沒有第二個地方需要同步。
    expect(rotationOf(A, 0).liberoReplacement).toBeNull();
  });

  it("先發 L 被移出名單時，他的頂替關係也一併撤掉", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "l1", 1);

    rt().setRoster(A, [player("p1")]); // 名單裡沒有任何 L 了

    expect(rt().dataByMatch[A].startingLiberoId).toBeNull();
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBeNull();
    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1"]); // p1 露出來
  });

  it("被頂替的人被移出名單時，頂替關係也要跟著清掉（#326 才需要顧的殘留）", () => {
    // 舊模型記的是號位，人被刪掉頂多讓那格空著；新模型記的是**人**，所以會留下一個指向
    // 不存在球員的 id。畫面上看不出差別（deriveRotation 算出來一樣是「L 不在場上」），
    // 但 store 裡留著一個永遠不會成真的值，下一個讀它的人就會被騙。
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "l1", 1);

    rt().setRoster(A, [player("l1", "L")]); // p1 被移出名單，L 還在

    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBeNull();
    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1"); // L 本人還在名單裡，不受影響
  });
});

describe("setRoster 的 stable reference 優化（#231 清單 7，最重要的一條）", () => {
  // 「沒清到任何東西時，必須回傳原本那個先發物件的參照」，而不是每次都產生一份「內容相等
  // 但參照不同」的新物件。
  //
  // 為什麼這不是效能微調而是正確性問題：TacticsBoard 進頁的 effect 會用 match.players 呼叫
  // setRoster，而 match 每次 render 都是新物件，所以 setRoster 會被反覆呼叫。如果每次呼叫都
  // 換掉先發的參照，訂閱它的元件就會判定「這個 slice 變了」而重繪，重繪又觸發那個 effect
  // 再呼叫一次 setRoster——形成無限迴圈，React 會丟出 "Maximum update depth exceeded"
  //（issue #69→#70 就是踩過這個雷）。
  //
  // 所以這裡刻意用 toBe（身分比較：兩個變數是不是指向記憶體裡同一個物件）而不是 toEqual
  //（內容比較）。toEqual 沒辦法測出這個 bug——就算每次都重新產生新物件，只要內容一樣照樣
  // 會過；能測出「有沒有換參照」的只有 toBe。這正是本節唯一在乎「內部實作細節」的例外：
  // 因為「參照穩不穩定」本身就是外部可觀察的行為（會不會觸發無限重繪）。

  it("沒有任何球員被清掉時，setRoster 後的先發要是原本那個物件參照（toBe）", () => {
    const roster = [player("p1"), player("p2")];
    rt().setRoster(A, roster);
    rt().placePlayerOnCourt(A, "p1", 1);
    const before = rt().dataByMatch[A].lineup;

    // 用同樣的球員名單（沒有刪任何人）再呼叫一次 setRoster——模擬 effect 被反覆觸發的情境。
    rt().setRoster(A, [player("p1"), player("p2")]);

    expect(rt().dataByMatch[A].lineup).toBe(before);
  });

  it("真的刪掉一個在場上的球員時，先發參照要換掉（跟上面那條剛好相反）", () => {
    const roster = [player("p1"), player("p2")];
    rt().setRoster(A, roster);
    rt().placePlayerOnCourt(A, "p1", 1);
    const before = rt().dataByMatch[A].lineup;

    rt().setRoster(A, [player("p2")]); // p1 真的被刪了

    expect(rt().dataByMatch[A].lineup).not.toBe(before);
  });
});

describe("removePlayerFromCourt — 一般球員 vs 自由球員（#231 清單 8）", () => {
  it("一般球員：從全部 6 個輪次消失", () => {
    rt().setRoster(A, [player("p1")]);
    rt().placePlayerOnCourt(A, "p1", 1);

    rt().removePlayerFromCourt(A, "p1");

    for (let r = 0; r < 6; r++) {
      expect(rotationOf(A, r).positions.map((p) => p.playerId)).not.toContain("p1");
    }
  });

  // ⚠️ 行為變更（#326）：這一條原本釘的是「L 只從目前輪次移除，其他輪次的 L 站位不受影響」，
  // 因為舊模型讓 L 在六輪各有一個獨立的號位。新模型只有一份「頂替誰」，那件事不再可表示——
  // 而且它本來就跟規則對不上：把 L 換下場是一個當下的動作，不是「只有第 3 輪他不上場」。
  it("自由球員：解除頂替＝整份先發都看不到他了", () => {
    rt().setRoster(A, [player("p1"), player("p5", "OH"), player("l1", "L")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "p5", 5);
    rt().placePlayerOnCourt(A, "l1", 1); // 頂替 p1

    rt().removePlayerFromCourt(A, "l1");

    for (let r = 0; r < 6; r++) {
      expect(rotationOf(A, r).positions.map((p) => p.playerId)).not.toContain("l1");
    }
  });
});

describe("setLineupZones（#231 清單 9）", () => {
  it("⚠️ 行為變更（#327）：被頂替的人還在新先發裡，頂替關係就留著", () => {
    // 舊行為是無條件清空 liberoReplacesPlayerId。當時說得通——那時右欄面板沒有任何地方
    // 能指定 L，這支的呼叫端都是「教練剛動過六個號位」，清掉一個別處設的殘留值沒人察覺。
    // #327 把第七格搬進同一個面板之後就完全不同：排好 L、再調整任何一格，L 就無聲消失。
    useRotationTable.setState((state) => ({
      dataByMatch: {
        ...state.dataByMatch,
        [A]: {
          roster: [],
          currentRotation: 0,
          startingLiberoId: "l1",
          lineup: { 1: "p1" },
          liberoReplacesPlayerId: "p1",
        },
      },
    }));

    // 新的先發裡 p1 還在（只是換了格），頂替關係沒有理由失效。
    rt().setLineupZones(A, { 5: "p1", 2: "p2" });
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBe("p1");

    // 反過來：新的先發裡沒有 p1 了，這次頂替就不成立（#326：系統不替教練猜下一個對象）。
    rt().setLineupZones(A, { 1: "p9" });
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBeNull();
  });

  it("先發直接就是傳進來那一份", () => {
    const lineup: LineupZones = { 1: "p1", 2: "p2" };
    rt().setLineupZones(A, lineup);

    // ⚠️ 行為變更（表述層面）：以前這個 action 要把號位快照「展開」成六輪座標寫進 state，
    // 現在 store 存的本來就是同一種格式，直接放進去即可——少掉的正是那層翻譯。
    expect(rt().dataByMatch[A].lineup).toEqual(lineup);

    // 使用者看得到的結果沒變：輪次 0 照排，輪次 1 起始站 1 號位的人（p1）落在 6 號位。
    expect(rotationOf(A, 0).positions).toEqual(
      expect.arrayContaining([
        { playerId: "p1", ...getZoneCoords(1) },
        { playerId: "p2", ...getZoneCoords(2) },
      ]),
    );
    expect(rotationOf(A, 1).positions).toEqual(
      expect.arrayContaining([{ playerId: "p1", ...getZoneCoords(6) }]),
    );
  });
});

describe("setLiberoAssignment — 第七格的寫入口（#327）", () => {
  const seed = () => {
    rt().setRoster(A, [player("p1"), player("p2"), player("l1", "L"), player("l2", "L")]);
    rt().setLineupZones(A, { 1: "p1", 4: "p2" });
  };

  it("一次寫定「哪位 L」跟「頂替誰」", () => {
    seed();
    rt().setLiberoAssignment(A, "l1", "p1");

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBe("p1");
    // 被頂替的人站 1 號位（後排）→ L 在場上，蓋住他那一格。
    const rot = rotationOf(A, 0);
    expect(rot.liberoReplacement?.liberoId).toBe("l1");
    expect(rot.positions.map((p) => p.playerId)).not.toContain("p1");
  });

  it("頂替一個站前排的人是合法的計畫，只是 L 現在不在場上", () => {
    // 跟 placePlayerOnCourt 的前排拒絕不一樣，不是漏擋：那邊的手勢是「把 L 放到這一格
    // 站著」（前排站位不存在），這裡的手勢是「指定 L 要頂誰」（等他轉到後排再上）。
    seed();
    rt().setLiberoAssignment(A, "l1", "p2"); // p2 在 4 號位＝前排

    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBe("p2");
    expect(rotationOf(A, 0).liberoReplacement).toBeNull();
    // 轉三輪之後 4 號位的人走到 1 號位（後排），同一份資料就推導出「L 上場了」。
    expect(BACK_ROW_ZONES.has(1)).toBe(true);
    expect(rotationOf(A, 3).liberoReplacement?.liberoId).toBe("l1");
  });

  it("liberoId 傳 null＝整個指派收掉（L 下場、也不頂替任何人）", () => {
    seed();
    rt().setLiberoAssignment(A, "l1", "p1");
    rt().setLiberoAssignment(A, null, null);

    expect(rt().dataByMatch[A].startingLiberoId).toBeNull();
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBeNull();
  });

  it("白名單：不是名單裡的 L 就整個忽略，不寫進任何東西", () => {
    seed();
    rt().setLiberoAssignment(A, "l1", "p1");

    rt().setLiberoAssignment(A, "p2", "p1"); // p2 是 OH，不是自由球員
    rt().setLiberoAssignment(A, "ghost", "p1"); // 根本不在名單裡

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");
  });

  it("白名單：頂替對象不在先發裡就當作沒指定（L 仍然設定成功）", () => {
    seed();
    rt().setLiberoAssignment(A, "l1", "ghost");

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBeNull();
  });

  it("換一位 L 不會動到頂替對象（兩個決定是分開的）", () => {
    seed();
    rt().setLiberoAssignment(A, "l1", "p1");
    rt().setLiberoAssignment(A, "l2", "p1");

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l2");
    expect(rt().dataByMatch[A].liberoReplacesPlayerId).toBe("p1");
  });
});

describe("⚠️ 行為變更：resetPositions 清全部輪次（原 resetCurrentRotationPositions 只清一輪）", () => {
  // PR1 這一條釘的是「只清目前輪次，其他輪次不受影響」。新表示法下那件事不再可表示——
  // 先發只有一份、六輪共用，沒有「只有第 3 輪是空的」這種狀態。
  //
  // 這個行為其實舊版也名不副實：清掉第 3 輪之後，只要再拖任何一個人，六輪就會全部從那一輪
  // 重新推算，被清掉的其他輪資料本來就留不住——「只清一輪」是舊表示法多存了五份副本才變得
  // 出來的假象。所以改成誠實地清全部，按鈕的確認文案也一併改過（RotationControlsFooter）。
  it("清掉之後六個輪次都沒有人，L 的頂替關係也一併清空", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "l1", 1); // 頂替 p1

    rt().setCurrentRotation(A, 2);
    rt().resetPositions(A);

    for (let r = 0; r < 6; r++) {
      expect(rotationOf(A, r).positions).toEqual([]);
      expect(rotationOf(A, r).liberoReplacement).toBeNull();
    }
    // 名單跟目前輪次不受影響——清的是站位，不是整場重來（那是 resetAll）。
    expect(rt().dataByMatch[A].roster).toHaveLength(2);
    expect(rt().dataByMatch[A].currentRotation).toBe(2);
  });
});

describe("per-match 分片互不污染（#231 清單 11 / issue #119）", () => {
  it("在 match A 排站位，match B 的分片完全不受影響（甚至不存在）", () => {
    rt().setRoster(A, [player("p1")]);
    rt().placePlayerOnCourt(A, "p1", 1);

    expect(rt().dataByMatch[B]).toBeUndefined(); // 還沒碰過 B，分片根本沒被建立

    rt().setRoster(B, [player("p9")]);
    rt().placePlayerOnCourt(B, "p9", 6);

    // 兩場的站位各自獨立：B 的操作不會讓 A 的球員跑出來，A 的操作也不會混進 B。
    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1"]);
    expect(rotationOf(B, 0).positions.map((p) => p.playerId)).toEqual(["p9"]);
  });
});
