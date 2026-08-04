import { describe, it, expect } from "vitest";
import { normalizePersonName, groupMergeCandidates } from "./personName";

describe("normalizePersonName", () => {
  it("去掉頭尾空白", () => {
    expect(normalizePersonName("  王小明  ")).toBe("王小明");
  });

  it("轉小寫（英文暱稱）", () => {
    expect(normalizePersonName("Amy")).toBe("amy");
    expect(normalizePersonName("AMY")).toBe("amy");
  });

  it("NFKC 把全形字元轉半形", () => {
    // "Ａｍｙ" 是全形英文字母，NFKC 正規化後應該等同半形 "Amy" 再轉小寫。
    expect(normalizePersonName("Ａｍｙ")).toBe("amy");
  });

  it("內部空白（含全形空白）整個拿掉", () => {
    expect(normalizePersonName("王　小明")).toBe("王小明"); // 全形空白
    expect(normalizePersonName("王    小明")).toBe("王小明"); // 連續半形空白
  });

  it("同一個人不同寫法應該正規化成同一個 key", () => {
    const a = normalizePersonName("  Ａｍｙ  ");
    const b = normalizePersonName("amy");
    expect(a).toBe(b);
  });

  it("英文姓名的空白也一併拿掉（刻意放寬，只是多列一組候選給人確認）", () => {
    expect(normalizePersonName("Amy Chen")).toBe(normalizePersonName("AmyChen"));
  });
});

describe("groupMergeCandidates", () => {
  it("只有一個成員的名字不成組", () => {
    const people = [{ id: 1, name: "王小明" }];
    expect(groupMergeCandidates(people)).toEqual([]);
  });

  it("空字串或純空白的名字不成組（就算有兩筆以上）", () => {
    const people = [
      { id: 1, name: "" },
      { id: 2, name: "   " },
    ];
    expect(groupMergeCandidates(people)).toEqual([]);
  });

  it("兩筆正規化後相同的名字成一組", () => {
    const people = [
      { id: 1, name: "王小明" },
      { id: 2, name: " 王小明 " },
    ];
    const groups = groupMergeCandidates(people);
    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedName).toBe("王小明");
    expect(groups[0].people.map((p) => p.id)).toEqual([1, 2]);
  });

  it("三人同名成一組", () => {
    const people = [
      { id: 3, name: "Amy" },
      { id: 1, name: "amy" },
      { id: 2, name: "AMY" },
    ];
    const groups = groupMergeCandidates(people);
    expect(groups).toHaveLength(1);
    // 組內依 id 排序，不是輸入順序。
    expect(groups[0].people.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("組內依 id 排序、組間依 normalizedName 排序", () => {
    const people = [
      { id: 5, name: "王小明" },
      { id: 2, name: "王小明" },
      { id: 4, name: "Amy" },
      { id: 1, name: "Amy" },
      { id: 9, name: "沒有同名的人" }, // 只有一筆，不該出現在結果裡
    ];
    const groups = groupMergeCandidates(people);
    expect(groups).toHaveLength(2);
    // 組間順序用 localeCompare 排序（實際順序取決於執行環境的排序規則，這裡不特別
    // 斷言「哪個字串排前面」，只斷言兩組的相對順序跟 localeCompare 直接比較的結果一致——
    // 避免測試綁死在某個特定排序結果，之後換一個 locale 跑測試也不會無緣無故失敗）。
    const [first, second] = ["amy", "王小明"].sort((a, b) => a.localeCompare(b));
    expect(groups[0].normalizedName).toBe(first);
    expect(groups[1].normalizedName).toBe(second);
    // 組內一律依 id 排序，跟組間順序無關。
    const groupById = new Map(groups.map((g) => [g.normalizedName, g]));
    expect(groupById.get("amy")?.people.map((p) => p.id)).toEqual([1, 4]);
    expect(groupById.get("王小明")?.people.map((p) => p.id)).toEqual([2, 5]);
  });
});
