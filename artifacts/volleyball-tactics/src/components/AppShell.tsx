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
  // 左欄內容（目前都是 NavRail，但這個元件不寫死是哪個元件——插槽只管「這裡有一塊
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
//   - NAV_WIDTH：issue #173（環 2，左欄 hover 展開）動手時已經把左欄收合寬度從現況的
//     64px（w-16）調成 spec §0 的目標值 105px。Tailwind v4 的 spacing 工具是「N × 0.25rem」
//     算出來的（不用像 v3 那樣先在設定檔登記才能用），`w-26` = 26 × 0.25rem = 6.5rem = 104px，
//     跟 105px 只差 1px，肉眼分不出來（layout-spec §0 本來就講過「不要硬寫 px、用比例或
//     Tailwind 尺標」，104 跟 105 這種誤差就是這個原則允許的範圍）。
//   - ASIDE_WIDTH：沿用現況的 288px（w-72）。spec §0 的目標是 493px（≈ w-[30rem]），
//     等環 3（#174，右欄資訊欄元件化）再調。
//   - TOOLS_WIDTH：模式 C 目前根本不存在（沒有任何頁面在用），沒有「現況」可以沿用，
//     所以直接照 spec §0 的目標值 132px（w-32）定案，不用等未來再改一次。
// 之後不管哪一環要調寬度，都只要改這裡的常數——這正是把骨架收斂到單一檔案的意義：
// 「這一欄多寬」這個問題以後只有一個答案在一個地方。
// （左欄的收合寬度 w-26 併進下面的 NAV_COLUMN_CLASS 一起管，理由見該常數的說明。）
const ASIDE_WIDTH = "w-72";
const TOOLS_WIDTH = "w-32";

// 左欄展開態的寬度（issue #173 環 2）。
//
// 這個常數連同下面的實作，推翻了 #172 時期寫在這裡的兩條決定——兩條都是 PO 把畫面實際
// 點過一輪之後改的，不是實作方便就改掉，所以連同理由一起留著：
//
//   1. **寬度不用 layout-spec §2.2 抄自 Figma 的 370px**。實機上那個寬度吃掉將近半個畫面，
//      但展開態要顯示的只是「比賽列表 / 計分表 / 數據分析」這種四五個字的入口，空得很怪。
//      改成 11rem（176px，約規格的一半）：文字仍然完整不截斷，中央主區留得住。
//   2. **展開時中央跟著壓縮，不做浮層**。#172 的原始顧慮是「滑鼠移開整頁 reflow 會卡」，
//      實際看下來相反：浮層會蓋住中央內容，使用者正要點的東西被遮住反而更難用；推開版面
//      也才對得上 layout-spec §1 那張表——它一直都是把展開態當成一個版面寬度在畫的。
//
// 實作刻意用純 CSS 的 `hover:` / `focus-within:` 變體，而不是把 NavRail 內部的展開 state
// 拉上來當 AppShell 的 prop。理由：欄寬是這個檔案的職責、欄裡的內容是 NavRail 的職責；
// 若兩者共用一份 useState，等於在兩個元件之間拉一條雙向狀態線，日後任一邊改觸發條件都得
// 記得同步另一邊。用 CSS 變體則是兩邊各自對「滑鼠在不在這一欄上」這同一個瀏覽器事實作
// 反應，天然同步、不需要通訊。（focus-within 是給鍵盤使用者的：tab 進導覽軌時同樣要展開，
// 否則焦點會停在一個看不見的元素上。）
// 注意這裡是一整條寫死的字串，而不是像其他常數那樣把寬度單獨抽出來再用樣板字串拼進
// `hover:${...}`：Tailwind 是在**建置時掃描原始碼、找出現過的完整 class 名稱**才產生對應
// CSS 的（沒被掃到的 class 根本不會存在於輸出的樣式表裡）。`hover:` 前綴 + 變數拼出來的
// 字串在原始碼裡看不到 "hover:w-44" 這幾個字，掃描器就不會產生那條規則，執行期只會得到
// 一個沒有任何效果的 class 名——這是 Tailwind 最經典的踩雷點，任何動態拼 class 的寫法都要
// 提高警覺（同理，別把 NAV_WIDTH 之類的常數改成只存數字再去拼）。
const NAV_COLUMN_CLASS =
  "w-26 shrink-0 transition-[width] duration-200 ease-out hover:w-44 focus-within:w-44";

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

      {/* 左欄：固定寬、shrink-0（不被 flex 擠壓縮小），滑鼠移上去或鍵盤焦點進入時撐開成
          NAV_WIDTH_EXPANDED，中央主區（flex-1）自動讓出對應的寬度。沒有 nav 時就不渲染，
          避免留下一塊空的、佔寬度卻沒內容的欄位。
          transition-[width] 只補間寬度這一個屬性，不寫成 transition-all——後者會連
          背景色、border 之類的變化一起補間，容易在 hover 時看到不必要的殘影/延遲。
          duration-200 是個「看得出來在動、但不會讓人等」的常見值。 */}
      {nav && <div className={NAV_COLUMN_CLASS}>{nav}</div>}

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
