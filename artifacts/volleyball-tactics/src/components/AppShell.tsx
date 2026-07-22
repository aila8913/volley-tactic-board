import type { CSSProperties, ReactNode } from "react";

// issue #172（layout-spec 環 1）：三欄骨架的唯一擁有者。
//
// 為什麼要抽出這個元件？在這之前，MatchList / TournamentDetail / TacticsBoard / ScoreSheet /
// MatchAnalytics 這五個頁面各自手刻自己的「外層 flex h-screen + 左欄 + 中央 + 右欄」，
// 連寬度數字都是複製貼上（w-72、w-16…散落在五個檔案裡）。docs/layout-spec.md §7 把這叫做
// 「沒有任何一個地方擁有三欄骨架」——每次要調整某一欄的寬度或收合規則，都得記得五個檔案
// 一起改，漏改一個就會有某一頁悄悄跟其他頁不一樣。這個元件就是把「三欄怎麼分、多寬、
// 什麼情況下右欄放什麼」收斂成單一事實來源（single source of truth）：以後這些規則只在
// 這一個檔案定義，各頁只負責把內容塞進插槽（nav / children / aside / tools）。
//
// 這是這一環（環 1）唯一的目標——「讓版面有主人」，不包含任何視覺調整或功能元件重寫。
// docs/layout-spec.md §8「環 1 的範圍限制」寫得很清楚：改版前後畫面沒有明顯差異，才是
// 這一環成功的標誌。

// 四種版面模式對應 layout-spec §1 的表：A 列表瀏覽／B 戰術唯讀／C 戰術編輯／D 對手佈陣。
// 目前只有 A/B 真的在用（C/D 是後面的環才會生出來的頁面狀態），但型別先把四種都列出來，
// 呼叫端跟這個元件本身都能在編譯期就檢查「這個模式有沒有被涵蓋到」，不用等到執行期才發現
// 漏掉了一種模式。
export type ShellMode = "A" | "B" | "C" | "D";

type AppShellProps = {
  mode: ShellMode;
  // 左欄內容（目前都是 MatchNavRail，但這個元件不寫死是哪個元件——插槽只管「這裡有一塊
  // 內容」，不管內容是什麼，這樣以後左欄要換別的東西也不用改這個檔案）。
  nav?: ReactNode;
  // 右欄「資訊欄」插槽，模式 A / B / D 用這個。沒傳就不渲染右欄——列表頁（MatchList /
  // TournamentDetail / MatchAnalytics）現在還沒有資訊欄內容可放（那是環 3 #174 的事），
  // 讓右欄整個消失比硬渲染一個空殼欄位更誠實。
  aside?: ReactNode;
  // 右欄「工具軌」插槽，模式 C 專用。這一環還沒有任何頁面會進入模式 C（編輯工具軌是環 5
  // #176 才會做的東西），先把插槽開好，等內容出現時只要傳 tools prop 就能用，不用回來改
  // 這個檔案。
  tools?: ReactNode;
  // 絕對定位的背景裝飾層（目前只有 TacticsBoard.tsx 的 tb-beam / tb-mark 光效）。之所以
  // 獨立成一個插槽而不是讓呼叫端自己在 children 裡塞 absolute 元素，是因為這層背景要疊在
  // 最外層容器裡、在三欄骨架「之下」——放進 children（中央主區）的話，它只會蓋住中央欄，
  // 蓋不到左右欄，效果就不對了。
  backdrop?: ReactNode;
  // 外層容器的額外樣式／class——用來讓各頁維持自己現有的背景（漸層、材質紋理等）。
  // AppShell 本身刻意不管顏色/材質，那些是各頁的視覺決定，不該被這個「只管版面」的元件
  // 綁死。
  className?: string;
  style?: CSSProperties;
  // 中央主區的內容。
  children: ReactNode;
};

// 左欄／右欄的寬度常數。
//
// 重要：這一環刻意「沿用現況的數值」，不是 docs/layout-spec.md §0 寫的目標值！
// issue #172 的驗收條件之一是「改版前後畫面沒有明顯視覺差異」——這一環只負責把三欄骨架的
// 主導權從「散落五個檔案」收斂到「這一個檔案」，不順便把數字也改成 spec 的目標值。
// 把「搬家」（這一環）跟「裝潢」（改寬度、改配色）混在一起做，一旦畫面出錯，會分不清楚
// 是搬壞了還是裝潢壞了，除錯會很痛苦。所以：
//   - NAV_WIDTH：沿用現況的 64px（w-16）。spec §0 的目標是 105px（≈ w-24～w-28），
//     等環 2（#173，左欄 hover 展開）真的要動這一欄的內容時再一起調。
//   - ASIDE_WIDTH：沿用現況的 288px（w-72）。spec §0 的目標是 493px（≈ w-[30rem]），
//     等環 3（#174，右欄資訊欄元件化）再調。
//   - TOOLS_WIDTH：模式 C 目前根本不存在（沒有任何頁面在用），沒有「現況」可以沿用，
//     所以直接照 spec §0 的目標值 132px（w-32）定案，不用等未來再改一次。
// 之後不管哪一環要調寬度，都只要改這裡的常數——這正是把骨架收斂到單一檔案的意義：
// 「這一欄多寬」這個問題以後只有一個答案在一個地方。
const NAV_WIDTH = "w-16";
const ASIDE_WIDTH = "w-72";
const TOOLS_WIDTH = "w-32";

