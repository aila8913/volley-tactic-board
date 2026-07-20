// 純函式集合：把「哪個球員站在哪個座標」的正規化資料（PlayerPosition + playerId）轉成
// 「快照」（CourtSnapshot + SnapshotPlayer，見 types/courtSnapshot.ts 的說明）。
//
// 刻意不 import 任何 store（useRotationTable / useTacticsBoard / useScoreSheet）——這些函式
// 全部「以值傳入、以值傳出」（roster、positions 都是呼叫端傳進來的參數），呼叫端負責從 store
// 讀出目前資料再傳進來。這樣測試時不需要 mock store，也保證這份程式碼永遠不會意外變成
// 「回頭去查 store 拿最新資料」——一旦真的這樣做了，就又變回正規化、快照就不再是快照了。

import { z } from "zod";
import type { PlayerPosition } from "../types/rotationTable";
import type { MatchPlayer, PlayerRole } from "../types/match";
import type { LineupSnapshot } from "../types/scoresheet";
import type { Marker, DefenseRange } from "../types/tacticsBoard";
import type { CourtSnapshot, SnapshotPlayer, SavedTacticDataV2 } from "../types/courtSnapshot";
import { lineupToPositions } from "./rotationLogic";

// ── 共用的「正規化→快照」轉換：拿一個站位 + 一份名單，查出球員資料後凍結成一筆 SnapshotPlayer ──
// 找不到球員（roster 裡沒有這個 playerId，俗稱「幽靈站位」——常見於切換不同比賽、或球員
// 後來被刪除）就回傳 null，呼叫端要記得 filter 掉。這正是快照要解決的問題發生的當下：
// 擷取的那一刻如果名單對不上，這個站位就直接丟棄，不會讓 undefined 姓名混進存檔。
function toSnapshotPlayer(pos: PlayerPosition, roster: MatchPlayer[]): SnapshotPlayer | null {
  const p = roster.find((x) => x.id === pos.playerId);
  if (!p) return null;
  return {
    sourcePlayerId: pos.playerId,
    name: p.name,
    number: p.number,
    role: p.role,
    x: pos.x,
    y: pos.y,
    isLibero: p.role === "L",
  };
}

// 從輪轉表的站位（教練排好的先發/輪次）擷取一張快照。
export function captureFromRotation(
  positions: PlayerPosition[],
  roster: MatchPlayer[],
  meta: { matchId: string | null; rotation: number },
): CourtSnapshot {
  const players = positions
    .map((pos) => toSnapshotPlayer(pos, roster))
    .filter((p): p is SnapshotPlayer => p !== null);
  return {
    source: "rotation",
    matchId: meta.matchId,
    rotation: meta.rotation,
    capturedAt: new Date().toISOString(),
    players,
  };
}

// 從計分表的先發快照（LineupSnapshot：號位 1~6 → playerId）擷取一張快照。
// 先用 lineupToPositions 把「號位→球員 id」換算成「第 rotation 輪時場上 6 個人的座標」
// （這條換算公式跟輪轉表共用，見 rotationLogic.ts），再套用同一套 denormalize 邏輯。
export function captureFromScoreSheet(
  lineup: LineupSnapshot,
  rotation: number,
  roster: MatchPlayer[],
  meta: { matchId: string | null },
): CourtSnapshot {
  const positions = lineupToPositions(lineup, rotation);
  const players = positions
    .map((pos) => toSnapshotPlayer(pos, roster))
    .filter((p): p is SnapshotPlayer => p !== null);
  return {
    source: "scoresheet",
    matchId: meta.matchId,
    rotation,
    capturedAt: new Date().toISOString(),
    players,
  };
}

// 「空站位」擷取：issue #160 C2 新增戰術的第二種來源。跟 captureFromRotation /
// captureFromScoreSheet 同一個家族——一樣是純函式、一樣回傳「以值」構成的 CourtSnapshot——
// 差別只是 players 固定給空陣列，不查任何 positions/roster。之所以獨立寫一個函式而不是
// 讓呼叫端直接手刻一個字面量物件：這樣「空快照長什麼樣子」只有一個定義來源，以後如果
// CourtSnapshot 的形狀改了（例如多一個必填欄位），只要改這裡，呼叫端不用跟著改。
export function captureBlank(meta: { matchId: string | null }): CourtSnapshot {
  return {
    source: "blank",
    matchId: meta.matchId,
    rotation: 0,
    capturedAt: new Date().toISOString(),
    players: [],
  };
}

