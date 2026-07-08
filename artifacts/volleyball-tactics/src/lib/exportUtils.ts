import { toPng } from "html-to-image";

export async function exportCourtAsPng(elementId: string, fileName: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    const dataUrl = await toPng(el, { backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.download = `${fileName}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error("Failed to export PNG", err);
  }
}

// state 用 unknown 而不是 any：這支函式只把資料丟給 JSON.stringify，不需要知道
// 內部長相。unknown 是「型別安全版的 any」——什麼都能傳進來，但函式裡若想直接
// 取屬性，TS 會強迫先收窄型別；any 則是完全關掉檢查。
export function exportStateAsJson(state: unknown, fileName: string) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const link = document.createElement("a");
  link.setAttribute("href", dataStr);
  link.setAttribute("download", `${fileName}.json`);
  link.click();
}

// 回傳 Promise<unknown>：JSON.parse 的結果本來就無法保證長相（使用者可以選任何檔案），
// 用 unknown 誠實表達「還沒驗證過」，把「當成什麼型別用」的決定推給呼叫端明確處理。
export function importStateFromJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
