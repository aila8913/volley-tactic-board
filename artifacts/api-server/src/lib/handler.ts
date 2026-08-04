import type { Request, Response, RequestHandler } from "express";
import type { ZodType } from "zod";

// 每個路由 handler 原本都要手寫同一段儀式：parse params、parse body、
// 檢查擁有權（不是自己的資料就回 404）、才做真正的業務邏輯。25 個地方各寫一次，
// 漏寫一次就是一個安全漏洞——#225 就是 tactics.ts 的 POST /tactics 漏了擁有權檢查，
// 讓使用者能把戰術掛到別人的 matchId 底下（IDOR，Insecure Direct Object Reference）。
// 這支模組把「parse → 擁有權檢查 → 業務邏輯」三步驟收斂成一個 factory function，
// 讓遺漏擁有權檢查從「人眼容易漏看的重複程式碼」變成「型別系統會擋下來的編譯錯誤」。

// 一個「擁有權檢查」函式：吃 params/body/userId，回傳這筆資源是不是屬於這個使用者。
// 可以是 async（大多數情況要查資料庫）也可以是同步的（例如比對 body 裡的欄位）。
type OwnsCheck<P, B> = (ctx: { params: P; body: B; userId: string }) => boolean | Promise<boolean>;

// OwnsSpec 是 OwnsCheck 多包一層、可以附加 message 的版本。
// 目前 PO 決定 404 訊息一律統一成 "Not found"（不外洩「這個資源到底存不存在」的細節），
// 所以 message 欄位暫時沒被用到——但型別先留著，之後如果要做「除錯用的內部 log 訊息」
// （不會回給 client，只給後端自己看）會用得上，不用再改一次介面。
interface OwnsSpec<P, B> {
  check: OwnsCheck<P, B>;
  message?: string;
}

interface HandlerConfig<P, B> {
  // 路徑參數（req.params）跟 request body 各自的 zod schema。不帶就代表這支路由
  // 不需要驗證那一段（例如 GET /tactics 沒有 body）——parse 會被跳過，型別上 P/B 就是 unknown。
  params?: ZodType<P>;
  body?: ZodType<B>;

  // 這是這支模組真正的設計重點：owns 是「必填」欄位，不是 `owns?:`。
  // 為什麼刻意設計成必填、而不是「預設檢查、想關掉再明講」？
  // 因為「忘記寫」在這兩種設計下的後果完全不同：
  //   - 如果是可選、預設會檢查：忘記寫 = 安全（多包一層，最多是不小心過度保護）。
  //   - 如果是可選、預設「不」檢查：忘記寫 = 悄悄放行任何人存取任何人的資料（就是 #225 那個洞），
  //     而且 TypeScript 不會報錯、code review 也未必看得出少了一行 if。
  // 把 owns 設成必填，代表「這支路由到底要不要驗證擁有權」變成寫程式的人**一定要主動決定**、
  // 而且決定會留在程式碼裡讓 reviewer 看得到的一件事——想公開整個路由，
  // 也得明講 `owns: "public"`，而不是「什麼都沒寫、剛好漏掉」。
  // 支援陣列是因為巢狀資源常常要一路往上驗（例如 player 屬於 match、match 屬於使用者），
  // 陣列裡任何一項沒過，就整體視為「沒有擁有權」，直接回 404。
  owns: "public" | OwnsCheck<P, B> | OwnsSpec<P, B> | Array<OwnsCheck<P, B> | OwnsSpec<P, B>>;
}

export function handler<P = unknown, B = unknown>(
  config: HandlerConfig<P, B>,
  fn: (ctx: {
    req: Request;
    res: Response;
    params: P;
    body: B;
    userId: string;
  }) => Promise<void> | void,
): RequestHandler {
  // 回傳的是一支 Express RequestHandler，直接丟進 router.get/post/put/patch/delete 用。
  //
  // 這裡故意寫成 async function 但**不用 try/catch**：Express 5 開始，只要 route handler
  // 回傳的 promise reject 了（例如 zod 的 .parse() 丟出 ZodError、或資料庫查詢失敗），
  // Express 會自動把那個錯誤轉交給註冊在最後面的錯誤處理中介層（errorHandler.ts）。
  // 這是 Express 5 相對 4 的行為改變——Express 4 不會自動接，得自己包 try/catch 再呼叫
  // next(err)，Express 5 幫我們省了這一步。errorHandler.ts 那邊已經看得懂 ZodError
  // （用結構判斷成 400）跟常見的 Postgres 錯誤碼，所以這裡讓錯誤直接冒泡上去就好。
  return async (req, res) => {
    const params = (config.params ? config.params.parse(req.params) : undefined) as P;
    const body = (config.body ? config.body.parse(req.body) : undefined) as B;
    // req.userId 是 requireAuth middleware 注入的（見 middleware/requireAuth.ts 對 Express.Request
    // 的型別擴充），所有掛了 requireAuth 的路由在這裡都保證有值。
    const userId = req.userId;

    if (config.owns !== "public") {
      // owns 可能是單一 check、單一 spec，或是陣列——統一攤平成陣列，用同一段迴圈處理，
      // 不用為了「單一 vs 陣列」寫兩套邏輯。
      const specs = Array.isArray(config.owns) ? config.owns : [config.owns];
      for (const spec of specs) {
        // OwnsCheck 跟 OwnsSpec 的差別只在有沒有多包一層 { check, message }，
        // 用 typeof 判斷是不是函式來決定要不要拆出 .check。
        const check = typeof spec === "function" ? spec : spec.check;
        if (!(await check({ params, body, userId }))) {
          // PO 拍板：所有擁有權檢查失敗一律回同一句 "Not found"，不分資源類型。
          // 理由跟「404 不用 403」的既有原則一致——回覆內容本身不該洩漏
          // 「這個資源到底存不存在，只是不是你的」，通用訊息比各資源各自的訊息更安全。
          res.status(404).json({ error: "Not found" });
          return;
        }
      }
    }

    await fn({ req, res, params, body, userId });
  };
}
