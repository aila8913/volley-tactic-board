import { PLAYER_ROLES, type PlayerRole } from "../types/match";
import { DND_ANON_ROLE } from "../lib/dndProtocols";
import PlayerMarker from "./PlayerMarker";

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
// issue #420（header ＋ 佈陣右欄 v3）視覺重寫：原本是 flex-wrap 排列的方形描邊鈕，改成
// 5 欄固定 grid、圓形籌碼直接套用 PlayerMarker 的畫法（不另畫近似版——球場上跟調色盤上的
// 球員圈要是同一套視覺語彙，教練不用學兩套符號）。PlayerMarker 是畫進 <svg> 的 circle+text
// 片段（見該檔案開頭說明：只管畫、不管容器），這裡外面包一層小 <svg> 當圖示使用。
//
// ⚠️ 這顆元件同時被兩個地方用：mode D 的 ArrangingRail（見該檔案）跟 mode C 的
// TacticsEditToolRail 球員名單浮層。這次重繪套用到兩邊——純視覺升級、拖曳互動完全沒變，
// 兩個呼叫端不需要各自判斷「現在是哪個模式」，風險低到可以直接全域套用（同一種判斷見
// RotationRailPanel.tsx 唯讀格子材質那次的說明）。
const ROLE_LABEL: Record<PlayerRole, string> = {
  S: "舉球",
  OH: "主攻",
  MB: "副攻",
  OPP: "對角",
  L: "自由",
};

// 角色描邊色——直接對應 tactics-header-arranging-v3 spec §3.1 那張表。OH/MB 沒有專屬色，
// 用預設的 --ink（PlayerMarker 不傳 color 覆寫時的原生白）。OPP 的琥珀色是這次新增的
// 角色識別色，之前的畫面沒有替 OPP 單獨配色過。
const ROLE_COLOR: Partial<Record<PlayerRole, string>> = {
  S: "#c6f135",
  OPP: "#F5A623",
};

// 籌碼的視覺半徑（SVG 座標，配合下面 viewBox 換算成 44px 的圓）。「無限供應」的同心錯位
// 環（spec 的 .pm::after）改成在 PlayerMarker 主圓「後面」多畫一顆同半徑、往右下偏移的
// 空心圓——SVG 沒有 CSS 的 z-index，靠畫的先後順序決定疊層，所以這圈環要畫在 <PlayerMarker
// /> 之前，才會被主圓蓋住大半、只在右下角露出一小段弧，看起來像疊了一疊牌。
const CHIP_RADIUS = 17;
const RING_OFFSET = 3;

function PositionChip({ role }: { role: PlayerRole }) {
  const isLibero = role === "L";
  const color = ROLE_COLOR[role] ?? "#f5f5f0";
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_ANON_ROLE, role);
        // effectAllowed 用 "copy" 不是 "move"：瀏覽器原生拖放的這個屬性只影響滑鼠游標
        // 圖示（"copy" 通常畫一個「+」角標），不會真的影響資料怎麼傳，純粹是視覺上誠實
        // 反映「這是複印一份，不是把這顆籌碼真的搬走」這個決策，跟「無限供應」是同一件事
        // 的兩種寫法（狀態上：這顆 div 拖完還在；游標上：也不畫成「移動中」）。
        e.dataTransfer.effectAllowed = "copy";
      }}
      data-testid={`position-palette-${role}`}
      title={`${ROLE_LABEL[role]}（${role}）——拖到球場上放一位`}
      className="flex w-12 cursor-grab select-none flex-col items-center gap-1.5 active:cursor-grabbing"
    >
      <svg
        width="44"
        height="44"
        viewBox={`0 0 ${(CHIP_RADIUS + RING_OFFSET) * 2} ${(CHIP_RADIUS + RING_OFFSET) * 2}`}
        className="pointer-events-none"
      >
        {/* 同心錯位環：跟主圓同半徑、圓心往右下偏移 RING_OFFSET，畫在主圓之前所以會被蓋住
          大半，只留右下角一小段弧線——這段弧線就是「原地還有一顆」的視覺訊號。 */}
        <circle
          cx={CHIP_RADIUS + RING_OFFSET}
          cy={CHIP_RADIUS + RING_OFFSET}
          r={CHIP_RADIUS}
          fill="none"
          stroke="rgba(245,245,240,0.14)"
          strokeWidth="1"
        />
        <g transform={`translate(${CHIP_RADIUS}, ${CHIP_RADIUS})`}>
          <PlayerMarker
            number={0}
            name=""
            radius={CHIP_RADIUS}
            color={isLibero ? "#f5f5f0" : color}
            solidFill={isLibero}
            circleText={role}
          />
        </g>
      </svg>
      <span className="whitespace-nowrap text-micro text-[#a9b096]/70">{ROLE_LABEL[role]}</span>
    </div>
  );
}

export default function PositionPalette() {
  return (
    // 5 欄固定 grid（spec：一列排滿五顆、不換行——角色固定五個，flex-wrap 只會讓它在不同
    // 寬度的容器裡長得不一樣）。這顆元件會被塞進兩種容器：mode D 的 aside（288px）跟工具軌
    // 浮層（w-72，同樣 288px），兩邊寬度剛好一致，5 欄不會有換行風險。
    <div
      data-testid="position-palette"
      className="grid grid-cols-5 items-start justify-items-center gap-1"
      aria-label="位置調色盤：拖到球場上放一個對應位置的球員"
    >
      {PLAYER_ROLES.map((role) => (
        <PositionChip key={role} role={role} />
      ))}
    </div>
  );
}
