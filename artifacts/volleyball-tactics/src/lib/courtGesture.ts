// 球場手勢共用常數與數學（issue #392，從 ScoreSheetCourt.tsx 搬出來）。
//
// 為什麼要搬：進階版補填（AdvancedRecordingCourt.tsx）要在同一個球場座標系上做手勢判定
// （命中半徑、長按時間、位移取消門檻），跟簡易版的 ScoreSheetCourt.tsx 用的必須是同一組
// 數字——不然兩邊「按多久算長按」「移動多少算取消」的手感會不一致，使用者在兩個模式間
// 切換時反而要重新適應。抽出來之後，兩邊 import 同一份，改一個數字兩邊一起變。
//
// ScoreSheetCourt.tsx 改成從這裡 import，行為完全不變（純粹搬家，不是重寫）。

// px（SVG 座標單位，viewBox 0~100 x 0~200），判定「按在球員圈/號位圈上」的命中半徑。
export const HIT_RADIUS = 11;

// 長按判定的等待時間。跟 OS 層級的長按手勢（通常 500ms 上下）抓同一個量級，使用者不用
// 重新學一套「這個 app 的長按比較快/比較慢」的手感。
export const LONG_PRESS_MS = 500;

// 進階版補填「停駐選得失分」的等待時間與位移容許量（PO 2026-08-13 定案，issue #392）。
//
// 為什麼不共用上面的 LONG_PRESS_MS：這個長按**疊在「點落點」這個動作上面**——同一根手指、
// 同一次按壓，短放是記落點、久按是收尾這一分。兩者共用同一顆按壓，等待時間就必須明顯長過
// 「使用者只是在找落點、順手停一下」的時間，不然點落點會頻繁誤觸發成「這分結束了」。
// 1 秒是 PO 實機試出來的手感；換人/長按選單那類「按下去沒有別的意思」的長按維持 500ms。
export const DWELL_MS = 1000;

// 「停駐」的判準是**沒有游移**，不是「按下去之後完全沒動過」：手指移動超過這個距離時，
// 計時器不是被取消，而是**從新位置重新計時**——使用者本來就是一邊移動一邊找落點，找到了才
// 停下來等它跳出來。12px 略大於一般手指按住不動的抖動（~10px），又遠小於死區（34px），
// 所以選單彈出後往外滑的那一下一定會離開停駐範圍、不會被誤判成還在停駐。
export const DWELL_MOVE_TOLERANCE = 12;

// 「按住不動」的位移容許量：手指移動超過這個距離就不算按住不動，用來取消長按判定／
// 判斷一次手勢是「精準的點擊」還是「有位移的拖曳」。
//
// ⚠️ 這裡是**兩個常數**，不是一個。兩者現在的值剛好都是 3，但**單位不同**，不可以合併：
//   - MOVE_CANCEL_SVG    ＝ 球場 SVG 座標單位（viewBox 0~100 x 0~200）。球場高度是 200 個
//                           單位，所以 3 大約是球場長度的 1.5%——跟畫面實際有幾個像素高無關。
//   - MOVE_CANCEL_SCREEN ＝ 螢幕像素（clientX/clientY）。用在球場 SVG 以外的 HTML 元素上
//                           （目前是 ScoreSheetCourt 的自由球員拖曳鈕），那裡沒有 SVG 座標
//                           可用，比的是真正的螢幕距離。
// 合併成一個常數的話，日後有人為了「球場上手抖容忍度調鬆一點」把數字改大，會連帶改掉
// 自由球員鈕在螢幕上的門檻，而那兩件事的手感沒有任何關聯——一個數字同時代表兩種單位，
// 是這 repo 反覆處理過的那種「看起來一樣就併在一起」的錯（見 #352 的相反面：該收斂的是
// 同一條規則的多份拷貝，不是碰巧數值相同的兩條不同規則）。
export const MOVE_CANCEL_SVG = 3;
export const MOVE_CANCEL_SCREEN = 3;

