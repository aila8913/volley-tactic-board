import NavRail from "./NavRail";
import { captureCurrentRotation } from "../lib/captureCurrentRotation";
import type { MatchListSelection } from "./MatchInfoRail";

// 比賽列表（MatchList）／資料夾內頁（TournamentDetail）共用的左欄導覽（issue #173）。
//
// 為什麼需要這一層薄薄的包裝，而不是兩個頁面各自寫 `<NavRail ... />`？
//
// 因為這兩頁是全站唯一「matchId 會變動」的地方：其他三頁的網址裡就有 matchId，一進頁面
// 就確定是哪一場；列表頁則是**使用者點了哪張卡片、才算選了哪一場**（#174 Stage A 定的
// `selected {kind, id}` 語意，而且明文規定不自動選第一場）。第一版把列表頁寫死成
// 「永遠沒有 matchId」，結果就是使用者點了一場比賽、右欄的站位都出來了，左欄的
// 「計／數／戰」卻還是灰的、點下去只會跳「先選一場比賽」——他明明選了。
//
// 這一層做的事只有一件：把「右欄認定的選取」翻譯成「左欄認定的 matchId」，讓兩欄對同一個
// 選取狀態有一致的理解。放在共用元件裡而不是各頁複製一次，是因為這兩頁的右欄本來就已經
// 共用 MatchInfoRail 了——選取語意只有一份，翻譯規則也該只有一份。
export default function ListNavRail({ selected }: { selected: MatchListSelection }) {
  // 只有選中「比賽」才給 matchId；選中資料夾（kind: "tournament"）時，「計分表／數據分析」
  // 這些比賽級的入口仍然無處可去，維持停用態才誠實——資料夾不是一場比賽。
  const matchId = selected?.kind === "match" ? selected.id : undefined;

  if (matchId === undefined) {
    return <NavRail backHref="/" active="list" />;
  }

  return (
    <NavRail
      matchId={matchId}
      backHref="/"
      active="list"
      // 「+ 新增戰術」的起點＝這場比賽輪轉表當下的站位，跟戰術頁的「現在站位」同一個定義
      // （共用 lib/captureCurrentRotation，見該檔案說明）。列表頁選一場比賽就能直接開一張
      // 戰術，不用先進戰術板頁面。
      captureCurrent={() => captureCurrentRotation(matchId)}
      captureLabel="將複製這場比賽當下輪次的站位"
    />
  );
}
