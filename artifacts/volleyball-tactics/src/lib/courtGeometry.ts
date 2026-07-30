// 球場座標換算共用來源（issue #227）。
//
// 為什麼要收斂：球場有「兩套座標系」同時在用——
//   1. normalized 座標（0~1）：站位資料（PlayerPosition.x/y、zoneCoords……）都存這一套，
//      好處是跟球場實際畫多大完全脫鉤，換算成任何尺寸都只是乘一下。
//   2. SVG 座標（0~100 橫 / 0~200 縱）：球場 SVG 的 viewBox 用的就是這組數字，畫面上
//      每一個 <circle>/<line> 都要用這套座標才畫得到正確位置。
// 這兩套之間的互換（乘或除以 100/200）以前散落在 Court.tsx、PlayerNode.tsx、
// ScoreSheetCourt.tsx 三個檔案裡各寫一份，數字改一次要三個地方一起改、很容易漏掉一處
// （這正是 issue #227 想解決的重複）。收斂到這裡之後，往後如果球場座標系要調整
// （例如改成正方形 viewBox），只需要改這一個檔案。
export const COURT_W = 100;
export const COURT_H = 200;

// normalized（0~1）→ SVG 座標（0~100 / 0~200）。
export function toSvg(norm: { x: number; y: number }): { x: number; y: number } {
  return { x: norm.x * COURT_W, y: norm.y * COURT_H };
}

// SVG 座標 → normalized（0~1），toSvg 的反向操作。
export function toNorm(svg: { x: number; y: number }): { x: number; y: number } {
  return { x: svg.x / COURT_W, y: svg.y / COURT_H };
}

// 螢幕座標（滑鼠/觸控的 clientX/clientY，瀏覽器視窗座標系）→ 這個 SVG 元素自己的座標系
// （也就是 viewBox 裡的座標）。
//
// 為什麼不能直接拿 clientX/clientY 減掉 SVG 元素的 offsetLeft/offsetTop 就好：
// 球場 SVG 全部使用 preserveAspectRatio="none"（見 Court.tsx／ScoreSheetCourt.tsx 的說明），
// 代表 viewBox 的寬高會依容器的實際顯示尺寸「非等比例」縮放——viewBox 100x200 的球場
// 可能被拉伸畫成螢幕上 300px x 550px。要從「滑鼠在螢幕上的位置」反推「這個位置對應到
// viewBox 裡的哪個座標」，需要知道目前這個縮放/位移矩陣，而不是單純的加減。
//
// getScreenCTM()（Current Transformation Matrix）就是瀏覽器算好的「SVG 座標 → 螢幕座標」
// 轉換矩陣，a/d 是 x/y 方向個別的縮放倍率、e/f 是位移量（因為 preserveAspectRatio="none"
// 允許 x、y 各自縮放，所以矩陣不會出現 b/c 那種旋轉分量，可以簡化成
// screenX = e + svgX * a 這種形式）。要反過來（螢幕→SVG）就是解這條式子：
// svgX = (screenX - e) / a。
export function fromScreen(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement | null,
): { x: number; y: number } {
  const CTM = svg?.getScreenCTM();
  // SVG 還沒 mount 到 DOM 時 getScreenCTM() 會回 null（例如 ref 還沒接上、或元素被
  // display:none 藏起來）。這是「防禦性分支」——正常操作流程一定摸得到已經畫出來的
  // SVG，這條路徑理論上不會被踩到，只是型別上 getScreenCTM() 的回傳值允許是 null，
  // 不處理會被 TypeScript 擋下來。以前各個呼叫點各自挑了不同的預設值回傳
  // （有些回 {x:50,y:100}——球場正中央，有些回 {x:0,y:0}），這裡統一都回 {x:0,y:0}：
  // 反正這個分支不會真的被使用者操作觸發到，統一比「保留各自原本的巧合值」更好維護。
  if (!CTM) return { x: 0, y: 0 };
  return { x: (clientX - CTM.e) / CTM.a, y: (clientY - CTM.f) / CTM.d };
}

// fromScreen 的反向操作：SVG 座標 → 螢幕座標。用在「已知某個站位格在 SVG 裡的座標，
// 要換算成螢幕上的位置」，例如 ScoreSheetCourt.tsx 判斷手勢畫線最後停在哪個目標附近時，
// 要把命中的目標換算回螢幕座標傳給呼叫端。
export function toScreen(
  svgX: number,
  svgY: number,
  svg: SVGSVGElement | null,
): { x: number; y: number } {
  const CTM = svg?.getScreenCTM();
  if (!CTM) return { x: 0, y: 0 }; // 同上，CTM 拿不到時的防禦性預設值。
  return { x: CTM.e + svgX * CTM.a, y: CTM.f + svgY * CTM.d };
}

export type CourtRow = "front" | "back";

// 純視覺判斷：這個 normalized y 座標算前排還是後排，只用來決定球員圈要不要套用
// 「前排」的螢光黃綠色（見 PlayerNode.tsx／ScoreSheetCourt.tsx 的 stateColor/color 計算）。
//
// 門檻選 `y > 0.5 && y <= 0.75`（後排半場是 0.5~1、攻擊線在 0.75）：這條線本身沒有
// 「唯一正確」的位置，只是恰好落在攻擊線上。之所以用 `<=` 而不是 `<`：以前 4 個呼叫點裡
// 有 3 個已經用 `<=`，只有 Court.tsx 那兩處用 `<`——這裡統一成 `<=` 是照多數，且因為
// 6 個站位格實際的 y 值只會是 0.6（前排）或 0.85（後排），永遠不會剛好等於 0.75，
// 這個邊界條件在現實資料裡從來不會被踩到，改成 `<=` 對畫面沒有任何實際影響
//（純粹是把「表面上不一致、但從未被觸發的分支」收斂成一份）。
//
// ⚠️ 這跟 rotationLogic.ts 的 isBackRowPosition 是兩個不同層次的概念，不要合併：
//   - rowOf（這裡）：純視覺判斷「這個位置的圓圈該不該上前排配色」，沒有任何規則意義，
//     判斷依據只有座標，跟球員是誰、是不是自由球員完全無關。
//   - isBackRowPosition（rotationLogic.ts）：領域規則「自由球員站在這裡合不合法」，
//     依據的是 BACK_ROW_ZONES 這個排球規則（1/5/6 號位才是後排），透過先吸附到最近
//     號位再查表，而不是單純比較 y 座標。
// 兩者現在的門檻數字（0.75）看起來很像只是巧合：rowOf 是「攻擊線的視覺位置」，
// isBackRowPosition 是「哪些號位算後排」，兩件事分別對規則跟顯示各自負責，未來如果
// 視覺門檻要跟規則脫鉤調整（例如攻擊線畫得跟規則定義的前後排不同），這裡也不需要動
// isBackRowPosition，反之亦然——把兩者刻意分開就是為了讓這種調整互不影響。
export function rowOf(normY: number): CourtRow {
  return normY > 0.5 && normY <= 0.75 ? "front" : "back";
}
