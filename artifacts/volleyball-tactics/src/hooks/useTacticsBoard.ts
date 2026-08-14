import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { DefenseRange, Marker } from "../types/tacticsBoard";
import {
  CourtSnapshot,
  SnapshotPlayer,
  TacticScene,
  SavedTacticDataV2,
} from "../types/courtSnapshot";
import { parseSavedTactic } from "../lib/courtSnapshot";

// ── issue #154 PR C：戰術白板 session 化重構 ──
//
// 這個 store 過去的形狀（dataByMatch[matchId].tacticsByRotation[6]、直接 import
// useRotationTable 反向讀站位）是 #154 一系列 bug 的結構根源：戰術板明明是「消費者」，
// 卻握著能寫回輪轉表的資料與參照。PR C 把它整個換成「用完即丟的單景 session」：
//
//   1. 白板一次只編一張「快照」（CourtSnapshot）。快照裡的球員是**反正規化**的
//      SnapshotPlayer——姓名/背號/位置在擷取當下就凍進去了，沒有 playerId 外鍵、也沒有
//      對輪轉表 roster 的任何參照。既然型別裡「根本沒有能寫回去的東西」，單向性就不再靠
//      「小心不要寫回」的自律，而是架構保證（capture by value, not by reference）。
//   2. 擷取這件事發生在 **UI 邊界**（TacticsBoardPanel 的按鈕 handler 自己讀輪轉表 state →
//      呼叫純函式 captureFromRotation → 把純值 snapshot 傳進 startSession）。所以這個 store
//      **完全不 import useRotationTable / useScoreSheet**（並用 ESLint no-restricted-imports
//      把這條規則焊進 CI，見 eslint.config.mjs）。
//   3. session 用完即丟：存檔 / 取消 / 切場都直接把 session 設回 null，沒有常駐分片，也就
//      沒有「A 場資料殘留污染 B 場」的可能（#119 那組症狀在架構上消失）。
//
// 唯讀檢視已存戰術（PR B 的 viewingScene）保留：點清單只是「看一張凍結的照片」，按「編輯」
// 才用那張 scene 開一個可改的 session（enterEditFromViewing）。

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

// 一段可 undo 的「畫面內容」＝場上球員（含座標）＋畫筆＋防守範圍。undo/redo 的堆疊就是
// 一連串這種 content 的深拷貝（見 pushHistory 的 #147 說明）。
interface SceneContent {
  players: SnapshotPlayer[];
  markers: Marker[];
  defenseRanges: DefenseRange[];
}

// 一次場景編輯要不要進 undo 歷史。刻意做成必填的字面量聯集而不是選填 boolean：
// #361 那四個 undo bug 的成因就是「何時記歷史」散在九支動作裡各自硬寫、然後各自漂走，
// 所以這裡讓型別強迫每個動作明講自己的政策，漏寫會編譯錯誤。
//   "record" ＝ 動作完成即記一格
//   "defer"  ＝ 這次先不記，由呼叫端在手勢結束（pointerUp）時自己補一次 pushHistory()
type HistoryPolicy = "record" | "defer";

