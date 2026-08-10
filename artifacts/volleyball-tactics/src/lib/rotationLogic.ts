import type { RotationPositions, PlayerPosition } from "../types/rotationTable";
import type { MatchPlayer } from "../types/match";
import type { LineupSnapshot } from "../types/scoresheet";

// 把先發快照（rotation 0 的號位→球員）換算成「第 rotation 輪」時場上 6 個人的座標，
// 給計分表球場渲染用。排球輪轉：起始號位 z 的人，轉了 rotation 次後落在 rotateZone(z, rotation)，
// 取那個號位的座標。這跟 useRotationTable.placePlayerOnCourt 推算其他輪次是同一條公式，只是這裡
// 的基準固定是 rotation 0（先發那一輪），且資料來源是計分表自己的快照、不是全域 store。
export function lineupToPositions(lineup: LineupSnapshot, rotation: number): PlayerPosition[] {
  return Object.entries(lineup).map(([zoneStr, playerId]) => {
    const startZone = Number(zoneStr);
    const coords = getZoneCoords(rotateZone(startZone, rotation));
    return { playerId, x: coords.x, y: coords.y };
  });
}

// 6 個球場格子的座標基準（0~1 normalized，跟戰術板球場 SVG 的 viewBox 對齊）。
// 編號照排球規則：1 號位是發球輪到的右後場，逆時針 1→6→5→4→3→2→1 依序輪轉。
const zoneCoords = {
  1: { x: 0.83, y: 0.85 }, // Right Back
  2: { x: 0.83, y: 0.6 }, // Right Front
  3: { x: 0.5, y: 0.6 }, // Middle Front
  4: { x: 0.17, y: 0.6 }, // Left Front
  5: { x: 0.17, y: 0.85 }, // Left Back
  6: { x: 0.5, y: 0.85 }, // Middle Back
};

const shiftSequence = [1, 6, 5, 4, 3, 2];

// 排球規則：自由球員只能在後排（1/5/6 號位），不能輪轉到前排。
// 放在這裡（而不是某個 store 檔案裡）是因為輪轉表（格子吸附上場）跟戰術板
// （戰術視圖自由拖曳上場）都要檢查這條規則，兩個 store 各自獨立、不互相 import
// 對方的實作細節，所以共用的規則常數抽到大家都會 import 的 rotationLogic.ts。
export const BACK_ROW_ZONES = new Set([1, 5, 6]);

// 給定一個場上座標（0~1 normalized），判斷它算不算「後排」＝自由球員的合法上場位置。
// 先用 findNearestZone 把座標吸附到最近的號位，再看那個號位在不在 BACK_ROW_ZONES 裡。
//
// 為什麼要有這一支：輪轉表（格子吸附）手上直接有號位，可以 BACK_ROW_ZONES.has(zone)；
// 但計分表（拖曳替換）手上只有 x/y 座標，以前是自己寫一條 `y <= 0.75` 的門檻各判各的——
// 「後排」的定義因此有兩份、日後改了會失同步（issue #43）。把座標版判定收斂到這裡、
// 一樣從 BACK_ROW_ZONES 導出，兩邊就共用同一個真實來源，不會再各寫各的。
export function isBackRowPosition(x: number, y: number): boolean {
  return BACK_ROW_ZONES.has(findNearestZone(x, y));
}

// 給定「輪轉了幾次」，回傳某個起始號位現在實際落在哪個號位。
export function rotateZone(startZone: number, rotation: number): number {
  const currentIndex = shiftSequence.indexOf(startZone);
  const newIndex = (((currentIndex + rotation) % 6) + 6) % 6;
  return shiftSequence[newIndex];
}

export function getZoneCoords(zone: number): { x: number; y: number } {
  return zoneCoords[zone as keyof typeof zoneCoords];
}

