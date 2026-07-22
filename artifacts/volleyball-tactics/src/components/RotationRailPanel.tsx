import { useState } from "react";
import type { ReactNode } from "react";
import { assignPlayerToZone } from "@/lib/rotationLogic";
import type { MatchPlayer } from "@/types/match";
import type { LineupSnapshot } from "@/types/scoresheet";

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
  lineup: LineupSnapshot | null;
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
  onLineupChange?: (next: LineupSnapshot) => void;
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
  // 頁面各自想加在三個區塊下面的額外內容（戰術板放球員設定/輪次選擇/提示；
  // 計分頁目前用不到，留空）。
  footer?: ReactNode;
}

// 六宮格排法是 docs/layout-spec.md §4.1 訂死的規格，不是隨便湊的：上排 4 3 2、下排
// 5 6 1，是「從場上視角看」的站位——1 號位在右後方（發球位），逆時針 1→6→5→4→3→2
// 依序輪轉（跟 lib/rotationLogic.ts 的 shiftSequence 是同一套順序）。spec 裡白紙黑字
// 寫「編號位置不可自行調整順序」，所以不要因為覺得「排起來比較整齊」就重排這個陣列，
// 不然畫面會跟真實球場對不起來，教練照著排反而排錯場上的人。
const GRID_ZONES = [4, 3, 2, 5, 6, 1] as const;

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
  footer,
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
  const [selectedZone, setSelectedZone] = useState<number | null>(null);

  const safeLineup = lineup ?? {};
  const filledCount = Object.keys(safeLineup).length;

  // axis 決定「這個數字是輪還是局」的文案（issue #174）：計分頁/戰術板既有用法是輪
  // （沿著六人輪轉制走），比賽列表右欄（#170）要顯示的是局數，兩者共用同一個標題列
  // 版位、只換單位字，不用整段複製一份。
  const unitLabel = axis === "set" ? "局" : "輪";

  // 自由球員（role "L"）不列進這六個號位——LineupSnapshot 定義上就只記非自由球員，
  // 自由球員是從場邊靠換人上場的（見 types/scoresheet.ts）。
  const assignablePlayers = roster.filter((p) => p.role !== "L");

  // 點球員＝把他指派到目前選中的號位。真正的指派/互換規則放在 lib/rotationLogic.ts 的
  // assignPlayerToZone：那是領域規則（六人佈陣怎麼調整才合法），不是這個元件的 UI 細節，
  // 抽出去才測得到（專案還沒有 @testing-library/react，見 issue #168）。
  const assignToSelectedZone = (playerId: string) => {
    if (selectedZone === null || !onLineupChange) return;
    onLineupChange(assignPlayerToZone(safeLineup, selectedZone, playerId));
    setSelectedZone(null);
  };

  return (
    <section
      // opacity-90：「對照用的參考物、不是可以動手的編輯器」的視覺提示（issue #160
      // 對戰術頁右欄輪轉表訂的規格延伸過來）——讓使用者一眼分辨這裡「看得到、動不了」。
      className={`shrink-0 border-b border-white/[0.10] px-3 py-3 ${readOnly ? "opacity-90" : ""}`}
      data-testid="rotation-rail-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[#F5F5F0]">{title}</h2>
        <div className="flex items-center gap-2">
          {/* 「第 N 輪／第 N 局」永遠顯示，唯讀或可編輯都一樣。這是 #120 第一階段的核心補強——
            在此之前計分頁整頁沒有任何地方顯示 currentSet.ourRotation，教練看得到誰站哪，
            卻不知道現在輪到第幾轉。它本身是純資訊、不是控制項：計分頁的輪次由得分自動推進，
            戰術板的輪次由 RotationSwitcher 切（那顆帶白板 session 副作用，見 RotationTable）。
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

      {/* ① 輪轉表（layout-spec §4.1）：六宮格本身就是站位表。可編輯時點格子選號位；
        唯讀時純粹渲染成看不能點的資訊卡片。 */}
      <div className="grid grid-cols-3 gap-1.5">
        {GRID_ZONES.map((zone) => {
          const playerId = safeLineup[zone];
          const player = playerId ? roster.find((p) => p.id === playerId) : undefined;
          const isSelected = !readOnly && selectedZone === zone;
          const cellContent = (
            <>
              <span className="text-[10px] text-[#9AA08C]">{zone}</span>
              <span className="text-xs font-bold leading-tight">
                {player ? player.number : "—"}
              </span>
              <span className="text-[10px] leading-tight text-[#9AA08C]">
                {player ? player.name.slice(0, 3) : ""}
              </span>
            </>
          );
          const cellClass = `flex flex-col items-center justify-center rounded-lg border px-1 py-2 transition ${
            isSelected
              ? "border-[#C6F135] bg-[#C6F135]/10 text-[#C6F135]"
              : "border-white/[0.12] bg-white/[0.04] text-[#F5F5F0]"
          } ${!readOnly ? "hover:border-white/[0.30]" : ""}`;

          // readOnly 用 div 而不是 disabled button：既不用處理 disabled 的按鈕樣式，
          // 也從語意上明確表示「這裡沒有任何互動」，不會被螢幕閱讀器唸成一顆按不動的按鈕。
          return readOnly ? (
            <div key={zone} className={cellClass}>
              {cellContent}
            </div>
          ) : (
            <button
              key={zone}
              onClick={() => setSelectedZone(isSelected ? null : zone)}
              className={cellClass}
            >
              {cellContent}
            </button>
          );
        })}
      </div>

      {/* layout-spec §4.2 的「輪次切換 stepper」：上一版寫死不做，是因為當時兩個呼叫端
        （計分頁／戰術板）都不需要互動式切換——計分頁的輪次由得分自動推進，戰術板用
        RotationSwitcher（帶白板 session 副作用，見 RotationTable.tsx），先寫好卻沒有
        呼叫端傳 onRotationChange 等於死碼，所以先拔掉、只留純文字顯示。
        現在（issue #174）比賽列表右欄要切的是「局」，是貨真價實需要互動的第三個呼叫端，
        才把 stepper 加回來——但做法跟上一版不同：改成 onStep 這個「純粹回報使用者按了
        上/下」的回呼，元件本身不內建 mod 6 或邊界判斷（見 props 註解），輪是環狀、局是
        線性有邊界，這兩種領域規則由呼叫端各自決定要不要允許再往前/後、算完新的值再把
        新的 rotation/lineup 傳回來。元件只負責畫出按鈕、回報方向。
        沒有 onStep 就完全不渲染這個區塊，維持「純資訊、看戲的人不會誤以為能點」的原樣。 */}
      {onStep && (
        <div className="mt-2 flex items-center gap-1.5">
          <button
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
            onClick={() => onStep(1)}
            disabled={!canStepNext}
            className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.04] py-1.5 text-xs font-bold text-[#F5F5F0] transition hover:border-white/[0.30] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`下一${unitLabel}`}
          >
            下
          </button>
        </div>
      )}

      {!readOnly && (
        <p className="mt-2 text-[11px] leading-snug text-[#9AA08C]">
          {selectedZone !== null
            ? `已選 ${selectedZone} 號位，點下面的球員指派過去（他原本在別的號位就互換）`
            : "先點一個號位，再點球員把他放進去"}
        </p>
      )}

      {/* ③ 球員清單（layout-spec §4.3）：已經在場上的人標出目前號位，讓教練一眼看出
        誰還在板凳上。清單可能比六個號位長不少，給它自己的捲動範圍，才不會把下面的
        區塊推出視野外（右欄是 flex-column，這個 section 是 shrink-0）。 */}
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-0.5">
        {assignablePlayers.map((p) => {
          const currentZone = Object.entries(safeLineup).find(([, pid]) => pid === p.id)?.[0];
          const rowClass =
            "flex w-full items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-2 py-1.5 text-left text-xs text-[#F5F5F0] transition";
          const rowContent = (
            <>
              <span className="font-bold tabular-nums">{p.number}</span>
              <span className="truncate">{p.name}</span>
              {currentZone && (
                <span className="ml-auto shrink-0 text-[10px] text-[#9AA08C]">{currentZone}</span>
              )}
            </>
          );

          return readOnly ? (
            <div key={p.id} className={rowClass}>
              {rowContent}
            </div>
          ) : (
            <button
              key={p.id}
              onClick={() => assignToSelectedZone(p.id)}
              disabled={selectedZone === null}
              className={`${rowClass} hover:border-[#C6F135] hover:text-[#C6F135] disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {rowContent}
            </button>
          );
        })}
      </div>

      {footer}
    </section>
  );
}
