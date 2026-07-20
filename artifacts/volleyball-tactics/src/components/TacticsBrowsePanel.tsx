import type { Tactic } from "@workspace/api-client-react";
import TacticsList from "./TacticsList";
import { PRIMARY_BTN_CLASS } from "../lib/tacticsBoardStyles";

// browse 模式（session === null && viewingScene === null）——issue #160 C2 的兩模式狀態機
// 之一：還沒在編輯、也沒在看任何一張已存戰術，畫面就是「戰術庫」本身：一顆「新增戰術」
// 開新的布置彈窗，加上已存戰術清單（點一筆＝切去 viewing 模式看那張快照）。
interface TacticsBrowsePanelProps {
  tactics: Tactic[];
  onOpenNewTacticDialog: () => void;
  onSelectTactic: (t: Tactic) => void;
  onRenameTactic: (t: Tactic, name: string) => void;
  onDeleteTactic: (id: string) => void;
}

export default function TacticsBrowsePanel({
  tactics,
  onOpenNewTacticDialog,
  onSelectTactic,
  onRenameTactic,
  onDeleteTactic,
}: TacticsBrowsePanelProps) {
  return (
    <>
      <section>
        <h2 className="mb-2 text-[15px] font-bold">戰術布置</h2>
        <p className="mb-2 text-[10px] text-[#a9b096]">
          「新增戰術」用輪轉表現在的站位、或空白球場當起點，開一個可編排的戰術。點下面清單的已儲存戰術是「唯讀檢視」（看一張凍結的照片），檢視時按「編輯」才進可修改模式。
        </p>
        <button
          onClick={onOpenNewTacticDialog}
          className={`w-full py-1.5 text-xs font-bold ${PRIMARY_BTN_CLASS}`}
          data-testid="button-enter-layout-mode"
        >
          新增戰術
        </button>
      </section>
      <TacticsList
        tactics={tactics}
        activeTacticId={null}
        maxHeight="160px"
        onSelect={onSelectTactic}
        onRename={onRenameTactic}
        onDelete={onDeleteTactic}
      />
    </>
  );
}
