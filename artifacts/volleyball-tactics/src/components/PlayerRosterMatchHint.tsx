import { X } from "lucide-react";
import type { Person } from "@workspace/api-client-react";

// 球員名單去重 UX（#213）：在姓名輸入框下方，比對這一列的姓名跟既有的 people（跨場身分）
// 是否「trim 後不分大小寫完全相同」。
//   - 還沒對應到任何人、且比對到同名的既有身分 → 顯示建議 chip，要使用者親自按「是同一人」
//     才會寫入 personId。絕不自動綁定：自動綁對了省一步，綁錯了會把兩個不同人的生涯數據
//     混在一起，而且事後很難發現，所以這一步一定要使用者明示。
//   - 已經對應到某個人 → 顯示「已對應：XXX」＋一個可以解除的 ✕（解除＝把 personId 設回 null）。
//   - 沒對到、也還沒對應過 → 什麼都不顯示，保持名單編輯的清爽。
//
// #222：這塊原本長在 MatchDetailForm 裡面，只有「新增/編輯比賽」那條路徑有；戰術板的
// 「編輯球員名單」彈窗（RosterEditDialog）沒有，那條路加的球員永遠對不到既有身分。搬成
// 共用元件之後兩條路徑看到的是同一塊 UI。
//
// 搬家時順手把介面從「吃一整個 react-hook-form 的 form 物件」改成**純 props**：原本它自己
// useWatch 讀欄位、自己 setValue 寫回去，等於把型別綁死在 MatchFormValues 上（RosterEditDialog
// 的表單型別只有 players 一個欄位，塞不進去）。改成由父層負責訂閱與寫入，這支只管「拿到這些
// 值要畫什麼」——兩邊的表單型別因此不需要一致，這支也變成不必掛 react-hook-form 就能測。
// ⚠️ 顏色一律走 token（text-muted-foreground / border-border / text-foreground / *-primary），
// 不寫死字面值——這支現在會出現在**兩種底色**上：右欄的深色玻璃（MatchDetailForm，那邊用
// DARK_FORM_TOKENS 就地覆寫了這幾個變數）跟白底的彈窗（RosterEditDialog，用 :root 的原值）。
// 原本寫死的 text-[#F5F5F0] 在白底上等於隱形，這正是 token 存在的理由：同一塊 UI 換個容器
// 就該自動換一組顏色，而不是複製一份改顏色的分身。
interface PlayerRosterMatchHintProps {
  // 這一列目前打的姓名（父層用 useWatch 訂閱，打字時要即時重算建議）。
  name: string;
  // 這一列目前對應到的身分，null＝還沒對應。
  personId: number | null;
  // 既有的跨場身分清單。用 Pick 而不是整個 Person：這支只需要 id/name，而呼叫端拿到的
  // 其實是 PersonSummary（多帶 matchCount/teamNames），寬鬆一點兩邊都塞得進來。
  people: Pick<Person, "id" | "name">[];
  onLink: (personId: number) => void;
  onUnlink: () => void;
}

export default function PlayerRosterMatchHint({
  name,
  personId,
  people,
  onLink,
  onUnlink,
}: PlayerRosterMatchHintProps) {
  if (personId != null) {
    const matched = people.find((p) => p.id === personId);
    return (
      <div className="flex items-center gap-1 pl-1 text-micro text-muted-foreground">
        <span>已對應：{matched?.name ?? `#${personId}`}</span>
        <button
          type="button"
          onClick={onUnlink}
          className="rounded-sm hover:text-[#ef4444]"
          aria-label="解除對應"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;

  const candidate = people.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (!candidate) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-1 text-micro text-muted-foreground">
      <span>這是先前記錄過的「{candidate.name}」嗎？</span>
      <button
        type="button"
        onClick={() => onLink(candidate.id)}
        className="rounded border border-border px-1.5 py-0.5 text-foreground
          transition hover:border-primary hover:text-primary"
      >
        是同一人
      </button>
    </div>
  );
}
