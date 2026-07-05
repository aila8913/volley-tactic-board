import { type ErrorRequestHandler } from "express";
import { logger } from "../lib/logger";

// Express 的「錯誤處理中介層」：跟一般 middleware 的差別是它有 4 個參數 (err, req, res, next)。
// Express 靠參數數量來認出這是錯誤處理器，所以就算沒用到 next 也一定要把它列在簽章裡。
// Express 5 會自動接住 async route handler 裡拋出的錯誤（包含 zod 的 .parse() 失敗），
// 轉交給這裡——所以路由裡可以直接 .parse() 不用自己 try/catch，錯誤會冒泡到這。
// 這支要在所有路由「之後」才註冊（見 app.ts），Express 才會把它當成收尾的錯誤處理器。

// 判斷是不是 zod 的驗證錯誤。用「結構」判斷（有 name === "ZodError" 且 issues 是陣列）
// 而不是 err instanceof ZodError——因為 api-zod 跟 api-server 可能各自打包了不同版本的 zod，
// 跨套件的 instanceof 會因為不是同一個 class 物件而失效，結構判斷比較保險。
function isZodError(err: unknown): err is { name: string; issues: unknown[] } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

// Postgres 的錯誤會帶一個 SQLSTATE `code` 字串，用來分辨是哪一類約束違反。
// 常見的幾個：23503 外鍵違反（指到不存在的 parent）、23505 唯一值重複、23502 not-null 違反。
function getPgErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (isZodError(err)) {
    // 驗證失敗是「client 送錯資料」，屬於 400 Bad Request，把 issues 回給前端方便除錯。
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }

  const pgCode = getPgErrorCode(err);
  if (pgCode === "23503") {
    // 外鍵指到不存在的資源（例如 rally 掛到一個不存在的 set），視為 404。
    res.status(404).json({ error: "Referenced resource not found" });
    return;
  }
  if (pgCode === "23505") {
    // 唯一值衝突，視為 409 Conflict。
    res.status(409).json({ error: "Resource already exists" });
    return;
  }

  // 其餘一律當成沒預期到的伺服器錯誤：記 log 方便追，但不要把內部細節回給 client。
  logger.error({ err, path: req.path }, "Unhandled error in request");
  res.status(500).json({ error: "Internal server error" });
};
