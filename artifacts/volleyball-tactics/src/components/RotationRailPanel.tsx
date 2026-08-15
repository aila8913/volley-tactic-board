import { useState } from "react";
// DragEvent 取別名：全域 DOM 也有一個同名的 DragEvent，直接 import 會蓋掉它讓人誤會，
// 這裡要的是 React 的合成事件版本。
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { assignPlayerToZone, removePlayerFromZone, BACK_ROW_ZONES } from "@/lib/rotationLogic";
import type { MatchPlayer } from "@/types/match";
import type { LineupZones } from "@/types/scoresheet";

// ── 右欄共用的「場上站位」面板（issue #120）──
//
// 這個檔案取代了兩個舊元件：唯讀的 ScoreSheetRotationPanel 跟可編輯的
// ScoreSheetLineupEditor。PO 的決策是「輪轉/先發是一份跨頁共用的真相」——計分頁改先發，
// 戰術板也要立刻看到同一份結果，不再是兩份各自本地的副本。既然真相只有一份，
// 唯讀/可編輯就不必是兩個各自維護一份 UI 的元件，而是同一個元件靠 readOnly 開關表現方式。
//
// 跟舊的兩個元件一樣，這裡刻意「不 import 任何 store」：資料完全由 props 決定
// （issue #117 的錨點決議）。計分頁跟戰術板各自從自己的資料源（計分表的 per-set 快照 /
// 輪轉表 store）算出 lineup 再傳進來，這個元件本身不知道、也不需要知道資料從哪裡來。
//
// issue #174（比賽列表右欄）文字上寫的 `editable` prop，對應到的就是這裡沿用 #120 的
// `readOnly`（`editable === !readOnly`）——沒有新增一個同義的 prop，兩個既有呼叫端已經在用
// readOnly 這個名字，重複造一個名字不同、語意相同的 prop 只會製造混淆。
interface RotationRailPanelProps {
  // 6 個號位（1~6）→ 球員 id 的先發快照。null 代表這個資料源還沒有完整先發
  // （例如計分表 hasLineup 為 false，或戰術板這場還沒排過站位）。
  lineup: LineupZones | null;
  roster: MatchPlayer[];
  // 目前第幾輪／第幾局，0-indexed（顯示時 +1，跟 RotationSwitcher「第 N 輪」的慣例一致）。
  // 這個數字代表什麼由 axis 決定（見下方）。
  rotation: number;
  // 標題列右邊那個數字代表「輪」還是「局」（issue #174）。預設 "rotation"＝現況行為
  // （戰術板／計分頁原本的用法不用改）。"set" 是比賽列表右欄（#170）要的——那裡列的是
  // 「這場比賽第幾局」，跟輪轉的「第幾輪」是不同軸，文案跟著換才不會誤導使用者。
  axis?: "rotation" | "set";
  // true＝唯讀（戰術板用）：只能看不能改。
  // 註：issue #174 文字上寫的 `editable` prop，就是這裡既有的 `!readOnly`——兩個呼叫端
  // （ScoreSheet.tsx / RotationTable.tsx）已經在用 readOnly 這個名字，改名只會製造無意義的
  // diff，所以刻意不照 issue 原文照搬 prop 名稱，語意上是同一件事。
  readOnly?: boolean;
  // 編輯模式下，選好球員指派到號位後，整份新快照透過這裡即時交出去——見下方
  // 「為什麼沒有 draft/確定鈕」的說明。readOnly 時不會用到，但呼叫端必須在 !readOnly
  // 時提供，否則點了球員也沒有任何效果。
  onLineupChange?: (next: LineupZones) => void;
  // 標題列數字旁的 stepper（layout-spec §4.2）的「按了上/下」回呼，delta 是 -1（往前一輪/局）
  // 或 +1（往後一輪/局）。**只有傳了這個 prop 才會渲染 stepper**——見下方 GRID_ZONES 下方
  // 原本「刻意不做 stepper」那段註解已經過期，這裡補充為什麼現在可以加回來了。
  onStep?: (delta: -1 | 1) => void;
  // stepper 兩顆按鈕各自的可按狀態，只在有傳 onStep 時有意義。不傳就視為一律可按——
  // 元件本身不知道「輪」是環狀（mod 6 永遠可按）還是「局」是線性有邊界（第一局不能再往前、
  // 最後一局不能再往後），這是呼叫端的領域規則，元件不內建假設（見下方 onStep 的說明）。
  canStepPrev?: boolean;
  canStepNext?: boolean;
  // 標題文字，預設「場上站位」。
  title?: string;
  // true＝球員清單的每一列都是拖曳來源，即使 readOnly 也一樣——issue #251：戰術板要能把
  // 球員拖到球場上，但輪轉格子本身仍要維持 ADR-0001 訂死的「唯讀、不可從這裡改先發」。
  // 這兩件事是彼此獨立的兩個開關：readOnly 管的是「格子能不能被改」，benchDraggable 管的是
  // 「清單這一列能不能被拖走」，拖去球場不算「寫回輪轉真相」，只是既有、本來就允許的
  // 拖人上場互動（跟這個元件完全無關的另一份 store）。預設 false，維持計分頁既有行為不變。
  benchDraggable?: boolean;
  // 頁面各自想加在三個區塊下面的額外內容（戰術板放球員設定/輪次選擇/提示；
  // 計分頁目前用不到，留空）。
  footer?: ReactNode;
  // ③ 球員清單這一塊要怎麼呈現（PO 2026-08-09：右欄的兩份名單合併成一份）。
  //   "compact"（預設＝既有行為）：釘在區塊底部、max-h-28 自己捲。計分頁/戰術板/分析頁
  //     底下還有別的東西要顯示，這份清單不能無限長。
  //   "fill"：不設高度上限，改成吃掉容器剩下的高度。比賽列表右欄用這個——那裡這份清單
  //     已經是**整欄唯一的名單**（唯讀檢視不再自己畫一份），把它壓在 112px 高只露兩列
  //     正是 #331 記的那個「塞不下」訊號。
  //   "hidden"：整塊不渲染（連上面那行操作提示也不渲染——提示教人「拖清單裡的球員」，
  //     清單都不在了還留著只會誤導）。比賽列表右欄進入編輯模式時用這個：那時名單由
  //     MatchDetailForm 的可編輯版本接手，同一份東西不能同時畫兩次。
  rosterList?: "compact" | "fill" | "hidden";

