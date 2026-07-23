import { useRotationTable } from "../hooks/useRotationTable";
import { captureFromRotation } from "./courtSnapshot";
import type { CourtSnapshot } from "../types/courtSnapshot";

// 「把輪轉表當下的站位擷取成一張戰術快照」——四個呼叫端共用的同一段邏輯（issue #173）：
// TacticsBoard.tsx / TacticsBoardPanel.tsx（戰術頁的「+ 新增戰術」）、MatchList.tsx /
// TournamentDetail.tsx（列表頁選了一場比賽之後，左欄「戰」子清單裡的「+ 新增戰術」）。
//
// ── 為什麼可以抽出來，以及為什麼要順手把它焊進 lint 規則 ──
//
// #154 定下的鐵律是「戰術白板單向依賴」：白板 store（hooks/useTacticsBoard.ts）永遠不得
// import 輪轉表/計分表 store，否則它就有能力反向寫回，那正是 #154 一整串 bug 的病根。
// 這條規則已經用 eslint 的 no-restricted-imports 焊進 CI。
//
// 這個檔案讀了 useRotationTable，所以它本身「帶著輪轉表的讀取能力」。如果只是單純把它放進
// lib/ 就收工，會留下一個繞道：useTacticsBoard.ts 不能直接 import useRotationTable，卻可以
// import 這個檔案，等於透過一層轉包把被擋掉的依賴接回去——lint 規則看不到，因為它比對的是
// import 路徑字串，不是實際的相依圖。所以 eslint.config.mjs 的禁止清單同時也把這個模組列進
// 去了。抽共用邏輯時順手補上這一條，才不會讓「消除重複」變成偷偷拆掉一道防線。
//
// 讀取本身用 getState() 而不是 hook 訂閱：這裡要的是「使用者按下按鈕那一刻」的快照，不是
// 「隨輪轉表變動即時同步」——後者就不叫擷取，叫即時綁定，也會害呼叫端每次輪轉表一動就重繪。
export function captureCurrentRotation(matchId: string): CourtSnapshot {
  const data = useRotationTable.getState().dataByMatch[matchId];
  const rotation = data?.currentRotation ?? 0;
  const positions = data?.rotations[rotation]?.positions ?? [];
  const roster = data?.roster ?? [];
  return captureFromRotation(positions, roster, { matchId, rotation });
}