// 換局換輪視窗（issue #120）用：把一整組先發快照整個轉 step 格，回傳一份新的快照。
//
// 為什麼是「搬 key」而不是「搬 value」：LineupSnapshot 的 key 是「起始號位」——這一局
// 第一顆球開始時，某個球員站在哪個號位。轉一格的意思是「每個人的起始號位都往後移一格」，
// 例如原本在 1 號位發球的人，轉一輪之後應該變成從 6 號位開局（照 rotateZone 的
// 1→6→5→4→3→2→1 逆時針規則）。所以要動的是「這個人記在哪一個 key 底下」，人（value）
// 本身沒有變，只是他的號位標籤變了——這正是「搬 key」的意思。
//
// 不用自己另外處理 step 是負數的情況（例如「上一輪」會傳 -1）：rotateZone 內部已經用
// `((currentIndex + rotation) % 6 + 6) % 6` 處理過負數取模，這裡把 step 原封不動丟給它、
// 讓它負責「轉出界要怎麼繞回來」即可，不用在這裡重複寫一次取模邏輯。
export function rotateLineup(lineup: LineupSnapshot, step: number): LineupSnapshot {
  const result: LineupSnapshot = {};
  for (const [zoneStr, playerId] of Object.entries(lineup)) {
    const startZone = Number(zoneStr);
    result[rotateZone(startZone, step)] = playerId;
  }
  return result;
}

// 換局換輪視窗「重新排位」用（issue #120）：把 playerId 指派到 zone 號位，回傳新的快照。
//
// 為什麼這段要抽成純函式、而不是留在 SetLineupDialog 裡面：它其實是**領域規則**（六人佈陣
// 怎麼調整才合法），不是 UI 細節。留在元件裡的話，要驗證它就得先能渲染元件、模擬點擊，
// 而這個專案目前還沒有 @testing-library/react（見 issue #168）——結果就是最容易寫錯的
// 這段反而測不到。抽出來之後它跟 rotateLineup 一樣只是「吃一份快照、吐一份新快照」，
// 可以直接用單元測試把四種分支釘死。
//
// 為什麼「這個人原本在別的號位」要用**互換**而不是「把他從原位移除、留一個空格」：
// LineupSnapshot 永遠是六人滿編（六個號位、六個不同的人），互換能天然維持這個不變條件，
// 不會在畫面上留下「這格沒人」的破洞讓教練還得再補一次；而且「把 A、B 兩人對調」是實際
// 排陣最常見的操作，互換讓它只要點兩下就完成。
export function assignPlayerToZone(
  lineup: LineupSnapshot,
  zone: number,
  playerId: string,
): LineupSnapshot {
  const next: LineupSnapshot = { ...lineup };
  const fromEntry = Object.entries(next).find(([, pid]) => pid === playerId);

  if (fromEntry) {
    const fromZone = Number(fromEntry[0]);
    // 點了自己原本就站著的格子＝沒有任何變化，原樣回傳（不要回傳同一個物件參照以外的
    // 副作用，呼叫端的 setState 收到值相等的新物件也只是多 render 一次，無害）。
    if (fromZone === zone) return next;

    const occupantOfTarget = next[zone];
    if (occupantOfTarget !== undefined) {
      // 目標格有人 → 真正的互換：那個人搬去這個人騰出來的號位。
      next[fromZone] = occupantOfTarget;
    } else {
      // 目標格是空的（六人還沒湊滿的中途狀態）→ 這個人單純換位，原本的號位要清掉，
      // 不能留一個「他還站在那裡」的假資料。
      delete next[fromZone];
    }
  }

  // 走到這裡有兩種情況：(a) 上面互換/搬移完，把人放進目標格；(b) 這個人本來不在場上
  // （板凳球員），直接塞進目標格、原本站那裡的人被頂掉——這就是「換人上場」的語意，
  // 被頂掉的人回到板凳、不需要另外安置，所以六個號位依然滿編。
  next[zone] = playerId;
  return next;
}

