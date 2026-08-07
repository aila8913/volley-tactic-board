import { describe, it, expect } from "vitest";
import {
  sideToApi,
  apiToSide,
  pointRecordToRally,
  pointRecordToEvent,
  eventToMeta,
  reconstructSetFromRallies,
  isSetComplete,
  regularSubToApi,
  reconstructRegularSubs,
  countRegularSubs,
  timeoutToApi,
  reconstructTimeouts,
  reconstructRecording,
  disabledActions,
  resolveScoringSide,
  lineupSnapshotToApi,
  apiLineupToSnapshot,
} from "./scoreSheetMapping";
import type { PointRecord, RegularSub, LineupSnapshot } from "../types/scoresheet";
import type { MatchEvent } from "@workspace/api-client-react";
import {
  makeSet,
  makeRally,
  makeEvent,
  makeSubstitution,
  makeTimeout,
  makeLineup,
} from "./__fixtures__/scoreSheet";

// 純函式，最適合單元測試。重點是 us/opponent↔home/away 的翻譯，以及最容易出錯的
// 「從 rally 序列 replay 回比分/發球方/輪轉」——輪轉規則（只有 side-out 才轉）很細，
// 用測試釘住比較安心。
//
// 各測試造假資料用的 makeSet/makeRally/… 是共用的 fixture builder
// （見 __fixtures__/scoreSheet.ts），每個型別只在那一個檔案裡描述一次「最普通的一筆長怎樣」，
// 這裡呼叫時只覆寫自己在意的欄位。

describe("side mapping", () => {
  it("maps us↔home and opponent↔away both ways", () => {
    expect(sideToApi("us")).toBe("home");
    expect(sideToApi("opponent")).toBe("away");
    expect(apiToSide("home")).toBe("us");
    expect(apiToSide("away")).toBe("opponent");
  });
});

describe("isSetComplete", () => {
  it("needs 25 with a 2-point lead in a normal set", () => {
    expect(isSetComplete(1, 0, 0)).toBe(false);
    expect(isSetComplete(1, 25, 24)).toBe(false); // 到 25 但只領先 1，deuce
    expect(isSetComplete(1, 25, 23)).toBe(true);
    expect(isSetComplete(1, 24, 22)).toBe(false); // 領先 2 但還沒到 25
    expect(isSetComplete(1, 27, 25)).toBe(true); // deuce 後淨勝 2
  });

  it("only needs 15 in the deciding 5th set", () => {
    expect(isSetComplete(5, 15, 13)).toBe(true);
    expect(isSetComplete(5, 15, 14)).toBe(false); // 領先 1，要 deuce
    expect(isSetComplete(5, 14, 12)).toBe(false); // 領先 2 但還沒到 15
    expect(isSetComplete(4, 15, 13)).toBe(false); // 第 4 局仍是 25 分制
  });
});

describe("disabledActions (issue #50 規則#1：發球/接發互斥)", () => {
  it("disables nothing before the first server is chosen", () => {
    expect(disabledActions(null, "us")).toEqual([]);
    expect(disabledActions(null, "opponent")).toEqual([]);
  });

  it("greys 接發 for whichever side is serving", () => {
    // 我方發球：我方球員是發球方 → 不會「接發」；對手是接發方 → 不會「發球」。
    expect(disabledActions("us", "us")).toEqual(["receive"]);
    expect(disabledActions("us", "opponent")).toEqual(["serve"]);
  });

  it("flips when the opponent is serving", () => {
    // 對方發球：對手是發球方 → 不會「接發」；我方是接發方 → 不會「發球」。
    expect(disabledActions("opponent", "opponent")).toEqual(["receive"]);
    expect(disabledActions("opponent", "us")).toEqual(["serve"]);
  });

  it("only ever greys serve or receive, never the other four actions", () => {
    // 不管誰發球、誰動作，被反灰的永遠只有 serve 或 receive 這一對，且恰好一顆。
    // 舉球/攻擊/攔網/防守在一分裡兩邊都可能做、都可能是決定球，一律保留（見 #50：C8
    // 得分分支依 Data Volley 慣例站不住，防守/舉球得分各記自己、不轉攻擊）。
    const combos: Array<["us" | "opponent", "us" | "opponent"]> = [
      ["us", "us"],
      ["us", "opponent"],
      ["opponent", "us"],
      ["opponent", "opponent"],
    ];
    for (const [serving, actor] of combos) {
      const disabled = disabledActions(serving, actor);
      expect(disabled).toHaveLength(1);
      expect(["serve", "receive"]).toContain(disabled[0]);
      for (const kept of ["set", "attack", "block", "dig"]) expect(disabled).not.toContain(kept);
    }
  });
});

