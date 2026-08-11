// 「視圖③：球員跨場/跨隊分析」(#213) 的純函式層。跟 statsMapping.ts 的 buildPlayerMatrix/
// buildRotationStats 是同一套理由：把「後端回傳的原始資料 → 頁面要顯示的形狀」這段
// 轉換抽成不碰 React、不發請求的純函數，才方便寫單元測試釘住規則，也讓 PersonAnalytics.tsx
// 本身只管畫面、不管算法。
import type { PersonActionCount, PersonOutcomeBreakdown } from "@workspace/api-client-react";
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

// 「得分／失分結構」(#370) 那張卡要顯示的一列。跟 buildPersonActionSummary 同一套理由：
// 固定順序＋中文標籤＋缺席補 0，讓「這個人這輩子沒攔過網」明確顯示 0 次而不是整列消失。
// unknown 沒有補進這個型別本身要不要顯示的判斷（那是 UI 層的決定，見下面欄位說明），
// 但仍然原樣帶出，讓元件自己決定要不要秀出來。
export type PersonOutcomeSummaryRow = {
  action: PersonOutcomeBreakdown["action"];
  label: string;
  points: number;
  losses: number;
  // 「未填」筆數（events.outcome 是 null）。之所以不索性拿掉，是因為一個全新環境
  // （沒跑過回填腳本的 sandbox DB）就會真的看到非零的 unknown——見後端
  // analysisSummary.ts 的 OutcomeBreakdownEntry 長註解。頁面本身只在這個數字非零時
  // 才顯示「未填」那一欄，見 PersonAnalytics.tsx。
  unknown: number;
};

export function buildPersonOutcomeSummary(
  outcomeBreakdown: PersonOutcomeBreakdown[],
): PersonOutcomeSummaryRow[] {
  const byAction = new Map(outcomeBreakdown.map((row) => [row.action, row]));
  return ACTIONS.map((action) => {
    const row = byAction.get(action);
    return {
      action,
      label: ACTION_LABELS[action],
      points: row?.points ?? 0,
      losses: row?.losses ?? 0,
      // in_play 理論上不會出現在簡易版資料裡（見 EventOutcome 的 openapi 註解），這頁
      // 目前只呈現得分/失分/未填三欄，不特別畫出 in_play——之後真的有進階版逐球記錄要看
      // 這個維度時再加，不在這裡先猜格式。
      unknown: row?.unknown ?? 0,
    };
  });
}