  // ── 第七格：自由球員先發（issue #327）────────────────────────────────────────
  //
  // 在此之前，全 app 唯一能指定先發 L 的地方是戰術板球場上那顆備位圓圈，而它只在中央球場
  // 的「輪轉畫法」下才渲染、開新戰術又會直接切走——實務上使用者根本到不了，等於「排不了
  // 自由球員先發」。這一格就是補上那個入口，也因此讓那顆圓圈（連同整個輪轉畫法）能在
  // #328 退役。
  //
  // 為什麼是「第七格」而不是把 L 塞進六宮格：六個號位是輪轉序，L 不佔輪轉序（他是替換
  // 上場的），塞進去等於宣稱他會跟著轉。獨立一格才誠實。
  showLiberoCell?: boolean;
  // 先發自由球員是誰（名單裡可能有多位 L，場上同時只有一位）。
  liberoId?: string | null;
  // 他頂替先發裡的哪一位（#326 的模型：存「頂替誰」，站哪格是推導值）。
  liberoReplacesPlayerId?: string | null;
  // 使用者改了第七格。兩個值一起交出去，理由見 useRotationTable 的 setLiberoAssignment：
  // 「哪位 L」跟「頂誰」描述的是同一件事，分兩次寫會生出「換了人但頂替對象是舊的」的中間態。
  // readOnly 時不會被呼叫（戰術板那兩個呼叫端只看不改，ADR-0001）。
  onLiberoChange?: (liberoId: string | null, replacesPlayerId: string | null) => void;

  // ── 以下兩個 prop 只有 axis==="set" 時才有意義（issue #191/#192）──
  //
  // 「第 N 局」這串數字本身不會告訴使用者這局是打完了、正在打、還是根本還沒開賽——
  // 教練得自己心算「已完成局數」跟「目前滑到第幾局」的關係才能猜出來，這正是 #191
  // 要補的「狀態不夠好讀」。rotation 軸（計分頁/戰術板既有用法）沒有這個問題：
  // 「第 N 輪」永遠是同一份現在進行式的資料，不存在歷史/進行中/未開始的分野，
  // 所以這兩個 prop 刻意設計成不傳就完全不渲染，不會動到 rotation 軸兩個既有呼叫端
  // 的畫面（沒傳 = undefined = 底下 && 判斷直接短路）。
  setStatus?: "historical" | "live" | "upcoming";
  // 這局的比分。null 代表這局有 setStatus 但還沒有比分可看（例如還沒開賽的那一局）——
  // 呼叫端要能區分「不是 set 軸，不該顯示」（undefined）跟「是 set 軸但這局沒分」（null），
  // 所以型別上特意留了兩層。
  score?: { our: number; opponent: number } | null;
}

// #191 狀態小藥丸的文案跟色票（tone 沿用 MatchAnalytics.tsx 比分總覽那組「進行中＝天藍、
// 我方領先＝萊姆綠」的用色邏輯，讓使用者在不同頁面看到同一種狀態時顏色是一致的）。
const SET_STATUS_META: Record<
  NonNullable<RotationRailPanelProps["setStatus"]>,
  { label: string; className: string }
> = {
  historical: {
    label: "已打完",
    className: "border-white/[0.18] bg-white/[0.06] text-[#9AA08C]",
  },
  live: {
    label: "進行中",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  },
  upcoming: {
    label: "未開賽",
    className: "border-[#C6F135]/30 bg-[#C6F135]/10 text-[#C6F135]",
  },
};

// 六宮格排法是 docs/layout-spec.md §4.1 訂死的規格，不是隨便湊的：上排 4 3 2、下排
// 5 6 1，是「從場上視角看」的站位——1 號位在右後方（發球位），逆時針 1→6→5→4→3→2
// 依序輪轉（跟 lib/rotationLogic.ts 的 shiftSequence 是同一套順序）。spec 裡白紙黑字
// 寫「編號位置不可自行調整順序」，所以不要因為覺得「排起來比較整齊」就重排這個陣列，
// 不然畫面會跟真實球場對不起來，教練照著排反而排錯場上的人。
const GRID_ZONES = [4, 3, 2, 5, 6, 1] as const;

// ── 跨欄拖曳的協定（issue #174 最後一項）──
//
// 用瀏覽器原生的 HTML5 drag and drop，不引入 dnd-kit / react-dnd 之類的套件。理由有兩個：
// (1) 這個 repo 已經有一套一模一樣的拖放合約在跑——RotationTable 左側名單、TacticsRosterPanel
//     拖球員到球場，用的都是 `dataTransfer.setData("text/plain", playerId)`（見那兩個檔的註解）。
//     同一個 app 裡兩套拖曳心智模型只會讓下一個人猜錯。
// (2) 這裡的拖放只有「一個 id 從 A 掉到 B」這麼簡單，沒有排序、沒有多選、沒有跨捲動容器的
//     自動捲動，套件能解決的那些難題這裡一個都沒有；而 pnpm-workspace 還設了 minimumReleaseAge
//     的供應鏈防線，能不加依賴就不加。
//
// text/plain 帶 playerId（跟既有合約相容）。另外多帶一個自訂 MIME 標記「他是從第幾號位被拖
// 出來的」：只有「拖回球員清單＝下場」這個方向需要知道來源，往格子放的方向不需要——
// assignPlayerToZone 自己會從快照裡找出這個人原本站哪、決定要互換還是搬移。
// 自訂 MIME 而不是把兩個值塞進 text/plain 的字串裡，是為了讓既有的 Court.tsx drop handler
// 就算收到這裡發出的拖曳，讀 text/plain 仍然只會拿到乾淨的 playerId。
const DND_SOURCE_ZONE = "application/x-volley-source-zone";
// 「這次拖曳是從第七格（自由球員格）拖出來的」。跟 DND_SOURCE_ZONE 分開一個 MIME 而不是
// 在裡面塞一個特殊值（例如 "libero"），是因為那個欄位的讀取端一律 Number() 之後當號位用，
// 混進一個非數字的哨兵值遲早會被某個呼叫端算成 NaN 號位。
const DND_SOURCE_LIBERO = "application/x-volley-source-libero";