describe("resolveScoringSide (issue #226：得分／失分 → 誰拿到這一分，原本寫在 ScoreSheet.tsx 事件處理器裡沒測試)", () => {
  it("動作方得分，這一分就是動作方的", () => {
    expect(resolveScoringSide("us", "win")).toBe("us");
    expect(resolveScoringSide("opponent", "win")).toBe("opponent");
  });

  it("動作方失分，這一分算給對面那一方", () => {
    expect(resolveScoringSide("us", "lose")).toBe("opponent");
    expect(resolveScoringSide("opponent", "lose")).toBe("us");
  });
});

describe("pointRecordToRally", () => {
  it("carries the score-before and maps the winner side", () => {
    const point: PointRecord = { side: "us", wasSideOut: true };
    expect(pointRecordToRally(point, 5, 4, 3, 2, 1)).toEqual({
      rallyNumber: 5,
      homeScore: 4,
      awayScore: 3,
      homeRotation: 2,
      awayRotation: 1,
      winner: "home",
    });
  });
});

describe("pointRecordToEvent", () => {
  it("returns null when there is no action (e.g. 沒看到)", () => {
    expect(pointRecordToEvent({ side: "us", wasSideOut: false }, 1)).toBeNull();
  });

  it("returns null when action exists but no touchedBy", () => {
    expect(pointRecordToEvent({ side: "us", wasSideOut: false, action: "attack" }, 1)).toBeNull();
  });

  it("maps our player's touch, stringified id → int", () => {
    const point: PointRecord = {
      side: "us",
      wasSideOut: false,
      action: "attack",
      touchedBy: { side: "us", playerId: "12", zone: 4 },
    };
    expect(pointRecordToEvent(point, 1)).toEqual({
      sequence: 1,
      side: "home",
      playerId: "12",
      action: "attack",
      source: "live",
    });
  });

  it("maps 對手(全體) touch to away with null playerId", () => {
    const point: PointRecord = {
      side: "opponent",
      wasSideOut: true,
      action: "serve",
      touchedBy: { side: "opponent" }, // 對手沒有名單 → playerId undefined
    };
    expect(pointRecordToEvent(point, 1)).toEqual({
      sequence: 1,
      side: "away",
      playerId: null,
      action: "serve",
      source: "live",
    });
  });
});

describe("eventToMeta", () => {
  it("maps our player's event back to touchedBy (int id → string)", () => {
    expect(
      eventToMeta(makeEvent({ rallyId: "1", side: "home", playerId: "12", action: "attack" })),
    ).toEqual({ action: "attack", touchedBy: { side: "us", playerId: "12" } });
  });

  it("maps an opponent-side event with null player to undefined playerId", () => {
    expect(
      eventToMeta(makeEvent({ rallyId: "1", side: "away", playerId: null, action: "serve" })),
    ).toEqual({ action: "serve", touchedBy: { side: "opponent", playerId: undefined } });
  });

  it("round-trips with pointRecordToEvent for our player", () => {
    const point: PointRecord = {
      side: "us",
      wasSideOut: false,
      action: "block",
      touchedBy: { side: "us", playerId: "7" },
    };
    const ev = pointRecordToEvent(point, 1)!;
    const meta = eventToMeta(makeEvent({ ...ev, rallyId: "1" }));
    expect(meta.action).toBe("block");
    expect(meta.touchedBy).toEqual({ side: "us", playerId: "7" });
  });
});