// assignPlayerToZone 的反向操作：把某個號位上的人拿下場，那格變空（issue #174 跨欄拖曳——
// 從輪轉表格子拖回球員清單就是「下場」）。
//
// 為什麼是「留空」而不是「找人遞補」：遞補要嘛得自己挑一個板凳球員（元件憑什麼替教練決定
// 派誰上），要嘛把後面的人往前移（那是輪轉、不是換人，語意完全不同）。留空並且讓
// filledCount 掉到 5/6，正好讓「還沒排滿就不能開賽」那道既有把關（captureLineupFromRotations）
// 自然生效——使用者拿掉一個人之後本來就該補人，不該被系統偷偷補完。
//
// 傳入號位本來就沒人時原樣回傳一份新快照，呼叫端不用先檢查。
export function removePlayerFromZone(lineup: LineupSnapshot, zone: number): LineupSnapshot {
  const next: LineupSnapshot = { ...lineup };
  delete next[zone];
  return next;
}

// ── #231 PR3 的推導層：從「一份先發 + L 站哪格」現算出某一輪的座標 ────────────────
//
// 這兩支是 PR3 換表示法的地基。背景：輪轉表 store 以前把「六輪各自的座標陣列」
// （RotationPositions[]）當成儲存的真相，但那六輪裡真正帶資訊量的只有第 0 輪的六個人 +
// 自由球員站哪個後排格——其餘 5 輪都是 rotateZone(z, i) 的純函數輸出，liberoReplacement
// （被 L 蓋住的人）同樣可以從「那一輪誰站在 L 那格」現算出來。
//
// 「能推導的東西就不要存」是 docs/event-grammar-spec.md 已經用過的原則：同一件事存了兩份，
// 就一定有「兩份不同步」這種 bug 的可能；只存一份、其餘現算，那類 bug 從型別上就不存在。
// PR3a 先把「現算」寫成純函式並測起來，PR3b 換掉 store 的儲存形狀，PR4 刪掉舊表示法留下的
// 一整批只剩測試在呼叫的函式（isLineupComplete / captureLineupFromRotations /
// readLineupFromRotations / positionsToLineup / placeLiberoInRotation）。

// 把某一輪的先發快照展開成該輪實際站位，並套上自由球員替換。
//
// ⚠️ 第三個參數在 #326 換了語意：以前是 liberoZone（「這一輪 L 站在哪個號位」），現在是
// replacedPlayerId（「L 頂替的是哪個球員」）。原因見 types/rotationTable.ts 那個欄位的說明，
// 一句話版本：站哪格是推導值，頂替誰才是原始事實。
//
// 換過來之後，「L 這一輪在不在場上」不再是另外一個要維護的旗標，而是這裡算出來的結果：
// 被頂替者落在後排 → L 站他的格子；被頂替者輪到前排（或已不在場上）→ L 不在場上，被頂替
// 者自己站回去。這正是排球規則本身（L 不能跟著輪到前排），只是寫成了一行推導。
//
// 回傳型別刻意仍是 RotationPositions（positions + liberoReplacement），這樣呼叫端（Court.tsx
// 畫球場、擷取戰術快照）拿到的答案格式沒變。
export function deriveRotation(
  lineup: LineupSnapshot,
  liberoId: string | null,
  replacedPlayerId: string | null,
  rotation: number,
): RotationPositions {
  const basePositions = lineupToPositions(lineup, rotation);
  if (liberoId === null || replacedPlayerId === null) {
    return { positions: basePositions, liberoReplacement: null };
  }

  const replaced = basePositions.find((p) => p.playerId === replacedPlayerId);
  // 被頂替者不在這一輪的六人裡（名單被改過留下的殘留），或已經輪到前排 → L 不在場上。
  // 兩種情況合成同一條分支不是偷懶：對畫面來說結果一模一樣（六人照站、沒有 L），而「殘留
  // 的 id 要不要順手清掉」是 store 的事，不是這支純函式該有的副作用。
  if (!replaced || !isBackRowPosition(replaced.x, replaced.y)) {
    return { positions: basePositions, liberoReplacement: null };
  }

  return {
    positions: [
      ...basePositions.filter((p) => p.playerId !== replacedPlayerId),
      { playerId: liberoId, x: replaced.x, y: replaced.y },
    ],
    liberoReplacement: { liberoId, replacedPosition: replaced },
  };
}

