// YouTube 連結 → 影片 id 的解析（#391，拆自 #21）。
//
// 為什麼要自己解析、不能把使用者貼的網址原封不動塞進 <iframe src>：
// 使用者手上的連結有五六種長相（分享鈕給的 youtu.be 短網址、網址列的 watch?v=、直播的
// /live/、Shorts 的 /shorts/、已經是嵌入用的 /embed/），但 <iframe> 只吃 /embed/<id> 這一種。
// 把 https://www.youtube.com/watch?v=xxx 直接塞進 iframe，YouTube 會用 X-Frame-Options 擋掉，
// 畫面上只會出現一片空白——沒有錯誤訊息、看起來就像「貼了沒反應」。所以「認得各種寫法、
// 一律收斂成同一個 id」這件事是必要的，不是為了漂亮。
//
// 這裡刻意寫成**純函式**（輸入字串、輸出字串或 null，不碰 DOM、不發請求），因為這是整個
// 功能裡唯一有分支、真的可能寫錯的地方——純函式才測得到（見 youtube.test.ts）。

// 已知的 YouTube 網域。用白名單比對而不是「網址裡有沒有 youtube 這幾個字」，理由跟後端
// 的安全閘門同一條：`=== 允許值` 才擋得住，`!== 危險值` 永遠漏。
// 不含 www 前綴的比對交給下面的 hostname 正規化處理。
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);

// 影片 id 的形狀：YouTube 目前一律是 11 個字元的 base64url 字集（英數 + `-` + `_`）。
// 長度寫死 11 是為了讓「/watch 後面接了別的東西」這種情況解析失敗、而不是解析出一個
// 明明不是 id 的字串再讓 iframe 顯示錯誤影片。
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * 從使用者貼進來的任意 YouTube 連結取出影片 id；認不出來就回傳 null。
 *
 * 支援的形狀：
 *   https://www.youtube.com/watch?v=ID（含任何附加參數，例如 &t=90）
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/live/ID
 *   https://www.youtube.com/shorts/ID
 *   ID（使用者直接貼 11 碼 id 本身）
 */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // 先接受「直接貼 id」這條路。放在最前面是因為裸 id 餵給 URL() 一定會丟例外，
  // 讓它先在這裡被認出來，下面就不用為了這一種情況包 try/catch 的例外分支。
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  // URL 解析交給瀏覽器內建的 URL 物件，不自己寫一條巨大的正規表達式：query string 的
  // 跳脫、多個參數的順序、有沒有 www 這些細節，標準解析器早就處理好了，手寫必漏。
  let url: URL;
  try {
    // 使用者常常貼的是沒有 protocol 的 `youtu.be/xxx`——URL() 會直接丟例外，所以先補上。
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  // youtu.be/<id>：整條路徑就是 id。
  if (host === "youtu.be") {
    return normalizeId(url.pathname.slice(1));
  }

  // /watch?v=<id>
  const v = url.searchParams.get("v");
  if (v) return normalizeId(v);

  // /embed/<id>、/live/<id>、/shorts/<id>：路徑的第二段就是 id。
  const [prefix, candidate] = url.pathname.split("/").filter(Boolean);
  if (candidate && (prefix === "embed" || prefix === "live" || prefix === "shorts")) {
    return normalizeId(candidate);
  }

  return null;
}

function normalizeId(raw: string): string | null {
  const id = raw.split("/")[0] ?? "";
  return VIDEO_ID_PATTERN.test(id) ? id : null;
}

/**
 * 影片 id → 可以直接放進 <iframe src> 的嵌入網址。
 *
 * 用 youtube-nocookie.com 這個網域：功能跟 youtube.com 的 /embed 完全一樣，但在使用者按下
 * 播放之前不會種追蹤 cookie。對我們沒有任何損失（這一頁不需要 YouTube 的個人化資料），
 * 對使用者是實質的隱私差別，所以預設選它。
 *
 * enablejsapi=1 現在還沒有人用——這一張票（#391）明講「只做載體、不記任何東西」。留著它是
 * 因為下一張票（M4-2 補填流程）要用 YouTube 的 JS API 讀「現在播到第幾秒」把 rally 錨上去，
 * 而這個參數必須在 iframe 建立的當下就帶著、事後補不上（改 src 會讓播放器整個重載、跳回
 * 影片開頭）。
 */
export function toYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`;
}
