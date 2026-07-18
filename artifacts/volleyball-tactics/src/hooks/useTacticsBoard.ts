import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  TacticsBoardData,
  RotationTactics,
  DefenseRange,
  Marker,
  SituationTag,
  SavedTacticData,
} from "../types/tacticsBoard";
import { TacticScene } from "../types/courtSnapshot";
import { parseSavedTactic } from "../lib/courtSnapshot";
import { useRotationTable } from "./useRotationTable";

export type ToolType =
  | "select"
  | "arrow"
  | "dashed"
  | "attack"
  | "text"
  | "volleyball"
  | "circle"
  | "ellipse"
  | "fan";

const emptyTacticsByRotation: RotationTactics[] = Array(6)
  .fill(null)
  .map(() => ({ tacticPositions: [], markers: [], defenseRanges: [] }));

// 一場比賽的戰術板資料（issue #119 用 matchId 當 key 分片存放的單位）。TacticsBoardData 的
// 形狀（tacticsByRotation/labelToggles/projectSituation/activeProjectId）剛好就是「一場一份」
// 要存的東西，直接重用當分片型別。
const emptyTactics = (): TacticsBoardData => ({
  tacticsByRotation: emptyTacticsByRotation,
  labelToggles: { zone: false },
  projectSituation: "基礎輪轉",
  activeProjectId: null,
});

// 讀「某一場目前在第幾輪」——輪轉表是站位的真相來源，currentRotation 現在也存在它的
// per-match 分片裡（issue #119）。戰術板的每個動作都要知道「現在在編哪一輪」，所以統一
// 從輪轉表拿；拿不到（那場還沒任何資料）就當第 0 輪。
const currentRotationOf = (matchId: string): number =>
  useRotationTable.getState().dataByMatch[matchId]?.currentRotation ?? 0;

interface TacticsBoardStore {
  // ── per-match 分片（issue #119）──
  // 戰術本身的資料一場一份，用 matchId 當 key。以前戰術庫是全域單例：A 場的 activeProjectId
  // 會殘留到 B 場，切場後按「儲存」還會覆寫別場的存檔（症狀 C）。分片後每場各讀自己的 key，
  // 跨場覆寫從根本不可能。刻意不用 persist（見檔尾說明）。
  dataByMatch: Record<string, TacticsBoardData>;

  // ── 全域、暫時性的畫面狀態（不隨 match 走、也本來就不持久化）──
  // 一次只會看到一塊戰術板，這些「目前選什麼工具、在不在布置模式、undo 歷史」重整頁面
  // 就該回預設值，留在全域最單純。（拆分前它們也不在 persist 的 partialize 名單裡。）
  activeTool: ToolType;
  selectedObjectId: string | null;
  isLayoutMode: boolean;
  courtView: "rotation" | "tactics";
  // ── 唯讀檢視已存戰術用的暫時狀態（issue #154 PR B）──
  // 戰術板單向化後，「載入已存戰術」不再把資料寫回輪轉表/戰術分片，而是純粹「看一張凍結的
  // 照片」。viewingScene 就是當下正在看的那一景（一張 CourtSnapshot + 畫在上面的 markers/
  // defenseRanges）；null 代表現在沒在看已存戰術（在看輪轉/即時布置）。它是全域、暫時性的
  // 畫面狀態，不隨 match 分片、也不持久化——跟 history/isLayoutMode 同一類。
  viewingScene: TacticScene | null;
  // undo/redo 只管戰術板自己畫的東西（畫筆、防守範圍、戰術視圖自由站位），不管輪轉表的
  // 站位。歷史堆疊是「當前正在編的那一輪」的快照，切輪次/切場都會重置（見 syncRotationChange）。
  history: RotationTactics[];
  historyIndex: number;

