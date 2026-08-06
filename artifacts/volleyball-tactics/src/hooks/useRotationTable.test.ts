import { describe, it, expect, beforeEach } from "vitest";
import { useRotationTable } from "./useRotationTable";
import { getZoneCoords, BACK_ROW_ZONES } from "../lib/rotationLogic";
import type { MatchPlayer } from "../types/match";
import type { LineupSnapshot } from "../types/scoresheet";

// ── 這份是什麼、為什麼現在寫（issue #231 PR1）──────────────────────────────────
//
// `useRotationTable.ts`（輪轉表 store）目前零測試，卻放著整個 app 最容易寫錯的領域邏輯：
// 交換 vs 擠位、六輪傳播公式、自由球員替補/還原、幽靈站位清理……相較之下 lib/ 底下的純函式
// 幾乎都有測試，等於「安全的部分被測到，危險的部分沒被測到」。
//
// 這份測試檔是 characterization test（特徵化測試）：只釘住「現在程式碼實際的行為」，
// 不判斷這個行為對不對。之所以要先寫這種測試，是因為接下來兩個 PR 要動這份邏輯本身：
//   - PR2 會把這裡面的座標運算（交換/擠位/六輪傳播）抽成 lib/ 底下的純函式；
//   - PR3 會把 store 內部的資料表示法從 RotationPositions[]（六輪座標陣列）
//     整個換成 LineupSnapshot（號位 → 球員 id）。
// 這兩個都是「該重構」——重構的定義是「外部行為不變，只換內部實作」。如果沒有一份先釘住
// 「現在的行為長什麼樣」的測試，就沒辦法區分「重構後的失敗」是「不小心改了行為」還是
// 「原本就會這樣」。所以斷言全部打在 store 的公開 action + 使用者觀察得到的 state 語意上
// （場上誰在哪個號位、liberoReplacement 記了誰、rotations 陣列的參照有沒有變），
// 刻意不斷言「內部演算法怎麼算的」，這樣 PR2/PR3 換掉內部實作之後，這份測試應該要原封不動
// 照樣全綠——如果它跟著實作細節一起垮，代表測試寫得不夠「行為導向」，等於白寫。

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
  // 這兩條路徑共用同一段程式碼（sourceZone !== null 是不是 true 決定分岔），寫錯很容易讓
  // 「擠位」誤觸發成「互換」，或反過來把互換誤判成擠位、憑空少一個人。

  it("兩個都在場上的球員互拖 → 互換位置，場上仍是原班 6 人", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "p2", 2);

    // p1 拖去 p2 的格子（2 號位）
    rt().placePlayerOnCourt(A, "p1", 2);

    const positions = rt().dataByMatch[A].rotations[0].positions;
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

    const positions = rt().dataByMatch[A].rotations[0].positions;
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

    // 程式碼在 sourceZone === zone 時直接 `return m`（原封不動的舊物件），沒有 return 新物件，
    // 所以連這一場的分片本身都是同一個參照，用 toBe 才驗得出「真的什麼都沒做」。
    expect(rt().dataByMatch[A]).toBe(before);
  });
});

describe("六輪傳播公式（#231 清單 2）：排好一輪，其他 5 輪自動推算", () => {
  // 教練只需要排「目前這一輪」的站位，其他 5 輪要照 1→6→5→4→3→2 逆時針的輪轉規則自動算出來
  // （lib/rotationLogic.ts 的 shiftSequence + rotateZone）。這條公式如果被 PR2 抽出去時算錯方向
  // 或算錯輪次差，畫面上其他 5 輪的站位會整組錯掉但不容易一眼看出來（座標仍在球場範圍內，
  // 只是站錯號位），所以特別需要釘住幾個具體的號位換算數字。

  it("在輪次 0（目前輪次預設值）排 1 號位，輪次 1 的座標要等於 6 號位（逆時針轉一格）", () => {
    rt().setRoster(A, [player("p1")]);
    rt().placePlayerOnCourt(A, "p1", 1); // 不傳 referenceRotation，用目前輪次（預設 0）

    const rotation1Pos = rt().dataByMatch[A].rotations[1].positions[0];
    expect(rotation1Pos).toEqual({ playerId: "p1", ...getZoneCoords(6) });
  });

  it("以輪次 2 為基準排位，回推輪次 0 也要照公式推算正確（referenceRotation 參數）", () => {
    rt().setRoster(A, [player("p1")]);
    // 站在「輪次 2」時是 1 號位 → 回推輪次 0（往前推 2 格，i - r = 0 - 2 = -2）：
    // shiftSequence = [1,6,5,4,3,2]，1 的 index 是 0，(0-2+6)%6=4，shiftSequence[4]=3 號位。
    rt().placePlayerOnCourt(A, "p1", 1, 2);

    const rotation0Pos = rt().dataByMatch[A].rotations[0].positions[0];
    const rotation2Pos = rt().dataByMatch[A].rotations[2].positions[0];
    expect(rotation2Pos).toEqual({ playerId: "p1", ...getZoneCoords(1) }); // 基準輪次本身維持 1 號位
    expect(rotation0Pos).toEqual({ playerId: "p1", ...getZoneCoords(3) });
  });
});

