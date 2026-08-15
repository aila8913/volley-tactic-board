import { describe, it, expect, beforeEach } from "vitest";
import { useRotationTable } from "./useRotationTable";
import { getZoneCoords, BACK_ROW_ZONES, deriveRotation } from "../lib/rotationLogic";
import type { MatchPlayer } from "../types/match";
import type { LineupZones } from "../types/scoresheet";

// ── 這份是什麼、為什麼長這樣（issue #231 PR1 建立、PR3 改寫、#328 收尾大幅減肥）───────
//
// `useRotationTable.ts`（輪轉表 store）放著整個 app 最容易寫錯的領域邏輯。這份是它的
// characterization test（特徵化測試）：釘住「使用者觀察得到的行為」，好在重構時分辨
// 「不小心改了行為」跟「原本就這樣」。
//
// **它現在只測 store 自己的職責**：名單變動時的清理與參照穩定性、先發與 L 指派的寫入規則、
// 各場分片互不污染。至於「誰站哪一格、轉幾輪之後在哪」那類純運算，家在 lib/rotationLogic
// 及其測試——store 只是把結果存起來。這條界線是 #328 收尾時才劃乾淨的：在那之前，同一批
// 純函式行為在兩個檔案各測一次，因為 store 有一支 placePlayerOnCourt 也做同樣的事
// （那支已刪，理由見 store 檔尾）。
//
// 讀法上唯一要知道的是 PR3 換過**內部儲存形狀**（六輪座標陣列 → 一份 LineupZones ＋
// 「L 頂替誰」），所以要看「這一輪誰站哪」不能直接撈欄位，得走下面的 rotationOf() 現算——
// 跟畫面用的是同一條推導路徑。

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

// store 是 module 級單例，每個 it() 之間會共用同一份記憶體，不重設的話上一個測試排的先發
// 會滲進下一個測試。這裡直接把 dataByMatch 設成空物件——好幾個測試要驗證「per-match 分片
// 互不污染」（見最後一個 describe），一次清掉所有 matchId 的分片最省事，也最不容易漏掉某個
// 測試裡用到的 matchId。（store 沒有提供「清掉某一場」的 action：唯一一支 resetAll 沒有任何
// 生產呼叫端，#328 收尾時刪了。）
beforeEach(() => {
  useRotationTable.setState({ dataByMatch: {}, circleLabel: "name" });
});

// ── #328 收尾：這裡刪掉了六個 describe（約 270 行）───────────────────────────────
// 它們全都以 placePlayerOnCourt / removePlayerFromCourt 當動作或當前置，而那兩支已隨
// 中央球場的輪轉畫法一起刪除（見 store 檔尾的說明）。刪之前逐條確認過覆蓋去哪了：
//
//   交換 vs 擠位、六輪傳播公式、L 頂替/還原/前排規則
//     → 這些其實都是**純函式**的行為，lib/rotationLogic.test.ts 已經各有一組直接測它們的
//       案例（assignPlayerToZone / lineupToPositions / deriveRotation）。store 這邊那幾條是
//       「透過一支 action 再測一次同一件事」，動作沒了，覆蓋沒少。
//   「排 L 時同步 startingLiberoId」「一般球員擠掉被頂替者 → 頂替不成立」
//     → 同樣的行為在下面 setLiberoAssignment / setLineupZones 兩個 describe 裡都有對應條目。
//
// 只有一條是**真的消失了**：「L 拖到前排號位被拒絕」。那道把關寫在 placePlayerOnCourt 的
// L 分支裡，而它把關的手勢（把 L 拖到球場某一格站著）現在沒有任何 UI 產生得出來。右欄第七
// 格的語意是「指定 L 頂替誰」，頂替一個站前排的人是合法計畫（#326：那一輪 L 不上場，由
// deriveRotation 推導），所以沒有東西需要接手這條規則——見 setLiberoAssignment 那一節。