// 正在編輯的白板 session。單景（PO 拍板）：只持有一張 snapshot，不做 scenes[] + 輪次切換。
export interface WhiteboardSession {
  // 反正規化的當前畫面。snapshot.players 的座標會隨拖曳更新，但每個 player 的身分
  //（name/number/role/sourcePlayerId）從擷取那一刻起就凍住不動。
  snapshot: CourtSnapshot;
  markers: Marker[];
  defenseRanges: DefenseRange[];
  name: string; // 戰術名稱（取代舊的 per-match projectSituation）
  serverId: string | null; // 正在覆寫哪一筆已存戰術；null = 新建草稿（取代舊的 activeProjectId）
  // undo/redo 歷史：sceneContent 的堆疊，index 指向「畫面現況那一格」（#147 先改後記約定）。
  history: SceneContent[];
  historyIndex: number;
  // 這個 session 目前是「佈陣模式」（mode D：只能拖球員上下場、調位置，畫筆/防守範圍工具
  // 都還沒開放）還是「編輯模式」（mode C：完整工具軌）——issue #177。
  //
  // 為什麼這裡要存一個顯式旗標，而不是像 #160 當初反對的那樣，另外推導一個等價的東西？
  // #160 反對的是「把可以從既有欄位算出來的東西，多存一份 enum/flag」——那種重複會有兩份
  // 真相對不上的風險。但 D／C 這兩態不屬於這種情況：兩者的 session 形狀完全一樣（同一張
  // snapshot、同一份 history），畫面上只差在「工具軌收起來、右欄改放球員名單、球場右上角
  // 那顆鈕文案是『確定』」——這件事在其他任何欄位裡都找不到對應的推導依據（不像
  // `session !== null` 天生對應「有沒有在編」，D/C 沒有這種天然可推導的信號）。硬要推導，
  // 只會逼自己發明一個假的判準（例如「history.length === 1 就是佈陣模式」——但編輯到一半
  // undo 回第 0 格也會變成 history.length === 1，會把使用者誤判回佈陣模式）。所以這裡選擇
  // 誠實地多存一個位元，讓「現在是 D 還是 C」永遠只有一個地方定義。
  arranging: boolean;
}

// 深拷貝小工具：undo 歷史每一格都必須是「當下的獨立快照」，不能跟 session 內的陣列共用
// 參照，否則之後改 session 會連歷史一起改掉。用 JSON round-trip 跟 store 其他地方一致
//（這些資料都是純 plain object，沒有函式/Date/循環參照，JSON 拷貝安全且夠快）。
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const contentOf = (s: WhiteboardSession): SceneContent =>
  clone({ players: s.snapshot.players, markers: s.markers, defenseRanges: s.defenseRanges });

// session 不存在時 buildSavedTactic 的保底空快照（正常流程存檔一定在 session 內，這只是
// 讓回傳型別永遠合法、不用回傳 null）。
const blankSnapshot = (): CourtSnapshot => ({
  source: "blank",
  matchId: null,
  rotation: 0,
  capturedAt: new Date().toISOString(),
  players: [],
});

interface TacticsBoardStore {
  // ── 可編輯的白板 session（用完即丟；null = 目前沒在編）──
  session: WhiteboardSession | null;

  // ── 唯讀檢視已存戰術（issue #154 PR B）──
  // viewingScene 是當下正在看的那張凍結照片；viewingTacticId/Name 記住「這張是哪一筆已存
  // 戰術」，好讓「編輯」按鈕能把它升級成可改的 session（帶回原本的 serverId/name）。
  viewingScene: TacticScene | null;
  viewingTacticId: string | null;
  viewingTacticName: string;

  // ── 全域、暫時性的畫面狀態（重整頁面就回預設，不持久化、不隨 match 分片）──
  activeTool: ToolType;
  selectedObjectId: string | null;
  courtView: "rotation" | "tactics";
  // 「新增戰術」中央浮層（issue #177）開關——戰術板頁按左欄或瀏覽面板的「+ 新增戰術」時
  // 開啟，選了起點（或按取消）就關閉。放在這顆 store 而不是頁面的 local state，是因為
  // 「開這個浮層」的觸發點（NavRail 的左欄子清單、TacticsBrowsePanel 的按鈕）跟「畫這個
  // 浮層」的地方（TacticsBoard.tsx 中央欄）分屬不同元件，用全域旗標串起來最直接——跟
  // courtView/activeTool 這些既有的全域暫時 UI state 同一種性質，不需要另外開一顆 context。
  newTacticOpen: boolean;

  // 全域畫面狀態的 setter
  setActiveTool: (tool: ToolType) => void;
  setSelectedObjectId: (id: string | null) => void;
  setCourtView: (v: "rotation" | "tactics") => void;
  openNewTactic: () => void;
  closeNewTactic: () => void;
  // 切場（換 matchId）時把所有暫時狀態歸零：丟掉 session、清掉唯讀檢視、跳回輪轉視圖。
  // matchId 是選填的「目前要顯示哪一場」——傳了它，resetBoardView 才有辦法分辨「跨場切換」
  // 跟「同一場內部的一次交棒」（見下面實作的說明）。
  resetBoardView: (matchId?: string | null) => void;

