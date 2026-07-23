import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";

// 中央列表的大卡片（issue #175 環 4、docs/layout-spec.md §3.1）。
//
// 一張元件同時服務「賽事資料夾」與「單場比賽」兩種項目，靠左端的徽章（資／比）區分——
// 線框稿的設計意圖就是**兩種東西混在同一個列表裡**，所以它們的排版必須是同一份程式碼，
// 分成兩個元件遲早會飄成兩種行高、兩種對齊。差異全部收斂成 props（徽章字、次要資訊字串）。
//
// 尺寸意圖：這是給「賽場邊站著用手指快點」的卡片，不是資訊密度優先的表格，所以點擊目標要夠大、
// 卡距要鬆。但 Figma 基準 1136×252 等比縮下來的 176px 實測太空曠（PO 2026-07-23：「一行式
// 現在上下太寬了」）——線框稿那個高度是配「卡片裡有多行內容」畫的，我們的內容只有一行，
// 同樣的高度就變成一大片留白。收斂到 104：仍遠大於觸控最小目標 44px，鬆的意圖保留，
// 但不再是為了填滿而填滿的空白。
const CARD_MIN_HEIGHT = "min-h-[104px]";

export type ListItemKind = "tournament" | "match";

interface ListItemCardProps {
  kind: ListItemKind;
  title: string;
  // 資料夾沒有比賽時間，所以是 optional：日期那一格會整個不渲染而不是留一個空白佔位。
  dateText?: string;
  // 次要資訊隨類型變：資料夾「5 場比賽」、比賽「3:0 勝」。字串由呼叫端算好傳進來——
  // 卡片不該認識 tournament/match 的資料形狀，否則它就得同時 import 兩種型別跟兩套查詢。
  secondaryText: string;
  selected: boolean;
  onSelect: () => void;
  // 雙擊＝進入。資料夾用它跳進內頁；比賽不傳（比賽的入口改成選中後在卡片裡展開，見
  // expandedContent），所以是 optional——不傳就只有選取行為，不會有「手滑點兩下就跳頁」。
  onOpen?: () => void;
  // 選中時在卡片下半部展開的內容（issue #175：比賽的三個入口）。
  //
  // 原本是疊一層 modal 蓋住整個列表，PO 2026-07-23 改成「該格向下拉長」：疊層會把上下文
  // 整個蓋掉，使用者為了看一眼入口就失去列表位置；卡片就地長高則是原地展開，旁邊哪幾場、
  // 自己捲到哪裡都還在，也不需要一個「返回列表」的動作把它收掉——再點別張卡就換過去了。
  expandedContent?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}

const BADGE_TEXT: Record<ListItemKind, string> = {
  tournament: "資",
  match: "比",
};

export default function ListItemCard({
  kind,
  title,
  dateText,
  secondaryText,
  selected,
  onSelect,
  onOpen,
  expandedContent,
  onEdit,
  onDelete,
}: ListItemCardProps) {
  return (
    <article
      onClick={onSelect}
      onDoubleClick={onOpen}
      // 選中態用的是 #134 環 0 定案的「強階」：玻璃提亮 bg-[#c6f135]/15 ＋ 一圈細環
      // ring-1 ring-[#c6f135]。線框稿字面寫的是「整張反白」（實色底＋深色字），但那是
      // **持續呈現**的狀態、不是按下就放開的瞬間回饋，整張卡片鋪滿實色長時間看太搶眼，
      // 所以定案改成同一套玻璃材質再加環——完整比較見 docs/design-spec.md「選取狀態」。
      // 左欄導覽的 active 用的是同一組值，兩邊視覺才對得起來。
      className={`flex cursor-pointer select-none flex-col rounded-2xl border px-8 font-dash
        text-[#f5f5f0] shadow-lg shadow-black/35 backdrop-blur-md transition ${
          selected
            ? "border-[#c6f135]/40 bg-[#c6f135]/15 ring-1 ring-[#c6f135]"
            : "border-white/[0.12] bg-white/[0.07] hover:border-white/[0.26]"
        }`}
    >
      {/* 這一層才是「一行式」的那一行：卡片本身改成直向容器（要容納展開區），所以最小高度、
          垂直置中都掛在這裡，不然展開之後上半行會被拉開、跟沒展開的卡片對不齊。 */}
      <div className={`flex ${CARD_MIN_HEIGHT} items-center gap-8`}>
        {/* 徽章：資料夾與比賽用不同底色，不只靠一個字區分——掃視一整排卡片時，色塊比單字
            先被看到，這是「一眼分辨兩種項目」真正在起作用的部分。 */}
        <span
          aria-hidden
          className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-xl
            font-bold ${
              kind === "tournament"
                ? "bg-[#c6f135]/15 text-[#c6f135]"
                : "bg-white/[0.10] text-[#f5f5f0]"
            }`}
        >
          {BADGE_TEXT[kind]}
        </span>

        {/* min-w-0 是 flex 的老坑：flex 子項預設 min-width:auto（至少跟內容一樣寬），沒有它的話
            很長的標題會把卡片撐開、把右側的日期／次要資訊擠出畫面，truncate 也不會生效。 */}
        <div className="min-w-0 flex-1">
          {/* sr-only：徽章對讀螢幕軟體是 aria-hidden（它是視覺符號），所以類型要用文字補回去，
              不然聽起來每張卡片都只是一個標題、分不出是資料夾還是比賽。 */}
          <span className="sr-only">{kind === "tournament" ? "賽事資料夾：" : "比賽："}</span>
          <h2 className="truncate text-xl font-bold">{title}</h2>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
          {dateText && (
            <p className="font-numeric text-sm tabular-nums text-[#a9b096]">{dateText}</p>
          )}
          <p className="text-base font-semibold text-[#f5f5f0]">{secondaryText}</p>
        </div>

        <div className="flex flex-shrink-0 gap-1">
          <button
            type="button"
            aria-label={kind === "tournament" ? "編輯資料夾" : "編輯比賽"}
            onClick={(e) => {
              // 卡身是可點的選取目標，按鈕的點擊會冒泡上去觸發 onSelect——編輯/刪除是「動作」，
              // 不該順便改變選取，所以在冒泡前擋掉。
              e.stopPropagation();
              onEdit();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#a9b096]
              transition hover:bg-white/[0.12] hover:text-[#f5f5f0]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={kind === "tournament" ? "刪除資料夾" : "刪除比賽"}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#a9b096]
              transition hover:bg-[#ef4444]/15 hover:text-[#ef4444]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 展開區只在「選中 ＋ 呼叫端有給內容」時才存在於 DOM，不是用 CSS 藏起來——藏起來的
          連結仍然可以被 Tab 走到、也會被讀螢幕軟體念出來，變成看不見卻能操作的鬼元素。 */}
      {selected && expandedContent && (
        <div className="border-t border-white/[0.12] pb-6 pt-5">{expandedContent}</div>
      )}
    </article>
  );
}
