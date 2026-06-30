import { RequestHandler } from "express";

// 在 Express 的 Request 型別上擴充 userId 欄位。
// 之後換成真正的 JWT/session middleware 時，只需替換這個檔案，路由端不用改。
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export const mockAuth: RequestHandler = (req, _res, next) => {
  req.userId = "mock-user-001";
  next();
};