describe("setRoster 幽靈站位清理（#231 清單 6 / issue #35）", () => {
  it("被移出名單的一般球員，若還卡在先發裡會被掃掉", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);
    rt().setLineupZones(A, { 1: "p1", 2: "p2" });

    rt().setRoster(A, [player("p1")]); // p2 被移出名單

    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1"]);
  });

  it("被 L 蓋住的人若被移出名單，替補紀錄跟著消失（不會留下指向不存在球員的殘留）", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().setLineupZones(A, { 1: "p1" });
    rt().setLiberoAssignment(A, "l1", "p1"); // l1 蓋住 p1

    rt().setRoster(A, [player("l1", "L")]); // p1 被移出名單

    // 舊模型要特地去檢查 liberoReplacement 裡有沒有卡到已刪除的球員；新模型只要 p1 從
    // 先發被掃掉，「被蓋住的人」現算的結果自然就是 null，沒有第二個地方需要同步。
    expect(rotationOf(A, 0).liberoReplacement).toBeNull();
  });

  it("先發 L 被移出名單時，他的頂替關係也一併撤掉", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().setLineupZones(A, { 1: "p1" });
    rt().setLiberoAssignment(A, "l1", "p1");

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
    rt().setLineupZones(A, { 1: "p1" });
    rt().setLiberoAssignment(A, "l1", "p1");

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
    rt().setLineupZones(A, { 1: "p1" });
    const before = rt().dataByMatch[A].lineup;

    // 用同樣的球員名單（沒有刪任何人）再呼叫一次 setRoster——模擬 effect 被反覆觸發的情境。
    rt().setRoster(A, [player("p1"), player("p2")]);

    expect(rt().dataByMatch[A].lineup).toBe(before);
  });

  it("真的刪掉一個在場上的球員時，先發參照要換掉（跟上面那條剛好相反）", () => {
    const roster = [player("p1"), player("p2")];
    rt().setRoster(A, roster);
    rt().setLineupZones(A, { 1: "p1" });
    const before = rt().dataByMatch[A].lineup;

    rt().setRoster(A, [player("p2")]); // p1 真的被刪了

    expect(rt().dataByMatch[A].lineup).not.toBe(before);
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
    // 這裡沒有「前排就擋掉」那道把關，不是漏擋：本 action 的手勢是「指定 L 要頂誰」
    // （等他轉到後排再上）。舊的 placePlayerOnCourt 確實會擋前排，因為它的手勢是「把 L
    // 放到這一格站著」、而前排站位在規則上不存在；那支已隨 #328 刪除，所以現在整個 store
    // 只剩這一種語意。
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
    rt().setLineupZones(A, { 1: "p1" });
    rt().setLiberoAssignment(A, "l1", "p1"); // 頂替 p1

    rt().setCurrentRotation(A, 2);
    rt().resetPositions(A);

    for (let r = 0; r < 6; r++) {
      expect(rotationOf(A, r).positions).toEqual([]);
      expect(rotationOf(A, r).liberoReplacement).toBeNull();
    }
    // 名單跟目前輪次不受影響——這顆按鈕清的是先發，不是整場重來。（以前 store 有一支
    // resetAll「整場歸零」，但從來沒有 UI 呼叫過它，#328 收尾時一併刪掉。）
    expect(rt().dataByMatch[A].roster).toHaveLength(2);
    expect(rt().dataByMatch[A].currentRotation).toBe(2);
  });
});

describe("per-match 分片互不污染（#231 清單 11 / issue #119）", () => {
  it("在 match A 排站位，match B 的分片完全不受影響（甚至不存在）", () => {
    rt().setRoster(A, [player("p1")]);
    rt().setLineupZones(A, { 1: "p1" });

    expect(rt().dataByMatch[B]).toBeUndefined(); // 還沒碰過 B，分片根本沒被建立

    rt().setRoster(B, [player("p9")]);
    rt().setLineupZones(B, { 6: "p9" });

    // 兩場的站位各自獨立：B 的操作不會讓 A 的球員跑出來，A 的操作也不會混進 B。
    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1"]);
    expect(rotationOf(B, 0).positions.map((p) => p.playerId)).toEqual(["p9"]);
  });
});
