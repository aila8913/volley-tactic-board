import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

beforeEach(() => {
  attachVideo.mockClear();
  detachVideo.mockClear();
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
});
