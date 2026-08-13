import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { radialOptionOffsets, RADIAL_DEAD_ZONE } from "@/lib/courtGesture";

export interface RadialMenuOption<T extends string> {
  value: T;
  label: string;
  // 反灰：這個選項仍佔一個固定方位、照樣畫出來，但灰掉、點了沒反應。用來做情境過濾
  // （見 ScoreSheet.tsx 的 disabledActions）——刻意「灰掉」而不是「拿掉」，是為了讓
  // 六個動作永遠在同樣的方位，記錄者可以靠肌肉記憶按方位（呼應節奏遊戲手感）。
  disabled?: boolean;
}

interface RadialMenuProps<T extends string> {
  // 螢幕座標（clientX/clientY），不是球場 SVG 座標——選單是疊在畫面最上層的 HTML，
  // 跟球場本身的縮放/座標系統無關，只要知道「螢幕上哪一點」就能定位。
  center: { x: number; y: number };
  options: RadialMenuOption<T>[];
  onSelect: (value: T) => void;
  onCancel: () => void;
  // 第一個選項的角度（單位：度，0°=正右方，順時針為正，跟 CSS/螢幕座標系一致）。
  // 預設 -90°（正上方），其餘選項依序沿順時針、平均分攤 360°。
  // 例如 2 個選項搭配 startAngle=180，會落在左（180°）／右（0°），可以做出
  // 舊版「寫死 left/right」一樣的排版，同時 6 個選項也不用另外設計版面。
  startAngle?: number;
  // 目前手指懸在哪個選項上，該顆要做高亮（issue #392）。簡易版是點擊型選單，滑鼠移動有
  // 原生 hover 可用；進階版補填是「按下就彈出、滑進去、放開才選中」的拖曳型選單，拖曳中
  // 沒有 hover 事件（pointer capture 通常握在球場元件手上，不會落在這顆選項按鈕上），
  // 所以需要外部（拖曳邏輯所在的球場元件）算好「現在離哪個選項最近」，用這個 prop 告訴
  // 選單該亮哪一顆——不然使用者滑到一半完全看不出放開會選到誰。
  // 預設 undefined（沒有任何選項高亮），簡易版所有呼叫端不傳這個 prop，視覺輸出不受影響。
  highlightedValue?: T;
  // 在圓心畫出「死區」——一個半徑 RADIAL_DEAD_ZONE 的圈，中間一個 ✕，代表「放開在這裡＝
  // 取消」（issue #392，PO 2026-08-13 定案）。只有拖曳型選單（進階版補填）才需要：點擊型
  // 選單（簡易版）的取消方式是點半透明背景，圓心那塊反而是使用者按下去的地方，畫個 ✕ 上去
  // 只會擋住視線。所以做成 opt-in 而不是無條件畫，預設 false ＝ 簡易版視覺完全不變。
  showDeadZoneCancel?: boolean;
}

