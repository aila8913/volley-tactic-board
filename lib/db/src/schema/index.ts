// 一場比賽的資料模型，由上到下是巢狀關係：
// Match (比賽) -> Player (球員) / Set (局) -> Rally (一分) -> Event (一球)
// 詳細規格見 docs/db-schema-spec.md。
export * from "./tournaments";
export * from "./matches";
export * from "./players";
export * from "./sets";
export * from "./rallies";
export * from "./events";
export * from "./lineups";
export * from "./substitutions";
export * from "./timeouts";
export * from "./tactics";
// people / teams 是橫跨上面巢狀結構的「身分／分組」概念，不屬於某一場比賽底下，
// 而是被 matches（team）、players（person）指回去引用，所以放在最後單獨列出。
export * from "./people";
export * from "./teams";
// person_merges 是 people 合併功能（#221）的稽核旁支表，不參與上面任何巢狀結構、
// 也不被任何既有查詢 join，純粹記錄「誰併進誰」方便誤併後回頭查——見該檔案頂端註解。
export * from "./personMerges";