describe("自由球員上場/替補/還原（#231 清單 3）", () => {
  // 自由球員（L）跟一般球員的站位邏輯完全獨立：L 不參與六輪傳播，每輪各自記錄；同時間只能有
  // 一位 L 在場上，上場時會「頂替」目標格原本站的人，該被頂替的人存進 liberoReplacement、
  // 不留在 positions 裡（Court.tsx 找不到就不會畫出兩個人疊在同一格）。這一段是 issue #14
  // 兩個 L 同時出現的 bug 根源，最需要釘死。

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

  it("L 上場頂替後排某格：那格原本的人進 liberoReplacement，不再留在 positions 裡", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1); // 1 號位是後排，p1 原本站這裡

    const rot0 = rt().dataByMatch[A].rotations[0];
    const ids = rot0.positions.map((p) => p.playerId);
    expect(ids).toContain("l1");
    expect(ids).not.toContain("p1"); // p1 被頂替，不在場上位置清單裡
    expect(rot0.positions).toHaveLength(6); // 頂替不改變場上人數
    expect(rot0.liberoReplacement).toEqual({
      liberoId: "l1",
      replacedPosition: { playerId: "p1", ...getZoneCoords(1) },
    });
  });

  it("換另一位 L 上場：前一位的被替換者要先被還原，場上不會同時出現兩個 L、也不會少人", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1); // l1 先頂替 p1
    rt().placePlayerOnCourt(A, "l2", 1); // l2 換上同一格

    const rot0 = rt().dataByMatch[A].rotations[0];
    const ids = rot0.positions.map((p) => p.playerId);
    expect(ids).not.toContain("l1"); // l1 已經被換下場
    expect(ids).toContain("l2");
    expect(ids).not.toContain("p1"); // p1 這次被 l2 頂替
    expect(rot0.positions).toHaveLength(6); // 全程都只有 6 人在場，不會多也不會少
    expect(rot0.liberoReplacement).toEqual({
      liberoId: "l2",
      // 關鍵：replacedPosition 記的是 p1（先還原 l1 頂替的人，再讓 l2 頂替他），
      // 不是誤記成「l1」被頂替——那樣會把一個自由球員記成被替換者，場上邏輯全亂。
      replacedPosition: { playerId: "p1", ...getZoneCoords(1) },
    });
  });

  it("removePlayerFromCourt(L)：只清當前輪次，被替換者回到 positions，liberoReplacement 變 null", () => {
    setupSixOnCourt();
    rt().placePlayerOnCourt(A, "l1", 1);

    rt().removePlayerFromCourt(A, "l1");

    const rot0 = rt().dataByMatch[A].rotations[0];
    const ids = rot0.positions.map((p) => p.playerId);
    expect(ids).not.toContain("l1");
    expect(ids).toContain("p1"); // 被頂替的 p1 還原回場上
    expect(rot0.positions).toHaveLength(6);
    expect(rot0.liberoReplacement).toBeNull();
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
    rt().placePlayerOnCourt(A, "p1", 1);

    rt().placePlayerOnCourt(A, "l1", 5);
    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");

    rt().placePlayerOnCourt(A, "l2", 5); // 換另一位 L 上場
    expect(rt().dataByMatch[A].startingLiberoId).toBe("l2"); // 備位區顯示要跟著換，不能停在 l1
  });
});