describe("reconstructSetFromRallies", () => {
  // sets.id / rallies.id / rallies.setId 都是 client-mintable uuid（#64 PR1），後端 DTO
  // 型別已經是 string——這裡沿用「數字字面量當假 uuid」的簡便寫法（跟 volleyballRules.test.ts
  // 的 parity 測試同一套慣例），只是包一層字串，數值本身完全不影響任何斷言。
  const set = makeSet({ id: "9", setNumber: 1, firstServer: "home" });
  // 這個區塊的測試只在乎 rallyNumber/winner/id，其他欄位（比分/輪轉）重建時不看 rally 存的
  // before-score，靠 replay 自己算——這裡是薄薄一層 wrapper，委派給共用的 makeRally。
  const rally = (rallyNumber: number, winner: "home" | "away", id: string = String(rallyNumber)) =>
    makeRally({ id, setId: "9", rallyNumber, winner });

  it("with no rallies, serving stays the first server and everything is zero", () => {
    const state = reconstructSetFromRallies(set, []);
    expect(state).toEqual({
      setNumber: 1,
      ourScore: 0,
      opponentScore: 0,
      serving: "us", // firstServer = home = us
      ourRotation: 0,
      opponentRotation: 0,
      history: [],
      serverId: "9",
    });
  });

  it("server holding serve scores without rotating", () => {
    // 我方先發，連得兩分：都不是 side-out，不輪轉。
    const state = reconstructSetFromRallies(set, [rally(1, "home"), rally(2, "home")]);
    expect(state.ourScore).toBe(2);
    expect(state.opponentScore).toBe(0);
    expect(state.serving).toBe("us");
    expect(state.ourRotation).toBe(0);
    expect(state.opponentRotation).toBe(0);
    expect(state.history.map((h) => h.wasSideOut)).toEqual([false, false]);
  });

  it("a side-out rotates only the side that won it, and flips serve", () => {
    // 我方先發，第 1 分對方贏（side-out）→ 對方奪回發球權、對方輪轉一格；我方不動。
    const state = reconstructSetFromRallies(set, [rally(1, "away")]);
    expect(state.ourScore).toBe(0);
    expect(state.opponentScore).toBe(1);
    expect(state.serving).toBe("opponent");
    expect(state.ourRotation).toBe(0);
    expect(state.opponentRotation).toBe(1);
    expect(state.history[0].wasSideOut).toBe(true);
    expect(state.history[0].serverId).toBe("1");
  });

  it("replays an alternating exchange, tracking both rotations independently", () => {
    // home 先發：away 贏(side-out, away轉1) → home 贏(side-out, home轉1) → home 續分(不轉)
    //          → away 贏(side-out, away轉2)
    const state = reconstructSetFromRallies(set, [
      rally(1, "away"),
      rally(2, "home"),
      rally(3, "home"),
      rally(4, "away"),
    ]);
    expect(state.ourScore).toBe(2);
    expect(state.opponentScore).toBe(2);
    expect(state.serving).toBe("opponent");
    expect(state.ourRotation).toBe(1);
    expect(state.opponentRotation).toBe(2);
  });

  it("sorts by rallyNumber before replaying (order-independent input)", () => {
    const shuffled = [rally(2, "home"), rally(1, "away")];
    const state = reconstructSetFromRallies(set, shuffled);
    // 正確順序應為 away 然後 home：away side-out 得 1，home side-out 奪回，比分 1:1，發球回我方
    expect(state.ourScore).toBe(1);
    expect(state.opponentScore).toBe(1);
    expect(state.serving).toBe("us");
  });

  it("attaches action/touchedBy from events when the map is provided (3b-ii)", () => {
    const rallies = [rally(1, "home", "100"), rally(2, "away", "200")];
    const eventsByRallyId = new Map<string, MatchEvent[]>([
      ["100", [makeEvent({ rallyId: "100", side: "home", playerId: "12", action: "attack" })]],
      ["200", [makeEvent({ rallyId: "200", side: "away", playerId: null, action: "serve" })]],
    ]);
    const state = reconstructSetFromRallies(set, rallies, eventsByRallyId);
    expect(state.history[0]).toMatchObject({
      side: "us",
      serverId: "100",
      action: "attack",
      touchedBy: { side: "us", playerId: "12" },
    });
    expect(state.history[1]).toMatchObject({
      side: "opponent",
      serverId: "200",
      action: "serve",
      touchedBy: { side: "opponent", playerId: undefined },
    });
  });

  it("leaves a rally with no event as a 沒看到 point (no action/touchedBy)", () => {
    const rallies = [rally(1, "home", "100"), rally(2, "home", "200")];
    // 只有 rally 100 有 event；rally 200 是「沒看到」，map 裡沒有它。
    const eventsByRallyId = new Map<string, MatchEvent[]>([
      ["100", [makeEvent({ rallyId: "100", side: "home", playerId: "5", action: "dig" })]],
    ]);
    const state = reconstructSetFromRallies(set, rallies, eventsByRallyId);
    expect(state.history[0].action).toBe("dig");
    expect(state.history[1].action).toBeUndefined();
    expect(state.history[1].touchedBy).toBeUndefined();
  });

  it("picks the first event (lowest sequence) when a rally has several", () => {
    const rallies = [rally(1, "home", "100")];
    const eventsByRallyId = new Map<string, MatchEvent[]>([
      [
        "100",
        [
          makeEvent({
            rallyId: "100",
            sequence: 1,
            side: "home",
            playerId: "3",
            action: "receive",
          }),
          makeEvent({ rallyId: "100", sequence: 2, side: "home", playerId: "9", action: "attack" }),
        ],
      ],
    ]);
    const state = reconstructSetFromRallies(set, rallies, eventsByRallyId);
    expect(state.history[0]).toMatchObject({ action: "receive", touchedBy: { playerId: "3" } });
  });
});

