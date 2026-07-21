import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "@/lib/tacticsBoardStyles";
import { assignPlayerToZone, lineupToPositions, rotateLineup } from "@/lib/rotationLogic";
import CourtReadOnlyView from "@/components/CourtReadOnlyView";
import type { MatchPlayer } from "@/types/match";
import type { LineupSnapshot } from "@/types/scoresheet";

// 換局換輪視窗（issue #120 第二階段）。
//
// 這個彈窗要解決的問題：以前按「下一局」之後，教練想換陣的唯一途徑是跑回戰術頁改輪轉表，
// 再回計分頁讓 start() 重新擷取一次——路徑很繞，而且戰術頁改的是「全域」輪轉表（所有頁面
// 共用的那份 store），教練往往只是想換這一局的站位，卻得動到跟這場比賽、甚至別場比賽共用
// 的東西。這個彈窗把「換局時要不要換陣」收攏成一個獨立的小步驟，而且刻意設計成**只讀寫
// 呼叫端傳進來的 previousLineup／只透過 onConfirm 把結果交出去**，彈窗本身完全不 import
// useRotationTable——維持 issue #115/#154 立下的規矩：計分表的先發真相只活在自己這份
// per-set 快照裡，不回頭污染全域輪轉表。

// 手動重排位的六宮格排法是 docs/layout-spec.md §4.1 訂死的規格，不是隨便湊的：
// 上排 4 3 2、下排 5 6 1，是「從場上視角看」的站位——1 號位在右後方（發球輪到的位置），
// 逆時針 1→6→5→4→3→2 依序輪轉（跟 lib/rotationLogic.ts 的 shiftSequence 是同一套順序）。
// 這裡直接把這個排列寫死成陣列，不要因為想「看起來更整齊」就重新排序，不然會跟真實球場
// 站位對不起來，教練照著畫面排反而會排錯場上的人。
const MANUAL_GRID_ZONES = [4, 3, 2, 5, 6, 1] as const;

interface SetLineupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 即將開始的「新」局號，純顯示用（標題「第 N 局要用什麼先發？」)。
  setNumber: number;
  // 剛結束那一局的先發快照，「照上次」按鈕的資料來源。可能是 null（例如第一局根本
  // 還沒排過先發），這時「照上次」要停用，不能讓使用者複製一份不存在的陣容。
  previousLineup: LineupSnapshot | null;
  roster: MatchPlayer[];
  // 使用者按下「確定」才會呼叫，帶著這次選好的先發快照。呼叫端（ScoreSheet.tsx）收到後
  // 才會真的推進到下一局、把這份快照寫進去——按 Esc/點外面關閉視窗不會呼叫這個 callback，
  // 等於「不換局」（見下方 onOpenChange 的說明）。
  onConfirm: (lineup: LineupSnapshot) => void;
}

