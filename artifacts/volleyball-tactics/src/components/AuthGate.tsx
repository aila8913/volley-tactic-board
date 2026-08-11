import type { ReactNode } from "react";
import { useAuth, useLogout } from "../hooks/useAuth";

// 全站唯一的登入檢查點（#26 PR2）：包在 App.tsx 的 <Router /> 外面，未登入時整個 app
// 都看不到，只看得到這個畫面。刻意不把「有沒有登入」下放到各個頁面自己判斷——那樣
// 五個頁面都要重複一次同樣的檢查，漏寫一個就是一個沒被擋住的頁面。單一檢查點是
// lib/handler.ts 那套「owns 必填」精神的前端版本：讓遺漏變成不可能，而不是靠記得。
//
// 沒有動 NavRail.tsx／AppShell.tsx：這兩個檔案是三欄骨架/導覽軌的單一事實來源，受
// docs/layout-spec.md 嚴格規範（area:design）。登入閘門是跟畫面版面完全正交的關注點，
// 所以做成一個獨立、不侵入既有版面的固定角落小工具，而不是擠進導覽軌裡多一個格子。
export default function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const logout = useLogout();

  // 載入中不要閃一下登入畫面又閃回正常畫面——那個畫面跳動比空白多等幾百毫秒更打擾。
  if (isLoading) return null;

  // 背景用 `app-canvas`（製圖紙）而不是自己寫一個深色值：登入畫面在 AppShell 之外，拿不到
  // APP_SHELL_CLASS 的背景，原本寫死的 `bg-[#0d0f0a]` 是全站第三個「差不多的黑」，登入完
  // 進到主畫面看得出色差（#322）。這裡只借背景層、不套整份 APP_SHELL_CLASS——那還會帶進
  // font-dash，登入畫面要不要換字體屬於視覺決策，不在這張修正票的範圍。
  if (!isAuthenticated) {
    return (
      <div className="app-canvas flex h-screen w-full flex-col items-center justify-center gap-6 text-[#f5f5f0]">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">排球戰術板</h1>
          <p className="text-sm text-[#a9b096]">用 Google 帳號登入，開始記錄你的比賽</p>
        </div>
        {/* 這是一次整頁導覽（瀏覽器直接跳去 Google 的畫面），不是 fetch 呼叫，所以用
            普通的 <a href>，不透過 React Query／api-client-react。見 routes/auth.ts
            對 GET /auth/google 的說明：這支故意沒有寫進 openapi.yaml。 */}
        <a
          href="/api/auth/google"
          className="rounded-lg bg-[#c6f135] px-6 py-3 text-sm font-bold text-[#0d0f0a]
            transition-colors hover:bg-[#d4fc4a]"
        >
          使用 Google 登入
        </a>
      </div>
    );
  }

  return (
    <>
      {children}
      {/* 固定在畫面角落的登入身分＋登出，不佔用任何頁面既有版面。z-40 蓋過 NavRail 展開態
          的 z-30（見 AppShell.tsx / NavRail.tsx），避免被導覽軌浮層蓋住。 */}
      <div
        className="pointer-events-none fixed bottom-3 right-3 z-40 flex items-center gap-2
          rounded-full border border-white/[0.08] bg-[#12140f]/90 px-3 py-1.5 text-xs
          text-[#a9b096] backdrop-blur-sm"
      >
        <span className="max-w-[10rem] truncate pointer-events-none">{user?.name}</span>
        <button
          type="button"
          onClick={logout}
          className="pointer-events-auto font-semibold text-[#f5f5f0]/70 transition-colors hover:text-[#c6f135]"
        >
          登出
        </button>
      </div>
    </>
  );
}