// ── zod schema：舊版（legacy）SavedTacticData 與新版（v2）SavedTacticDataV2 ──
// 用 zod 而不是單純用 TypeScript 型別「假裝」讀進來的 JSON 一定符合形狀：這份資料是從
// 後端 /tactics API 讀回來的，實際內容可能是任何時期存進去的舊格式、或未來手動改壞的資料，
// TypeScript 的型別只在編譯期檢查、對「執行期真的讀到什麼」沒有保障力。zod.parse 在執行期
// 真的驗證欄位存在、型別正確，驗證失敗會丟出清楚的錯誤，而不是讓 undefined 一路帶著跑到
// 畫面上才爆炸。

const playerRoleSchema = z.enum(["S", "OH", "MB", "OPP", "L"]) satisfies z.ZodType<PlayerRole>;

const matchPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  number: z.number(),
  role: playerRoleSchema,
});

const playerPositionSchema = z.object({
  playerId: z.string(),
  x: z.number(),
  y: z.number(),
});

const liberoReplacementSchema = z.object({
  liberoId: z.string(),
  replacedPosition: playerPositionSchema,
});

const markerSchema = z.object({
  id: z.string(),
  type: z.enum(["arrow", "dashed", "attack", "text", "volleyball"]),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  text: z.string().optional(),
}) satisfies z.ZodType<Marker>;

const defenseRangeSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  type: z.enum(["circle", "ellipse", "fan"]),
  x: z.number(),
  y: z.number(),
  radius: z.number().optional(),
  rx: z.number().optional(),
  ry: z.number().optional(),
  startAngle: z.number().optional(),
  endAngle: z.number().optional(),
  rotation: z.number().optional(),
  color: z.string(),
  opacity: z.number(),
  visible: z.boolean(),
}) satisfies z.ZodType<DefenseRange>;

// 舊格式：一個輪次一筆，攤平存輪轉表+戰術板兩份資料（見 types/tacticsBoard.ts 的說明）。
const savedTacticRotationSchema = z.object({
  positions: z.array(playerPositionSchema),
  liberoReplacement: liberoReplacementSchema.nullable(),
  tacticPositions: z.array(playerPositionSchema).optional(),
  markers: z.array(markerSchema).optional(),
  defenseRanges: z.array(defenseRangeSchema).optional(),
});

const legacySavedTacticDataSchema = z.object({
  roster: z.array(matchPlayerSchema),
  currentRotation: z.number(),
  rotations: z.array(savedTacticRotationSchema),
  circleLabel: z.enum(["name", "number", "role"]),
  labelToggles: z.object({ zone: z.boolean() }),
});

const snapshotPlayerSchema = z.object({
  sourcePlayerId: z.string().nullable(),
  name: z.string(),
  number: z.number(),
  role: playerRoleSchema,
  x: z.number(),
  y: z.number(),
  isLibero: z.boolean(),
}) satisfies z.ZodType<SnapshotPlayer>;

const courtSnapshotSchema = z.object({
  source: z.enum(["rotation", "scoresheet", "saved-tactic", "blank"]),
  matchId: z.string().nullable(),
  rotation: z.number(),
  capturedAt: z.string(),
  players: z.array(snapshotPlayerSchema),
}) satisfies z.ZodType<CourtSnapshot>;

const tacticSceneSchema = z.object({
  label: z.string(),
  snapshot: courtSnapshotSchema,
  markers: z.array(markerSchema),
  defenseRanges: z.array(defenseRangeSchema),
});

const savedTacticDataV2Schema = z.object({
  version: z.literal(2),
  scenes: z.array(tacticSceneSchema),
}) satisfies z.ZodType<SavedTacticDataV2>;

