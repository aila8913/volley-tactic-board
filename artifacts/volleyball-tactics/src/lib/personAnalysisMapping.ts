// 「視圖③：球員跨場/跨隊分析」(#213) 的純函式層。跟 statsMapping.ts 的 buildPlayerMatrix/
// buildRotationStats 是同一套理由：把「後端回傳的原始資料 → 頁面要顯示的形狀」這段
// 轉換抽成不碰 React、不發請求的純函數，才方便寫單元測試釘住規則，也讓 PersonAnalytics.tsx
// 本身只管畫面、不管算法。
import type { PersonActionCount } from "@workspace/api-client-react";
import { ACTIONS, ACTION_LABELS } from "@/lib/statsMapping";

export type PersonActionSummaryRow = {
  action: PersonActionCount["action"];
  label: string;
  count: number;
};

// 把後端「觸球動作次數分布」整理成固定順序（發球→接發→舉球→攻擊→攔網→防守，跟
// ACTIONS/ACTION_LABELS 同一套順序，呼應 ScoreSheet.tsx 的 ACTION_OPTIONS）、
// 並補上中文標籤、缺席的動作補 0 次——後端 groupBy 出來的順序不保證（取決於資料庫
// 掃描順序），前端不該假設它已經照順序排好，也不該讓「這個人這輩子沒攔過網」在畫面上
// 直接消失一列（缺席跟「0 次」語意不同：消失容易讓人誤以為是資料沒載到，明確顯示 0
// 次才是「有查過、確實是 0」）。
export function buildPersonActionSummary(
  actionCounts: PersonActionCount[],
): PersonActionSummaryRow[] {
  const countByAction = new Map(actionCounts.map((row) => [row.action, row.count]));
  return ACTIONS.map((action) => ({
    action,
    label: ACTION_LABELS[action],
    count: countByAction.get(action) ?? 0,
  }));
}
