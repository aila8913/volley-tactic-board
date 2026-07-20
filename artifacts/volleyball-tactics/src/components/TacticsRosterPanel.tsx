import { useRotationTable } from "../hooks/useRotationTable";
import { useTacticsBoard } from "../hooks/useTacticsBoard";
import type { MatchPlayer } from "../types/match";
import type { SnapshotPlayer } from "../types/courtSnapshot";

// 這兩個「空陣列常數」必須提到模組層級、不能寫成 selector 裡的 `?? []`。
//
// 原因是 Zustand 的 selector 判斷「要不要重新 render」是用 Object.is 比對前後兩次選出來的
// 值。如果在 selector 裡直接寫 `?? []`，每次呼叫都會生出一個**全新的空陣列**，跟上一次的
// 空陣列雖然內容一樣、但參照不同 → Object.is 判定為「變了」→ 每次 store 有任何風吹草動
// 就重新 render。更糟的是 React 18 之後 Zustand 底層走 useSyncExternalStore，它會要求
// getSnapshot 回傳穩定參照，回傳浮動的新物件會直接觸發「The result of getSnapshot should
// be cached」的無限迴圈警告。
//
// 把空陣列宣告成模組層級的常數，每次 fallback 都回同一個參照，這個問題就消失了。
// （這跟這個 repo 之前踩過的 setRoster 無限迴圈是同一類病因：狀態沒變時參照必須保持不變。）
const EMPTY_ROSTER: MatchPlayer[] = [];
const EMPTY_SNAPSHOT_PLAYERS: SnapshotPlayer[] = [];

// 「常駐球員名單」面板——issue #160 C2 edit 模式的主要新 UI。
//
// 為什麼要「常駐」：戰術布置以前只能靠拖曳輪轉表擷取好的站位微調位置，想把板凳上的人
// 換上場、或把場上某人先挪開，沒有直接的操作入口。這個面板把整份「這場比賽」的名單
// （roster）攤開常駐在右側，讓場上/場下狀態一目了然，隨時能拖人上下場。
//
// 場上/場下怎麼判斷：不是靠 roster 自己記「誰在場上」——roster（MatchPlayer[]）跟
// session 裡的球員（SnapshotPlayer[]）是兩份完全不同、也刻意不互相參照的資料（見
// types/courtSnapshot.ts 的說明：session 裡的球員是反正規化、以值凍結的）。這裡單純
// 「比對」兩份資料：session.snapshot.players 裡有出現的 sourcePlayerId，就是「場上」；
// roster 裡剩下沒出現的，就是「場下」。這個比對只發生在渲染當下、算完就丟，不會把
// 比對結果存回任何 store——維持 #154 的單向性。
//
// 拖曳協定：沿用 RotationTable 左側名單「拖到球場」原本就有的做法——onDragStart 把
// playerId 存進 e.dataTransfer 的 "text/plain"。Court.tsx 的 handleDrop 已經在
// courtView === "tactics" && session 這條分支處理這個協定（查 roster 組出 SnapshotPlayer
// 再呼叫 placeSessionPlayer），這裡完全不用改 Court.tsx，重用同一套「拖放合約」就好。
interface TacticsRosterPanelProps {
  matchId: string;
}

export default function TacticsRosterPanel({ matchId }: TacticsRosterPanelProps) {
  const roster = useRotationTable((s) => s.dataByMatch[matchId]?.roster ?? EMPTY_ROSTER);
  const sessionPlayers = useTacticsBoard(
    (s) => s.session?.snapshot.players ?? EMPTY_SNAPSHOT_PLAYERS,
  );
  const removeSessionPlayer = useTacticsBoard((s) => s.removeSessionPlayer);

  const onCourtIds = new Set(sessionPlayers.map((p) => p.sourcePlayerId));
  const onCourt = roster.filter((p) => onCourtIds.has(p.id));
  const offCourt = roster.filter((p) => !onCourtIds.has(p.id));

  return (
    <section>
      <h2 className="mb-2 text-[15px] font-bold">球員名單</h2>

      <div className="mb-2">
        <div className="mb-1 text-[10px] font-bold text-[#a9b096]">場上 ({onCourt.length})</div>
        {onCourt.length === 0 ? (
          <p className="py-1 text-[10px] text-[#a9b096]">目前沒有球員在場上</p>
        ) : (
          <div className="space-y-1">
            {onCourt.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.18]
                  bg-white/[0.11] px-2 py-1 text-xs shadow-sm shadow-black/20 backdrop-blur-lg"
                data-testid={`roster-oncourt-${p.id}`}
              >
                <span>
                  #{p.number} {p.name}
                  <span className="ml-1 text-[10px] text-[#a9b096]">{p.role}</span>
                </span>
                <button
                  onClick={() => removeSessionPlayer(p.id)}
                  className="px-1 text-[10px] font-bold text-[#a9b096] hover:text-[#ef4444]"
                  title="移除下場"
                  data-testid={`button-remove-roster-${p.id}`}
                >
                  下場
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold text-[#a9b096]">場下 ({offCourt.length})</div>
        {offCourt.length === 0 ? (
          <p className="py-1 text-[10px] text-[#a9b096]">全部球員都在場上</p>
        ) : (
          <div className="space-y-1">
            {offCourt.map((p) => (
              <div
                key={p.id}
                draggable
                // 跟 RotationTable/Court.tsx 同一套原生 drag-and-drop 協定：只存 playerId，
                // 座標由放開時（Court 的 handleDrop）依滑鼠位置換算，這裡不用管座標。
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                className="cursor-grab rounded-lg border border-white/[0.18] bg-white/[0.05] px-2 py-1
                  text-xs text-[#a9b096] transition hover:border-[#c6f135] hover:text-[#f5f5f0]
                  active:cursor-grabbing"
                title="拖到球場上場"
                data-testid={`roster-offcourt-${p.id}`}
              >
                #{p.number} {p.name}
                <span className="ml-1 text-[10px]">{p.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
