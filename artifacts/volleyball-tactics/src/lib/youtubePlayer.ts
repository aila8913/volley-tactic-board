// YouTube IFrame Player API 的薄包裝（#393，實作 ADR-0010 決定 5：影片秒數自動擷取）。
//
// ── 為什麼要用官方的 IFrame API，不是自己監聽 postMessage 的 infoDelivery ──
// YouTube 的嵌入播放器背地裡是用 postMessage 跟父頁溝通的，理論上可以自己在 window 上
// 監聽 message 事件、解析它送出來的 infoDelivery 訊息去挖目前播放秒數。但那個訊息格式
// **沒有公開文件**、YouTube 隨時可能改版而不通知，而且更關鍵的是：暫停時它不一定持續
// 推送 infoDelivery（省流量的合理設計，但正好是我們最需要的那個狀態）。補填時使用者
// 多半正把影片停在那一分上——這個功能要的就是「暫停狀態下也讀得到目前播到第幾秒」，
// 官方 API 的 `player.getCurrentTime()` 不管播放器是播放中還是暫停都能直接查詢，不用等
// 下一次事件推送，這正是這裡選它而不是自己解析 postMessage 的理由。
//
// ── 為什麼 enablejsapi=1 要在 iframe 建立當下就帶（不能事後補）──
// 見 lib/youtube.ts 的 toYouTubeEmbedUrl 註解：#391 已經把這個參數放進 embed URL 了。
// 若要事後才加（例如改 iframe.src），YouTube 的播放器會整個重新載入、畫面跳回影片開頭
// ——對正在補填的使用者來說等於把他們手動找到的那個時間點沖掉。所以 enablejsapi=1
// 從一開始（#391）就已經帶著，這個檔案只是接上「拿到已經支援 JS API 的 iframe 之後
// 怎麼跟它對話」這一步。
//
// ── 為什麼安全性在 jsdom（測試環境）下要顧到 ──
// vitest 用 jsdom 跑元件測試，jsdom 不會真的載入外部 <script>，所以 loadYouTubeIframeApi()
// 注入的 <script src="https://www.youtube.com/iframe_api"> 永遠不會觸發 onload、也永遠不會
// 有人呼叫 window.onYouTubeIframeAPIReady。這支模組必須在那種情況下也不拋例外——呼叫端
// （MatchVideoRail.tsx）要能安全地拿到一個「一直沒 resolve」的 promise，測試才不會掛掉，
// 而不是需要每個用到它的元件測試各自 mock 這個模組。

// ── 這裡用的 YT 型別只包我們實際用到的那一小塊 ──
// 完整的 @types/youtube 有上百行、涵蓋整套播放器事件系統，但這裡只需要建構子跟
// getCurrentTime 兩樣東西。pnpm-workspace.yaml 有 minimumReleaseAge 供應鏈防護，
// 為了十幾行的型別去多裝一個套件不划算，所以自己宣告一個最小型別就好。
interface YTPlayerInstance {
  getCurrentTime: () => number;
  // seekTo 的第二個參數 allowSeekAhead：true 讓播放器在目標秒數還沒被瀏覽器緩衝時，
  // 直接跟 YouTube 的伺服器要那一段（等於重新起播那一段），而不是傻傻地卡在最近一個
  // 已緩衝的關鍵影格。#394 這裡要跳的是使用者在表格上點的任意一分，通常都在目前緩衝
  // 範圍之外，所以固定傳 true——傳 false 只適合「使用者正在拖曳同一段進度條」那種
  // 目標多半已經緩衝好的情境，不是這裡的用法。
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
}

interface YTPlayerConstructorOptions {
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
  };
}

// window 上會被 YouTube 的 iframe_api script 塞進來的兩個全域：YT 命名空間本身，
// 以及腳本載入完成時它會呼叫的回呼函式（如果我們有先定義好的話）。
declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLIFrameElement, options: YTPlayerConstructorOptions) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