  // 全域畫面狀態的 setter（不需要 matchId）
  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setLayoutMode: (value: boolean) => void;
  setCourtView: (v: "rotation" | "tactics") => void;
  // 進入某一場的戰術板時，把全域、暫時性的畫面狀態歸零（issue #119）。因為 history/isLayoutMode/
  // courtView 是全域共用、但 tacticsByRotation 是 per-match：若不歸零，從 A 場帶著 undo 歷史切到
  // B 場再按 Ctrl+Z，會把 A 的快照還原進 B 的分片。TacticsBoard 頁在 matchId 變動時呼叫一次。
  resetBoardView: () => void;

  // 以下動作都收 matchId 第一參數，指定要動哪一場的分片。
  setProjectSituation: (matchId: string, situation: SituationTag) => void;
  toggleLabel: (matchId: string, key: keyof TacticsBoardData["labelToggles"]) => void;

  pushHistory: (matchId: string) => void;
  undo: (matchId: string) => void;
  redo: (matchId: string) => void;

  // 輪次切換時的跨 store 同步（取代舊的全域 subscribe）：切輪次後重置這塊戰術板的 undo 歷史、
  // 取消選取、跳回輪轉視圖。改由 RotationSwitcher 在呼叫 setCurrentRotation 後「明確」呼叫一次，
  // 而不是靠全域 subscribe——因為 currentRotation 現在存在 per-match 分片裡，全域 subscribe
  // 沒辦法乾淨地分辨「是哪一場的輪次變了」。這就是專案偏好的「資料用傳輸的」明確呼叫。
  syncRotationChange: (matchId: string) => void;

  // 進入戰術布置的唯一入口：把輪轉表「當下」的即時站位複製一份到 tacticPositions，
  // 當作這次編輯的起點。之後不管在戰術布置裡怎麼拖，都只改這份複製出來的快照，
  // 不會寫回輪轉表——兩邊從這一刻起完全獨立。
  enterTacticsLayout: (matchId: string) => void;

  // 戰術布置模式下的自由放置：直接用正規化座標（0~1 範圍），只影響目前輪次的快照。
  placePlayerFree: (matchId: string, playerId: string, x: number, y: number) => void;
  addDefenseRange: (matchId: string, range: Omit<DefenseRange, "id">) => void;
  updateDefenseRange: (matchId: string, id: string, updates: Partial<DefenseRange>) => void;
  removeDefenseRange: (matchId: string, id: string) => void;
  // options.skipHistory：畫線類工具（arrow/dashed/attack）用「拖曳」畫，pointerDown 只是放下
  // 起點、終點要靠 pointerMove 一路更新到放開為止。若在 pointerDown 就 pushHistory，記進歷史的
  // 只會是「起點＝終點」的殘缺線，完成後的終點永遠不進歷史——那正是 #147 殘留的病灶（Ctrl+Z
  // 會把上一條線退成只剩線頭）。所以拖曳畫線時傳 skipHistory:true，改由 Court 在 pointerUp
  // 線畫完後才呼叫一次 pushHistory，記下完整的線。點擊型標記（text/volleyball）不傳，維持原本
  // 「新增即記歷史」的行為。
  addMarker: (
    matchId: string,
    marker: Omit<Marker, "id">,
    options?: { skipHistory?: boolean },
  ) => void;
  updateMarker: (matchId: string, id: string, updates: Partial<Marker>) => void;
  removeMarker: (matchId: string, id: string) => void;
  clearMarkers: (matchId: string) => void;
  resetCurrentRotationTactics: (matchId: string) => void;
  removePlayerFromTacticView: (matchId: string, playerId: string) => void;

  setActiveProjectId: (matchId: string, id: string | null) => void;
  // 載入已存戰術＝唯讀檢視（issue #154 PR B）：把存檔（可能是舊格式，也可能是未來的 v2）
  // 用 parseSavedTactic 轉成單景快照塞進 viewingScene，畫面切到戰術視圖唯讀顯示。
  // 刻意「不」寫回輪轉表/戰術分片——這正是 #154 那個「載入會覆蓋名單/站位且回不去」的 bug
  // 的門，這裡把它焊死。data 型別是 unknown：實際傳進來的是 API 的 Tactic.data，內容格式
  // 沒有編譯期保證，交給 parseSavedTactic 在執行期用 zod 驗證（見 lib/courtSnapshot.ts）。
  loadProject: (matchId: string, data: unknown, id: string, name: string) => void;
  importState: (matchId: string, data: unknown) => void;
  // 把輪轉表 + 戰術板兩份資料合併成可以存檔/匯出的單一 JSON（跟拆分 store 之前的
  // 格式一樣，這樣資料庫裡舊的已存戰術才能繼續正常讀取）。
  buildSnapshot: (matchId: string) => SavedTacticData;
}

