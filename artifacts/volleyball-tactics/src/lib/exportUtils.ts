import { toBlob, toPng } from "html-to-image";

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

export function exportStateAsJson(state: any, fileName: string) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const link = document.createElement("a");
  link.setAttribute("href", dataStr);
  link.setAttribute("download", `${fileName}.json`);
  link.click();
}

export function importStateFromJson(file: File): Promise<any> {
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
