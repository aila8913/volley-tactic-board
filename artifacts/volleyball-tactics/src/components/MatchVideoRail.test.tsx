import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import MatchVideoRail from "./MatchVideoRail";

// 這支測的是 #391 那條使用者路徑上、真的有分支的兩件事：
//   1. 貼進來的東西認不出是 YouTube 連結時，**不會**打後端（而不是送出去讓後端存一條
//      永遠播不出來的網址）。
//   2. 已經掛好影片時，右欄長出的是指向 /embed 的 iframe（不是把原網址直接塞進去——那樣
//      會被 YouTube 用 X-Frame-Options 擋成一片空白，見 lib/youtube.ts）。
//
// useMatchVideos 整支 mock 掉：這裡要驗的是元件的判斷，不是 React Query 的行為，讓真的
// fetch 進來只會把測試變慢又變脆。
const attachVideo = vi.fn();
const detachVideo = vi.fn();
let mockVideo: { id: string; matchId: number; url: string; sequence: number } | null = null;

vi.mock("@/hooks/useMatchVideos", () => ({
  useMatchVideos: () => ({
    video: mockVideo,
    videos: mockVideo ? [mockVideo] : [],
    isLoading: false,
    isError: false,
    attachVideo,
    detachVideo,
    isSaving: false,
  }),
}));

// youtubePlayer 也 mock 掉：真的那支會往 document.head 塞 YouTube 的 <script>，jsdom 不會
// 執行它，promise 永遠不 resolve——那對「有沒有在正確的時機呼叫 createPlayer」這件事完全
// 測不到。mock 成一個 spy 之後，時序本身就變成可以斷言的東西。
const createPlayer = vi.fn(() => new Promise<never>(() => {}));
vi.mock("@/lib/youtubePlayer", () => ({
  createPlayer: (...args: unknown[]) => createPlayer(...(args as [])),
}));

beforeEach(() => {
  attachVideo.mockClear();
  detachVideo.mockClear();
  createPlayer.mockClear();
  mockVideo = null;
});

describe("MatchVideoRail", () => {
  it("認不出的連結不會送出，並顯示錯誤訊息", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MatchVideoRail matchId={1} />);

    await user.type(screen.getByPlaceholderText(/youtu\.be/), "https://vimeo.com/123456789");
    await user.click(screen.getByRole("button", { name: "掛上影片" }));

    expect(attachVideo).not.toHaveBeenCalled();
    expect(screen.getByText(/認不出這條 YouTube 連結/)).toBeTruthy();
  });

  it("認得出的連結會原封不動送給後端（不是送解析後的 id）", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MatchVideoRail matchId={1} />);

    await user.type(
      screen.getByPlaceholderText(/youtu\.be/),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90",
    );
    await user.click(screen.getByRole("button", { name: "掛上影片" }));

    expect(attachVideo).toHaveBeenCalledWith("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
  });

  it("已掛影片時渲染指向 /embed 的播放器", () => {
    mockVideo = {
      id: "v1",
      matchId: 1,
      url: "https://youtu.be/dQw4w9WgXcQ?t=42",
      sequence: 1,
    };
    const { container } = renderWithProviders(<MatchVideoRail matchId={1} />);

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toContain("/embed/dQw4w9WgXcQ");
  });

  // ── 迴歸測試：iframe 載完之前不准接 JS API ──
  // PO 回報「按播放轉一下就沒反應」的那個 bug（#393 帶進來的）：effect 在 React commit 後
  // 同步執行，那時 iframe 裡還是空的 about:blank（origin 繼承父頁），對它 postMessage 會被
  // 瀏覽器擋下、交握失敗，而 enablejsapi=1 的播放器會一直等那個交握 → 按播放永遠轉圈。
  // 這條測試釘的就是時序本身：load 之前不呼叫 createPlayer，load 之後才呼叫。
  it("iframe 載完（load）之後才建立 YT 播放器", () => {
    mockVideo = { id: "v1", matchId: 1, url: "https://youtu.be/dQw4w9WgXcQ", sequence: 1 };
    const { container } = renderWithProviders(<MatchVideoRail matchId={1} />);

    expect(createPlayer).not.toHaveBeenCalled();

    const iframe = container.querySelector("iframe")!;
    act(() => {
      fireEvent.load(iframe);
    });

    expect(createPlayer).toHaveBeenCalledTimes(1);
    expect(createPlayer).toHaveBeenCalledWith(iframe);
  });

  it("嵌入網址帶著 origin（JS API 交握用）", () => {
    mockVideo = { id: "v1", matchId: 1, url: "https://youtu.be/dQw4w9WgXcQ", sequence: 1 };
    const { container } = renderWithProviders(<MatchVideoRail matchId={1} />);

    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("&origin=");
  });
});
