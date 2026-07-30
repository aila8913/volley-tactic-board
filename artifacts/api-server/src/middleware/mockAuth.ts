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

// 預設使用者：所有既有的 seed 資料、以及正式跑起來的每一個請求都掛在這個 id 底下。
export const MOCK_USER_ID = "mock-user-001";

// 第二個假使用者，只有種子資料會用到（見 lib/db/src/seed-testdata.ts）。
// 存在的唯一理由：ownership 檢查防的是「A 拿得到 B 的資料嗎」，而只有一個使用者的時候
// 這個情境根本擺不出來——「查無此 id」和「這 id 不是你的」兩條路徑會長得一樣，
// 測了也證明不了什麼。要有第二個人，那些檢查才驗得到真的東西（#225／#232）。
export const OTHER_MOCK_USER_ID = "mock-user-002";

// 開發時可以用這個 header 假扮成另一個使用者，手動驗證跨使用者的擁有權檢查。
const MOCK_USER_HEADER = "x-mock-user-id";

export const mockAuth: RequestHandler = (req, _res, next) => {
  // 這個 header 的語意是「我說我是誰，我就是誰」——完全沒有驗證。它在開發機上是測試工具，
  // 一旦在正式環境生效就是徹底的身分冒用漏洞（任何人加一個 header 就能讀別人的全部資料）。
  //
  // 所以這裡用**白名單**判斷：只有 NODE_ENV 剛好等於 "development" 才理會這個 header。
  // 刻意不寫成 `!== "production"`，那是黑名單、預設開啟——而 `pnpm run start`（正式啟動）
  // 根本沒設 NODE_ENV，值是 undefined，黑名單寫法會判定「不是 production」而把後門打開。
  // 白名單寫法在同樣情況下是關閉的：忘記設定時失敗的方向是「少一個測試功能」，
  // 而不是「多一個漏洞」。
  //
  // 順帶一提，這條判斷實測時抓到 dev script 本身是錯的：原本寫
  // `cross-env NODE_ENV=development pnpm run build && pnpm run start`，`&&` 讓 cross-env
  // 只罩住 build 那一半，真正跑起來的 server 反而沒有 NODE_ENV。已改成罩住 start
  // （build 不讀這個變數）。這也順便說明為什麼上面要選白名單：設定漏掉是常態，
  // 差別只在漏掉的時候是安全地失敗、還是安靜地把後門打開。
  const isDev = process.env.NODE_ENV === "development";
  const override = isDev ? req.header(MOCK_USER_HEADER) : undefined;

  req.userId = override || MOCK_USER_ID;
  next();
};
