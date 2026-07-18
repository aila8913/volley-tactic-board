import { create } from "zustand";
import { useCallback, useEffect, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useListSets,
  useListMatchEvents,
  useListMatchSubstitutions,
  useCreateSet,
  useUpdateSet,
  useCreateRally,
  useCreateEvent,
  useDeleteRally,
  useCreateSubstitution,
  useDeleteSubstitution,
  useListMatchTimeouts,
  useCreateTimeout,
  useDeleteTimeout,
  useListMatchLineups,
  usePutSetLineup,
  listRallies,
  getListRalliesQueryKey,
} from "@workspace/api-client-react";
import { ScoreSheetState, PointRecord, Side, UndoEntry, LineupSnapshot } from "../types/scoresheet";
import {
  sideToApi,
  pointRecordToRally,
  pointRecordToEvent,
  reconstructRecording,
  regularSubToApi,
  timeoutToApi,
  lineupSnapshotToApi,
  makeEmptySet,
  emptyRecord,
} from "../lib/scoreSheetMapping";

// 計分表的狀態層。以前這裡是 Zustand + persist（localStorage）；Phase 3b 把真相來源搬到後端
// sets/rallies/events。做法是「本地優先 + 背景寫入」：
//   - store 仍保留純 reducer（scorePoint/undo/…），每個動作瞬間更新畫面，記分零延遲。
//   - 另外一層 hook（useScoreSheetController）負責兩件事：進頁時從 API 重建 store，以及每個
//     動作在背景把對應的 rally/event POST 到後端。
// 為什麼不像 useMatches 那樣純 React Query？因為記分是課邊快速連點，不能每點一分就卡一次
// 網路來回；rotation/比分也必須在前端即時算好。所以這裡 store 當「即時 optimistic 快取」，
// 後端當「持久層」，兩者靠 controller 橋接。

interface ScoreSheetStore {
  // 用 matchId（字串，跟 URL 參數一致）當 key，每場比賽的記錄分開存。現在改由 API 重建灌入，
  // 不再用 persist 自動存 localStorage。
  recordingsByMatch: Record<string, ScoreSheetState>;
  // 「復原」用的動作快照堆疊，一樣用 matchId 分開存（見 types/scoresheet.ts 的 UndoEntry）。
  // 刻意跟 recordingsByMatch 分開放、不塞進 ScoreSheetState：它是純記憶體、不進後端、也不參與
  // 進頁重建（hydrate 不會碰它），放外面才不會被 reconstructRecording 的形狀約束或誤重建。
  undoStacksByMatch: Record<string, UndoEntry[]>;
  // 進頁重建：把從後端 sets/rallies 重算出來的完整狀態，一次灌進某一場的記錄。
  hydrate: (matchId: string, state: ScoreSheetState) => void;
  startSet: (matchId: string, servingFirst: Side) => void;
  // 記一個使用者動作「之前」先存一份快照，之後 undo 靠它整包還原（見 UndoEntry 註解）。
  // 只在真正會改變狀態的使用者動作前呼叫（記分、一般換人、手動 libero）；自動 libero 回位、
  // 換局清空這類「後果」不呼叫——它們會被下一個使用者動作的快照涵蓋，不該各自變成一個可復原步驟。
  snapshotForUndo: (matchId: string, backendKind: UndoEntry["backendKind"]) => void;
  scorePoint: (
    matchId: string,
    side: Side,
    meta?: Pick<PointRecord, "action" | "touchedBy">,
  ) => void;
  // 復原最近一個動作：pop 堆疊最上面那筆快照、整包還原三個可變欄位（比分/輪轉/發球方、
  // 一般換人清單、libero 替補）。後端要補刪什麼由 controller 依那筆的 backendKind 決定。
  undoLast: (matchId: string) => void;
  nextSet: (matchId: string) => void;
  // 擷取這場比賽的先發快照（issue #115）。開賽（選先發方）那一刻由 controller 的 start() 呼叫，
  // 把當下輪轉表的起始站位凍結進這場的計分記錄，之後球場只讀它、跟全域 store 解耦。
  setLineup: (matchId: string, lineup: LineupSnapshot) => void;
  setLiberoSubstitution: (matchId: string, playerId: string | null) => void;
  // 一般換人（issue #42 Phase B）：跟 setLiberoSubstitution 一樣是純 reducer，瞬間更新畫面；
  // 真正寫進後端由 controller 的 substitute() 在背景做（跟 scorePoint/score() 是同一套分工）。
  recordRegularSub: (matchId: string, outPlayerId: string, inPlayerId: string) => void;
  // 暫停（issue #44）：純 reducer，把一筆暫停 append 進當前這一局；背景寫入由 controller 的
  // callTimeout() 負責（同 recordRegularSub / substitute 的分工）。
  recordTimeout: (matchId: string, side: Side) => void;
}