// ── 讀取時轉檔（read-adapter），而不是寫一支批次程式改資料庫裡的舊資料 ──
//
// 為什麼選這個方向而不是「寫個 migration script，把 DB 裡所有舊 tactics row 一次性轉成
// v2 格式」：
//   1. 零停機：不用等一支 migration 跑完才能上線新版前端，讀取當下即時轉檔，新舊資料同時
//      可讀。
//   2. 舊 jsonb 資料永遠原封不動留在 DB 裡——這專案目前是 dev DB、沒有正式的 migration
//      流程（見 CLAUDE.md：Drizzle 用 `db:push`、沒有版本化的 migration 檔），批次改資料
//      這種「不可逆」操作風險偏高，出錯不容易回滾。
//   3. 轉檔本身是有損的（legacy 存 6 個輪次、v2 目前只留「目前這一輪」單一場景），如果先
//      批次轉檔又後悔了，其他輪次的資料已經真的不見了；用 read-adapter 每次讀都重新從
//      「原始舊資料」轉一次，舊資料完整保留，之後想改轉檔規則（例如改成保留全部輪次）
//      隨時可以調整，不用擔心「已經回不去了」。
//
// 因此這支函式的角色是「相容層」：呼叫端（load 戰術存檔那段程式碼）永遠只需要處理
// SavedTacticDataV2 這一種形狀，不管實際存進 DB 的是哪個年代存的格式。
export function parseSavedTactic(raw: unknown): SavedTacticDataV2 {
  // v2 格式用 version 欄位辨識，先檢查再驗證完整形狀（v2 讀回來要能原封不動、不失真地
  // 通過驗證，這是「read-adapter 至少要保證 idempotent」的最低要求：v2 存進去、讀出來
  // 還是同一份 v2）。
  if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    (raw as { version: unknown }).version === 2
  ) {
    return savedTacticDataV2Schema.parse(raw);
  }

  const legacyResult = legacySavedTacticDataSchema.safeParse(raw);
  if (legacyResult.success) {
    return convertLegacyToV2(legacyResult.data);
  }

  throw new Error(
    "無法辨識的戰術存檔格式：既不是 v2 格式（version === 2），也不符合舊版 SavedTacticData 結構。",
  );
}

function convertLegacyToV2(data: z.infer<typeof legacySavedTacticDataSchema>): SavedTacticDataV2 {
  // currentRotation 可能因為存檔當時跟現在陣列長度不一致而越界（例如舊資料本來就存壞了）
  // ——guard 一下，越界就當成「這個場景是空的」，不要整支函式炸掉。
  const rot = data.rotations[data.currentRotation];

  let players: SnapshotPlayer[] = [];
  let markers: Marker[] = [];
  let defenseRanges: DefenseRange[] = [];

  if (rot) {
    // 優先用 tacticPositions（教練在戰術視圖手動拖曳過的自訂站位），只有在它是空陣列
    // （代表「還沒客製化」，見 types/tacticsBoard.ts 的註解）時才 fallback 回 positions
    // （輪轉表原本的站位）。
    const positions =
      rot.tacticPositions && rot.tacticPositions.length > 0 ? rot.tacticPositions : rot.positions;

    // 關鍵：這裡的 join 對象是「這個檔案自己內嵌的 roster」（data.roster），不是呼叫端
    // 從外部（例如目前資料庫裡最新的球員名單）傳進來的名單。這正是快照化要解決的問題——
    // 就算現在的比賽名單裡已經刪掉了某個球員，這份舊存檔內嵌的 roster 副本還留著他當時的
    // 姓名/背號/位置，轉檔出來的快照才不會因為「現在」的名單變動而跟著壞掉。
    players = positions
      .map((pos) => toSnapshotPlayer(pos, data.roster))
      .filter((p): p is SnapshotPlayer => p !== null);
    markers = rot.markers ?? [];
    defenseRanges = rot.defenseRanges ?? [];
  }

  return {
    version: 2,
    scenes: [
      {
        label: "",
        snapshot: {
          source: "saved-tactic",
          matchId: null,
          rotation: data.currentRotation,
          capturedAt: new Date().toISOString(),
          players,
        },
        markers,
        defenseRanges,
      },
    ],
  };
}