// module 頂層的 singleton promise：整個 app 只需要注入一次這支 <script>，重複注入不會有
// 額外好處，只會多一次沒必要的網路請求。用 lazy init（第一次呼叫才建立）而不是模組載入
// 時就建立，是因為這個模組可能被 import 進 SSR 或測試環境，那些地方不見得需要真的載入。
let apiReadyPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve) => {
    // 已經載入過（例如頁面上同時有別的地方也用了 YouTube 播放器）：YT.Player 已經存在，
    // 不用再注入一次 script、也不用等 onYouTubeIframeAPIReady 被呼叫（它可能已經被消耗掉了）。
    if (window.YT?.Player) {
      resolve();
      return;
    }

    // 這個全域回呼是 YouTube 自己的合約：script 載入完成後，它會呼叫
    // window.onYouTubeIframeAPIReady（如果存在的話）。這裡「串接」既有的回呼而不是直接
    // 覆寫，是因為如果頁面上還有其他程式碼也在等這個腳本就緒、且比我們先掛上了自己的
    // callback，直接覆寫會讓那份程式碼永遠等不到通知——串接（chain）才不會互相蓋掉。
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    const script = document.createElement("script");
    script.src = IFRAME_API_SRC;
    // jsdom 環境下這個 script 標籤會被加進 DOM，但 jsdom 不會真的發網路請求去執行它
    // ——onYouTubeIframeAPIReady 永遠不會被呼叫，這個 promise 就永遠不 resolve。這是
    // 刻意接受的行為（見檔頭說明）：呼叫端要能容忍這個 promise 掛著不動。
    document.head.appendChild(script);
  });

  return apiReadyPromise;
}

// 呼叫端只需要這兩件事：讀目前秒數、卸載時清掉播放器。不暴露完整的 YT.Player 實例，
// 避免呼叫端（MatchVideoRail.tsx）多知道播放器控制的其他能力，之後這裡想換一套實作
// （例如 Vimeo）也不用動呼叫端的型別。
export interface YouTubePlayerHandle {
  getCurrentSeconds: () => number | null;
  // #394：表格點一列要能把播放器「推」到那一秒，跟 getCurrentSeconds（讀）方向相反。
  // 同樣包一層 try/catch 吞掉例外——理由跟 getCurrentSeconds 一樣，這是一個「錦上添花」
  // 的輔助功能（跳到那一秒方便使用者核對），不該讓呼叫端因為播放器剛好在奇怪的狀態
  // （例如正在切換影片）而整個炸掉。呼叫端不需要知道有沒有成功，seek 不到就當作沒點。
  seekTo: (seconds: number) => void;
  destroy: () => void;
}

// 在已經存在（且帶著 enablejsapi=1）的 <iframe> 上建立一個可以查詢的 YT.Player。
// 回傳的 promise 只有在 API 腳本真的載入完成、onReady 觸發之後才 resolve——jsdom 底下
// 這個 promise 永遠不會 resolve（見 loadYouTubeIframeApi 的說明），呼叫端不能假設它一定會。
export function createPlayer(iframe: HTMLIFrameElement): Promise<YouTubePlayerHandle> {
  return loadYouTubeIframeApi().then(
    () =>
      new Promise<YouTubePlayerHandle>((resolve) => {
        const YT = window.YT;
        if (!YT) {
          // 理論上 loadYouTubeIframeApi 已經 resolve 就代表 YT 就位了，這裡只是防呆
          // （不讓後面的 `new YT.Player` 在型別上還要處理 undefined）。
          return;
        }
        new YT.Player(iframe, {
          events: {
            onReady: ({ target }) => {
              resolve({
                getCurrentSeconds: () => {
                  // getCurrentTime 在少數情境下可能丟例外（例如播放器剛被 destroy、
                  // 或使用者正在切換影片的瞬間）——這是一個「讀秒數」的輔助功能，讀不到
                  // 就回 null、讓呼叫端把這一分的錨點留白，不該讓整個補填流程被這裡炸掉。
                  try {
                    return Math.floor(target.getCurrentTime());
                  } catch {
                    return null;
                  }
                },
                seekTo: (seconds) => {
                  try {
                    // allowSeekAhead: true，理由見上面 YTPlayerInstance.seekTo 的註解。
                    target.seekTo(seconds, true);
                  } catch {
                    // 讀不到秒數會回 null 讓呼叫端自己決定要不要跳過；seek 是「做了就好」
                    // 的動作，沒有回傳值可以吞，失敗就單純沒反應。
                  }
                },
                destroy: () => target.destroy(),
              });
            },
          },
        });
      }),
  );
}