describe("⚠️ 已知 bug：一般球員拖到自由球員正站著的格子（釘住現況，不是釘住應然）", () => {
  // characterization test 的定義是「描述現在的行為」，不是「描述正確的行為」——所以這一條
  // 刻意把一個**確認過的 bug** 也釘住。理由：如果不釘，PR2 抽純函式或 PR3 換表示法時，
  // 這個行為可能被「順手修掉」或「變成另一種錯法」，而兩者在 diff 上都看不出來。釘住之後，
  // 行為一旦改變這條就會紅，強迫那個 PR 明講「我改了這件事」。
  //
  // bug 本身：placePlayerOnCourt 的一般球員分支在算「目標格現在有沒有人」之前，會先把所有
  // 自由球員的站位過濾掉（見 useRotationTable.ts 的 currentPositions）。所以當 L 正站在某格
  // 時，那格在 zoneMap 裡看起來是「空的」——一般球員拖過去不會觸發任何互換/擠位，L 也不會
  // 被移開，兩個人就同時被寫進同一個座標，畫面上兩顆圈疊在一起。
  //
  // 這跟 issue #14「場上出現兩個自由球員」是同一族的病：自由球員的身分散在
  // startingLiberoId / liberoReplacement / positions 三個地方，任何一段程式碼只看其中一兩個
  // 就會做出跟其他段不一致的判斷。#231 PR3 把 liberoReplacement 收斂成 liberoZone 之後，
  // 「那格有沒有人」才會只有一個答案。
  it("目前會讓兩個人疊在同一個號位（PR3 應該讓這條變成 1，屆時請一併更新這個斷言）", () => {
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
    rt().placePlayerOnCourt(A, "l1", 1); // l1 頂替 p1，站上 1 號位

    rt().placePlayerOnCourt(A, "p7", 1); // 板凳的 p7 也被拖到 1 號位

    const zone1 = getZoneCoords(1);
    const atZone1 = rt().dataByMatch[A].rotations[0].positions.filter(
      (p) => p.x === zone1.x && p.y === zone1.y,
    );
    expect(atZone1.map((p) => p.playerId).sort()).toEqual(["l1", "p7"]); // ← 現況：疊了兩個人
  });
});

describe("setRoster 幽靈站位清理（#231 清單 6 / issue #35）", () => {
  it("被移出名單的一般球員，若還卡在 positions 裡會被掃掉", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "p2", 2);

    rt().setRoster(A, [player("p1")]); // p2 被移出名單

    const rot0 = rt().dataByMatch[A].rotations[0];
    expect(rot0.positions.map((p) => p.playerId)).toEqual(["p1"]);
  });

  it("被移出名單的球員若卡在 liberoReplacement 裡（不管是 L 本人還是被替換者），一併清掉", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().placePlayerOnCourt(A, "l1", 1); // l1 頂替 p1，liberoReplacement 記著 p1

    rt().setRoster(A, [player("l1", "L")]); // p1 被移出名單（雖然人已經不在 positions 上，但還卡在 liberoReplacement 裡）

    expect(rt().dataByMatch[A].rotations[0].liberoReplacement).toBeNull();
  });
});

describe("setRoster 的 stable reference 優化（#231 清單 7，最重要的一條）", () => {
  // 這段程式碼的長註解說得很白：「沒清到任何東西時，必須回傳原本那個 rotations 陣列參照」，
  // 而不是每次都重新 .map() 出一份「內容相等但參照不同」的新陣列。
  //
  // 為什麼這不是效能微調而是正確性問題：TacticsBoard 進頁的 effect 會用 match.players 呼叫
  // setRoster，而 match 每次 render 都是新物件，所以 setRoster 會被反覆呼叫。如果每次呼叫都
  // 換掉 rotations 的參照，訂閱 rotations 的元件就會判定「這個 slice 變了」而重繪，重繪又觸發
  // 那個 effect 再呼叫一次 setRoster——形成無限迴圈，React 會丟出
  // "Maximum update depth exceeded"（issue #69→#70 就是踩過這個雷）。
  //
  // 所以這裡刻意用 toBe（身分比較：兩個變數是不是指向記憶體裡同一個物件）而不是 toEqual
  // （內容比較：兩個物件長得一不一樣）。toEqual 沒辦法測出這個 bug——就算每次都重新 .map()
  // 出一份新陣列，只要內容一樣，toEqual 照樣會過；能測出「有沒有換參照」的只有 toBe。
  // 這正是本節唯一在乎「內部實作細節」（而不是純行為）的例外：因為這裡的「參照穩不穩定」
  // 本身就是外部可觀察的行為（會不會觸發無限重繪），不是藏在黑盒子裡的實作細節。

  it("沒有任何球員被清掉時，setRoster 後的 rotations 要是原本那個陣列參照（toBe）", () => {
    const roster = [player("p1"), player("p2")];
    rt().setRoster(A, roster);
    rt().placePlayerOnCourt(A, "p1", 1);
    const before = rt().dataByMatch[A].rotations;

    // 用同樣的球員名單（沒有刪任何人）再呼叫一次 setRoster——模擬 effect 被反覆觸發的情境。
    rt().setRoster(A, [player("p1"), player("p2")]);

    expect(rt().dataByMatch[A].rotations).toBe(before);
  });

  it("真的刪掉一個在場上的球員時，rotations 參照要換掉（跟上面那條剛好相反）", () => {
    const roster = [player("p1"), player("p2")];
    rt().setRoster(A, roster);
    rt().placePlayerOnCourt(A, "p1", 1);
    const before = rt().dataByMatch[A].rotations;

    rt().setRoster(A, [player("p2")]); // p1 真的被刪了

    expect(rt().dataByMatch[A].rotations).not.toBe(before);
  });
});