// 兩點間的歐氏距離（SVG 座標系）。
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// RadialMenu 的選項方位數學：算出每個選項的按鈕，相對圓心該往哪個方向、多遠距離
// （dx/dy，螢幕像素）。原本這段算式直接寫在 RadialMenu.tsx 的 render 裡；抽出來的理由是
// 進階版的「滑」手勢需要在使用者放開手指的當下，判斷這一點離哪個選項最近（見
// AdvancedRecordingCourt.tsx 的命中判定）——那份判定用的座標，必須跟 RadialMenu 畫選項
// 時用的是同一份，不然畫面上看到的選項位置跟實際判定命中的位置會漂走。這 repo 已經踩過
// 同一類坑一次（#352：一段算式兩份手寫拷貝，改一邊忘了改另一邊），所以這裡只寫一份，
// RadialMenu 跟球場元件都呼叫它。
export const BASE_OFFSET = 56;
export const BASE_OPTION_COUNT = 6;

export function radialOptionOffsets(
  count: number,
  startAngle: number,
): { dx: number; dy: number }[] {
  if (count === 0) return [];
  const step = 360 / count;
  // Math.max 卡下限：選項比基準（6 顆）少時維持原本的 56，不會縮水；只有超過基準時才等比例
  // 放大，維持每顆按鈕之間的弧長大致不變（見 RadialMenu.tsx 原本這段的說明）。
  const offset = Math.max(BASE_OFFSET, (BASE_OFFSET * count) / BASE_OPTION_COUNT);
  return Array.from({ length: count }, (_, i) => {
    const angle = ((startAngle + i * step) * Math.PI) / 180;
    return { dx: offset * Math.cos(angle), dy: offset * Math.sin(angle) };
  });
}

// 環形選單正中央的「死區」半徑（螢幕像素）。手指還在這個圈裡＝還沒選任何東西。
//
// 為什麼需要死區（PO 2026-08-13 定案，取代原本的「離哪顆鈕最近」判定）：
// 沒有死區的話，「離哪顆最近」永遠會挑出一顆——包括**手指根本沒動**的情形（按下去就在
// 圓心，圓心離六顆鈕等距，浮點誤差決定選到誰）。使用者按下去只是想看看有哪些選項、
// 直接放開，卻會莫名記到一球。有了死區，「按下去、看一眼、放開」就是明確的「不選」，
// 而那個「不選」剛好就是取消——所以取消不必再另外設計手勢，畫個 ✕ 在死區裡就完成了。
//
// 34px：比選項半徑（BASE_OFFSET = 56）的一半略大，讓「往外滑」這件事必須是刻意的；
// 同時大於一般手指觸控的抖動範圍（~10px），按住不動不會誤觸發選取。
export const RADIAL_DEAD_ZONE = 34;

// 放開手指（或拖曳中）時，判斷這一點落在環形選單的哪一個選項上。
// 回傳 null ＝ 落在死區裡，代表「不選／取消」。
//
// 判定方式是**角度扇區**，不是「離哪顆鈕的圓心最近」。兩者在所有選項等距排列時結果相同，
// 但角度版有一個決定性的好處：手指滑多遠都算數。使用者滑過頭（滑到離鈕更遠的地方）時，
// 距離版會開始因為「離另一顆鈕比較近」而跳選項，角度版則只看方向——這正是節奏遊戲式手感
// 想要的「往那個方向甩出去就對了」，不需要精準停在鈕上面（見 docs/adr/0010）。
export function radialSelection(
  center: { x: number; y: number },
  release: { x: number; y: number },
  count: number,
  startAngle: number,
): number | null {
  if (count === 0) return null;
  const dx = release.x - center.x;
  const dy = release.y - center.y;
  if (Math.hypot(dx, dy) < RADIAL_DEAD_ZONE) return null;

  const step = 360 / count;
  // atan2 回傳 -180~180，跟 radialOptionOffsets 用的角度系統同一套（0°=正右、順時針為正，
  // 因為螢幕座標的 y 軸向下）。減掉 startAngle 之後就是「距離第一顆選項幾度」。
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // +360 * count 再取餘數：JS 的 % 對負數會回負值（-30 % 360 === -30），先加一個夠大的
  // 正數倍數才能安全地折回 0~360。
  const rel = (angle - startAngle + 360 * count) % 360;
  // 除以每一格的角度再四捨五入＝落在第幾扇；最後再 % count 是因為 rel 接近 360 時
  // round 會得到 count（例如 6），要折回第 0 顆。
  return Math.round(rel / step) % count;
}