describe("regularSubToApi", () => {
  it("stringifies player ids to ints and tags kind='regular'", () => {
    const sub: RegularSub = { outPlayerId: "7", inPlayerId: "12" };
    expect(regularSubToApi(sub, 10, 8)).toEqual({
      homeScore: 10,
      awayScore: 8,
      playerInId: "12",
      playerOutId: "7",
      kind: "regular",
    });
  });
});

describe("reconstructRecording", () => {
  it("returns an empty record when the match has no sets yet", () => {
    const state = reconstructRecording([], [], [], []);
    expect(state).toEqual({
      currentSet: {
        setNumber: 1,
        ourScore: 0,
        opponentScore: 0,
        serving: null,
        ourRotation: 0,
        opponentRotation: 0,
        history: [],
      },
      completedSets: [],
      lineup: null,
      liberoSubstitution: null,
      regularSubs: [],
      subCount: 0,
      subCountsHistory: [],
      timeouts: [],
      timeoutCountsHistory: [],
    });
  });

  it("treats the last set (highest setNumber) as in-progress, earlier ones as completed", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: "away" });
    // 第 1 局：home 先發，home 連得 2 分 → 2:0 已結束。
    const set1Rallies = [
      makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" }),
      makeRally({ id: "101", setId: "1", rallyNumber: 2, winner: "home" }),
    ];
    // 第 2 局：away 先發，home 得 1 分（side-out）→ 1:0 進行中。
    const set2Rallies = [makeRally({ id: "200", setId: "2", rallyNumber: 1, winner: "home" })];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], [], []);

    // lineup: null——這個測試沒有傳 lineups 參數（第 5 個參數留空預設 []），沒有任何
    // 先發資料可以回填，見 findLineupSnapshotForSet 找不到 setId 對應 row 時回傳 null。
    expect(state.completedSets).toEqual([
      { setNumber: 1, ourScore: 2, opponentScore: 0, history: expect.any(Array), lineup: null },
    ]);
    expect(state.currentSet.setNumber).toBe(2);
    expect(state.currentSet.ourScore).toBe(1);
    expect(state.currentSet.opponentScore).toBe(0);
    expect(state.currentSet.serverId).toBe("2");
  });

  // #218：同一批資料，只因為 isFinished 不同就該切出不同結果。這是整個 issue 的核心
  // ——以前打完的最後一局永遠被當成進行中丟掉，局比數就會少算一局。
  it("counts every set as completed when the match is finished (isFinished = true)", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: "away" });
    // 第 1 局 2:0、第 2 局 1:0，兩局都是我方拿下——三戰兩勝的話這場就是 2:0 結束了。
    const set1Rallies = [
      makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" }),
      makeRally({ id: "101", setId: "1", rallyNumber: 2, winner: "home" }),
    ];
    const set2Rallies = [makeRally({ id: "200", setId: "2", rallyNumber: 1, winner: "home" })];

    const state = reconstructRecording(
      [set1, set2],
      [set1Rallies, set2Rallies],
      [],
      [],
      [],
      [],
      true,
    );

    // 兩局都在 completedSets 裡——第 2 局不再被當成「進行中那局」而消失。
    expect(state.completedSets.map((s) => s.setNumber)).toEqual([1, 2]);
    expect(state.completedSets[1]).toMatchObject({ ourScore: 1, opponentScore: 0 });
    // currentSet 是一個空佔位（局號往前走），serving 為 null 讓畫面上的各局比分表不會
    // 把它多列一行——見 reconstructRecording 裡那段說明。
    expect(state.currentSet.setNumber).toBe(3);
    expect(state.currentSet.serving).toBeNull();
    expect(state.currentSet.serverId).toBeUndefined();
    expect(state.lineup).toBeNull();
    expect(state.regularSubs).toEqual([]);
    expect(state.subCount).toBe(0);
    expect(state.timeouts).toEqual([]);
  });

  // #218：按了「下一局」（會先建一筆 firstServer=null 的空 set）之後才想起比賽已經結束、
  // 直接按「結束比賽」——那筆從沒開球的尾巴局不該被算成一局 0:0。
  it("drops trailing never-started sets when the match is finished", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: "home" });
    // 第 3 局：按了「下一局」但還沒選先發方（firstServer=null、沒有任何 rally）。
    const set3 = makeSet({ id: "3", setNumber: 3, firstServer: null });

    const state = reconstructRecording(
      [set1, set2, set3],
      [
        [makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" })],
        [makeRally({ id: "200", setId: "2", rallyNumber: 1, winner: "home" })],
        [],
      ],
      [],
      [],
      [],
      [],
      true,
    );

    // 只有真的打過的兩局算數，那筆空的第 3 局不會變成「0:0 的一局」。
    expect(state.completedSets.map((s) => s.setNumber)).toEqual([1, 2]);
  });

  it("attaches events to the right rallies across multiple sets", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: "home" });
    const set1Rallies = [makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" })];
    const set2Rallies = [makeRally({ id: "200", setId: "2", rallyNumber: 1, winner: "home" })];
    const events: MatchEvent[] = [
      makeEvent({ rallyId: "100", side: "home", playerId: "5", action: "serve" }),
      makeEvent({ rallyId: "200", side: "home", playerId: "9", action: "attack" }),
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], events, []);

    expect(state.completedSets[0].history[0]).toMatchObject({
      action: "serve",
      touchedBy: { playerId: "5" },
    });
    expect(state.currentSet.history[0]).toMatchObject({
      action: "attack",
      touchedBy: { playerId: "9" },
    });
  });

  it("rebuilds subCountsHistory per completed set and regularSubs for the in-progress set", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: "home" });
    const set1Rallies = [makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" })];
    const set2Rallies = [makeRally({ id: "200", setId: "2", rallyNumber: 1, winner: "home" })];
    const subs = [
      makeSubstitution({
        setId: "1",
        playerOutId: "1",
        playerInId: "2",
        homeScore: 0,
        awayScore: 0,
      }),
      makeSubstitution({
        setId: "2",
        playerOutId: "3",
        playerInId: "4",
        homeScore: 1,
        awayScore: 0,
      }),
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], [], subs);

    expect(state.subCountsHistory).toEqual([1]); // 第 1 局（已結束）換了 1 次
    expect(state.regularSubs).toEqual([{ outPlayerId: "3", inPlayerId: "4" }]); // 第 2 局（進行中）
    expect(state.subCount).toBe(1); // 第 2 局（進行中）只有一筆單純換人，原始次數跟淨疊加清單長度一致
  });

  // #63 迴歸測試：按「下一局」後那個「還沒選先發方」的空局，現在會先寫進後端成一筆
  // firstServer=null 的 set row。重建時它是最後一局（進行中），必須還原成「這局由誰先發球？」
  // 的空狀態——而不是退回顯示上一局（那正是 #63 修好前的錯誤行為）。
  it("rebuilds a trailing firstServer=null set as an empty in-progress set (issue #63)", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    // 剛按下一局建出來的空局：firstServer 還沒選，是 null，底下一定沒有任何 rally。
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: null });
    const set1Rallies = [
      makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" }),
      makeRally({ id: "101", setId: "1", rallyNumber: 2, homeScore: 1, winner: "home" }),
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, []], [], []);

    // 第 1 局照常收進 completedSets（2:0）；lineup: null 理由同上一個測試——沒傳 lineups。
    expect(state.completedSets).toEqual([
      { setNumber: 1, ourScore: 2, opponentScore: 0, history: expect.any(Array), lineup: null },
    ]);
    // 第 2 局是進行中，但因為 firstServer=null 而重建成空局：serving=null 觸發「誰先發球？」畫面，
    // 比分/輪轉全 0、沒有任何 history，且已帶著後端 row 的 serverId（選好先發後 PATCH 這個 id）。
    expect(state.currentSet.setNumber).toBe(2);
    expect(state.currentSet.serving).toBeNull();
    expect(state.currentSet.ourScore).toBe(0);
    expect(state.currentSet.opponentScore).toBe(0);
    expect(state.currentSet.history).toEqual([]);
    expect(state.currentSet.serverId).toBe("2");
  });

  // issue #115：reload 後把每一局的先發從後端 lineups 讀回來，計分表才不會又退回去讀
  // （可能被別場/存檔污染的）全域 store。
  it("seeds the current set's lineup from the lineups list", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set1Rallies = [makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" })];
    // 六個號位的球員 id 下面會被斷言，所以照樣明寫出來；只有沒人在乎的 Lineup.id
    // 交給 fixture 預設值——它正是 #64 那次主鍵遷移要逐處手改的欄位。
    const lineups = [
      makeLineup({
        setId: "1",
        zone1PlayerId: "11",
        zone2PlayerId: "12",
        zone3PlayerId: "13",
        zone4PlayerId: "14",
        zone5PlayerId: "15",
        zone6PlayerId: "16",
      }),
    ];

    const state = reconstructRecording([set1], [set1Rallies], [], [], lineups);
    expect(state.lineup).toEqual({ 1: "11", 2: "12", 3: "13", 4: "14", 5: "15", 6: "16" });
  });

  it("does NOT carry a previous set's lineup into a trailing firstServer=null set (per-set lineup)", () => {
    // 先發每局可不同：剛按下一局的空局（set2, firstServer=null）還沒寫自己的 lineup，就給 null
    // ——畫面停在「這局誰先發球」、還不需要顯示球場，等教練選先發方時才擷取這一局的新先發。
    // 不沿用 set1 的先發，才能支援逐局換陣。
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: null });
    const set1Rallies = [makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" })];
    const lineups = [
      makeLineup({
        setId: "1",
        zone1PlayerId: "11",
        zone2PlayerId: "12",
        zone3PlayerId: "13",
        zone4PlayerId: "14",
        zone5PlayerId: "15",
        zone6PlayerId: "16",
      }),
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, []], [], [], lineups);
    expect(state.currentSet.setNumber).toBe(2);
    expect(state.lineup).toBeNull();
  });

  it("reads the in-progress set's own lineup, independent of earlier sets (per-set lineup)", () => {
    // set2 進行中，且有自己的先發（跟 set1 不同人）——要讀回 set2 自己那一份，不是 set1 的。
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set2 = makeSet({ id: "2", setNumber: 2, firstServer: "home" });
    const set1Rallies = [makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" })];
    const set2Rallies = [makeRally({ id: "200", setId: "2", rallyNumber: 1, winner: "home" })];
    const lineups = [
      makeLineup({
        setId: "1",
        zone1PlayerId: "11",
        zone2PlayerId: "12",
        zone3PlayerId: "13",
        zone4PlayerId: "14",
        zone5PlayerId: "15",
        zone6PlayerId: "16",
      }),
      makeLineup({
        setId: "2",
        zone1PlayerId: "21",
        zone2PlayerId: "22",
        zone3PlayerId: "23",
        zone4PlayerId: "24",
        zone5PlayerId: "25",
        zone6PlayerId: "26",
      }),
    ];

    const state = reconstructRecording([set1, set2], [set1Rallies, set2Rallies], [], [], lineups);
    expect(state.lineup).toEqual({ 1: "21", 2: "22", 3: "23", 4: "24", 5: "25", 6: "26" });
  });

  it("leaves lineup null when no lineups are provided", () => {
    const set1 = makeSet({ id: "1", setNumber: 1, firstServer: "home" });
    const set1Rallies = [makeRally({ id: "100", setId: "1", rallyNumber: 1, winner: "home" })];
    const state = reconstructRecording([set1], [set1Rallies], [], []);
    expect(state.lineup).toBeNull();
  });
});

