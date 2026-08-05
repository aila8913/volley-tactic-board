// #224：人員名單管理頁——列出這個帳號底下所有已儲存的球員身分（people 表），並且能直接
// 新增／改名／刪除／合併它們。跟 PersonAnalytics.tsx（視圖③，唯讀的分析入口）是姐妹頁，
// 共用同一套視覺語言（AppShell + NavRail + 深色玻璃卡片），但這頁是「管理」不是「分析」——
// PersonAnalytics 的下拉選單雖然也列出所有 people，卻沒有任何地方能改名/刪除/合併，
// 這就是這個 issue 存在的理由（見 issue #224 本文）。
//
// 合併功能（#221 的後端、這裡是 UI 落點）刻意跟列表/新增/改名/刪除放在同一頁但分成
// 獨立的「合併建議」區塊，而不是把合併操作也塞進每一列的按鈕——理由是合併的操作單位是
// 「一組同名的人」而不是「單一一個人」，混在同一列的 UI 裡會讓使用者搞不清楚在跟誰互動。
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Users, Pencil, Trash2, Plus, Check, X, Merge } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import AppShell from "@/components/AppShell";
import NavRail from "@/components/NavRail";
import {
  usePersonList,
  useCreatePerson,
  useRenamePerson,
  useDeletePerson,
  useMergeCandidates,
  useMergePeople,
} from "@/hooks/usePeople";
import { APP_BACKGROUND_STYLE, APP_SHELL_CLASS } from "@/lib/appChromeStyles";
import type { MergeCandidateGroup, MergeCandidatePerson } from "@workspace/api-client-react";

// 跟 PersonAnalytics.tsx 同一套次要按鈕／玻璃卡片語言，維持分析頁家族的視覺一致。
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/[0.26] " +
  "bg-white/[0.05] px-5 py-2 text-sm font-bold text-[#f5f5f0] transition " +
  "hover:border-[#c6f135] hover:text-[#c6f135]";

const GLASS_SECTION_CLASS =
  "rounded-2xl border border-white/[0.12] bg-white/[0.07] p-4 shadow-lg shadow-black/35 backdrop-blur-md";

// 「隊伍清單」文字，跟 PersonAnalytics.tsx 第 179 行同一個判準：沒有關聯到任何球隊的
// 場次，顯示「未分類」而不是留白——留白容易被誤讀成「資料還沒載入完」。
function formatTeamNames(teamNames: string[]): string {
  return teamNames.length > 0 ? teamNames.join("、") : "未分類";
}