// 把先發快照裡「已經不在名單上的球員」剔除（幽靈站位清理，issue #35）。
//
// 舊模型要在六輪座標陣列裡逐輪 filter，還要另外檢查 liberoReplacement 裡有沒有卡到人；
// 新模型只有一份 lineup，掃一次就完事——這就是「單一表示法」省下來的東西。
//
// 沒有任何人被剔除時**回傳原本那個物件參照**，不是內容相同的新物件。這不是效能微調而是
// 正確性：setRoster 會被 TacticsBoard 的 effect 反覆呼叫，若每次都換新參照，訂閱 lineup 的
// 元件就會重繪 → effect 再呼叫 setRoster → 無限迴圈（Maximum update depth exceeded，
// issue #69→#70 踩過）。這條規則有測試用 toBe 釘住。
export function filterLineupToRoster(
  lineup: LineupSnapshot,
  roster: MatchPlayer[],
): LineupSnapshot {
  const validIds = new Set(roster.map((p) => p.id));
  const entries = Object.entries(lineup);
  const kept = entries.filter(([, playerId]) => validIds.has(playerId));
  if (kept.length === entries.length) return lineup;
  return Object.fromEntries(kept.map(([zone, playerId]) => [Number(zone), playerId]));
}

// 「先發排好了沒／可不可以開賽」這道門檻的唯一定義（issue #37 收斂、#231 PR3 換成吃
// LineupSnapshot）。六個號位都各站一個人才算滿——LineupSnapshot 的 key 天生就是號位，
// 所以「六個不同號位」直接等於 Object.keys 有六個，不需要另外檢查有沒有人重複站同一格。
//
// 為什麼「滿不滿」要跟「現在排了誰」分成兩件事：它們回答的是不同問題。lineup 本身照實
// 記錄 0~6 人（編輯中必然經過的中間狀態），這支只回答「夠不夠開賽」。以前這兩個語意混在
// captureLineupFromRotations 一支函式裡（不滿六人回 null），結果拿它去畫編輯中的面板時，
// 排第一個人就讀回 null 整個變空——「要看到第 1 個人得先有 6 個人」的死結（#174）。
//
// 也不必特別檢查有沒有派自由球員：L 是替換上場的，不佔六個號位（跟後端 lineups 表一致）。
export function isLineupFull(lineup: LineupSnapshot): boolean {
  return Object.keys(lineup).length === 6;
}

// 球員從球員設定拖到球場上、或在場上重新拖曳時，放開滑鼠的座標不會剛好落在 6 個
// 格子的正中心，所以要找「離哪個格子最近」來吸附。x/y 跟 zoneCoords 一樣是 0~1 normalized。
export function findNearestZone(x: number, y: number): number {
  let nearestZone = 1;
  let minDistance = Infinity;
  for (const zone of [1, 2, 3, 4, 5, 6] as const) {
    const coords = zoneCoords[zone];
    const distance = (coords.x - x) ** 2 + (coords.y - y) ** 2;
    if (distance < minDistance) {
      minDistance = distance;
      nearestZone = zone;
    }
  }
  return nearestZone;
}

export interface ZoneSlot {
  // 這個 slot 的原始號位標籤（顯示在圓圈裡）
  zone: number;
  // 輪轉後這個 slot 實際佔據的號位——用來判斷誰現在在 1 號位（發球方）
  currentZone: number;
  x: number;
  y: number;
}

// 紀錄模式用：對手沒有球員名單可以對應，只需要知道「現在 1~6 號位實際排在哪裡」，
// 用來畫沒有姓名、純粹顯示號位的圈圈。mirrored=true 時把座標上下左右都翻過去，
// 對應到球場另一邊（跟 Court.tsx 畫「對手號位」標籤時的鏡射方式一致）。
export function getZoneLayout(rotation: number, mirrored: boolean): ZoneSlot[] {
  return shiftSequence.map((zone) => {
    const newZone = rotateZone(zone, rotation);
    const coords = zoneCoords[newZone as keyof typeof zoneCoords];
    return {
      zone,
      currentZone: newZone,
      x: mirrored ? 1 - coords.x : coords.x,
      y: mirrored ? 1 - coords.y : coords.y,
    };
  });
}
