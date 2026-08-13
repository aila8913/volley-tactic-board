import { describe, it, expect } from "vitest";
import { parseYouTubeVideoId, toYouTubeEmbedUrl } from "./youtube";

// 這支測試釘的是「使用者會貼進來的各種寫法」。每一種形狀都對應一個真實的來源：
// 分享鈕、網址列、直播頁、Shorts、以及貼錯東西的情況。
describe("parseYouTubeVideoId", () => {
  const ID = "dQw4w9WgXcQ";

  it.each([
    ["網址列的 watch 連結", `https://www.youtube.com/watch?v=${ID}`],
    ["帶時間戳的 watch 連結", `https://www.youtube.com/watch?v=${ID}&t=90s`],
    ["時間戳排在 v 前面", `https://www.youtube.com/watch?t=90&v=${ID}`],
    ["分享鈕給的短網址", `https://youtu.be/${ID}`],
    ["短網址帶參數", `https://youtu.be/${ID}?t=42`],
    ["沒有 protocol", `youtu.be/${ID}`],
    ["嵌入網址", `https://www.youtube.com/embed/${ID}`],
    ["直播網址", `https://www.youtube.com/live/${ID}`],
    ["Shorts", `https://www.youtube.com/shorts/${ID}`],
    ["手機版網域", `https://m.youtube.com/watch?v=${ID}`],
    ["前後有空白（從別處複製常見）", `  https://youtu.be/${ID}  `],
    ["直接貼 id 本身", ID],
  ])("認得 %s", (_label, input) => {
    expect(parseYouTubeVideoId(input)).toBe(ID);
  });

  it.each([
    ["空字串", ""],
    ["只有空白", "   "],
    ["不是網址", "這場比賽的影片"],
    ["別的影音平台", "https://vimeo.com/123456789"],
    // 這一條是白名單的重點：網域裡有 youtube 這幾個字，但根本不是 YouTube。
    // 用「網址裡有沒有 youtube」判斷的寫法會在這裡放行。
    ["冒充網域", `https://youtube.com.evil.example/watch?v=${ID}`],
    ["YouTube 首頁（沒有指定影片）", "https://www.youtube.com/"],
    ["頻道頁", "https://www.youtube.com/@somechannel"],
    ["id 長度不對", "https://youtu.be/abc"],
  ])("認不出 %s，回傳 null", (_label, input) => {
    expect(parseYouTubeVideoId(input)).toBeNull();
  });
});

describe("toYouTubeEmbedUrl", () => {
  it("指向 nocookie 網域的 /embed 路徑", () => {
    expect(toYouTubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1",
    );
  });
});
