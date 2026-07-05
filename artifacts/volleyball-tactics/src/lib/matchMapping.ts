// 前端 domain 型別（types/match.ts）跟後端 API DTO（@workspace/api-client-react 產生的
// Match/Player）之間的轉換都集中在這裡，不散落到各元件。三個主要落差：
//   1. id：後端是 serial 整數，前端 domain 沿用字串（把整數 String() 起來當字串用，
//      URL 參數、localStorage key 都還是字串，改動最小）。
//   2. 時間：後端存 ISO timestamp；前端 <input type="datetime-local"> 要的是
//      "2026-06-24T15:30" 這種沒有時區的本地字串。
//   3. 名單：後端 players 是獨立資源要分開抓；domain Match 仍把它內嵌成 players[]。
import type {
  Match as ApiMatch,
  Player as ApiPlayer,
  NewPlayer,
  UpdatePlayer,
} from "@workspace/api-client-react";
import type { Match, MatchPlayer } from "../types/match";

// ── 日期轉換 ──
// datetime-local 的字串沒有時區，new Date() 會當成「本地時間」解讀；toISOString() 轉成 UTC
// 存進後端。反向 isoToLocalInput 用本地 getter 取回同一個牆上時鐘時間，來回一致。
export function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── DTO → domain ──
export function serverPlayerToDomain(p: ApiPlayer): MatchPlayer {
  return { id: String(p.id), name: p.name, number: p.number, role: p.role };
}

export function serverMatchToDomain(m: ApiMatch, players: ApiPlayer[] = []): Match {
  return {
    id: String(m.id),
    opponent: m.opponent,
    dateTime: isoToLocalInput(m.date),
    players: players.map(serverPlayerToDomain),
    createdAt: m.createdAt,
    tournamentId: m.tournamentId ?? null,
  };
}

// ── 名單 diff ──
// 前端名單編輯是「改整個陣列」的心智模型，但後端是 granular 的 create/patch/delete。
// 這支把「新名單 next」跟「伺服器目前名單 existing」比對，算出三組動作，讓呼叫端照著打 API。
// 用 granular 而非「刪光重建」是為了保住 player id 穩定（未來 events→playerId 才對得上）。
//
// 判斷「是不是既有球員」看的是 id 能不能對到 existing 裡的某個 id：
//   - RosterEditDialog 給新球員補的是 uuid、MatchFormDialog 新列則根本沒 id，
//     兩者都對不到 existing → 視為新增。
//   - 既有球員帶的是 String(serverId)，對得到 → 視情況更新或不動。
export interface RosterDiff {
  toCreate: NewPlayer[];
  toUpdate: { playerId: number; data: UpdatePlayer }[];
  toDelete: number[];
}

// next 用比 MatchPlayer 寬鬆的型別：表單裡新增的球員列沒有 id（id 為 undefined），
// 只有既有球員才帶得到 String(serverId) 的 id。id 對不到 existing 就當新增。
export type RosterInput = { id?: string; name: string; number: number; role: MatchPlayer["role"] };

export function diffRoster(existing: MatchPlayer[], next: readonly RosterInput[]): RosterDiff {
  const existingById = new Map(existing.map((p) => [p.id, p]));
  const nextIds = new Set(next.map((p) => p.id));

  const toCreate: NewPlayer[] = [];
  const toUpdate: { playerId: number; data: UpdatePlayer }[] = [];

  for (const p of next) {
    // 沒 id（表單新增列）直接視為新增；有 id 才去 existing 裡找對應的既有球員。
    const prev = p.id !== undefined ? existingById.get(p.id) : undefined;
    if (!prev) {
      // 對不到既有球員 → 新增。
      toCreate.push({ name: p.name, number: p.number, role: p.role });
      continue;
    }
    // 對得到 → 只有欄位真的變了才發 PATCH，沒變就不打不必要的請求。
    if (prev.name !== p.name || prev.number !== p.number || prev.role !== p.role) {
      toUpdate.push({
        playerId: Number(p.id),
        data: { name: p.name, number: p.number, role: p.role },
      });
    }
  }

  // 在 existing 裡、但新名單沒有的 → 刪除。
  const toDelete = existing.filter((p) => !nextIds.has(p.id)).map((p) => Number(p.id));

  return { toCreate, toUpdate, toDelete };
}