// 比賽期間快速操作用的圓形彈出選單：點在球場上的球員，選項會繞著他彈出來，
// 不用開選單、不用捲動列表，單手點一下就能記一球（見 pages/ScoreSheet.tsx 的
// 手勢流程：先選動作，再選得失分）。半透明背景擋住整個畫面，點背景視為取消。
export default function RadialMenu<T extends string>({
  center,
  options,
  onSelect,
  onCancel,
  startAngle = -90,
  highlightedValue,
  showDeadZoneCancel = false,
}: RadialMenuProps<T>) {
  // 選項方位數學（半徑隨選項數等比例放大、每顆的 dx/dy）收在 lib/courtGesture.ts 的
  // radialOptionOffsets，理由見那支函式開頭的說明：進階版的拖曳選取要用同一份座標
  // 判斷「放開時離哪個選項最近」，兩邊各寫一份會漂走。這裡只是把原本直接寫在這個檔案裡
  // 的算式換成呼叫共用函式，畫面輸出不變。
  const offsets = radialOptionOffsets(options.length, startAngle);

  // 進場彈出動畫：選單一開，所有按鈕先疊在中心點（transform 只有置中、opacity:0），
  // 下一影格才把 mounted 翻成 true、transform 換成各自的最終方位——CSS transition
  // 只會補間「有變化」的兩個狀態，如果第一次 render 就直接套用最終位置，中間沒有
  // 前後差異可以補，畫面會像瞬間出現而不是彈出來。用 requestAnimationFrame 而不是
  // useState(true) 初始值，就是為了確保瀏覽器先畫出「疊在中心點」那一幀。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // ⚠️ 一定要 portal 到 document.body，不能就地 render（issue #392 實機回報的第一個災情：
  // 「選單沒有圍在球員身邊」）。
  //
  // 原因是 CSS 的一條規則：`position: fixed` 平常以視窗為基準定位，但**只要任何一個祖先
  // 元素身上有 transform（或 filter / perspective），它就改以那個祖先的方框為基準**。
  // 進階版的球場被包在一個帶 `-translate-x-8` 的容器裡（pages/ScoreSheet.tsx 的版面決定：
  // 右欄翻成影片後球場要往左挪），那就是一個 transform——於是 `left: center.x`（螢幕座標）
  // 被當成「相對球場容器左上角」來解讀，整組選項平移了一整個容器的位移量。
  // 簡易版沒有那個 class，所以同一支元件在簡易版看起來是好的，純粹是碰巧沒踩到。
  //
  // portal 到 body 之後，選單的 DOM 位置在任何 transform 祖先之外，`fixed` 恢復成
  // 以視窗為基準——也就是 center 這個 prop 一直以來宣稱的那個座標系（見 props 的說明）。
  return createPortal(
    // bg-black/40：計分表換成深色球場背景後，選單彈出時要跟底下忙碌的球場拉開視覺
    // 焦距，原本淺色主題用的 bg-black/10 太淡，深色底幾乎看不出「選單開著」的感覺。
    <div
      className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150"
      style={{ opacity: mounted ? 1 : 0 }}
      onPointerDown={onCancel}
    >
      {/* 死區的 ✕：手指還在這個圈裡就是「還沒選」，放開＝取消。highlightedValue 是
          undefined 代表拖曳邏輯算出來的結果是「落在死區」（見 courtGesture.ts 的
          radialSelection 回傳 null），所以 ✕ 亮起來的條件正好是「沒有任何選項亮著」——
          兩者是同一件事的一體兩面，不需要再多傳一個 prop 來說明。 */}
      {showDeadZoneCancel && (
        <div
          className={cn(
            "pointer-events-none absolute flex items-center justify-center rounded-full border font-bold transition-colors",
            highlightedValue === undefined
              ? "border-[#f87171] bg-[#f87171]/20 text-[#f87171]"
              : "border-white/20 bg-black/30 text-white/35",
          )}
          style={{
            left: center.x,
            top: center.y,
            width: RADIAL_DEAD_ZONE * 2,
            height: RADIAL_DEAD_ZONE * 2,
            transform: "translate(-50%, -50%)",
            opacity: mounted ? 1 : 0,
            transition: "opacity 200ms ease-out, color 150ms, background-color 150ms",
          }}
        >
          {/* 用 SVG 畫兩條線而不是打「✕」這個字：字型會影響叉叉的粗細跟置中，
              兩條線在任何裝置上都一樣。 */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M6 6 L18 18 M18 6 L6 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      {options.map((opt, i) => {
        const { dx, dy } = offsets[i];
        const isHighlighted = !opt.disabled && opt.value === highlightedValue;
        // spring 感的 easing：CSS 沒有真的物理彈簧曲線，這條 cubic-bezier 最後一段會
        // 略為超出終點再彈回來，視覺上接近彈簧回彈；每顆鈕的 transition-delay 依 index
        // 錯開 20ms，六顆鈕會依序「爆」出去，而不是同時瞬間到位。
        const springTransition = `transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 20}ms, opacity 200ms ease-out ${i * 20}ms`;
        return (
          // 這裡刻意拆成兩層：外層 <button> 只管「彈出動畫的位移」（inline transform，
          // 每顆鈕的目標位置是 JS 算出來的，只能用 inline style 動態指定，套用不了
          // Tailwind 的固定 class）；內層 <span> 管視覺樣式跟按下去的縮放回饋
          // （group-active:scale-95）。兩個 transform 各自獨立不衝突——如果全部疊在同一個
          // 元素上，inline style 的 transform 會整個蓋掉 Tailwind active:scale-95 想加的
          // scale，按下去的回饋就會消失。
          <button
            key={opt.value}
            onPointerDown={(e) => {
              // 一律 stopPropagation（連反灰的也是）：不讓這個點擊冒泡到背景的 onCancel，
              // 所以點到反灰選項時選單不會關掉、什麼都不做，使用者可以接著點旁邊有效的那顆。
              e.stopPropagation();
              if (!opt.disabled) onSelect(opt.value);
            }}
            className="group absolute rounded-full"
            style={{
              left: center.x,
              top: center.y,
              transform: mounted
                ? `translate(-50%, -50%) translate(${dx}px, ${dy}px)`
                : "translate(-50%, -50%) translate(0, 0)",
              opacity: mounted ? 1 : 0,
              transition: springTransition,
            }}
          >
            {/* 退役手繪風（wobbly-border + 硬邊陰影），改用跟計分表其餘按鈕同一套
              玻璃圓角語言（見 pages/ScoreSheet.tsx 的 SECONDARY_BUTTON_CLASS）。
              這是全站最後一個還在用 wobbly-border 的地方，換完之後 index.css 那個
              class 就沒有消費者了（見清理那一步）。 */}
            <span
              className={cn(
                "block rounded-full px-3 py-2 text-sm font-bold backdrop-blur-md transition-transform group-active:scale-95",
                opt.disabled
                  ? "cursor-not-allowed border border-white/[0.08] bg-white/[0.03] text-white/25"
                  : // 拖曳高亮跟滑鼠 hover 套用同一組萊姆綠語彙（border-[#c6f135] +
                    // bg-[#c6f135]/20 + text-[#c6f135]）——highlightedValue 是「拖曳版的
                    // hover」，兩者代表同一件事（「放開會選到這顆」），理應長一樣。
                    isHighlighted
                    ? "border border-[#c6f135] bg-[#c6f135]/20 text-[#c6f135] shadow-lg shadow-black/30"
                    : "border border-white/[0.26] bg-white/[0.11] text-[#f5f5f0] shadow-lg shadow-black/30 hover:border-[#c6f135] hover:bg-[#c6f135]/20 hover:text-[#c6f135]",
              )}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