const getOrInitRecord = (
  byMatch: Record<string, ScoreSheetState>,
  matchId: string,
): ScoreSheetState => byMatch[matchId] ?? emptyRecord();

export const useScoreSheet = create<ScoreSheetStore>()((set) => ({
  recordingsByMatch: {},
  undoStacksByMatch: {},

  hydrate: (matchId, state) =>
    set((s) => ({
      recordingsByMatch: { ...s.recordingsByMatch, [matchId]: state },
    })),

  snapshotForUndo: (matchId, backendKind) =>
    set((state) => {
      const record = state.recordingsByMatch[matchId];
      if (!record) return state;
      // 直接存舊物件的參照當快照（immutable 更新下等於凍結，見 UndoEntry 註解）。
      const entry: UndoEntry = {
        currentSet: record.currentSet,
        regularSubs: record.regularSubs,
        liberoSubstitution: record.liberoSubstitution,
        timeouts: record.timeouts,
        backendKind,
      };
      const stack = state.undoStacksByMatch[matchId] ?? [];
      return {
        undoStacksByMatch: { ...state.undoStacksByMatch, [matchId]: [...stack, entry] },
      };
    }),

  startSet: (matchId, servingFirst) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: { ...record, currentSet: { ...record.currentSet, serving: servingFirst } },
        },
      };
    }),

  scorePoint: (matchId, side, meta) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      const current = record.currentSet;
      if (current.serving === null) return state;

      // 排球輪轉規則：只有原本沒發球的一方贏得這一分（side-out，奪回發球權）才會輪轉；
      // 發球方自己再得分只加分、不輪轉——輪轉永遠發生在「剛拿到發球權」的那一刻。
      // 我方、對手各自獨立輪轉，互不影響。
      const wasSideOut = side !== current.serving;
      const ourRotation =
        wasSideOut && side === "us" ? (current.ourRotation + 1) % 6 : current.ourRotation;
      const opponentRotation =
        wasSideOut && side === "opponent"
          ? (current.opponentRotation + 1) % 6
          : current.opponentRotation;

      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            ...record,
            currentSet: {
              ...current,
              ourScore: side === "us" ? current.ourScore + 1 : current.ourScore,
              opponentScore:
                side === "opponent" ? current.opponentScore + 1 : current.opponentScore,
              serving: side,
              ourRotation,
              opponentRotation,
              history: [...current.history, { side, wasSideOut, ...meta }],
            },
          },
        },
      };
    }),

  undoLast: (matchId) =>
    set((state) => {
      const stack = state.undoStacksByMatch[matchId];
      const record = state.recordingsByMatch[matchId];
      if (!stack || stack.length === 0 || !record) return state;
      // pop 最上面那筆快照，把三個「動作會改到」的欄位整包還原回去。比分/輪轉/發球方的
      // 逆運算、換人淨疊加的回退，全都由「直接換回舊物件參照」一次搞定，不用逐項反推。
      const entry = stack[stack.length - 1];
      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            ...record,
            currentSet: entry.currentSet,
            regularSubs: entry.regularSubs,
            liberoSubstitution: entry.liberoSubstitution,
            timeouts: entry.timeouts,
          },
        },
        undoStacksByMatch: {
          ...state.undoStacksByMatch,
          [matchId]: stack.slice(0, -1),
        },
      };
    }),

  nextSet: (matchId) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      const finished = record.currentSet;
      return {
        // 進新的一局就把這場的復原堆疊清空：復原只在「當前這一局」內有意義，不讓使用者
        // 跨局往回退（上一局已封存進 completedSets，退回去會破壞已結束局的資料）。
        undoStacksByMatch: { ...state.undoStacksByMatch, [matchId]: [] },
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            completedSets: [
              ...record.completedSets,
              {
                setNumber: finished.setNumber,
                ourScore: finished.ourScore,
                opponentScore: finished.opponentScore,
                history: finished.history,
              },
            ],
            currentSet: makeEmptySet(finished.setNumber + 1),
            // 先發快照歸零（issue #115）：先發是「每局可不同」，換下一局就清掉這一局的快照，等新
            // 的一局選先發方時，start() 再從（教練可能已回輪轉表重排的）當下站位擷取新的一份、
            // PUT 成這一局自己的 lineup row（一局一 row）。不沿用上一局，才能支援逐局換陣。
            lineup: null,
            // 換新的一局，自由球員替補狀態歸零（跟原本 handleNextSet 手動呼叫
            // setLiberoSubstitution(null) 是同一件事，現在收進 store 自己的動作裡）。
            liberoSubstitution: null,
            // 這一局的換人次數（淨疊加清單的長度）先存進歷史，新的一局換人清單歸零。
            // 以前這兩行是 ScoreSheet.tsx 手動呼叫 setSubCountsHistory/setRegularSubs 做的，
            // 現在既然 regularSubs 搬進 store，順手把「跨局怎麼交接」的邏輯也收進來，
            // 讓 store 自己對這兩個欄位的一致性負責，不用 UI 元件記得同步做兩件事。
            subCountsHistory: [...record.subCountsHistory, record.regularSubs.length],
            regularSubs: [],
            // 暫停跟換人同一套跨局交接（issue #44）：把這一局的暫停次數收進歷史，新的一局歸零。
            timeoutCountsHistory: [...record.timeoutCountsHistory, record.timeouts.length],
            timeouts: [],
          },
        },
      };
    }),

  setLineup: (matchId, lineup) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: { ...record, lineup },
        },
      };
    }),

  setLiberoSubstitution: (matchId, playerId) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: { ...record, liberoSubstitution: playerId },
        },
      };
    }),

  recordRegularSub: (matchId, outPlayerId, inPlayerId) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      // 淨疊加 dedup：如果剛好有一筆舊紀錄的「換上場的人」正好等於這次「換下場的人」
      // （代表這個位置正在被連續操作），先把那筆舊紀錄濾掉，只保留最新結果——
      // 跟 lib/scoreSheetMapping.ts 的 reconstructRegularSubs 是同一套邏輯，重建時才能對得上。
      const cleaned = record.regularSubs.filter((s) => s.inPlayerId !== outPlayerId);
      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            ...record,
            regularSubs: [...cleaned, { outPlayerId, inPlayerId }],
          },
        },
      };
    }),

  recordTimeout: (matchId, side) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      // 暫停沒有換人那種去重（見 types/scoresheet.ts 的 TimeoutRecord 註解），單純 append 一筆。
      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            ...record,
            timeouts: [...record.timeouts, { side }],
          },
        },
      };
    }),
}));

