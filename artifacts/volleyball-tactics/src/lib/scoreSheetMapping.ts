// 計分表 domain 型別（types/scoresheet.ts 的 PointRecord / SetRecordingState）跟後端計分
// API DTO（@workspace/api-client-react 產生的 Rally / NewRally / NewEvent / MatchSet）之間的
// 轉換都集中在這裡，比照 lib/matchMapping.ts 的做法，讓 hooks/元件只管流程、不管欄位對應。
//
// 三個主要落差：
//   1. 「哪一邊」：前端用 'us' / 'opponent'，後端用 'home' / 'away'。
//   2. 一分的結構：前端一個 PointRecord（誰得分 + 這一球誰做了什麼動作）→ 後端拆成
//      一個 rally（誰得這分）＋ 最多一個 event（那一球的動作／球員）。「沒看到」只有 rally、沒 event。
//   3. 輪轉/發球方不存在後端：sets 只多存一個「誰先發（firstServer）」的種子，其餘（比分、
//      發球方、輪轉、每球的 side-out 旗標）都由這裡 replay rally 序列重算回來。
import type { MatchSet, Rally, MatchEvent, NewRally, NewEvent } from "@workspace/api-client-react";
import type { Side, PointRecord, PlayAction, SetRecordingState } from "../types/scoresheet";

// ── us/opponent ↔ home/away ──
// 後端所有計分相關的表（rallies.winner、events.side、sets.firstServer）都用 home/away，
// 前端一律用 us/opponent，進出後端就在這一層翻譯，其他地方不出現 home/away。
export function sideToApi(side: Side): "home" | "away" {
  return side === "us" ? "home" : "away";
}

export function apiToSide(value: "home" | "away"): Side {
  return value === "home" ? "us" : "opponent";
}

// ── PointRecord → rally ──
// 一個 PointRecord 就是一分 = 一個 rally。homeScore/awayScore 存的是「這分開始前」的比分
// （後端設計，見 lib/db/src/schema/rallies.ts），所以呼叫端要把記這分之前的比分傳進來。
export function pointRecordToRally(
  point: PointRecord,
  rallyNumber: number,
  homeScoreBefore: number,
  awayScoreBefore: number,
): NewRally {
  return {
    rallyNumber,
    homeScore: homeScoreBefore,
    awayScore: awayScoreBefore,
    winner: sideToApi(point.side),
  };
}

// ── PointRecord → event ──
// 簡易版一分最多記一球（sequence 固定 1）：有選動作又有動作方時才產生 event。
// 「沒看到」/沒帶動作 → 回 null，代表這分只有 rally、底下不記任何一球。
// playerId 只有我方球員對得到（string id → 後端 int）；對手(全體)沒有球員 → null。
// ballType/quality/座標都是進階版（賽後精確記）才填，簡易版一律留空。
export function pointRecordToEvent(point: PointRecord, sequence: number): NewEvent | null {
  if (!point.action || !point.touchedBy) return null;
  return {
    sequence,
    side: sideToApi(point.touchedBy.side),
    playerId: point.touchedBy.playerId !== undefined ? Number(point.touchedBy.playerId) : null,
    action: point.action,
    source: "live",
  };
}

// ── event → PointRecord 的動作資訊（pointRecordToEvent 的反向）──
// 重建時把後端 event 還原成 PointRecord 的 action/touchedBy。是 pointRecordToEvent 的逆：
//   - side：event.side（home/away）→ touchedBy.side（us/opponent）。
//   - playerId：後端 int（可為 null，代表對手(全體)沒有球員）→ 前端字串 / undefined。
//   - zone 不還原：events 沒存 zone（它是可由輪轉+球員衍生的顯示值，統計也用不到）。
// event.action 型別上是後端 EventAction，跟前端 PlayAction 是同一組字面值，斷言成 PlayAction。
export function eventToMeta(event: MatchEvent): Pick<PointRecord, "action" | "touchedBy"> {
  return {
    action: event.action as PlayAction,
    touchedBy: {
      side: apiToSide(event.side),
      playerId: event.playerId != null ? String(event.playerId) : undefined,
    },
  };
}

// ── 從後端重建一局的完整前端狀態 ──
// sets 表只存 setNumber + firstServer（誰先發）。比分、發球方、輪轉、每球的 wasSideOut
// 全部靠「從先發方開始、按 rallyNumber 依序 replay 每個 rally 的 winner」重算：
//   - 排球規則：只有原本沒發球的一方贏球（side-out，奪回發球權）才輪轉一個位置；
//     發球方自己續分只加分不輪轉。我方、對手各自獨立輪轉。（跟 useScoreSheet.scorePoint 同一套規則。）
//   - eventsByRallyId 帶進來時（3b-ii），每個 rally 若有 event 就把 action/touchedBy 補回 PointRecord，
//     reload / 跨場後球員統計才正確；不帶（或某 rally 沒 event，例如「沒看到」）就只重建
//     { side, wasSideOut, serverId }。簡易版一分最多一球，取 sequence 最小的那顆（呼叫端已排序）。
export function reconstructSetFromRallies(
  apiSet: MatchSet,
  rallies: Rally[],
  eventsByRallyId?: Map<number, MatchEvent[]>,
): SetRecordingState {
  const sorted = [...rallies].sort((a, b) => a.rallyNumber - b.rallyNumber);

  // server 一路追「目前發球方」：從先發方起算，每分結束後由這分的贏家發下一球。
  let server: Side = apiToSide(apiSet.firstServer);
  let ourScore = 0;
  let opponentScore = 0;
  let ourRotation = 0;
  let opponentRotation = 0;
  const history: PointRecord[] = [];

  for (const rally of sorted) {
    const winnerSide = apiToSide(rally.winner);
    const wasSideOut = winnerSide !== server;
    if (wasSideOut && winnerSide === "us") ourRotation = (ourRotation + 1) % 6;
    if (wasSideOut && winnerSide === "opponent") opponentRotation = (opponentRotation + 1) % 6;

    const events = eventsByRallyId?.get(rally.id);
    const meta = events && events.length > 0 ? eventToMeta(events[0]) : undefined;
    history.push({ side: winnerSide, wasSideOut, serverId: rally.id, ...meta });

    if (winnerSide === "us") ourScore++;
    else opponentScore++;
    server = winnerSide;
  }

  return {
    setNumber: apiSet.setNumber,
    ourScore,
    opponentScore,
    // 沒有任何 rally 時 server 還是先發方，發球方就是先發方；有 rally 時是最後一分的贏家。
    serving: server,
    ourRotation,
    opponentRotation,
    history,
    serverId: apiSet.id,
  };
}