describe("removePlayerFromCourt — 一般球員 vs 自由球員（#231 清單 8）", () => {
  it("一般球員：從全部 6 個輪次移除", () => {
    rt().setRoster(A, [player("p1")]);
    rt().placePlayerOnCourt(A, "p1", 1); // 會連動寫入全部 6 輪（六輪傳播公式）

    rt().removePlayerFromCourt(A, "p1");

    const rotations = rt().dataByMatch[A].rotations;
    for (const rot of rotations) {
      expect(rot.positions.map((p) => p.playerId)).not.toContain("p1");
    }
  });

  it("自由球員：只從目前輪次移除，其他輪次的 L 站位不受影響", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().placePlayerOnCourt(A, "p1", 1);
    rt().setCurrentRotation(A, 0);
    rt().placePlayerOnCourt(A, "l1", 1); // 只寫進輪次 0

    rt().setCurrentRotation(A, 1);
    rt().placePlayerOnCourt(A, "l1", 5); // 輪次 1 另外單獨排一個 L 站位（L 不跟著輪轉，各輪獨立記錄）

    rt().setCurrentRotation(A, 0);
    rt().removePlayerFromCourt(A, "l1"); // 目前輪次是 0，只該清輪次 0

    const rotations = rt().dataByMatch[A].rotations;
    expect(rotations[0].positions.map((p) => p.playerId)).not.toContain("l1");
    expect(rotations[1].positions.map((p) => p.playerId)).toContain("l1"); // 輪次 1 沒被動到
  });
});

describe("setLineupFromSnapshot（#231 清單 9）", () => {
  it("把 LineupSnapshot 展開成全部 6 輪座標，liberoReplacement 一律清 null", () => {
    const lineup: LineupSnapshot = { 1: "p1", 2: "p2" };
    // 先手動塞一個 liberoReplacement，確認 setLineupFromSnapshot 真的會把它清掉，
    // 而不是「本來就是 null，測不出有沒有清」。
    useRotationTable.setState((state) => ({
      dataByMatch: {
        ...state.dataByMatch,
        [A]: {
          roster: [],
          currentRotation: 0,
          startingLiberoId: null,
          rotations: Array(6)
            .fill(null)
            .map(() => ({
              positions: [],
              liberoReplacement: {
                liberoId: "leftover-l",
                replacedPosition: { playerId: "leftover-p", x: 0, y: 0 },
              },
            })),
        },
      },
    }));

    rt().setLineupFromSnapshot(A, lineup);

    const rotations = rt().dataByMatch[A].rotations;
    expect(rotations[0].positions).toEqual(
      expect.arrayContaining([
        { playerId: "p1", ...getZoneCoords(1) },
        { playerId: "p2", ...getZoneCoords(2) },
      ]),
    );
    // 輪次 1：起始站 1 號位的人（p1）轉一輪後落在 6 號位，跟六輪傳播公式的算法一致。
    expect(rotations[1].positions).toEqual(
      expect.arrayContaining([{ playerId: "p1", ...getZoneCoords(6) }]),
    );
    for (const rot of rotations) {
      expect(rot.liberoReplacement).toBeNull();
    }
  });
});

describe("resetCurrentRotationPositions（#231 清單 10）", () => {
  it("只清目前輪次的站位，其他輪次不受影響", () => {
    rt().setRoster(A, [player("p1")]);
    rt().placePlayerOnCourt(A, "p1", 1); // 六輪傳播：全部 6 輪都會有站位

    rt().setCurrentRotation(A, 2);
    rt().resetCurrentRotationPositions(A);

    const rotations = rt().dataByMatch[A].rotations;
    expect(rotations[2].positions).toEqual([]);
    expect(rotations[2].liberoReplacement).toBeNull();
    // 輪次 0（跟其他沒被重置的輪次）站位還在，不會被連坐清空。
    expect(rotations[0].positions).not.toEqual([]);
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
    expect(rt().dataByMatch[A].rotations[0].positions.map((p) => p.playerId)).toEqual(["p1"]);
    expect(rt().dataByMatch[B].rotations[0].positions.map((p) => p.playerId)).toEqual(["p9"]);
  });
});