// 第七格在「先點格子、再點球員」這條路裡的識別值。用字串哨兵而不是 7 之類的假號位：
// 排球沒有 7 號位，寫成數字會讓下游任何「號位運算」（rotateZone、BACK_ROW_ZONES）默默
// 把它當成一個真的格子處理。
const LIBERO_SLOT = "libero" as const;
type SelectedSlot = number | typeof LIBERO_SLOT | null;

// 第七格要講的四句話。刻意把「場外」拆成兩種原因（front-row / not-in-lineup）：
// 前者是 #326 的規則正在生效（頂替的人輪到前排了，等他轉回來 L 就上場），後者是這份先發
// 根本還沒排到那個人（例如戰術板只在滿 6 人時才傳 lineup 進來）。兩者長得一樣、成因不同，
// 合成一句就會在「先發還沒排完」時謊稱「他在前排」——實測抓到的正是這一種。
type LiberoStatus = "no-target" | "on-court" | "front-row" | "not-in-lineup";

// 第七格的文字內容。抽成獨立元件純粹是因為可編輯（button）跟唯讀（div）兩種外殼要包
// 同一段內容，複製兩份就是下一個「改了一邊忘了另一邊」的候選（#349/#351 那類）。
function LiberoSlotBody({
  libero,
  status,
  replacedPlayer,
}: {
  libero: MatchPlayer | null;
  status: LiberoStatus;
  replacedPlayer: MatchPlayer | undefined;
}) {
  if (!libero) {
    return <span className="truncate text-[#9AA08C]">自由球員先發：未指派</span>;
  }

  const who = replacedPlayer ? `${replacedPlayer.number} 號` : "頂替對象";

  return (
    <>
      <span className="shrink-0 font-bold tabular-nums text-[#F5F5F0]">{libero.number}</span>
      <span className="min-w-0 flex-1 truncate text-[#F5F5F0]">{libero.name}</span>
      {/* 「場外」一定要把原因講出來——不然教練只會看到 L 莫名其妙不在場上，而這正是
        #326 那條規則實際生效的樣子。兩種場外原因也必須分開講：「頂替的人輪到前排」是
        規則生效，「先發根本還沒排出來」是資料還不完整，兩者要採取的行動完全不同。 */}
      {status === "no-target" ? (
        <span className="shrink-0 text-micro text-[#9AA08C]">尚未指定頂替對象</span>
      ) : status === "on-court" ? (
        <span className="shrink-0 text-micro text-[#C6F135]">
          頂替 {replacedPlayer ? replacedPlayer.number : "—"}
        </span>
      ) : status === "front-row" ? (
        <span className="shrink-0 text-micro text-[#9AA08C]">場外（{who}在前排）</span>
      ) : (
        <span className="shrink-0 text-micro text-[#9AA08C]">場外（{who}不在這份先發裡）</span>
      )}
    </>
  );
}

