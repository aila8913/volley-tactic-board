// #221 人員合併：用姓名找出「看起來像同一個人」的候選組。
//
// 這裡的正規化規則刻意寫得比 MatchFormDialog.tsx（前端名單去重建議，第 99 行附近）
// 「寬」——那邊只做 `p.name.trim().toLowerCase() === trimmed.toLowerCase()`，這裡多做了
// NFKC 正規化跟「所有空白（含全形空白）整個拿掉」。這不是兩邊實作走偏、忘記同步，
// 是刻意的不同判準：兩邊「猜錯的代價」完全不一樣。
//   - MatchFormDialog 的比對結果是「主動建議使用者按下去，把這個新名字直接綁到某個既有
//     person」——猜錯（把兩個真的不同的人配成同一個）會讓使用者不知不覺按下去，
//     兩個人的資料就這樣被誤導著混在一起，所以那邊的規則要窄、要保守。
//   - 這裡只是「列出來給人看」的候選名單，使用者一定要自己勾選來源、按下確認才會真的
//     合併（見 routes/people.ts 的 POST /people/:personId/merge）。所以「多列一組其實
//     不是同一人的假候選」成本趨近於零（使用者看一眼就知道不對，不勾就是了）；
//     反而是「該列出來的一組沒被抓到」才是問題（使用者根本不知道有這組重複可以合併）。
//     這就是 #213 定下的判準：能不能自動化，取決於「猜錯的方向會不會製造出使用者難以
//     察覺的錯誤答案」——這裡猜寬一點沒有那種風險，所以可以放心比 MatchFormDialog 寬。
//
// 明確不做的事：簡繁轉換（例如「臺」跟「台」）。那需要一份簡繁對照表才能正確處理，
// 不是字串正規化能解決的，超出這一輪範圍，留給之後有需要再做。

// 把一個姓名字串正規化成用來比對「是不是同一個人」的 key。
// 步驟：
//   1. NFKC（Normalization Form Compatibility Composition）：把「相容字元」統一成標準
//      形式，最常見的例子是全形字元轉半形（例如全形英數字 Ａ→A、全形空白（U+3000）→ 一般空白）——
//      使用者在中文輸入法底下很容易不小心打出全形字元，同一個人的名字因此在資料庫裡
//      長得不完全一樣。
//   2. 把所有空白整個拿掉（不只是壓成一個、也不只是去頭尾）：使用者很容易在姓名中間
//      多打一個空白（中文輸入法切換、或從別處複製貼上帶進來的全形空白 U+3000），
//      「王」「小明」中間夾一個全形空白跟「王小明」肉眼幾乎看不出差別，卻是兩個不相等的
//      字串——這正是這支功能最該抓到的
//      那種重複。中文姓名本來就不含有意義的內部空白，拿掉是安全的；英文姓名雖然會因此
//      讓 "Amy Chen" 跟 "AmyChen" 被視為同一個 key，但那兩個寫法本來就極可能是同一個人，
//      而且照上面的判準，這裡多配對到一組只是多列一個候選給人確認，成本近乎零。
//   3. toLowerCase()：中文姓名通常沒有大小寫問題，但系隊/球隊偶爾會用英文暱稱記名單
//      （例如 "Amy" vs "amy"），統一轉小寫比較保險。
export function normalizePersonName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

// 把一批「人」依正規化姓名分組，只回傳成員數 ≥ 2 的組（單獨一筆代表沒有同名的人，
// 不構成合併候選）。空字串正規化後也是空字串——刻意跳過，不要把兩個「名字打錯/漏填」
// 的空白人誤判成候選組（那並不是「同一個人」，只是剛好都沒填名字）。
//
// 排序是刻意做穩定輸出，方便測試斷言、也讓前端渲染結果不會每次重新整理就跳動順序：
//   - 組內成員依 id 排序（id 遞增＝建立順序）。
//   - 組間依 normalizedName 排序（字典序）。
export function groupMergeCandidates<T extends { id: number; name: string }>(
  people: T[],
): Array<{ normalizedName: string; people: T[] }> {
  const groups = new Map<string, T[]>();

  for (const person of people) {
    const key = normalizePersonName(person.name);
    if (key === "") continue;

    const existing = groups.get(key);
    if (existing) {
      existing.push(person);
    } else {
      groups.set(key, [person]);
    }
  }

  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([normalizedName, members]) => ({
      normalizedName,
      people: [...members].sort((a, b) => a.id - b.id),
    }))
    .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}
