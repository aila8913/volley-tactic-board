import { create } from "zustand";
import { useCallback, useEffect, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useListSets,
  useListMatchEvents,
  useListMatchSubstitutions,
  useCreateSet,
  useCreateRally,
  useCreateEvent,
  useDeleteRally,
  useCreateSubstitution,
  listRallies,
  getListRalliesQueryKey,
} from "@workspace/api-client-react";
import type { MatchEvent, Substitution } from "@workspace/api-client-react";
import {
  ScoreSheetState,
  PointRecord,
  Side,
  SetRecordingState,
  CompletedSet,
} from "../types/scoresheet";
import {
  sideToApi,
  pointRecordToRally,
  pointRecordToEvent,
  reconstructSetFromRallies,
  regularSubToApi,
  reconstructRegularSubs,
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
  // 進頁重建：把從後端 sets/rallies 重算出來的完整狀態，一次灌進某一場的記錄。
  hydrate: (matchId: string, state: ScoreSheetState) => void;
  startSet: (matchId: string, servingFirst: Side) => void;
  scorePoint: (
    matchId: string,
    side: Side,
    meta?: Pick<PointRecord, "action" | "touchedBy">,
  ) => void;
  undoLastPoint: (matchId: string) => void;
  nextSet: (matchId: string) => void;
  setLiberoSubstitution: (matchId: string, playerId: string | null) => void;
  // 一般換人（issue #42 Phase B）：跟 setLiberoSubstitution 一樣是純 reducer，瞬間更新畫面；
  // 真正寫進後端由 controller 的 substitute() 在背景做（跟 scorePoint/score() 是同一套分工）。
  recordRegularSub: (matchId: string, outPlayerId: string, inPlayerId: string) => void;
}

const makeEmptySet = (setNumber: number): SetRecordingState => ({
  setNumber,
  ourScore: 0,
  opponentScore: 0,
  serving: null,
  ourRotation: 0,
  opponentRotation: 0,
  history: [],
});

const emptyRecord = (): ScoreSheetState => ({
  currentSet: makeEmptySet(1),
  completedSets: [],
  liberoSubstitution: null,
  regularSubs: [],
  subCountsHistory: [],
});

const getOrInitRecord = (
  byMatch: Record<string, ScoreSheetState>,
  matchId: string,
): ScoreSheetState => byMatch[matchId] ?? emptyRecord();

