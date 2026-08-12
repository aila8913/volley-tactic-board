import { useState } from "react";
import { useMatchVideos } from "@/hooks/useMatchVideos";
import { parseYouTubeVideoId, toYouTubeEmbedUrl } from "@/lib/youtube";

// 進階模式下右欄翻過來那一面：這場比賽的影片（#391，拆自 #21）。
//
// 這一張票的範圍就是「載體」——把影片掛上去、播得出來、重整還在。**這裡不記任何東西**：
// 沒有「把這一球錨到現在的秒數」那類按鈕，那是 M4-2a／2b 的事。刻意講明是因為看到播放器
// 的第一反應通常是「順便做個標記鈕」，而那條路要先有補填流程的資料模型（ADR-0010）才走得動。
//
// 為什麼影片放右欄、不是蓋在球場上：右欄本來就是「這一頁的第二視角」（站位／統計），
// 影片是賽後補填時的第二視角，位置語意一致；蓋在球場上則會擋住主要操作區。

const INPUT_CLASS =
  "w-full rounded-lg border border-white/[0.16] bg-black/30 px-3 py-2 text-sm " +
  "text-[#f5f5f0] placeholder:text-[#6d7361] focus:border-[#c6f135] focus:outline-none " +
  "disabled:opacity-40";

const PRIMARY_SM_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-[#c6f135] px-4 py-1.5 text-xs " +
  "font-bold text-[#0a0b07] transition hover:brightness-110 disabled:pointer-events-none " +
  "disabled:opacity-40";

const GHOST_SM_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold " +
  "text-[#a9b096] transition hover:text-[#c6f135] disabled:pointer-events-none disabled:opacity-30";

type Props = {
  // 路由參數還沒到手時是 null——hook 會據此關掉查詢（見 useMatchVideos）。
  matchId: number | null;
};

export default function MatchVideoRail({ matchId }: Props) {
  const { video, isLoading, attachVideo, detachVideo, isSaving } = useMatchVideos(matchId);
  // 輸入框的內容是純 UI 暫存（還沒送出的草稿），不進 store 也不進後端——送出成功後
  // 真相就是後端回來的那一列，草稿清空。
  const [draftUrl, setDraftUrl] = useState("");
  // 「認不出這條網址」的提示。用自己的 state 而不是 <input type="url"> 的原生驗證：
  // 原生驗證只看「是不是一條合法網址」，vimeo 的連結一樣會過關，但我們要的是
  // 「是不是一條**認得出影片 id 的 YouTube** 連結」。
  const [error, setError] = useState<string | null>(null);

  const videoId = video ? parseYouTubeVideoId(video.url) : null;

  const handleAttach = async () => {
    const parsed = parseYouTubeVideoId(draftUrl);
    if (!parsed) {
      setError("認不出這條 YouTube 連結，請貼影片頁的網址或分享短網址。");
      return;
    }
    setError(null);
    // 存的是**使用者貼的原始網址**，不是解析後的 id：原始網址帶著使用者的上下文
    //（哪個時間點、哪個播放清單），而 id 隨時能從它再解析一次。反過來（只存 id）就把
    // 那些資訊永久丟掉了。播放時才轉成 /embed 網址（見 toYouTubeEmbedUrl）。
    await attachVideo(draftUrl.trim());
    setDraftUrl("");
  };

  const handleDetach = async () => {
    if (!video) return;
    setError(null);
    await detachVideo(video.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.10] px-3 py-2 text-xs font-bold text-[#9AA08C]">
        <span>比賽影片</span>
        {video && (
          <button className={GHOST_SM_BUTTON_CLASS} disabled={isSaving} onClick={handleDetach}>
            換一支
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {isLoading ? (
          <p className="text-xs text-[#a9b096]">載入影片中…</p>
        ) : videoId ? (
          <>
            {/* aspect-video（16:9）讓播放器高度由寬度決定，不用寫死 px——右欄寬度之後若
              調整（AppShell 的 ASIDE_WIDTH，環 3 就打算改），這裡自動跟著對。 */}
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/[0.12] bg-black">
              <iframe
                // key 綁 videoId：換影片時強制重建 iframe。不換 key 的話 React 會沿用同一個
                // iframe 節點、只改 src，某些瀏覽器會把它記進上一頁的歷史，使用者按上一頁
                // 會變成「播放器退回上一支影片」而不是離開這一頁。
                key={videoId}
                src={toYouTubeEmbedUrl(videoId)}
                title="比賽影片"
                className="h-full w-full"
                // allowFullScreen：不寫的話 YouTube 播放器的全螢幕鈕會是灰的。看球需要放大。
                allowFullScreen
                // referrerPolicy：只送網域不送完整路徑，別把「使用者正在看哪一場比賽」
                // 這種路徑資訊送給 YouTube。
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <p className="break-all text-micro leading-relaxed text-[#6d7361]">{video?.url}</p>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-[#a9b096]">
              貼上這場比賽的 YouTube 連結，之後就能對著影片補填。
            </p>
            <input
              className={INPUT_CLASS}
              value={draftUrl}
              disabled={isSaving}
              placeholder="https://youtu.be/…"
              onChange={(e) => {
                setDraftUrl(e.target.value);
                // 一開始打字就把上一次的錯誤訊息收掉——錯誤是「上一次送出的結果」，
                // 使用者已經在改了，留著只會讓人以為現在打的這條也錯了。
                if (error) setError(null);
              }}
              // Enter 直接送出：這個輸入框只有一個欄位，多按一次 Tab 才碰得到按鈕很不順手。
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAttach();
              }}
            />
            {error && <p className="text-xs text-[#F0776C]">{error}</p>}
            <div className="flex justify-end">
              <button
                className={PRIMARY_SM_BUTTON_CLASS}
                disabled={isSaving || draftUrl.trim() === ""}
                onClick={() => void handleAttach()}
              >
                {isSaving ? "掛上中…" : "掛上影片"}
              </button>
            </div>
            {/* 這一輪只支援一段（#391 明文範圍）。表跟 API 從一開始就是「一場多段」，
              所以之後補多段管理不會有資料要搬——講出來是為了讓使用者知道現在的限制是
              刻意的，不是壞掉。 */}
            <p className="mt-1 text-micro leading-relaxed text-[#6d7361]">
              目前一場只掛一段影片；分段錄影的多段管理之後再開。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
