// 戰術板拖放用的自訂 MIME 型別集中放這裡。
//
// 這其實不是真的網路媒體類型（"application/x-volley-..." 不會拿去給任何伺服器解析），只是
// 借用瀏覽器原生 drag-and-drop 的 `DataTransfer.setData(type, value)` API——它本來就是設計
// 給「一次拖曳可以夾帶好幾種格式，接收端自己挑看得懂的那個」用的（例如同一次拖曳，網頁想要
// 純文字、瀏覽器想要 URL），這裡借同一套機制傳「這次拖曳的角色代碼是什麼」，字串只要跟
// onDragStart／onDrop 兩邊對得上就行，內容本身沒有標準規範，只是照 MIME type 的命名習慣
// 取一個不會跟瀏覽器內建類型（text/plain、text/uri-list…）撞名的字串。
//
// 這個 repo 已有一個類似的先例——RotationRailPanel.tsx 的 `DND_SOURCE_ZONE`，但那顆常數
// 直接定義在該檔案內部，因為只有 RotationRailPanel 自己的 onDragStart／Court.tsx 的 onDrop
// 兩邊在用，且 Court.tsx 本來就已經 import RotationRailPanel 附近的邏輯不深。這裡改放進獨立
// 的小檔案，是因為 DND_ANON_ROLE 的讀寫端是兩個互不隸屬、也不該互相依賴的元件：
// PositionPalette.tsx（onDragStart 寫入）跟 Court.tsx（onDrop 讀出）。如果讓其中一個 import
// 另一個只為了拿這串常數，就會產生「元件為了一個字串常數而依賴另一個元件」的不必要耦合
// ——尤其 Court.tsx 已經是這個 app 數一數二肥的檔案，不該再多背一個跟它自身職責無關的
// import。抽成一個誰都能 import、自己不 import 任何元件的葉節點模組，兩邊各自 import 它，
// 不會有循環依賴，未來如果還有第三個地方要讀寫同一種拖曳協定，也有現成的地方可以加。
export const DND_ANON_ROLE = "application/x-volley-anon-role";