  // ── session 生命週期 ──
  // 進入白板的唯一入口：吃一張「已經在外面擷取好的」純值快照（capture by value）。opts 給
  // 「編輯已存戰術」時帶入原本的畫筆/防守範圍/名稱/serverId。
  startSession: (
    snapshot: CourtSnapshot,
    opts?: {
      markers?: Marker[];
      defenseRanges?: DefenseRange[];
      name?: string;
      serverId?: string | null;
      // 開啟時是不是先進佈陣模式（mode D）。預設 false＝直接進編輯模式（mode C），這樣
      // enterEditFromViewing（面板「編輯」按鈕）跟計分頁 C3 交棒進來的既有呼叫端完全不用
      // 改，行為維持原樣——只有 issue #177 新增的「+ 新增戰術」流程會明確傳 true。
      arranging?: boolean;
    },
  ) => void;
  discardSession: () => void;
  // 把目前唯讀檢視中的那張 scene 升級成可編輯 session（面板「編輯」按鈕）。
  enterEditFromViewing: () => void;
  setSessionName: (name: string) => void;
  // 佈陣模式（D）按「確定」＝把 arranging 收回 false，進入編輯模式（C）。只動這一個欄位，
  // history/historyIndex 等其餘欄位原封不動——佈陣期間拖上場的球員本來就已經記進歷史了，
  // 「確定」單純是切換右欄/工具軌要顯示什麼，不是一個新的編輯動作。沒有 session 時 no-op。
  confirmArrangement: () => void;

  // ── session 內的編輯動作（都作用在當前 session；沒有 session 時是 no-op）──
  // 球員以 sourcePlayerId 當 key：可編輯 session 的球員來源現在有兩種——從名單擷取的
  // （真實 roster id）跟 issue #372 決策②新增的、從位置調色盤拖入的「匿名角色」（合成
  // "anon-<role>-<uuid>" id，見 types/courtSnapshot.ts 的 sourcePlayerId 說明、
  // Court.tsx 的 handleDrop）。兩種來源都保證 sourcePlayerId 非 null，拿來當穩定識別一樣
  // 安全（null 只會出現在唯讀檢視的舊快照，那條路不會呼叫這些動作）。
  //
  // #304/#361：以下九支動作全部透過 store 內部的 editSession() 走同一套「何時記 undo 歷史」的
  // 規則（見實作處註解），不再各自硬寫。凡是「一次手勢會連續觸發很多次」的動作（拖曳、畫線）
  // 都改用 options.skipHistory 選擇性跳過，交由呼叫端在手勢結束（pointerUp）時補記一次。
  moveSessionPlayer: (sourcePlayerId: string, x: number, y: number) => void;
  removeSessionPlayer: (sourcePlayerId: string) => void;
  // upsert（從名單拖入新球員／從位置調色盤拖入匿名角色都走這支，見上面的說明）
  placeSessionPlayer: (player: SnapshotPlayer) => void;