export const useScoreSheet = create<ScoreSheetStore>()((set) => ({
  recordingsByMatch: {},

  hydrate: (matchId, state) =>
    set((s) => ({
      recordingsByMatch: { ...s.recordingsByMatch, [matchId]: state },
    })),

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

  undoLastPoint: (matchId) =>
    set((state) => {
      const record = state.recordingsByMatch[matchId];
      const current = record?.currentSet;
      if (!current || current.history.length === 0) return state;
      const last = current.history[current.history.length - 1];

      const ourRotation =
        last.wasSideOut && last.side === "us" ? (current.ourRotation + 5) % 6 : current.ourRotation;
      const opponentRotation =
        last.wasSideOut && last.side === "opponent"
          ? (current.opponentRotation + 5) % 6
          : current.opponentRotation;
      // side-out 前的發球方，跟這次得分方剛好相反；如果這分沒有 side-out，
      // 發球方本來就跟得分方相同，復原後維持不變。
      const previousServing: Side = last.wasSideOut
        ? last.side === "us"
          ? "opponent"
          : "us"
        : last.side;

      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            ...record,
            currentSet: {
              ...current,
              ourScore: last.side === "us" ? current.ourScore - 1 : current.ourScore,
              opponentScore:
                last.side === "opponent" ? current.opponentScore - 1 : current.opponentScore,
              serving: previousServing,
              ourRotation,
              opponentRotation,
              history: current.history.slice(0, -1),
            },
          },
        },
      };
    }),

  nextSet: (matchId) =>
    set((state) => {
      const record = getOrInitRecord(state.recordingsByMatch, matchId);
      const finished = record.currentSet;
      return {
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
            // 換新的一局，自由球員替補狀態歸零（跟原本 handleNextSet 手動呼叫
            // setLiberoSubstitution(null) 是同一件事，現在收進 store 自己的動作裡）。
            liberoSubstitution: null,
            // 這一局的換人次數（淨疊加清單的長度）先存進歷史，新的一局換人清單歸零。
            // 以前這兩行是 ScoreSheet.tsx 手動呼叫 setSubCountsHistory/setRegularSubs 做的，
            // 現在既然 regularSubs 搬進 store，順手把「跨局怎麼交接」的邏輯也收進來，
            // 讓 store 自己對這兩個欄位的一致性負責，不用 UI 元件記得同步做兩件事。
            subCountsHistory: [...record.subCountsHistory, record.regularSubs.length],
            regularSubs: [],
          },
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
  const createRally = useCreateRally();
  const createEvent = useCreateEvent();
  const deleteRally = useDeleteRally();
  const createSubstitution = useCreateSubstitution();

  // 持久化記帳（見上方說明）。用 ref 因為它們只影響背景寫入、不該觸發重繪。
  const currentSetIdRef = useRef<number | undefined>(undefined);
  const rallyIdsRef = useRef<number[]>([]);
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

  const setsReady = setsQuery.isSuccess;
  const ralliesReady = ralliesQueries.every((q) => q.isSuccess);
  const eventsReady = eventsQuery.isSuccess;
  const subsReady = subsQuery.isSuccess;
  const isHydrating =
    !setsReady || !eventsReady || !subsReady || (sets.length > 0 && !ralliesReady);

  // 只在資料第一次備妥時重建一次，之後不再覆蓋（避免把使用者當下的即時編輯洗掉）。
  // matchId 變了就允許再重建一次。
  const hydratedMatchRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedMatchRef.current === matchId) return;
    if (!setsReady || !eventsReady || !subsReady) return;
    if (sets.length > 0 && !ralliesReady) return;

    // 把整場的 event 依 rallyId 分組，餵給 reconstruct 還原每一分的動作/球員。
    // endpoint 已依 rallyId、sequence 排序，所以同一組內是照 sequence 排好的。
    const eventsByRallyId = new Map<number, MatchEvent[]>();
    for (const ev of eventsQuery.data ?? []) {
      const list = eventsByRallyId.get(ev.rallyId);
      if (list) list.push(ev);
      else eventsByRallyId.set(ev.rallyId, [ev]);
    }

    // 把整場的一般換人紀錄依 setId 分組，重建各局的 regularSubs（見下方使用處）。
    // 後端 GET 已依 (setId, homeScore, awayScore, id) 排序，同一組內就是發生的先後順序，
    // 可以直接丟給 reconstructRegularSubs 照順序 replay。
    const subsBySetId = new Map<number, Substitution[]>();
    for (const sub of subsQuery.data ?? []) {
      const list = subsBySetId.get(sub.setId);
      if (list) list.push(sub);
      else subsBySetId.set(sub.setId, [sub]);
    }

    let state: ScoreSheetState;
    if (sets.length === 0) {
      // 這場還沒記過任何一局：給一份空白記錄，畫面會顯示「這局由誰先發球？」。
      state = emptyRecord();
    } else {
      // 慣例：最後一局（setNumber 最大）當「進行中」，前面的都當「已結束」。schema 沒有
      // 「這局結束了嗎」的旗標，所以無法區分「剛按下一局但還沒開球」的空局——那個未開球的
      // 新局還沒寫進後端（要選完先發方才建 set row），reload 後會退回顯示上一局，屬已知限制（#63）。
      const completedSets: CompletedSet[] = sets.slice(0, -1).map((s, i) => {
        const st = reconstructSetFromRallies(s, ralliesQueries[i].data ?? [], eventsByRallyId);
        return {
          setNumber: st.setNumber,
          ourScore: st.ourScore,
          opponentScore: st.opponentScore,
          history: st.history,
        };
      });
      // 已結束各局的換人次數：對每個已結束的 set，重放它的換人紀錄、取淨疊加清單的長度
      // （跟 nextSet 動作把 record.regularSubs.length 推進 subCountsHistory 是同一個數字，
      // 只是這裡是從後端資料重算，而不是延續 store 裡當下的值）。陣列順序對齊 completedSets。
      const subCountsHistory: number[] = sets
        .slice(0, -1)
        .map((s) => reconstructRegularSubs(subsBySetId.get(s.id) ?? []).length);
      const lastIdx = sets.length - 1;
      const currentSet = reconstructSetFromRallies(
        sets[lastIdx],
        ralliesQueries[lastIdx].data ?? [],
        eventsByRallyId,
      );
      // 進行中這一局的換人淨疊加清單，直接重放這一局的換人紀錄即可。
      const regularSubs = reconstructRegularSubs(subsBySetId.get(sets[lastIdx].id) ?? []);
      state = {
        currentSet,
        completedSets,
        liberoSubstitution: null,
        regularSubs,
        subCountsHistory,
      };
    }

    // seed 記帳 ref，讓重建後接著記分/復原能對得上後端 id。
    currentSetIdRef.current = state.currentSet.serverId;
    rallyIdsRef.current = state.currentSet.history
      .map((h) => h.serverId)
      .filter((id): id is number => id !== undefined);

    hydrate(matchId, state);
    hydratedMatchRef.current = matchId;
    // ralliesQueries / eventsQuery.data 每次 render 重建，放進依賴會抖動；用 *Ready 旗標即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, setsReady, ralliesReady, eventsReady, subsReady, sets.length]);

  // ── 動作（本地即時 + 背景持久化）──

  const start = useCallback(
    (servingFirst: Side) => {
      const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
      const setNumber = pre?.setNumber ?? 1;
      useScoreSheet.getState().startSet(matchId, servingFirst);
      enqueue(async () => {
        const created = await createSet.mutateAsync({
          matchId: numericMatchId,
          data: { setNumber, firstServer: sideToApi(servingFirst) },
        });
        currentSetIdRef.current = created.id;
        rallyIdsRef.current = [];
      });
    },
    [matchId, numericMatchId, enqueue, createSet],
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

  const undo = useCallback(() => {
    const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
    if (!pre || pre.history.length === 0) return;
    useScoreSheet.getState().undoLastPoint(matchId);
    enqueue(async () => {
      // 佇列序列化保證：即使這一分的 POST 還沒回來，它排在本 delete 前面、一定先跑完並把 id
      // 推進堆疊，所以這裡 pop 到的就是要刪的那一分。event 靠 FK cascade 一起刪掉。
      const rallyId = rallyIdsRef.current.pop();
      if (rallyId !== undefined) {
        await deleteRally.mutateAsync({ rallyId });
      }
    });
  }, [matchId, enqueue, deleteRally]);

  const goNextSet = useCallback(() => {
    useScoreSheet.getState().nextSet(matchId);
    // 新的一局要等下次選完先發方（start）才會建 set row，這裡先把 live 記帳清乾淨。
    // 排進佇列而非直接清，是為了排在正在結束那局的寫入之後，維持順序。
    enqueue(async () => {
      currentSetIdRef.current = undefined;
      rallyIdsRef.current = [];
    });
  }, [matchId, enqueue]);

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

      // 1) 本地即時更新（畫面零延遲）
      useScoreSheet.getState().recordRegularSub(matchId, outPlayerId, inPlayerId);

      // 2) 背景持久化：POST 到目前這一局底下。
      enqueue(async () => {
        const setId = currentSetIdRef.current;
        if (setId === undefined) return; // 理論上 start 一定先跑過；防呆
        await createSubstitution.mutateAsync({
          setId,
          data: regularSubToApi({ outPlayerId, inPlayerId }, homeScore, awayScore),
        });
      });
    },
    [matchId, enqueue, createSubstitution],
  );

  return { isHydrating, start, score, undo, goNextSet, substitute };
}
