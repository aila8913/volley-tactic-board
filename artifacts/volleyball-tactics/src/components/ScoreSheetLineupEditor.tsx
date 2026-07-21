import { useEffect, useState } from "react";
import { assignPlayerToZone, rotateLineup } from "@/lib/rotationLogic";
import type { MatchPlayer } from "@/types/match";
import type { LineupSnapshot } from "@/types/scoresheet";

// ── 計分頁右欄的先發編輯器（issue #120 第二階段）──
//
// 這一版刻意「不做彈窗」。前一版把換局改陣做成 Dialog，被 PO 打回的理由很直接：右欄
// 本來就有一塊站位視圖，彈窗等於把同一件事在畫面上做了兩遍，而且蓋住底下的計分表。
// docs/layout-spec.md §4 對右欄的規格是由上而下三塊——**輪轉表 → 輪次切換列 → 球員
// 清單**——那三塊合起來本來就是一個排站位的介面，這個元件就是把它做成可以動的版本，
// 取代原本唯讀的 ScoreSheetRotationPanel（同一個位置換人，不是多長一塊出來）。
//
// 跟 CourtReadOnlyView / ScoreSheetRotationPanel 一樣，這裡不 import 任何 store：
// draft 是自己的 local state，結果只透過 onConfirm 交出去（issue #117 的錨點決議）。
// 更重要的是它**完全不碰 useRotationTable**——計分表的先發真相只活在自己那份 per-set
// 快照裡，這是 issue #115/#154 立下的規矩，從右欄漏回去就前功盡棄。

// 六宮格排法是 docs/layout-spec.md §4.1 訂死的規格，不是隨便湊的：上排 4 3 2、下排
// 5 6 1，是「從場上視角看」的站位——1 號位在右後方（發球位），逆時針 1→6→5→4→3→2
// 依序輪轉（跟 lib/rotationLogic.ts 的 shiftSequence 是同一套順序）。spec 裡白紙黑字
// 寫「編號位置不可自行調整順序」，所以不要因為覺得「排起來比較整齊」就重排這個陣列，
// 不然畫面會跟真實球場對不起來，教練照著排反而排錯場上的人。
const GRID_ZONES = [4, 3, 2, 5, 6, 1] as const;

// 這個編輯器有兩種進場情境，差別只在文案與「能不能取消」：
//   - "initial"：這場還沒有任何先發（以前會叫使用者「前往戰術板」，現在直接在這裡排）。
//     沒有取消鈕——不排先發就沒辦法開始記錄，給一顆按了等於卡住的鈕沒有意義。
//   - "next-set"：按了「下一局」，正在決定新一局的先發。可以取消，取消＝這一局維持
//     現狀、不推進（換局是個不小的動作，要留反悔的空間）。
export type LineupEditorMode = "initial" | "next-set";

interface ScoreSheetLineupEditorProps {
  mode: LineupEditorMode;
  // 要排的是第幾局，純顯示用。
  setNumber: number;
  // 初始草稿的來源：next-set 是「剛結束那一局」的先發快照，initial 則是輪轉表當下能
  // 擷取出來的站位（可能是 null＝完全空場，這時就從零開始點）。
  seedLineup: LineupSnapshot | null;
  roster: MatchPlayer[];
  onConfirm: (lineup: LineupSnapshot) => void;
  onCancel?: () => void;
}