  // options.skipHistory：拖曳畫線（arrow/dashed/attack）用 pointerDown 放起點、pointerMove
  // 更新終點、pointerUp 才記一次完整的線。pointerDown 時傳 skipHistory 避免把「起點＝終點」的
  // 殘缺線記進歷史（#147 殘留的病灶）；點擊型標記（text/volleyball）不傳，維持「新增即記歷史」。
  addMarker: (marker: Omit<Marker, "id">, options?: { skipHistory?: boolean }) => void;
  // #361-1/#361-2 修法：updateMarker 預設「改一次記一格」——文字改標籤、或呼叫端沒特別說要跳過
  // 的更新，都該進歷史。真正「一次手勢會連打很多次」的呼叫端（拖曳中的 Markers.tsx、畫線中的
  // Court.tsx）自己傳 skipHistory:true 跳過，並在手勢結束時補一次 pushHistory()。
  updateMarker: (id: string, updates: Partial<Marker>, options?: { skipHistory?: boolean }) => void;
  // addDefenseRange：一律記歷史（新增防守範圍是單一動作，沒有拖曳中間態）。
  addDefenseRange: (range: Omit<DefenseRange, "id">) => void;
  // #361-3 修法：updateDefenseRange 預設也是「改一次記一格」，但它的唯一呼叫端
  // （DefenseRange.tsx 拖曳）每個 pointerMove frame 都會呼叫一次，所以必須明確傳
  // skipHistory:true，否則拖一下就會把 30 格的歷史上限灌爆、undo 變成只能退半步。
  updateDefenseRange: (
    id: string,
    updates: Partial<DefenseRange>,
    options?: { skipHistory?: boolean },
  ) => void;
  // #304 開放性問題 2 的答案：add/update 這兩組不合併——見 removeSceneObject 的註解說明
  // 「為什麼刪除可以合併、新增/更新不合併」。
  clearDrawings: () => void; // 清掉所有畫筆＋防守範圍（保留球員站位）
  // #361-4 修法：刪掉場上一個「畫出來的物件」——畫筆標記或防守範圍。取代舊的
  // removeMarker + removeDefenseRange 兩支各自 pushHistory 的動作（見實作處註解說明為何合併）。
  removeSceneObject: (id: string) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // ── 唯讀檢視入口（走 parseSavedTactic：zod 驗證 + 舊檔轉接）──
  loadProject: (data: unknown, id: string, name: string) => void;
  importState: (data: unknown) => void;

  // 把當前 session 組成可存檔/匯出的 v2 格式（單景）。反正規化後 legacy 格式已無法忠實
  // 重建，所以一律寫 v2（issue #154 PR C 把原設計的 PR D「寫 v2」併進來）。
  buildSavedTactic: () => SavedTacticDataV2;
}

// 「這個 session 有沒有未儲存的內容」的共用判準，跟提示文案放在一起。
//
// 為什麼要抽出來：這條判斷式原本在 TacticsBoardPanel、RotationSwitcher、TacticsRailMenu
// 三個元件各寫一份一模一樣的 `session !== null && session.history.length > 1`。這是典型的
// Duplicated Code——「什麼叫做動過還沒存」是一條會變的業務規則（例如哪天改成比對內容而不是
// 看歷史長度），散成三份的話改一處就會有兩處對不上，而且對不上的症狀是「有時候會問你要不要
// 捨棄、有時候不問」這種很難查的 bug。收斂成一支函式，規則就只有一個家。
//
// 為什麼 history.length > 1 就等於「動過」：history 是 undo/redo 的堆疊，session 一開始就會
// 押入一格「初始狀態」，所以長度 1＝什麼都還沒做，>1＝至少發生過一次會進歷史的編輯。
export function isSessionDirty(session: WhiteboardSession | null): boolean {
  return session !== null && session.history.length > 1;
}

// 捨棄未存內容前的確認文案。跟 isSessionDirty 成對使用，放在一起才不會有人改了判準卻忘了
// 文案（或反之）。
export const DISCARD_MSG = "未儲存的戰術內容將會捨棄，確定嗎？";

