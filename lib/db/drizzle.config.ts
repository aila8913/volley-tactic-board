import { defineConfig } from "drizzle-kit";
import path from "path";
import { config } from "dotenv";

// drizzle-kit は .env を自動で読まないので明示的にロード。
// .env は workspace root（このファイルから2階層上）にある。
config({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // drizzle-kit 把這個路徑當 glob pattern 處理，而 glob 語法裡反斜線是跳脫字元——
  // Windows 上 path.join 產生的是反斜線路徑，會讓 glob 比對失敗（即使檔案真的存在），
  // 所以這裡手動轉成正斜線，跨平台都能正確比對。
  schema: path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