export default function ScoreSheetLineupEditor({
  mode,
  setNumber,
  seedLineup,
  roster,
  onConfirm,
  onCancel,
}: ScoreSheetLineupEditorProps) {
  const [draft, setDraft] = useState<LineupSnapshot>(seedLineup ?? {});
  const [selectedZone, setSelectedZone] = useState<number | null>(null);

  // 只在「這次編輯開始」的當下拿 seedLineup 初始化一次，之後就讓 draft 自己走。
  // 為什麼不直接跟著 prop 同步：使用者可能轉了幾輪、換了幾個人才按確定，如果 draft
  // 綁著 seedLineup，上層任何一次 re-render（例如對手得分讓 record 變動）都會把使用者
  // 排到一半的結果洗掉。依賴陣列用 [mode, setNumber]，等於「換一個編輯情境才重新播種」。
  useEffect(() => {
    setDraft(seedLineup ?? {});
    setSelectedZone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, setNumber]);

  const filledCount = Object.keys(draft).length;
  const canConfirm = filledCount === 6;

  // 自由球員（role "L"）不列進這六個號位——LineupSnapshot 定義上就只記非自由球員，
  // 自由球員在計分表裡是從場邊靠換人上場的（見 types/scoresheet.ts）。
  const assignablePlayers = roster.filter((p) => p.role !== "L");

  // 點球員＝把他指派到目前選中的號位。真正的指派/互換規則放在 lib/rotationLogic.ts 的
  // assignPlayerToZone：那是領域規則（六人佈陣怎麼調整才合法），不是這個元件的 UI 細節，
  // 抽出去才測得到（專案還沒有 @testing-library/react，見 issue #168）。
  const assignToSelectedZone = (playerId: string) => {
    if (selectedZone === null) return;
    setDraft((prev) => assignPlayerToZone(prev, selectedZone, playerId));
    setSelectedZone(null);
  };

  return (
    <section
      className="shrink-0 border-b border-white/[0.10] px-3 py-3"
      data-testid="score-sheet-lineup-editor"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#F5F5F0]">
          {mode === "initial" ? "排第 1 局先發" : `排第 ${setNumber} 局先發`}
        </h2>
        <span className="text-xs text-[#9AA08C]">{filledCount}/6</span>
      </div>

      {/* ① 輪轉表（layout-spec §4.1）：六宮格本身就是站位表，點格子選號位。 */}
      <div className="grid grid-cols-3 gap-1.5">
        {GRID_ZONES.map((zone) => {
          const playerId = draft[zone];
          const player = playerId ? roster.find((p) => p.id === playerId) : undefined;
          const isSelected = selectedZone === zone;
          return (
            <button
              key={zone}
              onClick={() => setSelectedZone(isSelected ? null : zone)}
              className={`flex flex-col items-center justify-center rounded-lg border px-1 py-2 transition ${
                isSelected
                  ? "border-[#C6F135] bg-[#C6F135]/10 text-[#C6F135]"
                  : "border-white/[0.12] bg-white/[0.04] text-[#F5F5F0] hover:border-white/[0.30]"
              }`}
            >
              <span className="text-[10px] text-[#9AA08C]">{zone}</span>
              <span className="text-xs font-bold leading-tight">
                {player ? player.number : "—"}
              </span>
              <span className="text-[10px] leading-tight text-[#9AA08C]">
                {player ? player.name.slice(0, 3) : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* ② 輪次切換列（layout-spec §4.2）：spec 寫明「是 stepper 不是下拉選單」，
        左右兩顆貼齊、狀態文字置中。這裡轉的是**先發要從哪一輪開始**，不是在看
        既有輪轉的第幾輪——所以中間顯示的是動作提示而不是輪次數字。
        「沿用」是把草稿倒回種子站位，等於 spec 沒畫但實際很常用的「reset」。 */}
      <div className="mt-2 flex items-stretch gap-1">
        <button
          onClick={() => setDraft((prev) => rotateLineup(prev, -1))}
          disabled={filledCount === 0}
          className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-2 py-1.5 text-xs text-[#F5F5F0] transition hover:border-white/[0.30] disabled:opacity-40"
        >
          ↰
        </button>
        <button
          onClick={() => setDraft(seedLineup ?? {})}
          disabled={!seedLineup}
          className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-2 py-1.5 text-xs text-[#F5F5F0] transition hover:border-white/[0.30] disabled:opacity-40"
        >
          {mode === "initial" ? "沿用輪轉表" : "照上一局"}
        </button>
        <button
          onClick={() => setDraft((prev) => rotateLineup(prev, 1))}
          disabled={filledCount === 0}
          className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-2 py-1.5 text-xs text-[#F5F5F0] transition hover:border-white/[0.30] disabled:opacity-40"
        >
          ↱
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-[#9AA08C]">
        {selectedZone !== null
          ? `已選 ${selectedZone} 號位，點下面的球員指派過去（他原本在別的號位就互換）`
          : "先點一個號位，再點球員把他放進去"}
      </p>

      {/* ③ 球員清單（layout-spec §4.3）：已經在場上的人標出目前號位，讓教練一眼看出
        誰還在板凳上。清單可能比六個號位長不少，給它自己的捲動範圍，才不會把下面的
        統計區推出視野外（右欄是 flex-column，這個 section 是 shrink-0）。 */}
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-0.5">
        {assignablePlayers.map((p) => {
          const currentZone = Object.entries(draft).find(([, pid]) => pid === p.id)?.[0];
          return (
            <button
              key={p.id}
              onClick={() => assignToSelectedZone(p.id)}
              disabled={selectedZone === null}
              className="flex w-full items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-2 py-1.5 text-left text-xs text-[#F5F5F0] transition hover:border-[#C6F135] hover:text-[#C6F135] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="font-bold tabular-nums">{p.number}</span>
              <span className="truncate">{p.name}</span>
              {currentZone && (
                <span className="ml-auto shrink-0 text-[10px] text-[#9AA08C]">{currentZone}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-bold text-[#9AA08C] transition hover:border-white/[0.30] hover:text-[#F5F5F0]"
          >
            取消
          </button>
        )}
        <button
          onClick={() => canConfirm && onConfirm(draft)}
          disabled={!canConfirm}
          className="flex-1 rounded-lg bg-[#C6F135] px-3 py-1.5 text-xs font-bold text-[#121310] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canConfirm ? "確定" : `還差 ${6 - filledCount} 人`}
        </button>
      </div>
    </section>
  );
}
