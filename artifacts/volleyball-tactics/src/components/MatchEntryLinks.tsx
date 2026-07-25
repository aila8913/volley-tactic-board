import { Link } from "wouter";
import { LayoutGrid, ClipboardList, BarChart3 } from "lucide-react";

// 一場比賽的三個入口：戰術板／計分表／數據（issue #175）。
//
// 呈現方式的演進，值得記著因為它是這個環最主要的互動決策：
//   1. 原本掛在卡片底部（一直顯示）——一行式排版之後沒有空間。
//   2. @tangyi1025 提案疊一層 modal 蓋住列表；理由是「觸控裝置沒有 hover」，那點成立。
//   3. PO 2026-07-23 定案：**選中的那張卡片就地向下展開**，不疊層、也不跳另一個畫面。
//      疊層雖然解決了 hover 的問題，但它把整個列表蓋掉——使用者只是想進其中一場，卻連
//      「旁邊還有哪幾場」「我捲到哪裡」都一起失去，而且還多一個「返回列表」的動作要做。
//      就地展開兩者都免了：點另一張卡，展開區自己就跟著換過去。
//
// 這個元件只負責「三顆按鈕長什麼樣」，展開／收合是 ListItemCard 依 selected 決定的——
// 什麼時候該出現是列表的選取語意（環 3），不是這三個連結自己的事。

const ENTRIES = [
  { path: "board", icon: LayoutGrid, label: "戰術板" },
  { path: "record", icon: ClipboardList, label: "計分表" },
  { path: "analytics", icon: BarChart3, label: "數據" },
] as const;

interface MatchEntryLinksProps {
  matchId: string;
  // issue #190：軟提醒，不是硬性把關——三個入口本來就有各自的領域規則會在真正開始
  // 記分時擋下（既有的 domain gate 維持不動），這裡只是在使用者點進來之前先提醒一句，
  // 不 disable 任何連結。
  needsLineup?: boolean;
}

export default function MatchEntryLinks({ matchId, needsLineup }: MatchEntryLinksProps) {
  return (
    <div className="flex flex-col gap-2">
      {needsLineup && (
        <p className="text-xs text-amber-300/90">→ 先到右欄排好先發（6 人）再開始計分</p>
      )}
      <div className="flex flex-wrap gap-3">
        {ENTRIES.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            href={`/matches/${matchId}/${path}`}
            // stopPropagation：卡身的 onClick 是「選取」，這三顆是「導覽」。不擋的話點擊會冒泡
            // 上去再選一次同一張卡；現在看不出差別（本來就已經選中了），但選取語意之後若改成
            // 可切換（再點一次取消選取），就會變成「點了入口反而把自己收起來」的怪 bug。
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.26]
              bg-white/[0.05] px-5 py-2.5 text-sm font-bold text-[#f5f5f0] transition
              hover:border-[#c6f135] hover:text-[#c6f135]"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