export default function RotationRailPanel({
  lineup,
  roster,
  rotation,
  axis = "rotation",
  readOnly = false,
  onLineupChange,
  onStep,
  canStepPrev = true,
  canStepNext = true,
  title = "場上站位",
  benchDraggable = false,
  footer,
  rosterList = "compact",
  showLiberoCell = false,
  liberoId = null,
  liberoReplacesPlayerId = null,
  onLiberoChange,
  setStatus,
  score,
}: RotationRailPanelProps) {
  // 唯一的 local state：目前選中哪個號位（「先點格子、再點球員」兩段式操作的第一段）。
  //
  // 舊的 ScoreSheetLineupEditor 除了 selectedZone，還有一份 draft（自己的 useState）＋
  // 一顆「確定」按鈕：因為那時候先發只是「計分表自己的一份草稿」，排到一半被上層 re-render
  // 洗掉會很痛，所以先在本地攢著、按確定才交出去。現在先發是唯一共用真相，這個元件收到的
  // lineup prop 本身就是「當下的真相」，選好球員的當下透過 onLineupChange 直接寫回去——
  // 沒有草稿，也就沒有「半編輯到一半的草稿被外部 re-render 覆蓋掉」這整類 bug（那正是舊版
  // useEffect 只在 [mode, setNumber] 變動時才重新播種 draft 要防的東西，這裡連防都不用防，
  // 因為根本不存在「跟真相不同步的本地副本」）。
  const [selectedZone, setSelectedZone] = useState<SelectedSlot>(null);

  const safeLineup = lineup ?? {};
  const filledCount = Object.keys(safeLineup).length;

  // axis 決定「這個數字是輪還是局」的文案（issue #174）：計分頁/戰術板既有用法是輪
  // （沿著六人輪轉制走），比賽列表右欄（#170）要顯示的是局數，兩者共用同一個標題列
  // 版位、只換單位字，不用整段複製一份。
  const unitLabel = axis === "set" ? "局" : "輪";

  // 自由球員（role "L"）不列進這六個號位——LineupZones 定義上就只記非自由球員，
  // 自由球員是從場邊靠換人上場的（見 types/scoresheet.ts）。
  const assignablePlayers = roster.filter((p) => p.role !== "L");
  // ⚠️ 行為變更（#327）：清單以前用一個 includeLibero 開關決定要不要列出自由球員，預設
  // 不列——所以計分頁跟戰術板的右欄清單裡完全看不到 L。那不是設計，是把兩件事綁在同一個
  // filter 上的後果：「誰排得進六個號位」（L 永遠不行，是規則）跟「這場有哪些球員」
  //（L 當然算，他就是球員）。現在清單一律列出全名單，六個號位的白名單另外用
  // assignablePlayers 把關——兩個判斷分開，各自對各自的事負責。
  const liberos = roster.filter((p) => p.role === "L");

  // ── 第七格的推導值（#326 的模型：存「頂替誰」，其他都是算出來的）──
  const libero = liberoId ? (liberos.find((p) => p.id === liberoId) ?? null) : null;
  // 被頂替者在先發裡的起始號位。找不到＝那個人已經不在先發裡（例如剛被擠掉），
  // 這次頂替就不成立。
  const replacedZone = liberoReplacesPlayerId
    ? Object.entries(safeLineup).find(([, pid]) => pid === liberoReplacesPlayerId)?.[0]
    : undefined;
  const replacedPlayer = liberoReplacesPlayerId
    ? roster.find((p) => p.id === liberoReplacesPlayerId)
    : undefined;
  // L 到底在不在場上：被頂替者站前排時 L 就在場外（#326 的核心規則）。這裡刻意用「這個
  // 面板正在顯示的那份先發」去判斷，而不是另外接一個 rotation 進來算——六宮格顯示的是
  // 起始站位，第七格如果用別的輪次講話，兩者就會互相打臉。
  const liberoOnCourt = replacedZone !== undefined && BACK_ROW_ZONES.has(Number(replacedZone));
  const liberoStatus: LiberoStatus =
    liberoReplacesPlayerId === null
      ? "no-target"
      : replacedZone === undefined
        ? "not-in-lineup"
        : liberoOnCourt
          ? "on-court"
          : "front-row";

  // 點球員＝把他指派到目前選中的號位。真正的指派/互換規則放在 lib/rotationLogic.ts 的
  // assignPlayerToZone：那是領域規則（六人佈陣怎麼調整才合法），不是這個元件的 UI 細節，
  // 抽出去，它就能用單元測試直接釘死四種分支，不必先渲染元件、模擬點擊
  //（#168 之後元件層也測得動了，見這個檔案的測試下半部——但規則本身仍該住在 lib/）。
  const assignToSelectedZone = (playerId: string) => {
    if (selectedZone === null) return;
    // 選中第七格時，點清單裡的球員＝指定他當先發 L。只有 role "L" 才有意義，點到別人
    // 直接忽略（而不是「順便幫他排進某個號位」——那不是使用者在這個當下表達的意思）。
    if (selectedZone === LIBERO_SLOT) {
      if (!onLiberoChange || !liberos.some((p) => p.id === playerId)) return;
      onLiberoChange(playerId, liberoReplacesPlayerId);
      setSelectedZone(null);
      return;
    }
    if (!onLineupChange) return;
    onLineupChange(assignPlayerToZone(safeLineup, selectedZone, playerId));
    setSelectedZone(null);
  };

  // 拖曳中的視覺回饋：滑鼠正懸在哪個號位上方 / 是否懸在球員清單上方。純 UI 狀態，
  // 不進 store——拖到一半的中間狀態不是「真相」，放開才是。
  const [dragOverZone, setDragOverZone] = useState<SelectedSlot>(null);
  const [dragOverBench, setDragOverBench] = useState(false);

  const canDrag = !readOnly && !!onLineupChange;
  // 第七格能不能動，跟六宮格能不能動是**兩個獨立的開關**（同一種分工在 benchDraggable
  // 上已經用過）：比賽列表右欄有可能只想開其中一邊，而戰術板兩邊都關。
  const canEditLibero = showLiberoCell && !readOnly && !!onLiberoChange;
  // 拖曳（不管拖去哪）只要其中一邊開著就得允許——拖一位 L 到號位上改的是第七格，不是六宮格。
  const canDragAnything = canDrag || canEditLibero;

  // 開始拖一個球員。sourceZone 只有從六宮格拖出時才有值；fromLibero 則標記「這次是從
  // 第七格拖出來的」，讓「拖回清單＝下場」那端知道要收掉的是自由球員指派而不是某個號位。
  const startDrag = (
    e: ReactDragEvent,
    playerId: string,
    source?: { zone?: number; fromLibero?: boolean },
  ) => {
    e.dataTransfer.setData("text/plain", playerId);
    if (source?.zone !== undefined) e.dataTransfer.setData(DND_SOURCE_ZONE, String(source.zone));
    if (source?.fromLibero) e.dataTransfer.setData(DND_SOURCE_LIBERO, "1");
    e.dataTransfer.effectAllowed = "move";
  };

  // preventDefault 是 HTML5 DnD 最反直覺的一點：**預設所有元素都拒收**，
  // 只有在 dragover 阻止預設行為，這個元素才會變成合法的放置目標、drop 事件才會觸發。
  const allowDrop = (e: ReactDragEvent) => {
    if (!canDragAnything) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropOnZone = (e: ReactDragEvent, zone: number) => {
    if (!canDragAnything) return;
    e.preventDefault();
    setDragOverZone(null);
    const playerId = e.dataTransfer.getData("text/plain");

    // ── 把一位 L 拖到某個號位上 ──
    // 語意不是「L 站進這一格」（他不佔輪轉序），而是**「L 頂替站在這一格的那個人」**——
    // 格子只是使用者指到那個人的方式。這是 #326 定案的模型，也是為什麼這條路不呼叫
    // onLineupChange：六個號位一個字都沒改。
    if (liberos.some((p) => p.id === playerId)) {
      if (!canEditLibero || !onLiberoChange) return;
      const target = safeLineup[zone];
      // 空格子沒有可頂替的對象，這次拖曳表示不成任何狀態，忽略（跟 store 的
      // placePlayerOnCourt 同一條把關）。
      if (target === undefined) return;
      onLiberoChange(playerId, target);
      setSelectedZone(null);
      return;
    }

    if (!canDrag || !onLineupChange) return;
    // 只認這場名單裡的人：其他地方（甚至別的分頁、桌面上的文字）也可能丟一段 text/plain
    // 過來，沒這道檢查就會把垃圾 id 寫進先發快照，變成讀出來對不到人的「幽靈站位」。
    if (!assignablePlayers.some((p) => p.id === playerId)) return;
    onLineupChange(assignPlayerToZone(safeLineup, zone, playerId));
    setSelectedZone(null);
  };

  // 拖到第七格＝指定他是先發自由球員。頂替對象維持原樣（換人不等於換頂替對象）——
  // 沒有頂替對象時就只是「備位區站著這位 L」，還沒上場。
  const handleDropOnLibero = (e: ReactDragEvent) => {
    if (!canEditLibero || !onLiberoChange) return;
    e.preventDefault();
    setDragOverZone(null);
    const playerId = e.dataTransfer.getData("text/plain");
    if (!liberos.some((p) => p.id === playerId)) return;
    onLiberoChange(playerId, liberoReplacesPlayerId);
    setSelectedZone(null);
  };

  // 拖回球員清單＝把他從場上拿下來。只有帶著來源標記的拖曳才有意義；從清單拖到清單
  // 是原地打轉，直接忽略。
  const handleDropOnBench = (e: ReactDragEvent) => {
    if (!canDragAnything) return;
    e.preventDefault();
    setDragOverBench(false);
    // 從第七格拖回清單＝這位 L 不上場了，整個指派收掉（#326：L 下場就是留在場外，
    // 系統不會自己幫他找下一個頂替對象）。
    if (e.dataTransfer.getData(DND_SOURCE_LIBERO)) {
      if (!canEditLibero || !onLiberoChange) return;
      onLiberoChange(null, null);
      setSelectedZone(null);
      return;
    }
    const raw = e.dataTransfer.getData(DND_SOURCE_ZONE);
    if (!raw || !canDrag || !onLineupChange) return;
    onLineupChange(removePlayerFromZone(safeLineup, Number(raw)));
    setSelectedZone(null);
  };

  return (
    <section
      // opacity-90：「對照用的參考物、不是可以動手的編輯器」的視覺提示（issue #160
      // 對戰術頁右欄輪轉表訂的規格延伸過來）——讓使用者一眼分辨這裡「看得到、動不了」。
      // rosterList="fill" 時這一區塊改成「吃掉容器剩餘高度的 flex 容器」，底下的球員清單才有
      // 空間可以撐開（見該 prop 的說明）；其餘兩種模式維持原本的 shrink-0，計分頁/戰術板
      // 的版面完全不受影響。
      className={`border-b border-white/[0.10] px-3 py-3 ${
        rosterList === "fill" ? "flex min-h-0 flex-1 flex-col" : "shrink-0"
      } ${readOnly ? "opacity-90" : ""}`}
      data-testid="rotation-rail-panel"
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="truncate text-sm font-bold text-[#F5F5F0]">{title}</h2>
          {/* 狀態小藥丸（#191）：只有 axis="set" 的呼叫端會傳 setStatus，rotation 軸
            （計分頁/戰術板）不傳，這裡就不渲染，畫面跟改動前一模一樣。 */}
          {setStatus && (
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-micro font-semibold ${SET_STATUS_META[setStatus].className}`}
            >
              {SET_STATUS_META[setStatus].label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 「第 N 輪／第 N 局」永遠顯示，唯讀或可編輯都一樣。這是 #120 第一階段的核心補強——
            在此之前計分頁整頁沒有任何地方顯示 currentSet.ourRotation，教練看得到誰站哪，
            卻不知道現在輪到第幾轉。它本身是純資訊、不是控制項：計分頁的輪次由得分自動推進，
            戰術板的輪次由下面的 stepper 切（切輪次的副作用邏輯見 hooks/useRotationStepper.ts）。
            互動式的切換另外靠下面的 stepper（onStep 有傳才出現），不是靠點這行文字。
            有 stepper 時這裡就不重複顯示：stepper 正中央那格已經是同一個數字，兩個地方
            寫同一件事只會讓人懷疑「這兩個是不是不一樣的東西」。 */}
          {!onStep && (
            <span className="text-xs font-bold tabular-nums text-[#F5F5F0]">
              第 {rotation + 1} {unitLabel}
            </span>
          )}
          {/* 唯讀時不顯示 {filled}/6——那是「還差幾人」的編輯進度提示，看戲的人不需要。 */}
          {!readOnly && <span className="text-xs text-[#9AA08C]">{filledCount}/6</span>}
        </div>
      </div>

      {/* 這局的比分（#192）：跟狀態藥丸一樣只有 axis="set" 才會傳 score，且 score 是 null
        （例如「未開賽」那一局根本沒有分可看）時也不渲染——不是每個 setStatus 都一定有比分，
        「不渲染」比「硬顯示 0:0」更誠實，教練不會誤以為這局已經開球。 */}
      {score && (
        <div className="mb-2 shrink-0 text-xs tabular-nums text-[#9AA08C]">
          我{" "}
          <span
            className={`font-bold ${score.our > score.opponent ? "text-[#C6F135]" : "text-[#F5F5F0]"}`}
          >
            {score.our}
          </span>{" "}
          :{" "}
          <span
            className={`font-bold ${score.opponent > score.our ? "text-[#ef4444]" : "text-[#F5F5F0]"}`}
          >
            {score.opponent}
          </span>{" "}
          對手
        </div>
      )}

      {/* ① 輪轉表（layout-spec §4.1）：六宮格本身就是站位表。可編輯時點格子選號位；
        唯讀時純粹渲染成看不能點的資訊卡片。 */}
      <div className="grid shrink-0 grid-cols-3 gap-1">
        {GRID_ZONES.map((zone) => {
          const playerId = safeLineup[zone];
          const player = playerId ? roster.find((p) => p.id === playerId) : undefined;
          const isSelected = !readOnly && selectedZone === zone;
          // 這一格的人正被 L 頂替著：格子要顯示**場上實際站的那個人**（＝L），不是名義上
          // 的格主。這是第七格最重要的視覺回饋——教練指定完頂替對象，得在站位圖上直接看到
          // 結果，否則「設了有沒有生效」只能用猜的。
          // 被蓋住的格主不會消失，只是縮小顯示在角落（他還在先發裡，L 一下場他就回來）。
          const coveredByLibero =
            liberoOnCourt && !!playerId && playerId === liberoReplacesPlayerId;
          // 號位數字（1–6）不顯示：GRID_ZONES 的排法本身就是「從場上視角看」的空間位置，
          // 看的是格子在哪、不是格子寫著幾號——教練關心的是相對站位，數字反而是多餘的
          // 資訊圖層（使用者原話：「數字資訊不重要」）。GRID_ZONES 陣列順序仍然不能動
          // （layout-spec §4.1 鎖死），只是不再把 zone 這個數字渲染出來而已。
          const shown = coveredByLibero && libero ? libero : player;
          const cellContent = (
            <>
              <span className="text-xs font-bold leading-tight">{shown ? shown.number : "—"}</span>
              <span className="text-micro leading-tight text-[#9AA08C]">
                {shown ? shown.name.slice(0, 3) : ""}
              </span>
              {coveredByLibero && player && (
                <span className="text-micro leading-tight text-[#C6F135]/70">
                  L 頂 {player.number}
                </span>
              )}
            </>
          );
          // 拖曳懸停的高亮沿用「已選號位」那一套顏色：兩者要表達的是同一件事——
          // 「放開/點下去，人就會進這一格」，用兩種顏色反而要使用者記兩套規則。
          const isDropTarget = dragOverZone === zone;
          const cellClass = `flex flex-col items-center justify-center rounded-lg border px-1 py-1.5 transition ${
            isSelected || isDropTarget
              ? "border-[#C6F135] bg-[#C6F135]/10 text-[#C6F135]"
              : "border-white/[0.12] bg-white/[0.04] text-[#F5F5F0]"
          } ${!readOnly ? "hover:border-white/[0.30]" : ""}`;

          // readOnly 用 div 而不是 disabled button：既不用處理 disabled 的按鈕樣式，
          // 也從語意上明確表示「這裡沒有任何互動」，不會被螢幕閱讀器唸成一顆按不動的按鈕。
          // 兩個分支共用同一個 testid（#168 的互動測試要能指名某一格）：唯讀時它是 <div>、
          // 可編輯時是 <button>，「這一格現在是哪一種」本身就是要被測的規格之一，所以刻意
          // 不用兩個不同的 testid 去區分——測試該問的是「zone-1 這格是不是可按的」，
          // 而不是「zone-1-readonly 這個節點在不在」（後者等於把答案寫進查詢條件裡）。
          return readOnly ? (
            <div key={zone} data-testid={`rotation-zone-${zone}`} className={cellClass}>
              {cellContent}
            </div>
          ) : (
            <button
              key={zone}
              data-testid={`rotation-zone-${zone}`}
              // type="button" 不是可有可無的：#329 之後這個面板會被塞進 MatchDetailForm 的
              // <form> 裡（編輯模式的版面順序要跟唯讀模式一致），而 <button> 在 form 內的
              // 預設 type 是 "submit"——少了這行，點一下號位格子就會直接送出整張表單。
              type="button"
              onClick={() => setSelectedZone(isSelected ? null : zone)}
              // 格子上有人才可以被拖走（空格子沒東西可拖）。playerId 在這個分支一定存在
              // 才會進到 draggable，所以下面的 startDrag 不用再判一次。
              draggable={canDrag && !!playerId}
              onDragStart={(e) => playerId && startDrag(e, playerId, { zone })}
              onDragOver={allowDrop}
              onDragEnter={() => canDragAnything && setDragOverZone(zone)}
              // dragleave 要比對 zone 再清掉：拖過相鄰兩格時 enter(新格) 有機會早於
              // leave(舊格)，無條件清空會把剛設好的高亮又抹掉，畫面就一路不亮。
              onDragLeave={() => setDragOverZone((z) => (z === zone ? null : z))}
              onDrop={(e) => handleDropOnZone(e, zone)}
              className={cellClass}
            >
              {cellContent}
            </button>
          );
        })}
      </div>

      {/* ② 第七格：自由球員先發（issue #327）。
        版位上是接在 3×2 底下、跨滿整列的一格——它不是第七個號位（排球沒有 7 號位），
        跨滿整列正是為了在視覺上跟輪轉序的六格區隔開：那六格會轉，這一格不會。

        它顯示三種狀態，全部是從「頂替誰」推導出來的（#326 的模型）：
          未指派      —— 還沒指定先發 L
          頂替 #12    —— L 在場上，上面那格會直接顯示成 L（見 coveredByLibero）
          場外        —— 指定的頂替對象目前站前排，L 不在場上。這正是 issue 要求
                        「第七格要看得出 L 目前在場外」的那一格文字。 */}
      {showLiberoCell && (
        <div
          className={`mt-1 flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition ${
            selectedZone === LIBERO_SLOT || dragOverZone === LIBERO_SLOT
              ? "border-[#C6F135] bg-[#C6F135]/10"
              : "border-white/[0.12] bg-white/[0.04]"
          }`}
          onDragOver={allowDrop}
          onDragEnter={() => canEditLibero && setDragOverZone(LIBERO_SLOT)}
          onDragLeave={() => setDragOverZone((z) => (z === LIBERO_SLOT ? null : z))}
          onDrop={handleDropOnLibero}
          data-testid="libero-slot"
        >
          <span className="shrink-0 rounded border border-[#C6F135]/40 px-1 text-micro font-bold text-[#C6F135]">
            L
          </span>

          {/* 這一格的主體：可編輯時是一顆按鈕（點了選中，再點清單裡的 L 指派），
            唯讀時是純文字。跟六宮格用 div/button 分兩種寫法是同一個理由。 */}
          {canEditLibero ? (
            <button
              type="button"
              onClick={() => setSelectedZone((z) => (z === LIBERO_SLOT ? null : LIBERO_SLOT))}
              // 已經有先發 L 時，這一格本身就是拖曳來源：拖去某個號位＝改頂替對象，
              // 拖回球員清單＝L 下場（見 handleDropOnBench）。
              draggable={!!libero}
              onDragStart={(e) => libero && startDrag(e, libero.id, { fromLibero: true })}
              className={`flex min-w-0 flex-1 items-center gap-2 text-left ${
                libero ? "cursor-grab active:cursor-grabbing" : ""
              }`}
            >
              <LiberoSlotBody
                libero={libero}
                status={liberoStatus}
                replacedPlayer={replacedPlayer}
              />
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <LiberoSlotBody
                libero={libero}
                status={liberoStatus}
                replacedPlayer={replacedPlayer}
              />
            </div>
          )}

          {/* × 的語意跟著狀態走：有頂替對象時先收掉頂替（L 回場外、備位區還站著他），
            沒有頂替對象時才是把這位 L 整個撤掉。分兩段而不是一次清光，是因為「先發 L
            是誰」跟「這一輪頂誰」在教練心裡就是兩個決定，一鍵清光會誤刪前者。 */}
          {canEditLibero && libero && (
            <button
              type="button"
              onClick={() =>
                onLiberoChange?.(liberoReplacesPlayerId !== null ? libero.id : null, null)
              }
              aria-label={liberoReplacesPlayerId !== null ? "解除頂替" : "移除先發自由球員"}
              className="shrink-0 rounded px-1 text-[#9AA08C] transition hover:text-[#ef4444]"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* layout-spec §4.2 的「輪次切換 stepper」：上一版寫死不做，是因為當時兩個呼叫端
        （計分頁／戰術板）都不需要互動式切換——計分頁的輪次由得分自動推進，戰術板用一顆
        獨立的 RotationSwitcher 元件（帶白板 session 副作用），先寫好卻沒有呼叫端傳
        onRotationChange 等於死碼，所以先拔掉、只留純文字顯示。
        現在（issue #174）比賽列表右欄要切的是「局」，是貨真價實需要互動的第三個呼叫端，
        才把 stepper 加回來——但做法跟上一版不同：改成 onStep 這個「純粹回報使用者按了
        上/下」的回呼，元件本身不內建 mod 6 或邊界判斷（見 props 註解），輪是環狀、局是
        線性有邊界，這兩種領域規則由呼叫端各自決定要不要允許再往前/後、算完新的值再把
        新的 rotation/lineup 傳回來。元件只負責畫出按鈕、回報方向。
        沒有 onStep 就完全不渲染這個區塊，維持「純資訊、看戲的人不會誤以為能點」的原樣。
        issue #251 之後，戰術板的兩個呼叫端（RotationTable/TacticsRosterPanel）也改成
        傳 onStep 接進這裡的 stepper，原本各自獨立的 RotationSwitcher 元件已刪除
        （副作用邏輯搬進 hooks/useRotationStepper.ts）——現在三個呼叫端（計分頁的比賽
        列表、戰術板的兩個 mode）用的是同一份 stepper UI，不再是「這裡文字顯示、戰術板
        另外自己畫一顆」的兩套。 */}
      {onStep && (
        <div className="mt-2 flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onStep(-1)}
            disabled={!canStepPrev}
            className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.04] py-1.5 text-xs font-bold text-[#F5F5F0] transition hover:border-white/[0.30] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`上一${unitLabel}`}
          >
            上
          </button>
          <span className="shrink-0 px-2 text-xs font-bold tabular-nums text-[#F5F5F0]">
            第 {rotation + 1} {unitLabel}
          </span>
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={!canStepNext}
            className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.04] py-1.5 text-xs font-bold text-[#F5F5F0] transition hover:border-white/[0.30] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`下一${unitLabel}`}
          >
            下
          </button>
        </div>
      )}

      {/* 操作提示跟著清單走：rosterList="hidden" 時清單不在，提示裡的「點下面的球員」
        就沒有指涉對象了，一起不渲染。 */}
      {!readOnly && rosterList !== "hidden" && (
        <p className="mt-2 shrink-0 text-caption leading-snug text-[#9AA08C]">
          {selectedZone === LIBERO_SLOT
            ? "已選自由球員格，點下面位置是 L 的球員指派為先發自由球員"
            : selectedZone !== null
              ? `已選 ${selectedZone} 號位，點下面的球員指派過去（他原本在別的號位就互換）`
              : showLiberoCell
                ? "把球員拖進號位即可上場，拖回清單則下場；把自由球員拖到某個號位＝由他頂替那個人"
                : "把球員拖進號位即可上場，拖回清單則下場；也可以先點號位再點球員"}
        </p>
      )}

      {/* ③ 球員清單（layout-spec §4.3）：已經在場上的人標出目前號位，讓教練一眼看出
        誰還在板凳上。
        高度策略見 rosterList 這個 prop 的說明——"compact"（計分頁/戰術板/分析頁）維持
        max-h-28 的既有行為，"fill"（比賽列表右欄）改成吃掉剩餘高度。這一版之所以要多出
        "fill"，是因為右欄原本畫了兩份名單（唯讀檢視一份、這裡一份），合併成一份之後
        它就是那一欄唯一的名單，再壓在 112px 只露兩列就說不過去了（#331）。 */}
      {/* 放置目標是「整個清單容器」而不是個別球員列：拖回板凳的語意是「離開場上」，
        丟在誰身上都一樣，硬要求對準某一列只是在為難使用者（而且列高只有 ~28px）。 */}
      {rosterList !== "hidden" && (
        <div
          onDragOver={allowDrop}
          onDragEnter={() => canDragAnything && setDragOverBench(true)}
          onDragLeave={() => setDragOverBench(false)}
          onDrop={handleDropOnBench}
          className={`mt-2 space-y-1 overflow-y-auto rounded-lg border pr-0.5 transition ${
            rosterList === "fill" ? "min-h-0 flex-1" : "max-h-28"
          } ${dragOverBench ? "border-[#C6F135]/60 bg-[#C6F135]/[0.06]" : "border-transparent"}`}
        >
          {roster.length === 0 && (
            <p className="px-1 py-1 text-caption text-[#9AA08C]">這場比賽還沒有球員名單</p>
          )}
          {roster.map((p) => {
            // 自由球員不參與六個號位，所以不查 currentZone（查也永遠查不到）。他「在不在
            // 場上」是另一回事——由第七格的頂替狀態決定，見下面 isOnCourt。
            const isLibero = p.role === "L";
            const currentZone = isLibero
              ? undefined
              : Object.entries(safeLineup).find(([, pid]) => pid === p.id)?.[0];
            // 清單裡「這個人現在在場上」的發光效果，L 也該吃得到——但他的判準不是號位，
            // 是「他就是那位先發 L，而且頂替關係目前成立」。
            const isOnCourt = isLibero ? liberoOnCourt && p.id === liberoId : !!currentZone;
            // 已上場的人要在清單裡發光標出來，讓教練一眼看出誰還在板凳上（見上面 ③ 的
            // 說明）——原本只有右側那個小小的號位數字當提示，太不明顯，補上跟這個檔案
            // 其他地方同一套「已選中/命中目標」用的萊姆綠描邊+底色，再加一點光暈
            // （box-shadow）呼應「發光」而不只是換色。
            const rowClass = `flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
              isOnCourt
                ? "border-[#C6F135]/60 bg-[#C6F135]/10 text-[#C6F135] shadow-[0_0_10px_rgba(198,241,53,0.25)]"
                : "border-white/[0.12] bg-white/[0.03] text-[#F5F5F0]"
            }`;
            const rowContent = (
              <>
                <span className="shrink-0 font-bold tabular-nums">{p.number}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {/* 位置（S/OH/MB/OP/L）：合併之後這份清單同時是「這場比賽的名單」，
                    位置是名單本來就該有的欄位。三個呼叫端一起顯示是刻意的——教練在計分頁
                    /戰術板同樣想知道要點的這個人是舉球還是自由，沒有理由只給其中一頁看。 */}
                <span className="shrink-0 text-micro text-[#9AA08C]">{p.role}</span>
                {currentZone && (
                  <span className="shrink-0 text-micro text-[#C6F135]/80">{currentZone}</span>
                )}
              </>
            );

            // ── 自由球員這一列（issue #327）──
            // ⚠️ 行為變更：以前是 `opacity-70` 的純資訊列，不可點也不可拖。那是「還沒有
            // 地方放得下 L」時的權宜，現在第七格就是他的去處：拖到第七格＝指定為先發 L，
            // 拖到某個號位＝由他頂替那個人。兩條路都不會動到六個號位（見 handleDropOnZone）。
            if (isLibero) {
              // 可拖的兩種情況：這個面板能編第七格；或者呼叫端開了 benchDraggable
              //（戰術板——那裡拖出去是要丟到球場上的備位區，跟這個面板無關）。
              const liberoDraggable = canEditLibero || benchDraggable;
              if (!canEditLibero) {
                return (
                  <div
                    key={p.id}
                    draggable={liberoDraggable}
                    onDragStart={liberoDraggable ? (e) => startDrag(e, p.id) : undefined}
                    className={`${rowClass} ${liberoDraggable ? "cursor-grab hover:border-[#C6F135] hover:text-[#C6F135] active:cursor-grabbing" : "opacity-70"}`}
                  >
                    {rowContent}
                  </div>
                );
              }
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => assignToSelectedZone(p.id)}
                  // 跟一般球員那顆一樣刻意不用 disabled（會連 draggable 一起廢掉），
                  // 只有選中第七格時點下去才有作用。
                  aria-disabled={selectedZone !== LIBERO_SLOT}
                  draggable
                  onDragStart={(e) => startDrag(e, p.id)}
                  className={`${rowClass} cursor-grab hover:border-[#C6F135] hover:text-[#C6F135] active:cursor-grabbing`}
                >
                  {rowContent}
                </button>
              );
            }

            return readOnly ? (
              // benchDraggable 時仍然是 div（不是 button）：click-to-assign 在唯讀模式下
              // 本來就不該存在，這裡只加拖曳屬性，不升級成可點擊的互動元件。
              <div
                key={p.id}
                draggable={benchDraggable}
                onDragStart={benchDraggable ? (e) => startDrag(e, p.id) : undefined}
                className={`${rowClass} ${benchDraggable ? "cursor-grab hover:border-[#C6F135] hover:text-[#C6F135] active:cursor-grabbing" : ""}`}
              >
                {rowContent}
              </div>
            ) : (
              <button
                key={p.id}
                type="button"
                onClick={() => assignToSelectedZone(p.id)}
                // 這裡刻意**不用** disabled：瀏覽器的 disabled button 完全不收指標事件，
                // 連帶把 draggable 也一起廢掉——沒選號位時整排球員就拖不動了，而「直接拖上場」
                // 正是不需要先選號位的那條路。改用 aria-disabled ＋ 樣式表達「點了沒用」，
                // 實際的防呆本來就在 assignToSelectedZone 開頭那個 early return。
                // 也不再把「沒選號位」的列變半透明：拖曳這條路隨時都能用，把它畫成
                // 灰掉的樣子等於騙使用者說這裡現在動不了。
                aria-disabled={selectedZone === null}
                draggable={canDrag}
                onDragStart={(e) => startDrag(e, p.id)}
                className={`${rowClass} cursor-grab hover:border-[#C6F135] hover:text-[#C6F135] active:cursor-grabbing`}
              >
                {rowContent}
              </button>
            );
          })}
        </div>
      )}

      {footer}
    </section>
  );
}
