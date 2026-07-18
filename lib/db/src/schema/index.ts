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
