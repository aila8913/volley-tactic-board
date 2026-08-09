// 把 .env 讀進 process.env。這支檔案只有副作用、不匯出任何東西，存在的唯一理由是
// **執行順序**。
//
// 為什麼不能直接寫在 seed-testdata.ts 裡：ES module 的 `import` 宣告會被「提升」
// （hoisting）——整個檔案裡所有 import 指到的模組，都會在該檔案的任何一行頂層程式碼
// 執行之前就先被載入並執行完。所以底下這種寫法是壞的：
//
//     loadDotenv({ path: ... });              // ← 看起來在前面，其實最後才跑
//     import { db } from "./index";           // ← 實際上先跑，而它一載入就檢查
//                                             //   DATABASE_URL，這時還沒被讀進來 → throw
//
// 「先設定、再使用」在同步的程序式語言裡是理所當然的，但 ESM 的 import 不照書寫順序，
// 這是很容易踩的坑，而且症狀（"DATABASE_URL must be set"）看起來完全像是 .env 沒設好，
// 會往錯的方向查。
//
// 解法是把「讀 .env」本身也變成一個 import：ESM 保證**同一個檔案裡的 import 依書寫
// 順序執行**，所以只要在 seed 腳本第一行 `import "./loadEnv"`，它就一定會在
// `import { db } from "./index"` 之前跑完。
//
// 另外，路徑不能靠 process.cwd()：這支腳本有兩種呼叫方式，`pnpm run db:reset`
// 的 cwd 是 repo 根目錄，但 `pnpm --filter @workspace/db run seed` 的 cwd 是 lib/db
// （那裡沒有 .env）。所以改用這個檔案自己的位置（import.meta.url）往上推算根目錄。
import path from "path";
import { fileURLToPath } from "url";
import { config as loadDotenv } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url)); // lib/db/src
loadDotenv({ path: path.resolve(here, "../../../.env") }); // → repo 根目錄的 .env
