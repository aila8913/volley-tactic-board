import { PLAYER_ROLES, type PlayerRole } from "../types/match";
import { DND_ANON_ROLE } from "../lib/dndProtocols";

// 位置調色盤（issue #372 決策②）：右欄原本的「球員」按鈕只能換／挪真名單裡的人，戰術板
// 沒有比賽（空板，見 #372 part 1）時完全沒有名單可用，右欄那塊就整個是空的——PO 拍板的
// 解法不是「借一份假名單」，是換一種更根本的東西：一排固定的「位置」代表（OH/S/MB/OPP/L
// 五種），可以直接拖到場上，沒有比賽也能用。
//
// 「無限供應」是這個功能的核心心智模型，不是普通的「拖一個東西到別的地方」：
//   - 一般名單拖曳（TacticsRosterPanel／輪轉表）是「搬走」——這個人從清單消失、出現在
//     場上，清單跟場上加起來還是同一批人。
//   - 這裡是「複印」——拖出去一個 OH，原位這顆 OH 籌碼還在，可以再拖一個。場上因此可以
//     同時有兩個（或更多）OH，這是 PO 明確要的行為（見 #372 決策②），不是 bug。
// 下面每顆籌碼因此永遠不會消失、不會變灰、不會有「已用完」的狀態——這排本來就不是一份
// 「清單」，是一組固定的取用點。
//
// 角色代碼／中文名對照抄 CONTEXT.md〈位置〉那一條：舉球(S)、主攻(OH)、副攻(MB)、
// 對角(OPP)、自由球員(L)。直接 import types/match.ts 的 PLAYER_ROLES 決定要畫哪幾顆、
// 順序也跟著它走，不要另外手key一份角色代碼字串——那份才是跟 DB schema
// （lib/db/src/schema/players.ts 的 playerRoleEnum）對齊的唯一真相來源，兩邊各自維護
// 遲早會漂移（例如以後改成六個位置分類，這裡忘記加一顆）。
const ROLE_LABEL: Record<PlayerRole, string> = {
  S: "舉球",
  OH: "主攻",
  MB: "副攻",
  OPP: "對角",
  L: "自由球員",
};

export default function PositionPalette() {
  return (
    // flex-wrap：這排要塞進工具軌浮層（288px 寬，見 TacticsEditToolRail.tsx）跟 aside
    // （也是 288px，見 TacticsBoard.tsx mode D）兩種容器，五顆籌碼在窄容器裡自然換行，
    // 不需要為兩處容器各自排一份版面。
    <div
      data-testid="position-palette"
      className="flex flex-wrap items-center gap-1.5"
      aria-label="位置調色盤：拖到球場上放一個對應位置的球員"
    >
      {PLAYER_ROLES.map((role) => (
        <div
          key={role}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_ANON_ROLE, role);
            // effectAllowed 用 "copy" 不是 "move"：瀏覽器原生拖放的這個屬性只影響滑鼠游標
            // 圖示（"copy" 通常畫一個「+」角標），不會真的影響資料怎麼傳，純粹是視覺上誠實
            // 反映「這是複印一份，不是把這顆籌碼真的搬走」這個決策，跟上面說的「無限供應」
            // 是同一件事的兩種寫法（狀態上：這顆 div 拖完還在；游標上：也不畫成「移動中」）。
            e.dataTransfer.effectAllowed = "copy";
          }}
          data-testid={`position-palette-${role}`}
          title={`${ROLE_LABEL[role]}（${role}）——拖到球場上放一位`}
          // 樣式抄 TacticsEditToolRail.tsx 的 squareBtnClass（單一方鈕、選中萊姆綠）跟
          // RotationRailPanel.tsx 的 rowClass 未選中態（深色玻璃底＋白邊）——這排籌碼沒有
          // 「選中」這個狀態（不是點選式，是拖曳式），所以只借未選中的那一半視覺語彙，
          // 不新發明一套顏色。
          className="flex h-11 w-11 cursor-grab select-none items-center justify-center
            rounded-lg border border-white/[0.26] bg-white/[0.05] text-caption font-bold
            text-[#f5f5f0] transition hover:border-[#c6f135] hover:text-[#c6f135]
            active:cursor-grabbing"
        >
          {role}
        </div>
      ))}
    </div>
  );
}
