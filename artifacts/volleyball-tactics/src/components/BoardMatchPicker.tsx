import type { ChangeEvent } from "react";
import { useMatchList } from "../hooks/useMatches";
import { formatMatchDateTime } from "../lib/matchSummary";

// 戰術板 header 的「選比賽」下拉——issue #372 決策②③④⑤ part 1：/board（空板）不再要求
// 一定要帶著某一場比賽的 id 才能進戰術板，原本 header 那句「vs 誰誰誰」（唯讀文字）就沒有
// 位置能一直待著了，換成這顆下拉：可以留在空板、也可以隨時切去別場借站位。
//
// 選項標題沿用 MatchList.tsx 列表卡片的寫法（`vs ${opponent}` + formatMatchDateTime 的日期），
// 理由是同一個道理反覆出現在這個 repo 很多地方：同一場比賽在不同畫面要用同一句話描述它，
// 不然使用者會懷疑自己是不是選錯了場。
//
// 這個元件刻意做成「啞的」（dumb controlled component）：不自己決定「選了之後要不要真的
// 切過去」——那牽涉到「板上有沒有未存內容」「要不要跳確認」「要不要順便借站位」，這些邏輯
// 全部留給呼叫端（TacticsBoard.tsx）決定，這裡只負責「畫出選單」跟「回報使用者選了什麼」。
// 這樣拆的好處是這顆元件本身幾乎不用測什麼分支——測試只需要驗證「畫出了哪些選項」跟
// 「onChange 時 onSelect 收到正確的值」，不用假裝自己知道 confirm 對話框長什麼樣子。
interface BoardMatchPickerProps {
  // 目前選中的比賽 id；null＝空板（對應「未選比賽（空板）」那個選項）。
  matchId: string | null;
  // 使用者在下拉選了別的選項。id＝選了某一場；null＝選了「未選比賽（空板）」。
  onSelect: (matchId: string | null) => void;
}

// 空板選項固定用空字串當 <option> 的 value——原生 <select> 的 value 只能是字串，用空字串
// 代表「沒有 id」是最直覺的選擇，跟 matchId=null 的轉換只在這個檔案內部發生一次
//（handleChange 裡），呼叫端拿到的仍然是型別乾淨的 string | null，不用自己記得這個約定。
const BLANK_OPTION_VALUE = "";

export default function BoardMatchPicker({ matchId, onSelect }: BoardMatchPickerProps) {
  const { matches } = useMatchList();

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onSelect(value === BLANK_OPTION_VALUE ? null : value);
  };

  return (
    // 樣式沿用 CrossMatchAnalytics.tsx 那顆球隊篩選 select 的做法——這個 repo 目前沒有
    // shadcn 的深色主題 Select，硬套淺色主題的 <Select> 反而要花更多力氣改色票，一顆原生
    // select 手接幾個 token class 就跟畫面其他玻璃感元件很搭了（那邊的註解也是同樣的結論）。
    <select
      value={matchId ?? BLANK_OPTION_VALUE}
      onChange={handleChange}
      data-testid="board-match-picker"
      className="rounded-full border border-white/[0.26] bg-white/[0.05] px-3 py-1.5 text-xs
        font-bold text-[#f5f5f0] outline-none transition hover:border-[#c6f135]
        focus:border-[#c6f135] [&>option]:bg-[#0a0b07]"
    >
      <option value={BLANK_OPTION_VALUE}>未選比賽（空板）</option>
      {matches.map((m) => (
        <option key={m.id} value={m.id}>
          {`vs ${m.opponent}（${formatMatchDateTime(m.dateTime)}）`}
        </option>
      ))}
    </select>
  );
}
