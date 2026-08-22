import { describe, it, expect, beforeEach } from "vitest";
import { useRotationTable } from "./useRotationTable";
import { getZoneCoords, deriveRotation } from "../lib/rotationLogic";
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

// 「這一輪誰站哪」——store 只存先發，畫面上看到的站位是現算的，所以測試也走同一條推導
// 路徑來觀察。這正是這份測試該有的視角：使用者看得到的是球場上的圈圈，不是 store 裡的欄位
// 長相。省略 rotation 參數時看目前輪次。
//
// deriveRotation 的第三個參數（L 頂替誰）固定給 null，跟賽前這一側的兩個生產呼叫端一致
// （#425：賽前不記頂替對象，所以先發就是六個人）。要驗「L 頂替某人時場上長怎樣」請看
// lib/rotationLogic.test.ts，那裡直接測純函式，不需要繞過 store。
const rotationOf = (matchId: string, rotation?: number) => {
  const m = rt().dataByMatch[matchId];
  const r = rotation ?? m.currentRotation;
  return deriveRotation(m.lineup, m.startingLiberoId, null, r);
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
//     → 同樣的行為在下面 setStartingLibero / setLineupZones 兩個 describe 裡都有對應條目。
//
// 只有一條是**真的消失了**：「L 拖到前排號位被拒絕」。那道把關寫在 placePlayerOnCourt 的
// L 分支裡，而它把關的手勢（把 L 拖到球場某一格站著）現在沒有任何 UI 產生得出來。
//
// ── #425 又拿掉一批 ────────────────────────────────────────────────────────────
// 賽前不再記「L 頂替誰」（決策見 types/rotationTable.ts 的 startingLiberoId），
// liberoReplacesPlayerId 這個欄位整個移除，所以凡是斷言它的條目都跟著消失。剩下的 L 相關
// 測試只問一件事：**誰是先發 L**。

describe("setRoster 幽靈站位清理（#231 清單 6 / issue #35）", () => {
  it("被移出名單的一般球員，若還卡在先發裡會被掃掉", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);
    rt().setLineupZones(A, { 1: "p1", 2: "p2" });

    rt().setRoster(A, [player("p1")]); // p2 被移出名單

    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1"]);
  });

  it("先發 L 被移出名單時，這場就沒有先發 L 了", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().setLineupZones(A, { 1: "p1" });
    rt().setStartingLibero(A, "l1");

    rt().setRoster(A, [player("p1")]); // 名單裡沒有任何 L 了

    expect(rt().dataByMatch[A].startingLiberoId).toBeNull();
    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1"]);
  });

  it("名單裡還有別的 L 時，先發 L 改指向名單裡第一個", () => {
    // 不是清成 null：這場明明還有自由球員，清空等於宣稱「這隊沒有 L」。挑第一個是個
    // 猜測沒錯，但它是可見的（第七格會顯示是誰），教練一眼就能改；清空則是無聲的。
    rt().setRoster(A, [player("l1", "L"), player("l2", "L")]);
    rt().setStartingLibero(A, "l1");

    rt().setRoster(A, [player("l2", "L")]); // l1 被移出名單

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l2");
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
  // 註：這裡以前有一條「⚠️ 行為變更（#327）：被頂替的人還在新先發裡，頂替關係就留著」。
  // 那條規則在 #425 連同 liberoReplacesPlayerId 欄位一起消失——動六個號位現在就只是動六個
  // 號位，沒有第二個欄位需要跟著判斷要不要失效。少一個欄位，就少一種對不起來的可能。
  it("先發直接就是傳進來那一份，不動先發 L", () => {
    const lineup: LineupZones = { 1: "p1", 2: "p2" };
    rt().setLineupZones(A, lineup);

    // ⚠️ 行為變更（表述層面）：以前這個 action 要把號位快照「展開」成六輪座標寫進 state，
    // 現在 store 存的本來就是同一種格式，直接放進去即可——少掉的正是那層翻譯。
    expect(rt().dataByMatch[A].lineup).toEqual(lineup);

    // 使用者看得到的結果沒變：輪次 0 照排，輪次 1 起始站 1 號位的人（p1）落在 6 號位。
    // 先發 L 不受影響（它跟六個號位是兩個獨立的決定）。
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

describe("setStartingLibero — 第七格的寫入口（#327，#425 收斂成單一欄位）", () => {
  const seed = () => {
    rt().setRoster(A, [player("p1"), player("p2"), player("l1", "L"), player("l2", "L")]);
    rt().setLineupZones(A, { 1: "p1", 4: "p2" });
  };

  it("寫定這場的先發 L 是誰", () => {
    seed();
    rt().setStartingLibero(A, "l1");

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");
    // 先發六人一個都沒被動到：L 不佔六個號位，他是換人上場的。
    expect(rt().dataByMatch[A].lineup).toEqual({ 1: "p1", 4: "p2" });
    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1", "p2"]);
  });

  it("傳 null＝這場不派先發 L", () => {
    seed();
    rt().setStartingLibero(A, "l1");
    rt().setStartingLibero(A, null);

    expect(rt().dataByMatch[A].startingLiberoId).toBeNull();
  });

  it("白名單：不是這場名單裡的自由球員就整個忽略", () => {
    // 輸入來自拖曳事件的 dataTransfer（外部字串），所以這道把關不是防呆而是防髒資料：
    // 寫進一個渲染時查不到人的幽靈 id，畫面會安靜地少一個人。
    seed();
    rt().setStartingLibero(A, "l1");

    rt().setStartingLibero(A, "p2"); // p2 是 OH，不是自由球員
    rt().setStartingLibero(A, "ghost"); // 根本不在名單裡

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");
  });

  it("換一位 L 就只是換一位 L", () => {
    seed();
    rt().setStartingLibero(A, "l1");
    rt().setStartingLibero(A, "l2");

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l2");
  });

  // 註：這一節以前還有兩條在講「頂替對象」——「頂替站前排的人是合法計畫」與「頂替對象
  // 不在先發裡就當作沒指定」。#425 之後賽前不記頂替對象，那兩條沒有對象可測了。它們描述
  // 的推導規則（被頂替者在前排 → L 不在場上）仍然成立，只是家搬到了 deriveRotation 自己的
  // 測試（lib/rotationLogic.test.ts），資料來源改成比賽中的 liberoSubstitution。
});

describe("⚠️ 行為變更：resetPositions 清全部輪次（原 resetCurrentRotationPositions 只清一輪）", () => {
  // PR1 這一條釘的是「只清目前輪次，其他輪次不受影響」。新表示法下那件事不再可表示——
  // 先發只有一份、六輪共用，沒有「只有第 3 輪是空的」這種狀態。
  //
  // 這個行為其實舊版也名不副實：清掉第 3 輪之後，只要再拖任何一個人，六輪就會全部從那一輪
  // 重新推算，被清掉的其他輪資料本來就留不住——「只清一輪」是舊表示法多存了五份副本才變得
  // 出來的假象。所以改成誠實地清全部，按鈕的確認文案也一併改過（RotationControlsFooter）。
  it("清掉之後六個輪次都沒有人", () => {
    rt().setRoster(A, [player("p1"), player("l1", "L")]);
    rt().setLineupZones(A, { 1: "p1" });
    rt().setStartingLibero(A, "l1");

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

describe("hydrateLineup — 把後端已凍結的先發補進來（issue #431）", () => {
  // 這支存在的理由是一個具體的 bug：已開賽／打完的比賽在這份 store 裡永遠沒有站位
  //（唯一的寫入點是計分頁「還沒開賽時排先發」的拖曳，而 dataByMatch 不 persist），
  // 所以戰術板六宮格對那些比賽一律六格空白。下面三條釘住的是「補進來」與「不搶方向盤」
  // 這兩件事的邊界。
  it("這一場還沒有先發時，六個號位照著補進來", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);

    rt().hydrateLineup(A, { 1: "p1", 2: "p2" }, null);

    expect(rt().dataByMatch[A].lineup).toEqual({ 1: "p1", 2: "p2" });
    expect(rotationOf(A, 0).positions.map((p) => p.playerId)).toEqual(["p1", "p2"]);
  });

  it("先發 L 也一起補；不做 setStartingLibero 那種名單白名單把關", () => {
    // 名單還沒抓回來（roster 是空的）就先 hydrate——這是真實會發生的順序：lineups 這支
    // query 可能比 match 先回來。setStartingLibero 在這種情況會拒絕寫入（它的輸入來自
    // 拖曳事件，必須確認人真的在名單裡），hydrateLineup 不需要那道關卡：來源是我們自己的
    // 後端，lineups 的欄位有外鍵指著 players。
    rt().hydrateLineup(A, { 1: "p1" }, "l1");

    expect(rt().dataByMatch[A].startingLiberoId).toBe("l1");
  });

  it("這一場已經有先發時整支 no-op——只填空，不覆蓋使用者剛排的東西", () => {
    rt().setRoster(A, [player("p1"), player("p2")]);
    rt().setLineupZones(A, { 1: "p1" });
    const before = rt().dataByMatch[A].lineup;

    rt().hydrateLineup(A, { 1: "p2", 2: "p1", 3: "p1" }, "l9");

    // 內容不變，而且**是同一個物件參照**：這條不只是「沒改到」，它同時保證訂閱 lineup 的
    // 元件不會因為這次呼叫重繪——不然「effect 寫 → 元件重繪 → effect 再寫」就會轉不停。
    expect(rt().dataByMatch[A].lineup).toBe(before);
    expect(rt().dataByMatch[A].startingLiberoId).toBeNull();
  });
});
