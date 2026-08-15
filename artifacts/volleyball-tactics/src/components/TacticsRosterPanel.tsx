import { RotationPanel } from "./RotationTable";

// 「常駐球員名單」面板——issue #160 C2 edit 模式的主要新 UI，issue #251 這一輪重寫。
//
// 舊版這裡自己維護一份「場上/場下」清單：靠比對 session.snapshot.players 的
// sourcePlayerId 跟 roster，算出誰在場上、誰在板凳。這份比對邏輯本身沒有寫回任何 store
// （單向、算完即丟），但畫面上呈現的其實是「跟 mode B 那份 RotationRailPanel 幾乎一樣的
// 球員清單」又重新畫了一份——這正是 #251 回報的重複顯示 bug：中央欄跟右欄各自列出一次
// 同一場的球員。
//
// 產品的決策（跟 PO 確認過）：拿掉「場上/場下」這個分組視角，mode D 跟 mode B 用同一顆
// RotationRailPanel 呈現同一份 lineup/roster 真相，只差在哪個 mode 底下渲染。移除
// 「下場」按鈕是安全的——PlayerNode.tsx 上每個球場上的球員標記本來就有自己的移除控制項
// （見該檔案 ~29-53 行），使用者一樣能把人從場上移走，只是操作起點換成點球場上的人、
// 不是點右欄清單裡的「下場」文字鈕。
//
// 這個檔案現在只是 RotationTable.tsx 的 RotationPanel 本體套上不同的 matchId 來源
// （這裡的 matchId 是 TacticsBoard.tsx 算好、當 prop 傳進來的；RotationTable.tsx 自己
// 用 useParams 讀路由）——兩個 mode 需要的 RotationRailPanel 組合完全一樣（readOnly +
// benchDraggable + 同一顆 stepper + 同一組 footer 按鈕），拆出 RotationPanel 是為了不
// 讓兩邊各自維護一份幾乎相同的 JSX（見 RotationTable.tsx 開頭 RotationPanel 的說明）。
interface TacticsRosterPanelProps {
  matchId: string;
}

export default function TacticsRosterPanel({ matchId }: TacticsRosterPanelProps) {
  // mode D＝正在佈陣，中央球場上有一個 session 接得住拖曳（Court.tsx 的 handleDrop 會把
  // 拖進來的球員查成 SnapshotPlayer 放進快照），所以清單保持可拖。mode B 的
  // RotationTable 則相反，理由見 RotationTable.tsx 的 benchDraggable 說明。
  return <RotationPanel matchId={matchId} benchDraggable />;
}