export default function PeopleManagement() {
  const { people, isLoading: peopleLoading } = usePersonList();
  const createPerson = useCreatePerson();
  const renamePerson = useRenamePerson();
  const deletePerson = useDeletePerson();
  const { groups, isLoading: groupsLoading } = useMergeCandidates();

  // ── 新增 ──
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (trimmed === "") return;
    setIsCreating(true);
    try {
      await createPerson(trimmed);
      setNewName("");
    } finally {
      setIsCreating(false);
    }
  };

  // ── 改名 ──
  // 只用一個 editingId 記錄「目前哪一列在編輯」——同一時間只能編輯一列，切到別列會蓋掉
  // 前一列還沒存的草稿，這是刻意的簡化（跟 issue 要求的「保持簡單，不需要表單套件」一致）。
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const startEditing = (id: number, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEditing = async () => {
    if (editingId === null) return;
    const trimmed = editingName.trim();
    if (trimmed === "") return;
    await renamePerson(editingId, trimmed);
    cancelEditing();
  };

  // ── 刪除 ──
  // window.confirm——這個 repo 目前沒有 AlertDialog 元件，MatchList.tsx 的刪除也是同一套
  // 做法（見該檔案 handleDeleteMatch），這裡跟著沿用，不要另外引入新元件造成不一致。
  // 訊息內容是 issue #224「注意事項」明講的要求：一定要讓使用者知道這只是解除跨場身分的
  // 標記，不是刪除任何比賽/名單資料（players.personId 的外鍵是 onDelete: "set null"）。
  const handleDelete = async (id: number, name: string) => {
    const confirmed = window.confirm(
      `確定要刪除「${name}」這個球員身分嗎？\n\n這只會解除他跟過去比賽名單的跨場關聯，` +
        `不會刪除任何比賽或名單紀錄——那些比賽的名單列會變回「歸屬不明」，之後還能重新` +
        `對應到別的身分。`,
    );
    if (!confirmed) return;
    await deletePerson(id);
  };

  return (
    <AppShell
      mode="A"
      nav={
        <div className="relative z-10 h-full">
          <NavRail backHref="/" active="analytics" />
        </div>
      }
      backdrop={<div className="tb-beam" />}
      className={APP_SHELL_CLASS}
      style={APP_BACKGROUND_STYLE}
    >
      <div className="relative z-10 min-h-0 w-full flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5 text-[#c6f135]" />
            數據分析 · 人員名單管理
          </h1>
          <Link href="/analytics/people" className={SECONDARY_BUTTON_CLASS}>
            回球員分析
          </Link>
        </header>

        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {/* 新增：一個小輸入框＋按鈕，直接建一個身分，不必先去建一場比賽（issue 要求）。 */}
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">新增球員身分</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
                placeholder="輸入姓名"
                className="flex-1 rounded-full border border-white/[0.26] bg-white/[0.05] px-4 py-2 text-sm text-[#f5f5f0] outline-none transition placeholder:text-[#a9b096] hover:border-[#c6f135] focus:border-[#c6f135]"
              />
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={newName.trim() === "" || isCreating}
                className="inline-flex items-center gap-1 rounded-full bg-[#c6f135] px-4 py-2 text-sm font-bold text-[#0a0b07] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                新增
              </button>
            </div>
          </section>

          {/* 列表：帶 matchCount/teamNames（#224 對 GET /people 的升級），不然同名的兩筆
              根本分不出誰是誰（issue 原文）。 */}
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="mb-3 text-sm font-bold text-[#f5f5f0]">所有球員身分</h2>
            {peopleLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#a9b096]">
                <Spinner className="size-4" />
                載入中…
              </div>
            ) : people.length === 0 ? (
              <p className="text-sm text-[#a9b096]">
                還沒有任何球員身分。用上面的新增功能直接建一個，或是到比賽的名單裡把某個名單列
                「對應」到一個人。
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {people.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2 last:border-b-0 last:pb-0"
                  >
                    {editingId === person.id ? (
                      // 編輯態：名字換成輸入框＋存檔/取消。
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEditing();
                            if (e.key === "Escape") cancelEditing();
                          }}
                          autoFocus
                          className="flex-1 rounded-full border border-[#c6f135] bg-white/[0.05] px-3 py-1 text-sm text-[#f5f5f0] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void saveEditing()}
                          disabled={editingName.trim() === ""}
                          className="rounded-full border border-white/[0.26] p-1.5 text-[#c6f135] transition hover:border-[#c6f135] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="儲存"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="rounded-full border border-white/[0.26] p-1.5 text-[#a9b096] transition hover:border-white/[0.5]"
                          aria-label="取消"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      // 檢視態：名字＋出賽場次＋球隊，再加編輯/刪除兩顆按鈕。
                      <>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-[#f5f5f0]">
                            {person.name}
                          </span>
                          <span className="text-xs text-[#a9b096]">
                            出賽 {person.matchCount} 場 · {formatTeamNames(person.teamNames)}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditing(person.id, person.name)}
                            className="rounded-full border border-white/[0.26] p-1.5 text-[#a9b096] transition hover:border-[#c6f135] hover:text-[#c6f135]"
                            aria-label={`改名：${person.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(person.id, person.name)}
                            className="rounded-full border border-white/[0.26] p-1.5 text-[#a9b096] transition hover:border-red-400 hover:text-red-400"
                            aria-label={`刪除：${person.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 合併建議：#221 的後端＋這裡的 UI 落點。獨立成一個區塊，不跟上面列表的
              編輯/刪除按鈕混在一起——理由見檔頭註解。 */}
          <section className={GLASS_SECTION_CLASS}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#f5f5f0]">
              <Merge className="h-4 w-4 text-[#c6f135]" />
              合併建議
            </h2>
            {groupsLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#a9b096]">
                <Spinner className="size-4" />
                載入中…
              </div>
            ) : groups.length === 0 ? (
              // 沒有候選組是正常/好的狀態（沒有同名重複），刻意用平靜的說明文字，
              // 不要讓使用者誤以為這是錯誤或功能壞掉（issue 要求）。
              <p className="text-sm text-[#a9b096]">目前沒有偵測到同名的重複身分，不需要合併。</p>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-[#a9b096]">
                  下面每一組是姓名看起來相同的幾筆身分（可能是同一個人被重複建立）。選一筆當
                  「保留」的目標，其餘勾選的會被併入目標、然後刪除——這個操作無法復原。
                </p>
                {groups.map((group) => (
                  <MergeGroupCard key={group.normalizedName} group={group} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

// 單一合併候選組的卡片：自己管理「選哪個當目標」「勾了哪些來源」這兩份區域性狀態，
// 不放進外層 PeopleManagement 的 state——每組彼此獨立，放在同一個 state 物件裡只會讓
// 外層元件多一層不必要的巢狀更新邏輯，拆成子元件讓每組的 useState 天然互不干擾。
function MergeGroupCard({ group }: { group: MergeCandidateGroup }) {
  const mergePeople = useMergePeople();
  const [isMerging, setIsMerging] = useState(false);

  // 預設目標：matchCount 最高的那筆（出賽場次多，通常代表這是「主要」使用的那個身分），
  // 平手時選 id 較小的（建立得比較早，通常是原本就在用的那個，而不是後來誤建的）——
  // 這是 issue 明講的預設規則，使用者仍可以手動改選別筆當目標。
  const defaultTargetId = useMemo(() => {
    return [...group.people].sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return a.id - b.id;
    })[0].id;
  }, [group.people]);

  const [targetId, setTargetId] = useState<number>(defaultTargetId);

  // 預設所有「非目標」的人都勾選為來源——合併建議組本身就是系統判斷「這些人看起來是同一個
  // 人」，預設全選讓使用者在最常見的情況下（整組真的都是同一人）只要按一下確認就好，
  // 不想併的人自己取消勾選即可。
  const [checkedSourceIds, setCheckedSourceIds] = useState<Set<number>>(
    () => new Set(group.people.filter((p) => p.id !== defaultTargetId).map((p) => p.id)),
  );

  const handleSelectTarget = (id: number) => {
    setTargetId(id);
    // 換了目標之後，原本被選為目標的那筆理應變回可以被勾選的來源之一，而新目標本身
    // 不能再是自己的來源——用 group.people 重新算一次勾選集合，而不是只是移除/加入
    // 單一 id，避免使用者手動取消過的勾選在切換目標時被意外復原。
    setCheckedSourceIds(new Set(group.people.filter((p) => p.id !== id).map((p) => p.id)));
  };

  const toggleSource = (id: number) => {
    setCheckedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const targetPerson = group.people.find((p) => p.id === targetId);
  const sourcePeople = group.people.filter((p) => checkedSourceIds.has(p.id));

  const handleMerge = async () => {
    if (!targetPerson || sourcePeople.length === 0) return;
    // 確認訊息明講「哪些名字會消失、哪個會留下」，不是籠統的「確定要合併嗎」——
    // 合併不可逆，使用者要在按下確認前就看清楚後果（issue 要求）。
    const sourceNames = sourcePeople.map((p) => p.name).join("、");
    const confirmed = window.confirm(
      `確定要合併嗎？\n\n將保留：${targetPerson.name}\n將消失（併入上面那筆後刪除）：${sourceNames}\n\n這個操作無法復原。`,
    );
    if (!confirmed) return;

    setIsMerging(true);
    try {
      await mergePeople(
        targetId,
        sourcePeople.map((p) => p.id),
      );
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] p-3">
      <ul className="flex flex-col gap-1.5">
        {group.people.map((person) => (
          <MergeGroupRow
            key={person.id}
            person={person}
            isTarget={person.id === targetId}
            isChecked={checkedSourceIds.has(person.id)}
            onSelectTarget={() => handleSelectTarget(person.id)}
            onToggleSource={() => toggleSource(person.id)}
          />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => void handleMerge()}
        disabled={sourcePeople.length === 0 || isMerging}
        className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#c6f135] px-4 py-1.5 text-xs font-bold text-[#0a0b07] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Merge className="h-3.5 w-3.5" />
        合併
      </button>
    </div>
  );
}

// 候選組裡的一列：一顆 radio（選這筆當目標）＋一顆 checkbox（是不是來源，目標那列的
// checkbox 不會出現——目標不能同時是自己的來源）。拆成獨立元件單純是讓上面
// MergeGroupCard 的 JSX 不要塞進太多巢狀邏輯，沒有共用狀態的必要，props 全部從
// 父層傳下來即可。
function MergeGroupRow({
  person,
  isTarget,
  isChecked,
  onSelectTarget,
  onToggleSource,
}: {
  person: MergeCandidatePerson;
  isTarget: boolean;
  isChecked: boolean;
  onSelectTarget: () => void;
  onToggleSource: () => void;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <label className="flex items-center gap-1.5 text-xs text-[#a9b096]">
        <input
          type="radio"
          checked={isTarget}
          onChange={onSelectTarget}
          className="accent-[#c6f135]"
        />
        保留
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[#a9b096]">
        <input
          type="checkbox"
          checked={!isTarget && isChecked}
          disabled={isTarget}
          onChange={onToggleSource}
          className="accent-[#c6f135]"
        />
        併入
      </label>
      <span className={"flex-1 " + (isTarget ? "font-semibold text-[#c6f135]" : "text-[#f5f5f0]")}>
        {person.name}
      </span>
      <span className="text-xs text-[#a9b096]">
        出賽 {person.matchCount} 場 · {formatTeamNames(person.teamNames)}
      </span>
    </li>
  );
}
