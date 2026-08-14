// 登入狀態存取層（#26 PR2）。跟 useMatches.ts 同一套風格：底層是 generated React Query
// hook，這裡把「有沒有登入」這個問題包成一個好用的形狀給元件消費。
//
// GET /api/auth/me 沒登入時回 401——這是刻意的 API 設計（見 openapi.yaml 該端點的說明），
// 但也代表 React Query 預設行為在這裡是錯的：預設收到錯誤會自動重試 3 次，每次間隔遞增，
// 「還沒登入」在使用者看畫面的這幾秒內會被誤判成「網路一時失靈」，白白多等好幾秒才顯示
// 登入畫面。所以下面把 retry 關掉，401 一次就定案。
import {
  useGetCurrentUser,
  useLogout as useLogoutMutation,
  getGetCurrentUserQueryKey,
  ApiError,
} from "@workspace/api-client-react";

export function useAuth() {
  // queryKey 必填是這批 generated hook 的既有規則：跟 hook 內部預設值一模一樣的鍵，用
  // 對應的 getXxxQueryKey 產生（#372：這裡原本指向 NavRail.tsx 一個帶 `enabled` 條件、
  // 所以要手動補 queryKey 的例子，那段訂閱已經隨子清單機制一起刪除，見 hooks/useMatches.ts
  // 開頭同一種寫法的完整說明）。
  const { data, isLoading, isError, error } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });

  // 401（未登入）跟其他錯誤（例如伺服器掛了）要分開看待：前者該顯示「請登入」，
  // 後者顯示「請登入」反而會誤導使用者去點一個治不了根本問題的按鈕。
  // 目前先不特別區分兩者的畫面（AuthGate 兩種都顯示登入畫面），但把判斷式留在這裡，
  // 之後要加「伺服器目前連不上」這種區分畫面時，判斷邏輯已經在手邊。
  const isUnauthenticated = isError && error instanceof ApiError && error.status === 401;

  return {
    user: data,
    isLoading,
    isAuthenticated: data !== undefined,
    isUnauthenticated,
  };
}

export function useLogout() {
  const mutation = useLogoutMutation();
  return () => {
    // 登出不用等 mutation 的 onSuccess 才導頁：清掉 cookie 的請求送出去之後，
    // 直接整頁重新載入最省事——順便讓 React Query 快取（裡面全是剛剛那個帳號的資料）
    // 整批作廢，不用手動一個個 invalidateQueries，登出後本來就該是一片乾淨的狀態。
    mutation.mutate(undefined, {
      onSettled: () => {
        window.location.href = "/";
      },
    });
  };
}
