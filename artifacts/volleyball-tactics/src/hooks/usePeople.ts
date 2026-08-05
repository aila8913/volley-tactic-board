// 「人」（Person＝跨比賽的真實身分）的資料存取層，跟 useTeams.ts 是同一套「API adapter」模式：
// 底層用 @workspace/api-client-react 生成的 React Query hooks 打後端，對外給元件一個乾淨的
// 讀（usePersonList/useMergeCandidates）＋寫（useCreatePerson/useRenamePerson/useDeletePerson/
// useMergePeople）介面。
//
// 用途（#213）：名單去重 UX——同一個人打了好幾場比賽，我們想在球員名單裡認出「這其實是同一個
// 人」，讓 players.personId 指到同一個 person，之後跨場統計（視圖③）才能把數據正確地加總在
// 一起。#224 補齊了改名／刪除／合併這三支管理頁需要的 hook（原本這裡的檔頭註解寫「這一輪
// 還沒做」，就是指這幾支）。
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPeople,
  useCreatePerson as useCreatePersonMutation,
  useUpdatePerson as useUpdatePersonMutation,
  useDeletePerson as useDeletePersonMutation,
  useListMergeCandidates,
  useMergePeople as useMergePeopleMutation,
  getListPeopleQueryKey,
  getListMergeCandidatesQueryKey,
} from "@workspace/api-client-react";
import type { PersonSummary, MergeCandidateGroup } from "@workspace/api-client-react";

// ── 讀取 ──
// #224：GET /people 的回應形狀從單純的 Person（id/name）升級成 PersonSummary（多帶
// matchCount/teamNames），管理頁列表需要這兩個欄位才分得清楚同名的兩筆是誰是誰
// （見 issue #224 本文「不然同名的兩筆根本分不出誰是誰」）。後端理由見
// artifacts/api-server/src/routes/people.ts 的 getPersonSummaries() 註解。
export function usePersonList() {
  const { data, isLoading, isError } = useListPeople();
  // 用 Array.isArray 而不是 `data ?? []`——這不是多餘的防禦，是踩過的坑：
  // `?? []` 只擋得掉 undefined/null，擋不掉「後端回了一個不是陣列的東西」。最常見的情境是
  // api-server 還沒重啟、/people 這支新 endpoint 根本還沒掛上，請求就掉進 Vite 的 SPA
  // fallback、拿回一整份 index.html 的字串——`data ?? []` 會原封不動把那個字串傳下去，
  // 直到某個元件呼叫 people.find(...) 才炸成「people.find is not a function」的白屏，
  // 而錯誤訊息指向的是使用端，離真正的原因（endpoint 沒掛上）非常遠、很難查。
  // 用型別檢查在來源就把它收斂成空陣列，畫面只是「暫時沒有建議」而不是整頁掛掉。
  // useCrossMatchAnalysis.ts 有同一段理由的註解，那支是先踩到的。
  const people: PersonSummary[] = Array.isArray(data) ? data : [];
  return { people, isLoading, isError };
}

// #224：合併候選組——GET /people/merge-candidates 回傳「同一個正規化姓名底下有 2 筆以上
// person」的分組（見 artifacts/api-server/src/lib/personName.ts 的 groupMergeCandidates），
// 給合併 UI 當建議來源。跟 usePersonList 一樣用 Array.isArray 防呆，理由同上。
export function useMergeCandidates() {
  const { data, isLoading, isError } = useListMergeCandidates();
  const groups: MergeCandidateGroup[] = Array.isArray(data) ? data : [];
  return { groups, isLoading, isError };
}

// ── 寫入 ──
// 新增一個「人」，回傳後端給的整數 id，讓呼叫端（球員名單去重 UX）拿去綁到某個名單列的
// personId。成功後 invalidate 列表，讓其他正在讀 usePersonList 的地方看到新建的身分。
export function useCreatePerson() {
  const queryClient = useQueryClient();
  const createPerson = useCreatePersonMutation();

  return useCallback(
    async (name: string): Promise<number> => {
      const created = await createPerson.mutateAsync({ data: { name } });
      queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
      return created.id;
    },
    [queryClient, createPerson],
  );
}

// #224：改名——管理頁的「編輯」功能。跟 useMatches.ts 的 useUpdateMatch 同一套模式：
// 包一層 useCallback，內部 await mutateAsync 再 invalidate，呼叫端不必自己碰 React Query
// 的 queryKey。
export function useRenamePerson() {
  const queryClient = useQueryClient();
  const updatePerson = useUpdatePersonMutation();

  return useCallback(
    async (personId: number, name: string): Promise<void> => {
      await updatePerson.mutateAsync({ personId, data: { name } });
      queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
    },
    [queryClient, updatePerson],
  );
}

// #224：刪除——安全操作，不是使用者直覺以為的「刪資料」。players.personId 這個外鍵是
// onDelete: "set null"（見 lib/db/src/schema/players.ts），刪掉一個 person 只會讓指著它的
// 名單列 personId 變回 null（那些名單列變回「歸屬不明」），**不會**刪掉任何比賽/名單/計分
// 紀錄——歷史比賽事實都還在，斷掉的只是「這是同一個人」這個跨場標記本身。管理頁的刪除確認
// 對話框要把這件事講清楚（見 PeopleManagement.tsx 的 confirm 訊息），這裡的註解是給
// 之後讀這支 hook 的人一個提醒：不要因為看到「刪除」兩個字就以為要做額外的破壞性防護，
// 後端外鍵設計本身已經保證了安全。
export function useDeletePerson() {
  const queryClient = useQueryClient();
  const deletePerson = useDeletePersonMutation();

  return useCallback(
    async (personId: number): Promise<void> => {
      await deletePerson.mutateAsync({ personId });
      queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
    },
    [queryClient, deletePerson],
  );
}

// #224/#221：合併——把 sourceIds 這幾筆併進 targetId，來源會被刪除（後端
// POST /people/:personId/merge 的邏輯見 routes/people.ts）。這是唯一需要同時 invalidate
// 兩個查詢的寫入操作：people 列表少了幾筆（來源被刪）、合併候選組也要重算（原本那組
// 可能因為併完只剩 1 筆而不再是候選、或者名字被改了而換組），兩個快取都會過期。
export function useMergePeople() {
  const queryClient = useQueryClient();
  const mergePeople = useMergePeopleMutation();

  return useCallback(
    async (targetId: number, sourceIds: number[]): Promise<void> => {
      await mergePeople.mutateAsync({ personId: targetId, data: { sourceIds } });
      queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListMergeCandidatesQueryKey() });
    },
    [queryClient, mergePeople],
  );
}
