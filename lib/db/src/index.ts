import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
// #336 PR2：demoData.ts 的 seedDemoData／DbOrTx 需要讓 api-server 的 /demo-data 路由
// 也能 import 到（不只是同套件內的 seed-testdata.ts）。之前只有 seedDemoData 用相對路徑
// `from "./demoData"` 匯入，是因為那時唯一的消費者就在同一個套件裡；現在多了跨套件的
// 消費者，得從這支「對外的」入口檔案（package.json 的 "." export）一併匯出。
export * from "./demoData";