// 在 set() 裡對「某一場的戰術分片」做 immutable 更新的共用小工具（同 useRotationTable）。
function updateMatch(
  state: TacticsBoardStore,
  matchId: string,
  updater: (prev: TacticsBoardData) => TacticsBoardData,
): Pick<TacticsBoardStore, "dataByMatch"> {
  const prev = state.dataByMatch[matchId] ?? emptyTactics();
  return { dataByMatch: { ...state.dataByMatch, [matchId]: updater(prev) } };
}

// 只改「某一場、目前輪次」那一格 RotationTactics 的便捷版：大多數畫筆/站位動作都是這個形狀。
function updateCurrentRotation(
  state: TacticsBoardStore,
  matchId: string,
  updater: (rot: RotationTactics) => RotationTactics,
): Pick<TacticsBoardStore, "dataByMatch"> {
  const r = currentRotationOf(matchId);
  return updateMatch(state, matchId, (m) => {
    const newTactics = [...m.tacticsByRotation];
    newTactics[r] = updater(newTactics[r]);
    return { ...m, tacticsByRotation: newTactics };
  });
}

export const useTacticsBoard = create<TacticsBoardStore>()((set, get) => ({
  dataByMatch: {},

  activeTool: "select",
  selectedObjectId: null,
  isLayoutMode: false,
  courtView: "rotation",
  viewingScene: null,
  history: [],
  historyIndex: -1,

  setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setLayoutMode: (value) =>
    set({ isLayoutMode: value, activeTool: "select", selectedObjectId: null }),
  // 翻回輪轉視圖就代表離開「看已存戰術」的檢視，順手把 viewingScene 清空，避免下次進戰術
  // 視圖時還殘留上一張看過的照片。（切到 tactics 不清，因為即時布置也用 tactics 視圖。）
  setCourtView: (v) =>
    set(v === "rotation" ? { courtView: v, viewingScene: null } : { courtView: v }),
  resetBoardView: () =>
    set({
      history: [],
      historyIndex: -1,
      isLayoutMode: false,
      courtView: "rotation",
      viewingScene: null,
      selectedObjectId: null,
      activeTool: "select",
    }),

  setProjectSituation: (matchId, situation) =>
    set((state) => updateMatch(state, matchId, (m) => ({ ...m, projectSituation: situation }))),

  toggleLabel: (matchId, key) =>
    set((state) =>
      updateMatch(state, matchId, (m) => ({
        ...m,
        labelToggles: { ...m.labelToggles, [key]: !m.labelToggles[key] },
      })),
    ),

  // 把「動作完成後的當前輪次狀態」存進 undo 歷史。關鍵約定（issue #147 的修正）：每個動作
  // 都是「先 set 改狀態、再 pushHistory」，所以 history[historyIndex] 永遠等於畫面現況；undo
  // 只要往回退一格、redo 往前一格就正好差一步。之前是「先 push 再改」，history 存的是動作『前』
  // 的狀態、比現況慢一拍，於是第一次 Ctrl+Z 會一次跳回兩步——那就是 #147。
  pushHistory: (matchId) =>
    set((state) => {
      const r = currentRotationOf(matchId);
      const currentRotState = state.dataByMatch[matchId]?.tacticsByRotation[r];
      if (!currentRotState) return state;
      // 砍掉 redo 分支：如果剛 undo 過又畫了新東西，被退掉的未來就不該還留著。
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(currentRotState)));
      if (newHistory.length > 30) newHistory.shift();
      return { history: newHistory, historyIndex: newHistory.length - 1 };
    }),

  undo: (matchId) =>
    set((state) => {
      if (state.historyIndex <= 0) return state;
      const newIndex = state.historyIndex - 1;
      return {
        historyIndex: newIndex,
        selectedObjectId: null,
        ...updateCurrentRotation(state, matchId, () => state.history[newIndex]),
      };
    }),

  redo: (matchId) =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      return {
        historyIndex: newIndex,
        selectedObjectId: null,
        ...updateCurrentRotation(state, matchId, () => state.history[newIndex]),
      };
    }),

  syncRotationChange: (matchId) =>
    set((state) => {
      const r = currentRotationOf(matchId);
      const tacticsByRotation =
        state.dataByMatch[matchId]?.tacticsByRotation ?? emptyTacticsByRotation;
      return {
        history: [tacticsByRotation[r]],
        historyIndex: 0,
        selectedObjectId: null,
        courtView: "rotation",
      };
    }),

  enterTacticsLayout: (matchId) => {
    const rt = useRotationTable.getState().dataByMatch[matchId];
    const r = rt?.currentRotation ?? 0;
    // 複製（不是參照）目前輪次的即時站位，當作這次布置的起點——之後怎麼編輯
    // 都只碰這份副本，跟輪轉表的即時資料從這一刻起完全脫鉤。
    const snapshot = (rt?.rotations[r].positions ?? []).map((p) => ({ ...p }));
    set((state) => {
      const patch = updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        tacticPositions: snapshot,
      }));
      const newRotState = patch.dataByMatch[matchId].tacticsByRotation[r];
      return {
        ...patch,
        isLayoutMode: true,
        courtView: "tactics",
        // 開始一段新的即時布置＝離開「看已存戰術」的檢視，清掉殘留的照片。
        viewingScene: null,
        activeTool: "select",
        selectedObjectId: null,
        history: [newRotState],
        historyIndex: 0,
      };
    });
  },

  placePlayerFree: (matchId, playerId, x, y) => {
    // 戰術布置是自由畫布，自由球員在這裡跟一般球員一視同仁——只改這張快照的
    // tacticPositions，不檢查「只能站後排」（那是輪轉表的比賽規則），也不寫回 startingLiberoId。
    set((state) =>
      updateCurrentRotation(state, matchId, (rot) => {
        const filtered = rot.tacticPositions.filter((p) => p.playerId !== playerId);
        return { ...rot, tacticPositions: [...filtered, { playerId, x, y }] };
      }),
    );
    get().pushHistory(matchId); // 先改後記：見 pushHistory 的約定說明（#147）。
  },

  addDefenseRange: (matchId, range) => {
    set((state) => ({
      activeTool: "select",
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        defenseRanges: [...rot.defenseRanges, { ...range, id: uuidv4() }],
      })),
    }));
    get().pushHistory(matchId);
  },

  updateDefenseRange: (matchId, id, updates) => {
    set((state) =>
      updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        defenseRanges: rot.defenseRanges.map((dr) => (dr.id === id ? { ...dr, ...updates } : dr)),
      })),
    );
    get().pushHistory(matchId);
  },

  removeDefenseRange: (matchId, id) => {
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        defenseRanges: rot.defenseRanges.filter((dr) => dr.id !== id),
      })),
    }));
    get().pushHistory(matchId);
  },

  addMarker: (matchId, marker, options) => {
    const id = uuidv4();
    set((state) => ({
      selectedObjectId: id,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: [...rot.markers, { ...marker, id }],
      })),
    }));
    // 拖曳畫線時跳過，改在 pointerUp 才記一次完整的線（見型別宣告處的 skipHistory 說明，#147）。
    if (!options?.skipHistory) get().pushHistory(matchId);
  },

  updateMarker: (matchId, id, updates) =>
    set((state) =>
      updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: rot.markers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      })),
    ),

  removeMarker: (matchId, id) => {
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: rot.markers.filter((m) => m.id !== id),
      })),
    }));
    get().pushHistory(matchId);
  },

  clearMarkers: (matchId) => {
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        markers: [],
        defenseRanges: [],
      })),
    }));
    get().pushHistory(matchId);
  },

  resetCurrentRotationTactics: (matchId) => {
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, () => ({
        tacticPositions: [],
        markers: [],
        defenseRanges: [],
      })),
    }));
    get().pushHistory(matchId);
  },

  removePlayerFromTacticView: (matchId, playerId) =>
    set((state) => ({
      selectedObjectId: null,
      ...updateCurrentRotation(state, matchId, (rot) => ({
        ...rot,
        tacticPositions: rot.tacticPositions.filter((p) => p.playerId !== playerId),
      })),
    })),

  setActiveProjectId: (matchId, id) =>
    set((state) => updateMatch(state, matchId, (m) => ({ ...m, activeProjectId: id }))),

  // 載入已存戰術＝唯讀檢視（issue #154 PR B）。data 是 API 回傳的 Tactic.data（unknown）。
  // 關鍵改動：以前這裡會呼叫 useRotationTable.loadRotationData 把 roster + 六輪站位整包覆蓋回
  // 輪轉表（破壞性反向寫回，就是 #154 的病根）——現在完全不碰輪轉表，只把存檔轉成一張凍結的
  // 快照放進 viewingScene，畫面切到戰術視圖唯讀顯示。parseSavedTactic 會用 zod 驗證並把舊格式
  // 轉成單景 v2（見 lib/courtSnapshot.ts）；解析失敗會 throw，交給呼叫端 try/catch 提示。
  loadProject: (matchId, data, id, name) => {
    const scene = parseSavedTactic(data).scenes[0] ?? null;
    set((state) => ({
      // 檢視是唯讀，沒有 undo 需求，歷史清空即可。
      history: [],
      historyIndex: -1,
      selectedObjectId: null,
      isLayoutMode: false,
      courtView: "tactics",
      viewingScene: scene,
      // 只更新顯示用的欄位（名稱、正在看哪筆的 id），不動 tacticsByRotation/輪轉表站位。
      ...updateMatch(state, matchId, (m) => ({
        ...m,
        projectSituation: name,
        activeProjectId: id,
      })),
    }));
  },

  // 匯入 JSON 也是唯讀檢視，跟 loadProject 同一條路，只是沒有 server id/name（匯入的檔案
  // 不屬於任何一筆已存戰術），所以不設 activeProjectId。
  importState: (matchId, data) => {
    const scene = parseSavedTactic(data).scenes[0] ?? null;
    set({
      history: [],
      historyIndex: -1,
      selectedObjectId: null,
      isLayoutMode: false,
      courtView: "tactics",
      viewingScene: scene,
    });
  },

  buildSnapshot: (matchId) => {
    const rt = useRotationTable.getState();
    const rotationData = rt.dataByMatch[matchId] ?? {
      roster: [],
      currentRotation: 0,
      rotations: [],
      startingLiberoId: null,
    };
    const tb = get().dataByMatch[matchId] ?? emptyTactics();
    // 幽靈站位過濾（issue #119 症狀 B）：tacticPositions 裡可能殘留「已不在名單」的球員
    // （被刪掉、或根本是別場遺留的 id），存檔前只保留還在這場名單裡的，避免把幽靈站位
    // 靜靜寫進 DB。roster 是這場的真相來源，用它的 id 集合當白名單。
    const validIds = new Set(rotationData.roster.map((p) => p.id));
    return {
      roster: rotationData.roster,
      currentRotation: rotationData.currentRotation,
      circleLabel: rt.circleLabel,
      labelToggles: tb.labelToggles,
      rotations: rotationData.rotations.map((r, i) => ({
        positions: r.positions,
        liberoReplacement: r.liberoReplacement,
        tacticPositions: (tb.tacticsByRotation[i]?.tacticPositions ?? []).filter((p) =>
          validIds.has(p.playerId),
        ),
        markers: tb.tacticsByRotation[i]?.markers ?? [],
        defenseRanges: tb.tacticsByRotation[i]?.defenseRanges ?? [],
      })),
    };
  },
}));
