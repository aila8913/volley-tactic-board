// 「人」（Person＝跨比賽的真實身分）的資料存取層，跟 useTeams.ts 是同一套「API adapter」模式：
// 底層用 @workspace/api-client-react 生成的 React Query hooks 打後端，對外給元件一個乾淨的
// 讀（usePersonList）＋寫（useCreatePerson）介面。
//
// 用途（#213）：名單去重 UX——同一個人打了好幾場比賽，我們想在球員名單裡認出「這其實是同一個
// 人」，讓 players.personId 指到同一個 person，之後跨場統計（視圖③）才能把數據正確地加總在
// 一起。跟 useTeams 一樣，目前只需要「列出」＋「新增」：改名／刪除的管理 UI 這一輪還沒做。
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPeople,
  useCreatePerson as useCreatePersonMutation,
  getListPeopleQueryKey,
} from "@workspace/api-client-react";
import type { Person } from "@workspace/api-client-react";

// ── 讀取 ──
// 後端回傳的 Person（id/name）結構單純，不需要 mapping 層，直接當 domain 型別用。
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
  const people: Person[] = Array.isArray(data) ? data : [];
  return { people, isLoading, isError };
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