export default function SetLineupDialog({
  open,
  onOpenChange,
  setNumber,
  previousLineup,
  roster,
  onConfirm,
}: SetLineupDialogProps) {
  const [draft, setDraft] = useState<LineupSnapshot | null>(previousLineup);
  const [manualMode, setManualMode] = useState(false);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);

  // 只在「打開」那一刻（false → true）才用 previousLineup 初始化 draft，而不是讓 draft
  // 一路跟著 props 同步。為什麼要分這兩種：使用者可能在視窗裡試轉了好幾格、甚至進了手動
  // 重排模式，最後卻按了取消——這次操作應該整個不算數，下次打開要重新從「上一局真正的
  // 先發」開始試，而不是接續上次試到一半的結果。如果 draft 直接綁定 previousLineup，
  // 取消不會清掉使用者已經動過的 draft（因為 previousLineup 這個 prop 根本沒變），
  // 就會出現「明明按了取消，畫面卻還是轉過的站位」這種違反直覺的行為。
  useEffect(() => {
    if (!open) return;
    setDraft(previousLineup);
    setManualMode(false);
    setSelectedZone(null);
    // 故意只依賴 open：只想在「開啟」這個事件發生的當下拍一次快照，不想在 previousLineup
    // 本身變動時重新同步（那樣反而會覆蓋使用者已經在視窗裡做的轉輪/手動調整）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canConfirm = draft !== null && Object.keys(draft).length === 6;

  const handleConfirm = () => {
    if (!canConfirm || !draft) return;
    onConfirm(draft);
    onOpenChange(false);
  };

  const handleUseLastSet = () => {
    if (!previousLineup) return;
    setDraft(previousLineup);
  };

  const handleRotate = (step: number) => {
    setDraft((prev) => (prev ? rotateLineup(prev, step) : prev));
  };

  // 自由球員（role "L"）不列入這六個號位——LineupSnapshot 的定義本來就只記非自由球員，
  // 自由球員在計分表裡是從場邊出發、靠換人上場（見 types/scoresheet.ts 的
  // LineupSnapshot 說明），手動重排位也不該讓教練把 L 塞進這六個號位裡。
  const assignablePlayers = roster.filter((p) => p.role !== "L");

  // 點球員清單裡的某個人，把他指派到目前選中的號位。實際的指派/互換規則放在
  // lib/rotationLogic.ts 的 assignPlayerToZone——那是領域規則（六人佈陣怎麼調整才合法），
  // 不是這個彈窗的 UI 細節，抽出去才測得到（見該函式的註解）。這裡只負責把 UI 狀態
  // （選中哪一格、目前的 draft）餵給它、把結果收回來。
  const assignToSelectedZone = (playerId: string) => {
    if (selectedZone === null) return;
    setDraft((prev) => assignPlayerToZone(prev ?? {}, selectedZone, playerId));
    setSelectedZone(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.18] bg-[#12140f] text-[#f5f5f0] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#f5f5f0]">第 {setNumber} 局要用什麼先發？</DialogTitle>
          <DialogDescription className="text-[#a9b096]">
            選好之後按確定才會換局；按 Esc 或點外面關閉視窗，這一局維持現狀、不會被推進。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleUseLastSet}
            disabled={!previousLineup}
            className={`px-3 py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            照上次
          </button>
          <button
            onClick={() => handleRotate(-1)}
            disabled={!draft}
            className={`px-3 py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            ↰ 上一輪
          </button>
          <button
            onClick={() => handleRotate(1)}
            disabled={!draft}
            className={`px-3 py-1.5 text-xs font-bold ${SECONDARY_BTN_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            ↱ 下一輪
          </button>
          <button
            onClick={() => setManualMode((m) => !m)}
            className={`px-3 py-1.5 text-xs font-bold ${
              manualMode ? PRIMARY_BTN_CLASS : SECONDARY_BTN_CLASS
            }`}
          >
            重新排位
          </button>
        </div>

        {!manualMode ? (
          // 非手動模式：純預覽，直接借用計分頁右欄同一顆唯讀球場元件。rotation 傳 0 是因為
          // 這裡顯示的永遠是「新這一局的先發站位」，先發照定義就是這一局的 rotation 0——
          // 之後真正比賽開打，球場輪轉會從這份快照重新算起。
          <CourtReadOnlyView
            positions={draft ? lineupToPositions(draft, 0) : []}
            roster={roster}
            className="mt-1"
          />
        ) : (
          <div className="mt-1 flex flex-col gap-3">
            {/* 六宮格：排法固定是 docs/layout-spec.md §4.1 規定的「上 4 3 2、下 5 6 1」，
              不可依畫面美觀重新排序（見檔案開頭 MANUAL_GRID_ZONES 的說明）。 */}
            <div className="grid grid-cols-3 gap-2">
              {MANUAL_GRID_ZONES.map((zone) => {
                const playerId = draft?.[zone];
                const player = playerId ? roster.find((p) => p.id === playerId) : undefined;
                const isSelected = selectedZone === zone;
                return (
                  <button
                    key={zone}
                    onClick={() => setSelectedZone(zone)}
                    className={`flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-xs transition ${
                      isSelected
                        ? "border-[#c6f135] bg-[#c6f135]/10 text-[#c6f135]"
                        : "border-white/[0.18] bg-white/[0.05] text-[#f5f5f0] hover:border-white/[0.35]"
                    }`}
                  >
                    <span className="text-[10px] text-[#a9b096]">{zone} 號位</span>
                    <span className="font-bold">
                      {player ? `${player.number} ${player.name.slice(0, 4)}` : "（空）"}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-[#a9b096]">
              {selectedZone
                ? `已選 ${selectedZone} 號位，點下面的球員指派過去（原本在別號位會互換）`
                : "先點一個號位，再點下面的球員把他指派過去"}
            </p>

            {/* 球員清單只列非自由球員（role !== "L"）——LineupSnapshot 定義上就不含自由
              球員，見上方 assignablePlayers 的說明。已在場上的球員標示目前站在哪個號位，
              方便教練一眼看出「這個人現在在不在場上」。 */}
            <div className="grid grid-cols-2 gap-1.5">
              {assignablePlayers.map((p) => {
                const currentZone = draft
                  ? Object.entries(draft).find(([, pid]) => pid === p.id)?.[0]
                  : undefined;
                return (
                  <button
                    key={p.id}
                    onClick={() => assignToSelectedZone(p.id)}
                    disabled={selectedZone === null}
                    className={`rounded-lg border border-white/[0.18] bg-white/[0.03] px-2 py-1.5 text-left text-xs
                      text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]
                      disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span className="font-bold">
                      {p.number} {p.name}
                    </span>
                    {currentZone && (
                      <span className="ml-1 text-[10px] text-[#a9b096]">({currentZone} 號位)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm font-bold ${PRIMARY_BTN_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            確定
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