// 另一個這一環刻意「不做」的決策，也寫進註解免得之後有人照著 layout-spec 的表格誤改：
// docs/layout-spec.md §1 的表把模式 B/C/D 的左欄畫成「展開 370」，但 §2.1 講得很清楚，
// 展開是「滑鼠 hover 觸發」的暫時互動狀態，不是「這個模式固定用的版面寬度」——把 hover
// 態誤解成版面寬度的話，滑鼠移開時整個中央/右欄都要跟著回流（reflow）一次，會很卡也很
// 突兀。所以 hover 展開留給環 2（#173）處理，而且應該做成「浮層蓋在其他欄位上面」
// （例如 absolute 定位＋z-index），不去擠壓、不影響版面本身的寬度分配。這裡的左欄寬度
// 是固定不隨 mode 變動的單一常數——mode 只決定右欄放 aside 還是 tools。

// 用一張查表（lookup table）決定「這個模式的右欄要渲染哪個插槽」，取代寫一長串
// if/else 或 switch。這是很常見的技巧：當一組規則是「輸入 → 固定的幾種輸出」而且
// 邏輯本身很簡單（不需要複雜的計算），用資料表描述規則會比用一堆條件判斷式更好讀、
// 也更好擴充——之後如果要新增第五種模式，只要在這張表多加一行，不用去改任何 if 的
// 判斷邏輯。
const MODES: Record<ShellMode, { right: "aside" | "tools" }> = {
  A: { right: "aside" },
  B: { right: "aside" },
  C: { right: "tools" },
  D: { right: "aside" },
};

export default function AppShell({
  mode,
  nav,
  aside,
  tools,
  backdrop,
  className,
  style,
  children,
}: AppShellProps) {
  const rightSlot = MODES[mode].right;

  return (
    // 外層容器：flex 橫向排三欄、h-screen 撐滿視窗高、w-full 撐滿寬度、overflow-hidden
    // 讓內層自己決定怎麼捲動（不讓整個頁面捲動，而是中央/右欄各自捲）。className/style
    // 是各頁自己的背景，直接接在最外層——這樣每頁維持自己原本的視覺，AppShell 不干涉。
    <div className={`flex h-screen w-full overflow-hidden ${className ?? ""}`} style={style}>
      {/* 背景裝飾層要放在三欄骨架「之前」（在 DOM 順序上更早），這樣它才會被三欄的內容
          蓋在上面（後面的元素預設疊在前面元素之上）。目前只有 TacticsBoard 會傳這個。 */}
      {backdrop}

      {/* 左欄：固定寬、shrink-0（不被 flex 擠壓縮小）。沒有 nav 時就不渲染，
          避免留下一塊空的、佔寬度卻沒內容的欄位（例如未來若某頁真的完全不需要導覽軌）。 */}
      {nav && <div className={`${NAV_WIDTH} shrink-0`}>{nav}</div>}

      {/* 中央主區：flex-1 吃掉左右欄佔完後剩下的所有寬度。
          min-w-0 這行看起來多餘但絕對不能刪——這是 flexbox 一個很容易踩的坑：flex 子項目
          的 min-width 預設值是 auto，意思是「至少要撐開到能放得下裡面最長的內容」，而不是
          像一般 block 元素那樣可以被壓縮到 0。中央主區裡常會放表格、長字串、固定寬度的
          球場圖之類「不會自動換行」的內容，一旦這些內容比 flex-1 分配到的空間還寬，沒有
          min-w-0 的話這個欄位就會被撐爆，回頭去擠壓左右兩個「本來應該固定寬」的欄位，
          三欄比例整個跑掉。加上 min-w-0 等於告訴瀏覽器「不用管內容多寬，這欄的下限就是
          0，該多寬完全交給 flex-1 分配的結果決定」，內容自己想辦法用 overflow 處理。 */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>

      {/* 右欄：模式 A/B/D 放資訊欄（aside），模式 C 放工具軌（tools）——兩種插槽共用同一個
          「固定寬、shrink-0」的容器規則，只是寬度常數跟渲染的插槽不同，靠上面 MODES 那張
          表決定。跟左欄一樣，插槽沒東西傳的話就不渲染（例如目前列表型頁面還沒有 aside
          內容，見各頁呼叫端的註解）。 */}
      {rightSlot === "aside" && aside && <div className={`${ASIDE_WIDTH} shrink-0`}>{aside}</div>}
      {rightSlot === "tools" && tools && <div className={`${TOOLS_WIDTH} shrink-0`}>{tools}</div>}
    </div>
  );
}