// ────────────────────────────────────────────────────────────────────────────
// 持久化 + 重建的橋接層。
//
// 為什麼把「重建」跟「動作」放在同一個 hook？因為兩者要共用同一組記帳 ref：
//   - currentSetIdRef：目前這一局在後端的 setId（POST rally 要掛在它底下）。
//   - rallyIdsRef：目前這一局每一分對應的 rallyId 堆疊（復原上一球要 DELETE 最後一個）。
// 進頁重建時 seed 這兩個 ref，之後每個動作維護它們。放在兩個 hook 會各有一份 ref、對不上。
//
// 所有後端寫入都排進一條「序列化的 promise 佇列」(queueRef)：即使教練連點很快，rally 也會
// 依序 POST（rallyNumber 不會亂、id 不會 race）；復原時 pop 到的一定是正確那一分的 id，
// 就算它的 POST 還在飛也沒關係（佇列保證 create 一定先跑完、id 已進堆疊）。
// ────────────────────────────────────────────────────────────────────────────
export function useScoreSheetController(matchId: string) {
  const numericMatchId = Number(matchId);
  const hydrate = useScoreSheet((s) => s.hydrate);

  const createSet = useCreateSet();
  const updateSet = useUpdateSet();
  const createRally = useCreateRally();
  const createEvent = useCreateEvent();
  const deleteRally = useDeleteRally();
  const createSubstitution = useCreateSubstitution();
  const deleteSubstitution = useDeleteSubstitution();
  const createTimeout = useCreateTimeout();
  const deleteTimeout = useDeleteTimeout();
  const putLineup = usePutSetLineup();

  // 持久化記帳（見上方說明）。用 ref 因為它們只影響背景寫入、不該觸發重繪。
  const currentSetIdRef = useRef<number | undefined>(undefined);
  const rallyIdsRef = useRef<number[]>([]);
  // 換人 row id 的堆疊，跟 rallyIdsRef 是同一套路：一般換人成功 POST 後把 id 推進來，
  // 「復原」退掉一個換人動作時 pop 出最後一個、DELETE 掉它。序列化佇列保證 create 一定
  // 先於 delete 跑完（id 已進堆疊），所以 pop 到的就是要刪的那一筆。
  const subIdsRef = useRef<number[]>([]);
  // 暫停 row id 的堆疊，跟 subIdsRef 完全同一套路：暫停成功 POST 後把 id 推進來，「復原」退掉
  // 一個暫停動作時 pop 出最後一個、DELETE 掉它（issue #44）。
  const timeoutIdsRef = useRef<number[]>([]);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  // 把一個後端寫入工作排進序列化佇列。本地優先：寫入失敗只記 log、不回滾畫面
  // （完整的失敗 reconcile 留待未來；現階段先確保單人、順暢的 happy path）。
  const enqueue = useCallback((task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task).catch((err) => {
      console.error("[scoresheet] 背景寫入後端失敗：", err);
    });
  }, []);

  // ── 進頁重建 ──
  // 先抓這場的所有 set，再對每個 set 抓它的 rallies（useQueries 讓我們對動態長度的清單
  // 各發一個 query，不違反 hooks 規則）。events 這一階段（3b-i）先不抓——球員逐球統計留到 3b-ii。
  const setsQuery = useListSets(numericMatchId);
  const sets = setsQuery.data ?? [];
  const ralliesQueries = useQueries({
    queries: sets.map((s) => ({
      queryKey: getListRalliesQueryKey(s.id),
      queryFn: () => listRallies(s.id),
    })),
  });
  // 整場所有 event 一次抓（bulk endpoint），避免對每個 rally 各發一次請求。3b-ii 靠它把
  // 球員動作補回重建的 PointRecord，reload 後球員統計才不會空。
  const eventsQuery = useListMatchEvents(numericMatchId);
  // 整場所有一般換人紀錄一次抓（跟 events 同一種 bulk endpoint 理由：避免對每個 set
  // 各發一次請求）。issue #42 Phase B：重建 regularSubs/subCountsHistory 靠它。
  const subsQuery = useListMatchSubstitutions(numericMatchId);
  // 整場所有暫停紀錄一次抓（同 bulk endpoint 理由，issue #44）。reload 後重建各局的
  // timeouts / timeoutCountsHistory 靠它。
  const timeoutsQuery = useListMatchTimeouts(numericMatchId);
  // 整場所有局的先發一次抓（同 bulk endpoint 理由）。issue #115：reload 後把先發快照讀回，
  // 計分表才不會又退回去讀（可能被別場/存檔污染的）全域 store。
  const lineupsQuery = useListMatchLineups(numericMatchId);

  const setsReady = setsQuery.isSuccess;
  const ralliesReady = ralliesQueries.every((q) => q.isSuccess);
  const eventsReady = eventsQuery.isSuccess;
  const subsReady = subsQuery.isSuccess;
  const timeoutsReady = timeoutsQuery.isSuccess;
  const lineupsReady = lineupsQuery.isSuccess;
  const isHydrating =
    !setsReady ||
    !eventsReady ||
    !subsReady ||
    !timeoutsReady ||
    !lineupsReady ||
    (sets.length > 0 && !ralliesReady);

  // 只在資料第一次備妥時重建一次，之後不再覆蓋（避免把使用者當下的即時編輯洗掉）。
  // matchId 變了就允許再重建一次。
  const hydratedMatchRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedMatchRef.current === matchId) return;
    if (!setsReady || !eventsReady || !subsReady || !timeoutsReady || !lineupsReady) return;
    if (sets.length > 0 && !ralliesReady) return;

    // 「資料到位後怎麼組成 ScoreSheetState」這段純計算已抽到 reconstructRecording
    // （lib/scoreSheetMapping.ts），這裡只管把三個 query 的資料整理成它要的形狀：
    // ralliesBySetIndex 要跟 sets 陣列同索引對齊（ralliesQueries 就是照 sets.map(...)
    // 的順序發的，直接照順序取 .data 即可）。分析頁的 useMatchRecording 也是呼叫
    // 同一個函式，兩邊重建規則保證一致。
    const ralliesBySetIndex = ralliesQueries.map((q) => q.data ?? []);
    const state = reconstructRecording(
      sets,
      ralliesBySetIndex,
      eventsQuery.data ?? [],
      subsQuery.data ?? [],
      lineupsQuery.data ?? [],
      timeoutsQuery.data ?? [],
    );

    // seed 記帳 ref，讓重建後接著記分/復原能對得上後端 id。
    currentSetIdRef.current = state.currentSet.serverId;
    rallyIdsRef.current = state.currentSet.history
      .map((h) => h.serverId)
      .filter((id): id is number => id !== undefined);
    // 換人 id 堆疊重建後歸零：復原堆疊（undoStacksByMatch）reload 後本來就是空的（純記憶體、
    // 不重建），所以 reload 前的換人不會被 undo 退掉、也就不需要它們的 id；只累積本次進頁後
    // 新記的換人 id 即可。
    subIdsRef.current = [];
    // 暫停 id 堆疊同理歸零（issue #44）：reload 前的暫停不會被 undo 退掉，只累積本次進頁後新記的。
    timeoutIdsRef.current = [];

    hydrate(matchId, state);
    hydratedMatchRef.current = matchId;
    // ralliesQueries / eventsQuery.data 每次 render 重建，放進依賴會抖動；用 *Ready 旗標即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matchId,
    setsReady,
    ralliesReady,
    eventsReady,
    subsReady,
    timeoutsReady,
    lineupsReady,
    sets.length,
  ]);

  // ── 動作（本地即時 + 背景持久化）──

  const start = useCallback(
    (servingFirst: Side, lineup: LineupSnapshot | null) => {
      const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
      const setNumber = pre?.setNumber ?? 1;
      useScoreSheet.getState().startSet(matchId, servingFirst);

      // 先發快照（issue #115）：選先發方這一刻，把「這一局」的先發凍結下來。先發每局可不同，所以
      // 這裡用的是呼叫端（ScoreSheet.tsx）從當下輪轉表擷取好、傳進來的那份；換下一局時 nextSet 已把
      // lineup 歸零，新的一局會重新擷取（教練可先回輪轉表重排）。只有這一局「已經有快照」（同一局內
      // reload 讀回、或極少數重按）才沿用舊的、不重擷取——這就是「局中凍結」（症狀 B）：開賽後回
      // 輪轉表改站位不會污染進行中這一局，要動陣容得走 substitute() 換人。
      const existingLineup = useScoreSheet.getState().recordingsByMatch[matchId]?.lineup ?? null;
      const effectiveLineup = existingLineup ?? lineup;
      if (effectiveLineup && !existingLineup) {
        useScoreSheet.getState().setLineup(matchId, effectiveLineup);
      }
      // 兩條路（#63 修法）：
      //   - 第 2 局以後：goNextSet 在按下一局的當下已經 POST 過一筆 firstServer=null 的空
      //     set row，currentSetIdRef 早就有值——這裡只是教練終於選好先發方，PATCH 補上去。
      //   - 第 1 局：從頭開始，還沒有任何 set row，照舊直接 POST 一筆帶 firstServer 的。
      // 判斷放進 enqueue 的 async task 裡（而不是 enqueue 之前）才讀 ref，是因為佇列會把
      // 這個任務排在 goNextSet 那筆「建空局」任務後面依序執行——true 而已，等到這裡真的
      // 執行時，前面所有任務都跑完了，ref 保證是最新值，不會有「PATCH 早於 POST 完成」的競態。
      enqueue(async () => {
        const existingSetId = currentSetIdRef.current;
        if (existingSetId !== undefined) {
          await updateSet.mutateAsync({
            matchId: numericMatchId,
            setId: existingSetId,
            data: { firstServer: sideToApi(servingFirst) },
          });
        } else {
          const created = await createSet.mutateAsync({
            matchId: numericMatchId,
            data: { setNumber, firstServer: sideToApi(servingFirst) },
          });
          currentSetIdRef.current = created.id;
          rallyIdsRef.current = [];
        }
        // set row 確定存在後（上面兩條路都已把 currentSetIdRef 指到這一局），把先發 PUT 上去
        // ——一局一 row（setId unique），PUT 是 idempotent upsert，同一局重按也只會覆寫、不重覆。
        // 排在 firstServer 寫入之後同一個 task 裡，順序天然正確。
        const setId = currentSetIdRef.current;
        if (setId !== undefined && effectiveLineup) {
          await putLineup.mutateAsync({ setId, data: lineupSnapshotToApi(effectiveLineup) });
        }
      });
    },
    [matchId, numericMatchId, enqueue, createSet, updateSet, putLineup],
  );

  const score = useCallback(
    (side: Side, meta?: Pick<PointRecord, "action" | "touchedBy">) => {
      const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
      if (!pre || pre.serving === null) return;

      // 記分前先擷取「這分開始前」的比分與 rallyNumber（rallies.homeScore/awayScore 存的是
      // 開分前的值）。之後才跑 reducer 加分，才不會把加完的分數當成 before。
      const rallyNumber = pre.history.length + 1;
      const homeScoreBefore = pre.ourScore;
      const awayScoreBefore = pre.opponentScore;
      const point: PointRecord = { side, wasSideOut: side !== pre.serving, ...meta };

      // 0) 先存一份「記這分之前」的快照，讓之後「復原」能整包退回這一球（issue #41）。
      //    backendKind 'rally'：一分＝一個 rally，復原時要 DELETE 那個 rally。
      useScoreSheet.getState().snapshotForUndo(matchId, "rally");

      // 1) 本地即時更新（畫面零延遲）
      useScoreSheet.getState().scorePoint(matchId, side, meta);

      // 2) 背景持久化：POST rally，成功後把 id 推進堆疊；有動作/球員才順帶 POST 一個 event。
      enqueue(async () => {
        const setId = currentSetIdRef.current;
        if (setId === undefined) return; // 理論上 start 一定先跑過；防呆
        const rally = await createRally.mutateAsync({
          setId,
          data: pointRecordToRally(point, rallyNumber, homeScoreBefore, awayScoreBefore),
        });
        rallyIdsRef.current.push(rally.id);
        const newEvent = pointRecordToEvent(point, 1);
        if (newEvent) {
          await createEvent.mutateAsync({ rallyId: rally.id, data: newEvent });
        }
      });
    },
    [matchId, enqueue, createRally, createEvent],
  );

  // 復原最近一個動作（issue #41）：一顆按鈕、一次退一個動作（得分 / 一般換人 / 手動 libero），
  // 連按就一路往回。做法是先偷看堆疊最上面那筆是什麼動作（backendKind），本地整包還原後，
  // 再依它決定後端要不要補刪、刪哪張表的 row。
  const undo = useCallback(() => {
    const stack = useScoreSheet.getState().undoStacksByMatch[matchId];
    if (!stack || stack.length === 0) return;
    // 先 peek（不 pop）拿到「上一個動作在後端建了什麼」，再叫 store 還原＋pop。
    const top = stack[stack.length - 1];
    useScoreSheet.getState().undoLast(matchId);

    if (top.backendKind === "rally") {
      enqueue(async () => {
        // 佇列序列化保證：即使這一分的 POST 還沒回來，它排在本 delete 前面、一定先跑完並把 id
        // 推進堆疊，所以這裡 pop 到的就是要刪的那一分。event 靠 FK cascade 一起刪掉。
        const rallyId = rallyIdsRef.current.pop();
        if (rallyId !== undefined) {
          await deleteRally.mutateAsync({ rallyId });
        }
      });
    } else if (top.backendKind === "substitution") {
      enqueue(async () => {
        // 跟 rally 同理：序列化佇列保證這筆換人的 POST 已先跑完、id 已進 subIdsRef。
        const substitutionId = subIdsRef.current.pop();
        if (substitutionId !== undefined) {
          await deleteSubstitution.mutateAsync({ substitutionId });
        }
      });
    } else if (top.backendKind === "timeout") {
      enqueue(async () => {
        // 跟換人同理（issue #44）：序列化佇列保證這筆暫停的 POST 已先跑完、id 已進 timeoutIdsRef。
        const timeoutId = timeoutIdsRef.current.pop();
        if (timeoutId !== undefined) {
          await deleteTimeout.mutateAsync({ timeoutId });
        }
      });
    }
    // backendKind === null（手動 libero 上/下場）：純本地狀態，undoLast 已還原畫面，後端沒東西要刪。
  }, [matchId, enqueue, deleteRally, deleteSubstitution, deleteTimeout]);

  const goNextSet = useCallback(() => {
    const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
    const newSetNumber = (pre?.setNumber ?? 1) + 1;
    useScoreSheet.getState().nextSet(matchId);
    // #63 修法：新的一局不再「留空等 start 才建 row」，而是按下一局的當下就先 POST 一筆
    // firstServer=null 的空 set row（教練還沒選先發方，先寫 null，選好後 start() 再 PATCH
    // 補上）。這樣「使用者已經進到的每一局」都保證有對應 DB row，reload 時最後一局就是
    // 這筆空 row，會正確重建成「這局由誰先發球？」，不會退回顯示上一局。
    // 排進佇列而非直接發請求，是為了排在剛結束那局最後幾筆記分/換人寫入之後，維持順序。
    enqueue(async () => {
      // 先把記帳 ref 清乾淨「再」發 POST。順序很重要：如果建空局的 POST 失敗（背景寫入
      // 失敗目前不 reconcile，屬 #64 範圍），ref 會停在這個 undefined，start() 讀到就會
      // 退回「POST 開新局」——而不是誤把 ref 停在剛結束那局的 id、害 start() PATCH 到
      // 錯的一局、後續記分也灌進錯的 set。這保留了舊碼「goNextSet 後 ref 不指向舊局」的
      // 安全性質（舊碼是同步設 undefined，這裡改成非同步建 row 前先設，效果一致）。
      currentSetIdRef.current = undefined;
      rallyIdsRef.current = [];
      const created = await createSet.mutateAsync({
        matchId: numericMatchId,
        data: { setNumber: newSetNumber, firstServer: null },
      });
      currentSetIdRef.current = created.id;
    });
  }, [matchId, numericMatchId, enqueue, createSet]);

  // 一般換人（issue #42 Phase B）。跟 score() 是同一套結構：
  //   1) 先同步擷取「這次換人當下」的比分快照（换人不是掛在某個 rally 底下，
  //      而是記錄「發生時的比分」，見 scoreSheetMapping.ts 的 regularSubToApi 註解）。
  //   2) 本地 reducer 立刻更新畫面（recordRegularSub，零延遲）。
  //   3) 背景把這筆換人 POST 到後端、掛在目前這一局的 setId 底下。
  const substitute = useCallback(
    (outPlayerId: string, inPlayerId: string) => {
      const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
      if (!pre || pre.serving === null) return;

      const homeScore = pre.ourScore;
      const awayScore = pre.opponentScore;

      // 0) 先存一份「這次換人之前」的快照，讓「復原」能單獨退掉這個換人動作（issue #41）。
      //    backendKind 'substitution'：復原時要 DELETE 這一筆換人 row。
      useScoreSheet.getState().snapshotForUndo(matchId, "substitution");

      // 1) 本地即時更新（畫面零延遲）
      useScoreSheet.getState().recordRegularSub(matchId, outPlayerId, inPlayerId);

      // 2) 背景持久化：POST 到目前這一局底下，成功後把 row id 推進 subIdsRef（復原要用它 DELETE）。
      enqueue(async () => {
        const setId = currentSetIdRef.current;
        if (setId === undefined) return; // 理論上 start 一定先跑過；防呆
        const created = await createSubstitution.mutateAsync({
          setId,
          data: regularSubToApi({ outPlayerId, inPlayerId }, homeScore, awayScore),
        });
        subIdsRef.current.push(created.id);
      });
    },
    [matchId, enqueue, createSubstitution],
  );

  // 暫停（issue #44）。跟 substitute() 是同一套結構，只是更單純（沒有球員、沒有淨疊加）：
  //   1) 先同步擷取「叫暫停當下」的比分快照（暫停跟換人一樣不掛在某個 rally 底下，記的是發生時的比分）。
  //   2) 本地 reducer 立刻更新畫面（recordTimeout，零延遲）。
  //   3) 背景把這筆暫停 POST 到目前這一局的 setId 底下，成功後把 id 推進 timeoutIdsRef（復原要用它 DELETE）。
  const callTimeout = useCallback(
    (side: Side) => {
      const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
      if (!pre || pre.serving === null) return;

      const homeScore = pre.ourScore;
      const awayScore = pre.opponentScore;

      // 0) 先存一份「叫這次暫停之前」的快照，讓「復原」能單獨退掉這個暫停動作（issue #41）。
      useScoreSheet.getState().snapshotForUndo(matchId, "timeout");

      // 1) 本地即時更新（畫面零延遲）
      useScoreSheet.getState().recordTimeout(matchId, side);

      // 2) 背景持久化：POST 到目前這一局底下，成功後把 row id 推進 timeoutIdsRef。
      enqueue(async () => {
        const setId = currentSetIdRef.current;
        if (setId === undefined) return; // 理論上 start 一定先跑過；防呆
        const created = await createTimeout.mutateAsync({
          setId,
          data: timeoutToApi(side, homeScore, awayScore),
        });
        timeoutIdsRef.current.push(created.id);
      });
    },
    [matchId, enqueue, createTimeout],
  );

  return { isHydrating, start, score, undo, goNextSet, substitute, callTimeout };
}
