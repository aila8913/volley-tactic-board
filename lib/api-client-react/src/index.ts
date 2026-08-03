export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
// ApiError 帶著 HTTP status，呼叫端才有辦法分辨「這次失敗要不要當成失敗」——例如離線佇列
// 重送一筆 DELETE 時遇到 404，代表那列早就刪掉了，對重送來說其實是成功
// （見 volleyball-tactics 的 useScoreSheetController，#64 PR3）。
export { ApiError } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
