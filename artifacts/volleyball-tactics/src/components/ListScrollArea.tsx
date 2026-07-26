import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// 中央列表的捲動容器 ＋ 右側 8px 自訂捲軸指示條（issue #175 環 4、docs/layout-spec.md §3.1）。
//
// 為什麼要自己做而不是改瀏覽器預設捲軸：預設捲軸的寬度、顏色、圓角在 Windows / macOS /
// Firefox 各不相同，`::-webkit-scrollbar` 那套又不是標準（Firefox 只吃 scrollbar-width /
// scrollbar-color，細節控制不了）。線框稿指定的是一條固定 8px、跟深色玻璃語言一致的指示條，
// 唯一能在各瀏覽器長得一樣的做法就是把原生捲軸藏起來、自己畫一條。
//
// 為什麼不用 shadcn 的 ScrollArea（components/ui/scroll-area.tsx，Radix）：那顆會把內容搬進
// 自己的 viewport 結構裡，多一層包裝也多一套它自己的樣式要覆寫；這裡只需要「藏原生捲軸＋畫一條
// 指示條」，用不到 Radix 的鍵盤/觸控補丁，自己寫反而少一層需要理解的抽象。
//
// 這條是**指示條不是控制條**：只反映位置、不能拖。捲動一律走原生（滾輪、觸控、鍵盤、
// 空白鍵翻頁都照舊有效），所以不用自己實作那些互動——自訂捲軸最常見的退步就是為了做外觀，
// 反而把原生的無障礙行為弄丟。

// 指示條再短也保留這個高度，不然內容一長（例如 200 筆）算出來會剩幾 px，變成看不見也點不到。
const MIN_THUMB_PX = 32;

interface ListScrollAreaProps {
  children: ReactNode;
  className?: string;
}

export default function ListScrollArea({ children, className = "" }: ListScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // null＝內容沒有超出一屏，這時候整條指示條不渲染（沒東西可捲卻掛一條軌道在旁邊很怪）。
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);

  const sync = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    // +1 是給次像素誤差的緩衝：縮放比例不是整數時 scrollHeight 可能比 clientHeight 大 0.5px，
    // 沒有這個容差就會在完全不需要捲動的頁面上閃出一條假的捲軸。
    if (scrollHeight <= clientHeight + 1) {
      setThumb(null);
      return;
    }
    // 指示條高度／軌道高度 ＝ 看得見的比例，這是捲軸的標準比例式：滑塊有多長就代表
    // 「你現在看到的是全部內容的幾分之幾」。
    const height = Math.max((clientHeight / scrollHeight) * clientHeight, MIN_THUMB_PX);
    // 分母用「可捲動距離」(scrollHeight - clientHeight) 而不是 scrollHeight：捲到底時
    // scrollTop 的最大值就是這個數，這樣才會剛好讓滑塊貼齊軌道底部。
    const maxScroll = scrollHeight - clientHeight;
    const top = (scrollTop / maxScroll) * (clientHeight - height);
    setThumb({ top, height });
  }, []);

  // 用 useLayoutEffect 而不是 useEffect：這是在量 DOM 尺寸，要在瀏覽器畫下一幀之前算完，
  // 否則第一次進頁會先閃一格位置不對的指示條。
  useLayoutEffect(() => {
    const el = viewportRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    sync();
    // 視窗縮放、清單增減項目都會改變高度，但兩者都不會觸發 scroll 事件——所以除了 scroll
    // 之外還要盯著尺寸變化。viewport 看的是「可視高度變了」（視窗縮放），content 看的是
    // 「內容變高了」（新增/刪除一張卡片）。
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
  }, [sync]);

  return (
    <div className={`relative flex min-h-0 flex-1 ${className}`}>
      <div
        ref={viewportRef}
        onScroll={sync}
        // [scrollbar-width:none] 給 Firefox、[&::-webkit-scrollbar]:hidden 給 Chrome/Safari，
        // 兩者都是「藏起原生捲軸但保留捲動能力」（跟 overflow:hidden 完全不同，那會連捲都不能捲）。
        // 寫法沿用 ScoreSheet.tsx 既有的同一組 class，全站一致。
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={contentRef}>{children}</div>
      </div>

      {thumb && (
        // aria-hidden：它只是視覺指示，捲動的語意由原生捲動容器本身提供，讀螢幕軟體看到
        // 一個空 div 只會多念一段無意義的東西。
        <div aria-hidden className="relative ml-2 w-2 flex-shrink-0 rounded-full bg-white/[0.06]">
          <div
            className="absolute left-0 w-2 rounded-full bg-white/[0.26] transition-colors"
            style={{ top: thumb.top, height: thumb.height }}
          />
        </div>
      )}
    </div>
  );
}