export const useTacticsBoard = create<TacticsBoardStore>()((set, get) => {
  // #304/#361：九支場景編輯動作（add/update/remove × marker/defenseRange/sessionPlayer）過去
  // 各自把「這個動作完不完要不要 pushHistory()」寫成一行 if，久了規則就在九個地方各自漂走——
  // #361 回報的四個 undo bug，追到根都是某一支動作漏記或搶記歷史。這支私有 helper 把規則收攏
  // 成一個地方：呼叫端只需要描述「怎麼改」跟「這次算不算一步」，其餘（要不要 set、有沒有真的
  // 動到、什麼時候記歷史）全部由這裡決定，新增第十支動作也不可能再悄悄選錯政策。
  const editSession = (
    // mutate 吃目前的 session、回傳「要覆蓋上去的欄位」；回傳 null 表示這次呼叫其實沒有
    // 造成任何實質改變（例如要更新的 id 根本不存在），這種情況既不該動 state、也不該記歷史。
    mutate: (s: WhiteboardSession) => Partial<WhiteboardSession> | null,
    opts: { history: HistoryPolicy; select?: string | null },
  ) => {
    // changed 用來在 set() 的 updater 跑完之後，告訴外層「這次要不要 pushHistory()」。
    // 這裡看似是在讀一個「還沒被非同步賦值」的變數，但其實安全：zustand 的 set() 是同步執行
    // updater 的（不像 React 的 setState 可能被排程延後），所以 set() 呼叫一結束、下面立刻讀
    // changed 時，updater 內的賦值早就跑完了。
    let changed = false;
    set((state) => {
      const s = state.session;
      if (!s) return state; // 沒有 session 可編，維持原樣、changed 保持 false
      const patch = mutate(s);
      if (patch === null) return state; // mutate 說「沒改到東西」，同樣維持原樣
      changed = true;
      return {
        session: { ...s, ...patch },
        // 只有呼叫端明確傳了 select 這個 key 才動 selectedObjectId——不能用
        // `opts.select ?? state.selectedObjectId` 這種寫法，因為 select: null 是「清空選取」
        // 的合法意圖，跟「呼叫端根本沒提到選取」必須分得開，否則會出現「清空」被誤判成
        // 「不動」的 bug。
        ...("select" in opts ? { selectedObjectId: opts.select } : {}),
      };
    });
    // pushHistory 必須在 set() 之後才呼叫（#147「先改後記」的約定：history 記的必須是「改完
    // 之後」的畫面，先記再改會讓 undo 永遠慢一拍）。這裡把它收在 editSession 裡統一呼叫，
    // 就是整支 helper 存在的意義——以後不管加幾支場景編輯動作，都不可能再各自決定要不要記、
    // 或忘記把 pushHistory() 擺在 set() 後面。
    if (changed && opts.history === "record") get().pushHistory();
  };

  return {
    session: null,
    viewingScene: null,
    viewingTacticId: null,
    viewingTacticName: "",

    activeTool: "select",
    selectedObjectId: null,
    courtView: "rotation",
    newTacticOpen: false,

    openNewTactic: () => set({ newTacticOpen: true }),
    closeNewTactic: () => set({ newTacticOpen: false }),

    setActiveTool: (tool) => set({ activeTool: tool, selectedObjectId: null }),
    setSelectedObjectId: (id) => set({ selectedObjectId: id }),
    // 翻回輪轉視圖＝離開「看已存戰術」，順手清掉檢視狀態，避免下次進戰術視圖殘留上一張照片。
    //（切到 tactics 不清，因為即時 session 也用 tactics 視圖。）
    setCourtView: (v) =>
      set(
        v === "rotation"
          ? { courtView: v, viewingScene: null, viewingTacticId: null, viewingTacticName: "" }
          : { courtView: v },
      ),
    // #119 加這道 reset 是為了防「跨場殘留」：全域共用的 undo 歷史/session 如果不歸零，
    // 從 A 場帶著歷史切到 B 場，再按 Ctrl+Z 會把 A 的快照還原進 B。但病根是「跨場」，不是
    // 「進頁面就該清空」——原本的寫法沒有分辨這兩種情況，所以連「同一場，但由計分頁先
    // startSession() 再導航過來」這種正常的交棒，也會被無條件清光（issue #160 C3 踩到）。
    //
    // 改法：多收一個 matchId 參數，跟目前 session 的 snapshot.matchId 比對。相符（且不是
    // null/undefined，代表雙方都明確知道自己是哪一場）就判定為「同一場」，只保留 session、
    // 其他暫時性畫面狀態（viewingScene、選取物件、工具、視圖）照樣重置成剛進頁面的預設值；
    // 不符就退回舊行為，session 也一起清掉。嚴格來說這比原本的寫法更正確：舊寫法連「同一場
    // 重新整理頁面」都會把使用者交棒進來、還沒存檔的東西清掉。
    resetBoardView: (matchId) =>
      set((state) => {
        const keepSession =
          matchId != null && state.session != null && state.session.snapshot.matchId === matchId;
        return {
          session: keepSession ? state.session : null,
          viewingScene: null,
          viewingTacticId: null,
          viewingTacticName: "",
          // courtView 必須跟著 session 一起保留，不能無條件打回 "rotation"。原因是畫面上
          // 「看得到 session」這件事同時取決於兩個狀態：Court.tsx 只有在
          // `courtView === "tactics" && session` 時才畫 session 的球員與筆跡。startSession()
          // 會把 courtView 設成 "tactics"，若這裡又把它重設回 "rotation"，就會出現
          // 「session 明明還在、畫面卻空白」的詭異狀態——資料沒掉，但使用者看不到。
          // 兩個狀態要嘛一起留、要嘛一起清，不能各走各的。
          courtView: keepSession ? state.courtView : "rotation",
          selectedObjectId: null,
          activeTool: "select",
          // issue #177：「新增戰術」中央浮層的開關也是全域暫時 UI 狀態，一起歸零。否則使用者
          // 在 A 場開了浮層、沒選就切走，這個旗標會留在 store，下次一 mount 戰術板（這個 reset
          // 就是在 mount／換場時跑的）浮層就會無來由地自己冒出來。跟上面那些 selectedObjectId／
          // activeTool 同一種性質，不受 keepSession 影響——它跟「是不是同一場」無關，永遠該關。
          newTacticOpen: false,
        };
      }),

    startSession: (snapshot, opts) => {
      // 深拷貝入值：session 拿到的是跟外面來源完全脫鉤的獨立資料，之後怎麼編都碰不到輪轉表。
      const players = snapshot.players.map((p) => ({ ...p }));
      const markers = (opts?.markers ?? []).map((m) => ({ ...m }));
      const defenseRanges = (opts?.defenseRanges ?? []).map((d) => ({ ...d }));
      const session: WhiteboardSession = {
        snapshot: { ...snapshot, players },
        markers,
        defenseRanges,
        name: opts?.name ?? "",
        serverId: opts?.serverId ?? null,
        // 種入「起始畫面」當歷史第 0 格：任何後續編輯都會 push 成第 1 格以後，於是
        //「history.length > 1」剛好等於「使用者動過東西＝有未存內容」（見面板的 dirty 判斷）。
        history: [
          { players: clone(players), markers: clone(markers), defenseRanges: clone(defenseRanges) },
        ],
        historyIndex: 0,
        arranging: opts?.arranging ?? false,
      };
      set({
        session,
        viewingScene: null,
        viewingTacticId: null,
        viewingTacticName: "",
        courtView: "tactics",
        activeTool: "select",
        selectedObjectId: null,
      });
    },

    discardSession: () =>
      set({ session: null, courtView: "rotation", selectedObjectId: null, activeTool: "select" }),

    confirmArrangement: () =>
      set((state) => (state.session ? { session: { ...state.session, arranging: false } } : state)),

    enterEditFromViewing: () => {
      const { viewingScene, viewingTacticId, viewingTacticName } = get();
      if (!viewingScene) return;
      get().startSession(viewingScene.snapshot, {
        markers: viewingScene.markers,
        defenseRanges: viewingScene.defenseRanges,
        name: viewingTacticName,
        serverId: viewingTacticId,
      });
    },

    setSessionName: (name) =>
      set((state) => (state.session ? { session: { ...state.session, name } } : state)),

    moveSessionPlayer: (sourcePlayerId, x, y) =>
      editSession(
        (s) => ({
          snapshot: {
            ...s.snapshot,
            players: s.snapshot.players.map((p) =>
              p.sourcePlayerId === sourcePlayerId ? { ...p, x, y } : p,
            ),
          },
        }),
        { history: "record" },
      ),

    removeSessionPlayer: (sourcePlayerId) =>
      editSession(
        (s) => ({
          snapshot: {
            ...s.snapshot,
            players: s.snapshot.players.filter((p) => p.sourcePlayerId !== sourcePlayerId),
          },
        }),
        { history: "record", select: null },
      ),

    placeSessionPlayer: (player) =>
      editSession(
        (s) => {
          // upsert：同一個 sourcePlayerId 已在場上就換位置，否則新增（從名單拖入板外球員）。
          const filtered = s.snapshot.players.filter(
            (p) => p.sourcePlayerId !== player.sourcePlayerId,
          );
          return { snapshot: { ...s.snapshot, players: [...filtered, player] } };
        },
        { history: "record" },
      ),

    addMarker: (marker, options) => {
      const id = uuidv4();
      editSession((s) => ({ markers: [...s.markers, { ...marker, id }] }), {
        // #147 殘留的病灶：pointerDown 放起點時傳 skipHistory，避免把「起點＝終點」的殘缺線
        // 記進歷史；pointerUp 放開時（Court.tsx 的 handlePointerUp）才由呼叫端補記一次完整的線。
        history: options?.skipHistory ? "defer" : "record",
        select: id,
      });
    },

    // #361-1/#361-2：updateMarker 不再永遠跳過歷史。mutate 找不到對應 id 時回傳 null（沒有任何
    // marker 被改到），editSession 會把這次呼叫當成沒發生過，不動 state 也不記歷史。
    updateMarker: (id, updates, options) =>
      editSession(
        (s) => {
          if (!s.markers.some((m) => m.id === id)) return null;
          return { markers: s.markers.map((m) => (m.id === id ? { ...m, ...updates } : m)) };
        },
        { history: options?.skipHistory ? "defer" : "record" },
      ),

    addDefenseRange: (range) => {
      editSession((s) => ({ defenseRanges: [...s.defenseRanges, { ...range, id: uuidv4() }] }), {
        history: "record",
      });
      // activeTool 是全域 UI 狀態、不屬於 session 內容，editSession 只認得 session 欄位跟
      // selectedObjectId，所以這個「畫完防守範圍自動切回選取工具」的副作用得另外用一個 set()
      // 補上——這是九支動作裡唯一會動到 activeTool 的，其餘都不需要。
      set({ activeTool: "select" });
    },

    // #361-3：updateDefenseRange 預設也記歷史，但它的唯一呼叫端（DefenseRange.tsx 拖曳）每個
    // pointerMove frame 都會呼叫一次，必須明確傳 skipHistory:true，否則拖一下就會把 30 格的
    // 歷史上限灌爆。mutate 同樣在找不到 id 時回傳 null，讓「id 對不上」既不髒 state 也不記歷史。
    updateDefenseRange: (id, updates, options) =>
      editSession(
        (s) => {
          if (!s.defenseRanges.some((dr) => dr.id === id)) return null;
          return {
            defenseRanges: s.defenseRanges.map((dr) => (dr.id === id ? { ...dr, ...updates } : dr)),
          };
        },
        { history: options?.skipHistory ? "defer" : "record" },
      ),

    // #361-4：取代舊的 removeMarker + removeDefenseRange。刪除跟 add/update 不一樣，唯一合理合併
    // 成型別無關的版本——呼叫端（TacticsEditToolRail 的刪除鍵）拿到的只有 selectedObjectId，
    // 根本不知道選到的是畫筆還是防守範圍（舊寫法索性兩個 remove 都呼叫，反正對不上的那個是
    // no-op）。但這正是舊寫法本身壞掉的地方：兩支各自 pushHistory()，於是刪一個東西會在歷史
    // 記兩格，第一次 Ctrl+Z 只會把「本來就沒變的那個空陣列 filter」復原回來，畫面看起來像
    // 「按了沒反應」。合併成一支、內部一次判斷「兩個陣列裡有沒有這個 id」、只記一次歷史，
    // 才是誠實對應「使用者做了一件事」的寫法。
    //
    // 而 add/update 沒有跟著合併：add/update 的呼叫端（Markers.tsx、DefenseRange.tsx、
    // Court.tsx）永遠知道自己在編輯哪一種物件（拖曳中的是哪個元件的 pointer handler 就決定了
    // 型別），合併成 `updates: Partial<Marker> & Partial<DefenseRange>` 只會讓型別變鬆、
    // 呼叫端也拿不到什麼好處——這是 #304 開放性問題 2 的答案：三組動作不會一律收斂成同一種
    // 形狀，要看呼叫端到底知不知道自己在編什麼。
    removeSceneObject: (id) =>
      editSession(
        (s) => {
          const inMarkers = s.markers.some((m) => m.id === id);
          const inRanges = s.defenseRanges.some((dr) => dr.id === id);
          if (!inMarkers && !inRanges) return null;
          return {
            markers: s.markers.filter((m) => m.id !== id),
            defenseRanges: s.defenseRanges.filter((dr) => dr.id !== id),
          };
        },
        { history: "record", select: null },
      ),

    clearDrawings: () =>
      editSession(() => ({ markers: [], defenseRanges: [] }), { history: "record", select: null }),

    // 把「動作完成後的當前畫面」存進 undo 歷史。#147 的約定：每個動作都是「先 set 改狀態、
    // 再 pushHistory」，所以 history[historyIndex] 永遠等於畫面現況，undo 往回退一格剛好差一步。
    pushHistory: () =>
      set((state) => {
        const s = state.session;
        if (!s) return state;
        // 砍掉 redo 分支：剛 undo 過又畫了新東西，被退掉的未來就不該還留著。
        const newHistory = s.history.slice(0, s.historyIndex + 1);
        newHistory.push(contentOf(s));
        if (newHistory.length > 30) newHistory.shift();
        return { session: { ...s, history: newHistory, historyIndex: newHistory.length - 1 } };
      }),

    undo: () =>
      set((state) => {
        const s = state.session;
        if (!s || s.historyIndex <= 0) return state;
        const idx = s.historyIndex - 1;
        const c = clone(s.history[idx]);
        return {
          selectedObjectId: null,
          session: {
            ...s,
            historyIndex: idx,
            snapshot: { ...s.snapshot, players: c.players },
            markers: c.markers,
            defenseRanges: c.defenseRanges,
          },
        };
      }),

    redo: () =>
      set((state) => {
        const s = state.session;
        if (!s || s.historyIndex >= s.history.length - 1) return state;
        const idx = s.historyIndex + 1;
        const c = clone(s.history[idx]);
        return {
          selectedObjectId: null,
          session: {
            ...s,
            historyIndex: idx,
            snapshot: { ...s.snapshot, players: c.players },
            markers: c.markers,
            defenseRanges: c.defenseRanges,
          },
        };
      }),

    // 載入已存戰術＝唯讀檢視（issue #154 PR B）。parseSavedTactic 會用 zod 驗證並把舊格式
    // 轉成單景 v2；解析失敗會 throw，交給呼叫端 try/catch 提示。刻意「不」開 session、也不碰
    // 任何真相來源——這就是把「載入會覆蓋名單/站位」那道門焊死的地方。
    loadProject: (data, id, name) => {
      const scene = parseSavedTactic(data).scenes[0] ?? null;
      set({
        session: null,
        viewingScene: scene,
        viewingTacticId: id,
        viewingTacticName: name,
        courtView: "tactics",
        selectedObjectId: null,
      });
    },

    // 匯入 JSON 也是唯讀檢視，跟 loadProject 同一條路，只是沒有 server id/name（匯入的檔案
    // 不屬於任何一筆已存戰術）。
    importState: (data) => {
      const scene = parseSavedTactic(data).scenes[0] ?? null;
      set({
        session: null,
        viewingScene: scene,
        viewingTacticId: null,
        viewingTacticName: "",
        courtView: "tactics",
        selectedObjectId: null,
      });
    },

    buildSavedTactic: () => {
      const s = get().session;
      const scene: TacticScene = s
        ? {
            label: s.name,
            snapshot: s.snapshot,
            markers: s.markers,
            defenseRanges: s.defenseRanges,
          }
        : { label: "", snapshot: blankSnapshot(), markers: [], defenseRanges: [] };
      return { version: 2, scenes: [scene] };
    },
  };
});