// issue #115：先發快照（號位→字串 id）跟後端 lineups DTO（zone1~6PlayerId 整數）互轉，
// 跟 regularSub 的 Number()/String() 是同一套慣例，round-trip 要對得回來。
describe("lineup snapshot mapping", () => {
  it("round-trips snapshot ↔ api", () => {
    const snapshot: LineupSnapshot = { 1: "11", 2: "12", 3: "13", 4: "14", 5: "15", 6: "16" };
    expect(lineupSnapshotToApi(snapshot)).toEqual({
      zone1PlayerId: "11",
      zone2PlayerId: "12",
      zone3PlayerId: "13",
      zone4PlayerId: "14",
      zone5PlayerId: "15",
      zone6PlayerId: "16",
    });
    const row = makeLineup({
      zone1PlayerId: "11",
      zone2PlayerId: "12",
      zone3PlayerId: "13",
      zone4PlayerId: "14",
      zone5PlayerId: "15",
      zone6PlayerId: "16",
    });
    expect(apiLineupToSnapshot(row)).toEqual(snapshot);
  });
});

describe("reconstructRegularSubs", () => {
  it("keeps two independent subs at different positions", () => {
    // 位置 1 換成 2，位置 4 換成 5，兩筆彼此不相干，都保留。
    const subs = [
      makeSubstitution({ playerOutId: "1", playerInId: "2", homeScore: 3, awayScore: 1 }),
      makeSubstitution({ playerOutId: "4", playerInId: "5", homeScore: 6, awayScore: 2 }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([
      { outPlayerId: "1", inPlayerId: "2" },
      { outPlayerId: "4", inPlayerId: "5" },
    ]);
  });

  it("collapses a chained re-substitution the same way the live store's dedup does", () => {
    // 先 {out:1,in:2}，之後 {out:2,in:3}：後者的 outPlayerId="2" 剛好等於前一筆的
    // inPlayerId，代表 2 本身也是替補上場的——往前追一筆找到這個位置真正的原始先發是
    // 1，摺疊結果是 {out:1, in:3}——跟 useScoreSheet.ts 的 recordRegularSub 是同一套
    // 邏輯（見 volleyballRules.ts 的 applyRegularSub 函式註解，issue #247）。
    const subs = [
      makeSubstitution({ playerOutId: "1", playerInId: "2", homeScore: 3, awayScore: 1 }),
      makeSubstitution({ playerOutId: "2", playerInId: "3", homeScore: 5, awayScore: 2 }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([{ outPlayerId: "1", inPlayerId: "3" }]);
  });

  it("ignores libero rows (issue #43 territory, not regular subs)", () => {
    const subs = [
      makeSubstitution({ playerOutId: "1", playerInId: "2", homeScore: 3, awayScore: 1 }),
      makeSubstitution({
        playerOutId: "6",
        playerInId: null,
        kind: "libero",
        homeScore: 4,
        awayScore: 1,
      }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([{ outPlayerId: "1", inPlayerId: "2" }]);
  });

  it("skips regular rows with a null player id (shouldn't happen, but defends against it)", () => {
    const subs = [
      makeSubstitution({ playerOutId: "1", playerInId: null, homeScore: 3, awayScore: 1 }),
      makeSubstitution({ playerOutId: null, playerInId: "2", homeScore: 4, awayScore: 1 }),
    ];
    expect(reconstructRegularSubs(subs)).toEqual([]);
  });
});

// ── countRegularSubs（issue #289）──
// 「換人次數」跟「淨疊加清單長度」是兩個不同的數字（見 types/scoresheet.ts 的
// ScoreSheetState.subCount 註解）：三種情境（A→B / A→B→C 連鎖 / A→B→A 換回先發）分別驗證
// 摺疊後的清單長度（reconstructRegularSubs）跟原始次數（countRegularSubs）什麼時候會發散。
describe("countRegularSubs", () => {
  it("A→B: one substitution, count is 1 (matches the collapsed list length)", () => {
    const subs = [
      makeSubstitution({ playerOutId: "A", playerInId: "B", homeScore: 0, awayScore: 0 }),
    ];
    expect(countRegularSubs(subs)).toBe(1);
    expect(reconstructRegularSubs(subs)).toHaveLength(1);
  });

  it("A→B→C (chained): count is 2, but the collapsed list only has 1 entry", () => {
    const subs = [
      makeSubstitution({ playerOutId: "A", playerInId: "B", homeScore: 0, awayScore: 0 }),
      makeSubstitution({ playerOutId: "B", playerInId: "C", homeScore: 2, awayScore: 0 }),
    ];
    expect(countRegularSubs(subs)).toBe(2);
    expect(reconstructRegularSubs(subs)).toEqual([{ outPlayerId: "A", inPlayerId: "C" }]); // 摺成 1 筆
  });

  it("A→B→A (subbed back to the original starter): count is 2, but the collapsed list is empty", () => {
    const subs = [
      makeSubstitution({ playerOutId: "A", playerInId: "B", homeScore: 0, awayScore: 0 }),
      makeSubstitution({ playerOutId: "B", playerInId: "A", homeScore: 3, awayScore: 0 }),
    ];
    expect(countRegularSubs(subs)).toBe(2);
    expect(reconstructRegularSubs(subs)).toEqual([]); // 淨疊加摺成 0 筆——這正是 #289 的病灶
  });

  it("shares the same filtering as reconstructRegularSubs: ignores libero rows and null-player rows", () => {
    const subs = [
      makeSubstitution({ playerOutId: "1", playerInId: "2", homeScore: 0, awayScore: 0 }),
      makeSubstitution({
        playerOutId: "6",
        playerInId: null,
        kind: "libero",
        homeScore: 1,
        awayScore: 0,
      }),
      makeSubstitution({ playerOutId: null, playerInId: "3", homeScore: 2, awayScore: 0 }),
    ];
    expect(countRegularSubs(subs)).toBe(1);
  });
});

// ── 暫停（issue #44）──
describe("timeout mapping", () => {
  it("maps side us/opponent → home/away in the API body, carrying the score snapshot", () => {
    expect(timeoutToApi("us", 5, 3)).toEqual({ homeScore: 5, awayScore: 3, side: "home" });
    expect(timeoutToApi("opponent", 8, 10)).toEqual({ homeScore: 8, awayScore: 10, side: "away" });
  });

  it("reconstructs timeouts back to front-end side, preserving order (no dedup)", () => {
    // 這個測試唯一在乎的是 side 跟三筆的先後順序（reconstructTimeouts 不做 dedup、原樣照
    // 順序轉換），所以只覆寫 side；id / setId / 比分 / seq 全部沒被斷言，交給 fixture 預設值
    // ——只留下有意義的欄位，讀的人一眼就知道這個測試在驗什麼。
    const rows = [
      makeTimeout({ side: "home" }),
      makeTimeout({ side: "away" }),
      makeTimeout({ side: "home" }),
    ];
    expect(reconstructTimeouts(rows)).toEqual([
      { side: "us" },
      { side: "opponent" },
      { side: "us" },
    ]);
  });
});
