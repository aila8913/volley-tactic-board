import { useEffect, useRef, useState } from "react";
import { useMatchVideos } from "@/hooks/useMatchVideos";
import { parseYouTubeVideoId, toYouTubeEmbedUrl } from "@/lib/youtube";
import { createPlayer, type YouTubePlayerHandle } from "@/lib/youtubePlayer";

// 進階模式下右欄翻過來那一面：這場比賽的影片（#391，拆自 #21；#393 加上讀秒數）。
//
// #391 的範圍是「載體」——把影片掛上去、播得出來、重整還在。**這裡仍然不記任何東西**：
// 沒有「把這一球錨到現在的秒數」那類按鈕，那個決定（哪一球該用哪一秒）住在球場那邊的
// 手勢裡（AdvancedRecordingCourt.tsx／useAdvancedRecording.ts）。這個元件唯一多做的事
// 是透過 onPlayerReady 往上**曝露**「現在播到第幾秒」這個讀取函式，讓 #393 的呼叫端
// （ScoreSheet.tsx）在使用者做手勢的當下去問；記錄本身、要不要記、記在哪一分，全部不是
// 這個檔案的責任。
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
  // 播放器就緒（或不再就緒）時通知呼叫端（#393）。傳進來的 read 函式回傳「現在播到第幾秒」；
  // 沒有影片、或播放器還沒建好時傳 null，呼叫端要能容忍讀不到。這個 prop 選填，因為不是
  // 每個用到 MatchVideoRail 的地方都需要讀秒數（目前只有計分頁的補填流程需要）。
  onPlayerReady?: (read: (() => { videoId: string; seconds: number } | null) | null) => void;
};

export default function MatchVideoRail({ matchId, onPlayerReady }: Props) {
  const { video, isLoading, attachVideo, detachVideo, isSaving } = useMatchVideos(matchId);
  // 輸入框的內容是純 UI 暫存（還沒送出的草稿），不進 store 也不進後端——送出成功後
  // 真相就是後端回來的那一列，草稿清空。
  const [draftUrl, setDraftUrl] = useState("");
  // 「認不出這條網址」的提示。用自己的 state 而不是 <input type="url"> 的原生驗證：
  // 原生驗證只看「是不是一條合法網址」，vimeo 的連結一樣會過關，但我們要的是
  // 「是不是一條**認得出影片 id 的 YouTube** 連結」。
  const [error, setError] = useState<string | null>(null);

  const videoId = video ? parseYouTubeVideoId(video.url) : null;

  // ── 播放器控制代碼（#393）──
  // iframe 節點本身要有 ref 才能餵給 createPlayer（YT.Player 建構子要吃真的 DOM 節點）。
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 這個 effect 綁的 key 是 videoId（YouTube 11 碼 id，不是 MatchVideo row 的 uuid）——
  // 跟下面 <iframe key={videoId}> 用同一個值是刻意的：videoId 換了代表 iframe 整個被 React
  // 換掉重建（見下面 JSX 的註解），舊的 YT.Player 實例已經綁在一個消失的 DOM 節點上，
  // 這裡也要跟著重新對一個新節點建一個新的 player，不能沿用舊的。
  useEffect(() => {
    if (!videoId || !iframeRef.current) {
      // 沒有影片可播：通知呼叫端「現在讀不到秒數」，不留著上一支影片的 reader。
      onPlayerReady?.(null);
      return;
    }

    let cancelled = false;
    let handle: YouTubePlayerHandle | null = null;
    // matchVideoRowId 在 effect 開始時就先讀出來存進閉包，而不是在 reader 裡才讀
    // `video?.id`——effect 觸發之後、reader 真正被呼叫之前，video 這個 prop 有可能已經
    // 換過幾輪（例如使用者手速很快、連續換了兩次影片），reader 若晚讀 video.id 就可能
    // 回報一個跟目前這個 player 實例對不上的 MatchVideo id。這裡讀的是 effect 這一輪
    // 綁定當下的值，天然對齊「這個 player 到底是哪一支影片的」。
    const matchVideoRowId = video?.id;
    createPlayer(iframeRef.current).then((created) => {
      if (cancelled || !matchVideoRowId) {
        // effect 已經被清掉（例如使用者又換了一次影片）：player 建好了但已經來不及用，
        // 直接銷毀，不要餵給呼叫端一個過期的 reader。
        created.destroy();
        return;
      }
      handle = created;
      onPlayerReady?.(() => {
        // ⚠️ 這裡回傳的 videoId 是 MatchVideo 這一列的 uuid（rallies.videoId 的 FK 目標），
        // **不是**上面 effect 依賴的那個 YouTube 11 碼 videoId——兩者名字很容易搞混但
        // 指向完全不同的東西：一個是「YouTube 認得的影片」，一個是「我們資料庫裡代表
        // 「這場比賽掛了這支影片」這件事的那一列」。錨點要存進 rallies.videoId，FK
        // 指向的是後者，用錯會直接是外鍵違反。
        const seconds = handle?.getCurrentSeconds();
        return seconds != null ? { videoId: matchVideoRowId, seconds } : null;
      });
    });

    return () => {
      cancelled = true;
      handle?.destroy();
      onPlayerReady?.(null);
    };
    // video?.id 沒放進依賴：換了同一支影片的 url 大小寫或查詢參數不會改變 videoId
    // （解析出來的 YouTube id 相同），這種情況不需要重建 player；真正該觸發重建的只有
    // videoId 變了（換了一支不同的影片）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

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
                // 會變成「播放器退回上一支影片」而不是離開這一頁。這同時也是為什麼上面
                // createPlayer 的 effect 依賴要跟這裡用同一個 key：iframe 重建時舊的
                // YT.Player 實例已經沒有意義了（綁在一個已經被換掉的 DOM 節點上）。
                key={videoId}
                ref={iframeRef}
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
