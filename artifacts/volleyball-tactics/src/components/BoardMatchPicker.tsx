import { useState } from "react";
import { useMatchList } from "../hooks/useMatches";
import { formatMatchDateTime } from "../lib/matchSummary";

// 戰術板「選比賽」主詞——issue #372 決策②③④⑤ part 1：/board（空板）不再要求一定要帶著
// 某一場比賽的 id 才能進戰術板，原本 header 那句「vs 誰誰誰」（唯讀文字）就沒有位置能一直
// 待著了，換成這顆下拉：可以留在空板、也可以隨時切去別場借站位。
//
// issue #433（header ＋ 佈陣右欄 v3）整條重寫：原本是一顆藥丸形狀的原生 <select>，這次改成
// 自畫的按鈕＋選單——理由不是喜好，是原生 <select> 的 <option> 只能放純文字，畫不出設計稿
// 要的東西（選中項一顆萊姆綠圓點、日期時間獨立右對齊成一欄、群組標題「最近比賽」）。這些都
// 需要每個選項是一段有結構的 HTML，原生下拉做不到。
//
// 平常「零 chrome」（沒有背景、沒有邊框，就是一行文字浮在球場上），只有展開時才長出深色底
// 跟萊姆綠外框——spec 的理由是「選比賽是個中斷性動作，蓋住球場是誠實的，不是副作用」。
//
// 這個元件刻意做成「啞的」（controlled component）：不自己決定「選了之後要不要真的切過去」
// ——那牽涉到「板上有沒有未存內容」「要不要跳確認」「要不要順便借站位」，這些邏輯全部留給
// 呼叫端（TacticsBoard.tsx）決定，這裡只負責「畫出選單」跟「回報使用者選了什麼」。
interface BoardMatchPickerProps {
  // 目前選中的比賽 id；null＝空板。
  matchId: string | null;
  // 使用者在選單選了別的選項。id＝選了某一場；null＝選了「未選比賽（空板）」。
  onSelect: (matchId: string | null) => void;
}

export default function BoardMatchPicker({ matchId, onSelect }: BoardMatchPickerProps) {
  const { matches } = useMatchList();
  const [open, setOpen] = useState(false);

  const current = matchId ? matches.find((m) => m.id === matchId) : undefined;
  const isBlank = matchId === null;

  const handleChoose = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    // relative 錨點：選單用 absolute 貼著這個容器的左緣、正下方落下（見 spec §1.3）。
    // 跟 TacticsExportMenu.tsx 是同一種「觸發鈕 + 條件渲染選單」結構，沒有做 click-outside
    // 自動關閉——這個 repo 目前這一類輕量下拉（見 TacticsExportMenu）都靠再點一次觸發鈕
    // 或選一個選項來關閉，這裡沿用同一套習慣，不單獨開一個新的互動模式。
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="board-match-picker-trigger"
        aria-expanded={open}
        className={`flex min-w-0 max-w-[330px] items-baseline gap-[9px] rounded-lg border py-[5px] pl-0 pr-[9px] transition ${
          open
            ? "border-[#c6f135]/40 bg-[#0a0b07]/70 pl-[9px] backdrop-blur-[10px]"
            : "border-transparent"
        }`}
      >
        {isBlank ? (
          <span className="truncate font-dash text-display font-semibold tracking-[-0.02em] text-[#a9b096]/80">
            未選比賽
          </span>
        ) : (
          <>
            <span className="max-w-[210px] flex-none truncate font-dash text-display font-semibold tracking-[-0.02em]">
              {current?.opponent ?? "（找不到這場比賽）"}
            </span>
            {current && (
              <span className="min-w-0 truncate font-label text-caption text-[#a9b096]">
                {formatMatchDateTime(current.dateTime)}
              </span>
            )}
          </>
        )}
        <span className="flex-none text-micro text-[#a9b096]/60">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div
          data-testid="board-match-picker-menu"
          className="absolute left-0 top-[44px] z-40 flex w-72 flex-col rounded-[11px] border
            border-white/[0.10] bg-[#0b0c09]/97 p-1.5 shadow-[0_24px_50px_rgba(0,0,0,0.66)]
            backdrop-blur-[18px]"
        >
          <button
            type="button"
            onClick={() => handleChoose(null)}
            data-testid="board-match-picker-option-blank"
            className={`flex h-[34px] items-center rounded-[7px] px-2.5 text-caption transition hover:bg-white/[0.05] ${
              isBlank ? "bg-[#c6f135]/[0.09] text-[#c6f135]" : ""
            }`}
          >
            未選比賽（空板）
          </button>

          {matches.length > 0 && (
            <>
              <div className="my-1 h-px bg-white/[0.07]" />
              <div className="px-2.5 py-1 font-label text-micro tracking-[0.16em] text-[#a9b096]/55">
                最近比賽
              </div>
              {matches.map((m) => {
                const selected = m.id === matchId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleChoose(m.id)}
                    data-testid={`board-match-picker-option-${m.id}`}
                    className={`flex h-[34px] items-center gap-2 rounded-[7px] px-2.5 text-caption transition hover:bg-white/[0.05] ${
                      selected ? "bg-[#c6f135]/[0.09] text-[#c6f135]" : ""
                    }`}
                  >
                    {/* 選中項左側一顆圓點，未選項留同寬空位保持對齊——不是「有沒有點」，
                      是「點在不在」，才不會讓清單隨著誰被選中而左右跳動。 */}
                    <span
                      className={`h-[5px] w-[5px] flex-none rounded-full ${
                        selected ? "bg-[#c6f135]" : ""
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-left">{m.opponent}</span>
                    <span className="flex-none font-label text-micro text-[#a9b096]/60">
                      {formatMatchDateTime(m.dateTime)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
