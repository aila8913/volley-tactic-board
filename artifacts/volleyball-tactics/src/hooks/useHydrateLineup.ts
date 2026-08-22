// 把後端「已經凍結的先發」補進共用輪轉表 store（issue #431）。
//
// 修的是什麼：`useRotationTable` 的 lineup 在這支之前只有一個寫入點——計分頁在「還沒開賽、
// 允許編輯先發」時的拖曳。而 dataByMatch 刻意不 persist（未存的工作狀態，重整就該回到空白）。
// 兩件事合起來的後果是：**已經開賽或打完的比賽，這份 store 裡永遠沒有站位**，所以戰術板的
// 六宮格對教練最常工作的那些比賽一律六格 `—`。那些比賽的先發其實存在，只是住在後端的
// lineups 表（一局一 row），從來沒有人把它讀回來。
//
// 為什麼是「載入時 hydrate 一次」而不是「讓六宮格直接去讀 record」：站位是全站共用的單一
// 真相（07-21 PO 定案，推翻 #115 的解耦模型），戰術板不該長出第二條自己的資料來源——那樣
// 就變成同一件事有兩份表示法，正是 #14／#231 那一串怪象的形狀。所以來源仍然只有 store 一個，
// 這裡只負責在頁面載入時把 store 填滿。
import { useEffect } from "react";
import { useListMatchLineups, getListMatchLineupsQueryKey } from "@workspace/api-client-react";
import { useRotationTable } from "./useRotationTable";
import { apiLineupToSnapshot } from "@/lib/scoreSheetMapping";

export function useHydrateLineup(matchId: string | null): void {
  // 網址上的 id 是字串，API 收整數。空板（/board，matchId 為 null）時 Number(null) 是 0，
  // 0 會讓 orval 產的 `enabled: !!(matchId)` 自己關掉查詢；但不倚賴那個巧合，下面明寫 enabled。
  const numericMatchId = Number(matchId);
  //
  // generated hook 的 options 型別把 queryKey 列為必填，所以連同 enabled 一起帶上預設的
  // queryKey（用 getListMatchLineupsQueryKey 產生，跟 hook 內部的預設一致）——同一個寫法
  // 見 useMatches.ts 的 useMatchWithRoster。
  const lineupsQuery = useListMatchLineups(numericMatchId, {
    query: {
      enabled: matchId !== null && Number.isFinite(numericMatchId),
      queryKey: getListMatchLineupsQueryKey(numericMatchId),
    },
  });

  const hydrateLineup = useRotationTable((state) => state.hydrateLineup);
  const rows = lineupsQuery.data;

  useEffect(() => {
    if (!matchId || !rows || rows.length === 0) return;

    // 後端已依 setId 排序（＝依局數順序，見 artifacts/api-server/src/routes/lineups.ts），
    // 所以最後一筆就是「最新一局」。取最新而不是第一局：教練在戰術板上想看的是這場現在
    // （或最後）站成什麼樣，不是三局前的開局陣容。
    const latest = rows[rows.length - 1];
    const snapshot = apiLineupToSnapshot(latest);

    // 只餵六個號位與「先發 L 是誰」。snapshot.replacesPlayerId（那一局 L 實際頂替了誰）
    // 刻意丟掉——賽前規劃側沒有這個欄位（ADR-0013／#425），倒灌回去等於把「紀錄」寫成
    // 「計畫」。store 端也不會覆蓋既有先發，重複呼叫是安全的（見 hydrateLineup 的說明）。
    hydrateLineup(matchId, snapshot.zones, snapshot.liberoId);
    // rows 直接進依賴陣列是安全的：React Query 有 structural sharing，資料內容沒變時
    // 回傳的是同一個參照，不會每次 render 都重跑這個 effect。
  }, [matchId, rows, hydrateLineup]);
}
