import { create } from "zustand";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
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
  ApiError,
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
import { applyRally, applyRegularSub, type RuleState } from "../lib/volleyballRules";
import {
  createWriteLog,
  newRowId,
  type WriteLog,
  type WriteLogEntry,
  type WriteOp,
} from "../lib/writeLog";
import { createIndexedDbWriteLogStore, type WriteLogStore } from "../lib/writeLogStore";

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
  // backendRef 帶的是「這個動作在後端建了哪一筆」（表名＋已鑄好的 uuid），undo 要刪它。
  snapshotForUndo: (matchId: string, backendRef: UndoEntry["backendRef"]) => void;
  scorePoint: (
    matchId: string,
    side: Side,
    meta?: Pick<PointRecord, "action" | "touchedBy">,
  ) => void;
  // 復原最近一個動作：pop 堆疊最上面那筆快照、整包還原三個可變欄位（比分/輪轉/發球方、
  // 一般換人清單、libero 替補）。後端要補刪什麼由 controller 依那筆的 backendRef 決定。
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

  snapshotForUndo: (matchId, backendRef) =>
    set((state) => {
      const record = state.recordingsByMatch[matchId];
      if (!record) return state;
      // 直接存舊物件的參照當快照（immutable 更新下等於凍結，見 UndoEntry 註解）。
      const entry: UndoEntry = {
        currentSet: record.currentSet,
        regularSubs: record.regularSubs,
        liberoSubstitution: record.liberoSubstitution,
        timeouts: record.timeouts,
        backendRef,
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

      // 排球輪轉規則本體已經抽到 lib/volleyballRules.ts 的 applyRally——這裡只是把
      // currentSet 的五個規則欄位組成它要的 RuleState、把算出來的新值攤回 currentSet。
      // 這樣改，是因為 replay 端（scoreSheetMapping.ts 的 reconstructSetFromRallies）
      // 要重放整場歷史算出一模一樣的結果，以前兩邊各手寫一份「side-out 才輪轉」的邏輯，
      // 現在共用同一個純函式，改一次兩邊保證同步（見 volleyballRules.ts 開頭的說明）。
      //
      // 特地重新組一個物件字面量（而不是直接把 current 整包傳進去）：上面那行 guard
      // 只窄化了「current.serving」這一次讀取的型別，不會讓 current 這個變數本身的型別
      // 從 SetRecordingState（serving: Side | null）變成 RuleState（serving: Side）——
      // TypeScript 的控制流分析不會把單一屬性的窄化套用到整個物件上，重新取一次
      // current.serving 塞進新物件字面量，才能讓這次讀取被記錄的窄化生效。
      const ruleStateBefore: RuleState = {
        ourScore: current.ourScore,
        opponentScore: current.opponentScore,
        serving: current.serving,
        ourRotation: current.ourRotation,
        opponentRotation: current.opponentRotation,
      };
      const { state: nextRuleState, wasSideOut } = applyRally(ruleStateBefore, side);

      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            ...record,
            currentSet: {
              ...current,
              ...nextRuleState,
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
                // 封存這一局當下的先發快照（issue #174）：record.lineup 是「這一局」的先發
                // （下面幾行才會把它歸零成 null，給下一局用），所以要在歸零之前先讀出來存進去，
                // 順序不能顛倒——不然封存進 completedSets 的會是被清空後的 null。
                lineup: record.lineup,
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
      // 淨疊加摺疊本體已經抽到 lib/volleyballRules.ts 的 applyRegularSub：這裡跟
      // scoreSheetMapping.ts 的 reconstructRegularSubs（reload 時 reduce 整份換人流水帳）
      // 現在真的是呼叫同一份實作，不再是「兩份邏輯手動保持同步」的註解承諾。
      return {
        recordingsByMatch: {
          ...state.recordingsByMatch,
          [matchId]: {
            ...record,
            regularSubs: applyRegularSub(record.regularSubs, { outPlayerId, inPlayerId }),
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
// 為什麼把「重建」跟「動作」放在同一個 hook？因為兩者要共用同一份記帳：currentSetIdRef
// ——目前這一局在後端的 setId（rally/換人/暫停都要掛在它底下）。進頁重建時 seed 它，
// 之後每個動作維護它。放在兩個 hook 會各有一份 ref、對不上。
//
// 所有後端寫入都 append 進一條有序的 write log（lib/writeLog.ts），由它序列化送出：
// 即使教練連點很快，rally 也會依序 POST（rallyNumber 不會亂），delete 也一定排在對應的
// create 之後。復原要刪哪一筆不再靠「pop 某一疊 id ref」，而是 undo 快照自己帶著 row id
// ——因為主鍵已是 client-mintable uuid，動作發生的當下就鑄得出來（#64 PR1/PR2、#230）。
// ────────────────────────────────────────────────────────────────────────────
// write log 的落地層（IndexedDB）。整個 app 共用一份：它內部只有一個 DB 連線，
// 每場比賽靠 entry 的 matchId 分開。用 lazy singleton 而不是 module 頂層直接建，
// 是為了讓「沒有 IndexedDB 的環境」（測試/SSR）第一次用到時才判斷、並快取那個 null。
let writeLogStore: WriteLogStore | null | undefined;
function getWriteLogStore(): WriteLogStore | null {
  if (writeLogStore === undefined) writeLogStore = createIndexedDbWriteLogStore();
  return writeLogStore;
}

export function useScoreSheetController(matchId: string) {
  const numericMatchId = Number(matchId);
  const hydrate = useScoreSheet((s) => s.hydrate);
  const queryClient = useQueryClient();

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

  // 持久化記帳：目前這一局在後端的 setId。用 ref 因為它只影響背景寫入、不該觸發重繪。
  // 以前它旁邊還有 rallyIdsRef / subIdsRef / timeoutIdsRef 三疊「建立時 push、undo 時 pop」的
  // id 堆疊，現在全部刪掉了——id 在動作當下就鑄好並存進 undo 快照（見 UndoEntry.backendRef）。
  const currentSetIdRef = useRef<string | undefined>(undefined);

  // executor：整份程式碼裡唯一知道「哪一種 write op 對應哪一支 API」的地方。以前這個知識
  // 散在六個 action 裡（各自 mutateAsync 一次），現在收斂成這一個 switch。
  //
  // 為什麼要透過 ref 拿 mutation：orval/react-query 的 mutation 物件每次 render 都是新的，
  // 但 write log 必須整頁只建立一次（換一條新 log ＝ 序列化的 promise 鏈斷掉、順序不再保證）。
  // 所以 log 拿到的 executor 必須是穩定的函式，執行當下再從 ref 讀最新的 mutation。
  const apiRef = useRef({
    createSet,
    updateSet,
    createRally,
    createEvent,
    deleteRally,
    createSubstitution,
    deleteSubstitution,
    createTimeout,
    deleteTimeout,
    putLineup,
  });
  apiRef.current = {
    createSet,
    updateSet,
    createRally,
    createEvent,
    deleteRally,
    createSubstitution,
    deleteSubstitution,
    createTimeout,
    deleteTimeout,
    putLineup,
  };

  const execute = useCallback(
    async (entry: WriteLogEntry): Promise<void> => {
      const api = apiRef.current;
      // 重送一筆 DELETE 時，那列可能上一輪其實已經刪成功了（回應在半路掉了），後端會回 404。
      // 對「把這列弄不見」這個意圖來說 404 就是達成了，所以吞掉它、把 entry 標成 synced，
      // 否則這筆會永遠卡在 outbox 裡重送。這是 delete 天生冪等的性質；create 那邊對應的
      // 冪等是後端的 ON CONFLICT (id) DO NOTHING（見各 route 的 POST）。
      const ignoreMissing = async (send: Promise<unknown>) => {
        try {
          await send;
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) return;
          throw err;
        }
      };
      // TypeScript 會用 kind + table 這兩個 discriminant 把 entry 窄化到對應的分支，
      // 所以底下每個 case 拿到的 payload 型別都是準的；漏掉分支也會被編譯器抓到。
      switch (entry.table) {
        case "sets":
          if (entry.kind === "create") {
            await api.createSet.mutateAsync({ matchId: entry.matchId, data: entry.payload });
          } else if (entry.kind === "patch") {
            await api.updateSet.mutateAsync({
              matchId: entry.matchId,
              setId: entry.id,
              data: entry.payload,
            });
          }
          return;
        case "rallies":
          if (entry.kind === "create") {
            await api.createRally.mutateAsync({ setId: entry.parentId, data: entry.payload });
          } else {
            await ignoreMissing(api.deleteRally.mutateAsync({ rallyId: entry.id }));
          }
          return;
        case "events":
          await api.createEvent.mutateAsync({ rallyId: entry.parentId, data: entry.payload });
          return;
        case "substitutions":
          if (entry.kind === "create") {
            await api.createSubstitution.mutateAsync({
              setId: entry.parentId,
              data: entry.payload,
            });
          } else {
            await ignoreMissing(api.deleteSubstitution.mutateAsync({ substitutionId: entry.id }));
          }
          return;
        case "timeouts":
          if (entry.kind === "create") {
            await api.createTimeout.mutateAsync({ setId: entry.parentId, data: entry.payload });
          } else {
            await ignoreMissing(api.deleteTimeout.mutateAsync({ timeoutId: entry.id }));
          }
          return;
        case "lineups":
          await api.putLineup.mutateAsync({ setId: entry.id, data: entry.payload });
          return;
      }
    },
    // apiRef 是穩定的容器，內容每次 render 就地更新，所以這個 callback 不需要任何依賴。
    [],
  );

  // 這一場的 write log。用「lazy init + matchId 變了才重建」而不是 useMemo：useMemo 在
  // React 的合約裡是可以被丟棄重算的快取，而這裡重建一次就等於丟掉還沒送出的寫入，不能賭。
  //
  // pendingWrites 是「還沒送成功的筆數」，給畫面上的未同步指示器用（#64 PR4）。log 內部
  // 的 entry 是普通物件、就地改狀態，React 看不到——所以 log 每次狀態變動都回呼 onChange，
  // 我們在那裡把數字抄進 state 觸發重畫。這是把「非 React 的可變資料」接進 React 的標準做法。
  const [pendingWrites, setPendingWrites] = useState(0);
  const logRef = useRef<WriteLog | null>(null);
  const logMatchRef = useRef<number | null>(null);
  if (logRef.current === null || logMatchRef.current !== numericMatchId) {
    // 換一場比賽時先把舊 log 的重送計時器停掉，不然它會在背景一直醒來。
    logRef.current?.dispose();
    // holder 是為了讓 onChange 讀到「自己這條 log」而不是 logRef.current——換場之後
    // 舊 log 若還有 in-flight 的請求回來，讀 logRef 就會把新 log 的數字算成舊 log 的。
    const holder: { log: WriteLog | null } = { log: null };
    holder.log = createWriteLog(numericMatchId, execute, {
      store: getWriteLogStore(),
      onChange: () => setPendingWrites(holder.log?.pendingCount() ?? 0),
    });
    logRef.current = holder.log;
    logMatchRef.current = numericMatchId;
  }

  // 重新上線就立刻催一次補送，不用等退避計時器（理由見 writeLog.ts 的重送迴圈說明：
  // online 事件快但會說謊，退避計時器慢但誠實，兩個都留著）。
  // 卸載時 dispose：離開計分頁後不該還有一個看不見的計時器在背景重試。
  useEffect(() => {
    const flush = () => logRef.current?.retry();
    window.addEventListener("online", flush);
    return () => {
      window.removeEventListener("online", flush);
      logRef.current?.dispose();
    };
  }, []);

  // 六個動作統一用它把寫入交出去。本地優先：寫入失敗只記 log、不回滾畫面
  // （完整的失敗 reconcile 是 #64 PR4 的事）。
  const append = useCallback((op: WriteOp) => {
    logRef.current?.append(op);
  }, []);

  // ── 重放閘門（#64 PR3）──
  //
  // 上一次分頁被關掉時，可能還有沒送出的寫入躺在 IndexedDB 裡。如果直接拿後端資料重建畫面，
  // 那幾筆就會「暫時消失」（後端還沒有它們），等重放送完又冒出來——畫面閃一下、比分還會倒退。
  //
  // 所以順序反過來：**先把積欠的寫入補送完，再重建**。補送完如果真的有送出東西，後端資料就
  // 過期了，要 invalidate 讓 react-query 重抓（await 它 = 等重抓落地），這樣重建看到的才是
  // 「本地 + 後端」收斂後的同一份真相。
  //
  // 補送失敗（真的離線）時仍然會放行重建：那幾筆留在 IndexedDB 裡等 PR4 的重送迴圈，
  // 但畫面會暫時看不到它們。這是目前已知的取捨——「不會掉」有保證，「馬上看得到」還沒有。
  const [replayedMatch, setReplayedMatch] = useState<number | null>(null);
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    let cancelled = false;
    void log.replayed.then(async (count) => {
      if (count > 0) await queryClient.invalidateQueries();
      if (!cancelled) setReplayedMatch(numericMatchId);
    });
    return () => {
      cancelled = true;
    };
  }, [numericMatchId, queryClient]);
  const replayDone = replayedMatch === numericMatchId;

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
    !replayDone ||
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
    // 重放沒跑完就先不重建（理由見上面的「重放閘門」）。
    if (!replayDone) return;
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

    // seed 記帳 ref，讓重建後接著記分能掛到正確的一局底下。
    // （以前這裡還要 seed 三疊 id 堆疊；現在不用了——undo 快照自己帶著要刪的 row id，
    // 而復原堆疊 reload 後本來就是空的，所以 reload 前的紀錄不會、也不該被 undo 退掉。）
    currentSetIdRef.current = state.currentSet.serverId;

    hydrate(matchId, state);
    hydratedMatchRef.current = matchId;
    // ralliesQueries / eventsQuery.data 每次 render 重建，放進依賴會抖動；用 *Ready 旗標即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matchId,
    replayDone,
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

      // 先發快照（issue #115）：選先發方這一刻，把「這一局」的先發凍結下來。先發每局可不同，所以
      // 這裡用的是呼叫端（ScoreSheet.tsx）從當下輪轉表擷取好、傳進來的那份；換下一局時 nextSet 已把
      // lineup 歸零，新的一局會重新擷取（教練可先回輪轉表重排）。只有這一局「已經有快照」（同一局內
      // reload 讀回、或極少數重按）才沿用舊的、不重擷取——這就是「局中凍結」（症狀 B）：開賽後回
      // 輪轉表改站位不會污染進行中這一局，要動陣容得走 substitute() 換人。
      const existingLineup = useScoreSheet.getState().recordingsByMatch[matchId]?.lineup ?? null;
      const effectiveLineup = existingLineup ?? lineup;

      // 「發球方」與「凍結先發」必須同進同出——沒有先發可凍結時，連 serving 都不能寫出去。
      // 否則會製造一筆「serving 非 null、lineup null」的殘缺 set：本地看起來像開賽了（serving
      // 有值），但沒有任何先發被凍結，重整後就變成 ScoreSheet.tsx canEditLineup 註解描述的死結
      // （右欄被鎖、中央又喊還沒排先發）。呼叫端（ScoreSheet 的「誰先發球」）本來就只在有先發時
      // 才會走到這裡，這道 guard 是把「兩者必須成對」這個不變量寫死在 store，不靠呼叫端自律。
      if (!effectiveLineup) return;

      useScoreSheet.getState().startSet(matchId, servingFirst);
      if (!existingLineup) {
        useScoreSheet.getState().setLineup(matchId, effectiveLineup);
      }
      // 兩條路（#63 修法）：
      //   - 第 2 局以後：goNextSet 在按下一局的當下已經記過一筆 firstServer=null 的空 set，
      //     currentSetIdRef 早就有值——這裡只是教練終於選好先發方，PATCH 補上去。
      //   - 第 1 局：從頭開始，還沒有任何 set，POST 一筆帶 firstServer 的。
      // 以前這個判斷必須寫在 async task 裡「等排到自己時才讀 ref」，因為 setId 要等 POST 回來；
      // 現在 id 是前端鑄的，goNextSet 一按就同步寫進 ref，所以這裡可以直接同步判斷。
      // 順序仍由 write log 保證：PATCH 一定排在建空局的 POST 之後。
      const existingSetId = currentSetIdRef.current;
      if (existingSetId !== undefined) {
        append({
          kind: "patch",
          table: "sets",
          id: existingSetId,
          payload: { firstServer: sideToApi(servingFirst) },
        });
      } else {
        const setId = newRowId();
        currentSetIdRef.current = setId;
        append({
          kind: "create",
          table: "sets",
          id: setId,
          payload: { id: setId, setNumber, firstServer: sideToApi(servingFirst) },
        });
      }
      // set row 確定存在後（上面兩條路都已把 currentSetIdRef 指到這一局），把先發 PUT 上去
      // ——一局一 row（setId unique），PUT 是 idempotent upsert，同一局重按也只會覆寫、不重覆。
      // append 在 firstServer 那筆之後，log 的順序就保證它不會早於 set 建立。
      const setId = currentSetIdRef.current;
      if (setId !== undefined) {
        append({
          kind: "put",
          table: "lineups",
          id: setId,
          payload: lineupSnapshotToApi(effectiveLineup),
        });
      }
    },
    [matchId, append],
  );

  const score = useCallback(
    (side: Side, meta?: Pick<PointRecord, "action" | "touchedBy">) => {
      const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
      if (!pre || pre.serving === null) return;

      // 記分前先擷取「這分開始前」的比分、輪次與 rallyNumber（rallies.homeScore/awayScore/
      // homeRotation/awayRotation 存的都是開分前的值）。之後才跑 reducer 加分/輪轉，
      // 才不會把加完分、轉完位的值當成 before。
      const rallyNumber = pre.history.length + 1;
      const homeScoreBefore = pre.ourScore;
      const awayScoreBefore = pre.opponentScore;
      const homeRotationBefore = pre.ourRotation;
      const awayRotationBefore = pre.opponentRotation;
      const point: PointRecord = { side, wasSideOut: side !== pre.serving, ...meta };

      const setId = currentSetIdRef.current;
      if (setId === undefined) return; // 理論上 start 一定先跑過；防呆

      // 這一分的 rally id 現在由前端當場鑄出來，不必等 POST 回應。有了它，下面兩件事才能
      // 同步做完：undo 快照直接記住「要刪哪一筆」，event 也能立刻掛到這個 rallyId 底下。
      const rallyId = newRowId();

      // 0) 先存一份「記這分之前」的快照，讓之後「復原」能整包退回這一球（issue #41）。
      useScoreSheet.getState().snapshotForUndo(matchId, { table: "rallies", id: rallyId });

      // 1) 本地即時更新（畫面零延遲）
      useScoreSheet.getState().scorePoint(matchId, side, meta);

      // 2) 背景持久化：一筆 rally；有動作/球員才順帶一筆 event（掛在同一個 rallyId 底下，
      //    log 的順序保證 event 不會早於 rally 送出）。
      append({
        kind: "create",
        table: "rallies",
        id: rallyId,
        parentId: setId,
        payload: {
          id: rallyId,
          ...pointRecordToRally(
            point,
            rallyNumber,
            homeScoreBefore,
            awayScoreBefore,
            homeRotationBefore,
            awayRotationBefore,
          ),
        },
      });
      const newEvent = pointRecordToEvent(point, 1);
      if (newEvent) {
        const eventId = newRowId();
        append({
          kind: "create",
          table: "events",
          id: eventId,
          parentId: rallyId,
          payload: { id: eventId, ...newEvent },
        });
      }
    },
    [matchId, append],
  );

  // 復原最近一個動作（issue #41）：一顆按鈕、一次退一個動作（得分 / 一般換人 / 手動 libero），
  // 連按就一路往回。做法是先偷看堆疊最上面那筆在後端建了哪一筆（backendRef），本地整包還原後，
  // 再 append 一筆對應的 delete。
  //
  // 這裡就是 #230 消失的地方：以前要用字串 switch 判斷三疊 id ref 該 pop 哪一疊，而「pop 到的
  // 剛好是對的那筆」只是因為佇列順序碰巧成立。現在快照直接帶著 { table, id }，刪誰是資料、
  // 不是推論；而 delete 排在對應 create 之後，是 write log 的序列化本來就保證的性質。
  const undo = useCallback(() => {
    const stack = useScoreSheet.getState().undoStacksByMatch[matchId];
    if (!stack || stack.length === 0) return;
    const top = stack[stack.length - 1];
    useScoreSheet.getState().undoLast(matchId);

    // backendRef === null（手動 libero 上/下場）：純本地狀態，undoLast 已還原畫面，後端沒東西要刪。
    // rally 底下的 event 靠 FK cascade 一起刪掉，不用自己再 append 一筆。
    if (top.backendRef) {
      const { table, id } = top.backendRef;
      // 先試著「還沒送出就直接作廢」（#64 PR3）：離線時記一分再馬上復原，本來會在佇列裡
      // 留下 create + delete 兩筆白跑；更糟的是 create 若失敗，delete 會打到不存在的 row。
      // cancelPending 回 false 才代表那筆已經送出去了，這時才需要真的 append 一筆 delete。
      if (!logRef.current?.cancelPending(table, id)) {
        append({ kind: "delete", table, id });
      }
    }
  }, [matchId, append]);

  const goNextSet = useCallback(() => {
    const pre = useScoreSheet.getState().recordingsByMatch[matchId]?.currentSet;
    const newSetNumber = (pre?.setNumber ?? 1) + 1;
    useScoreSheet.getState().nextSet(matchId);
    // #63 修法：新的一局不再「留空等 start 才建 row」，而是按下一局的當下就先 POST 一筆
    // firstServer=null 的空 set row（教練還沒選先發方，先寫 null，選好後 start() 再 PATCH
    // 補上）。這樣「使用者已經進到的每一局」都保證有對應 DB row，reload 時最後一局就是
    // 這筆空 row，會正確重建成「這局由誰先發球？」，不會退回顯示上一局。
    // append 進 log 而非直接發請求，是為了排在剛結束那局最後幾筆記分/換人寫入之後，維持順序。
    //
    // 記帳 ref 現在是同步就位的：id 前端自己鑄，不用等回應。舊碼在這裡有一段「先把 ref 設回
    // undefined，POST 失敗就停在 undefined，讓 start() 退回開新局」的保護；現在拿掉了，因為
    // id 已經鑄好、ref 直接指向新的一局。差別在寫入失敗時：舊碼會另起一局（等於放棄那筆），
    // 新碼保留同一個 id ——這正是之後重送要的性質（同 id 重送，PR3 的冪等寫入會吃掉重複）。
    const newSetId = newRowId();
    currentSetIdRef.current = newSetId;
    append({
      kind: "create",
      table: "sets",
      id: newSetId,
      payload: { id: newSetId, setNumber: newSetNumber, firstServer: null },
    });
  }, [matchId, append]);

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

      const setId = currentSetIdRef.current;
      if (setId === undefined) return; // 理論上 start 一定先跑過；防呆
      const substitutionId = newRowId();

      // 0) 先存一份「這次換人之前」的快照，讓「復原」能單獨退掉這個換人動作（issue #41）。
      useScoreSheet
        .getState()
        .snapshotForUndo(matchId, { table: "substitutions", id: substitutionId });

      // 1) 本地即時更新（畫面零延遲）
      useScoreSheet.getState().recordRegularSub(matchId, outPlayerId, inPlayerId);

      // 2) 背景持久化：記在目前這一局底下。
      append({
        kind: "create",
        table: "substitutions",
        id: substitutionId,
        parentId: setId,
        payload: {
          id: substitutionId,
          ...regularSubToApi({ outPlayerId, inPlayerId }, homeScore, awayScore),
        },
      });
    },
    [matchId, append],
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

      const setId = currentSetIdRef.current;
      if (setId === undefined) return; // 理論上 start 一定先跑過；防呆
      const timeoutId = newRowId();

      // 0) 先存一份「叫這次暫停之前」的快照，讓「復原」能單獨退掉這個暫停動作（issue #41）。
      useScoreSheet.getState().snapshotForUndo(matchId, { table: "timeouts", id: timeoutId });

      // 1) 本地即時更新（畫面零延遲）
      useScoreSheet.getState().recordTimeout(matchId, side);

      // 2) 背景持久化：記在目前這一局底下。
      append({
        kind: "create",
        table: "timeouts",
        id: timeoutId,
        parentId: setId,
        payload: { id: timeoutId, ...timeoutToApi(side, homeScore, awayScore) },
      });
    },
    [matchId, append],
  );

  // retryWrites 給指示器當「點一下馬上重試」用。包成 useCallback 是為了讓它能安穩地當
  // 子元件的 prop（每次 render 都換一個新函式會讓 memo 化的子元件白白重畫）。
  const retryWrites = useCallback(() => {
    logRef.current?.retry();
  }, []);

  return {
    isHydrating,
    start,
    score,
    undo,
    goNextSet,
    substitute,
    callTimeout,
    pendingWrites,
    retryWrites,
  };
}
