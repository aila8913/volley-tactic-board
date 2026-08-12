# ADR-0009：body 帶進來的 id，驗的是「同一場比賽」而不是「同一個使用者」

狀態：Accepted（2026-08-12，#385／PR #388）

## 背景

`lib/ownership.ts` 既有的那批 `xBelongsToUser` 都在回答同一個問題：**這列是不是你的**。
`events.playerId` 第一次讓這個問題不夠用——PATCH 開放改 playerId 之後（#385），
「這名球員是不是你的」放行的範圍太寬：你自己另一場比賽的球員也會通過，
但那球是這場打的，指給一個沒上場的人就是錯的資料。

反過來，「這名球員在不在這場比賽的名單裡」自動蘊含「是你的」——因為 match 在前一道
owns 已經驗過擁有權了。**強的那個判準涵蓋弱的，反之不然。**

## 決定

**body 送進來的外鍵，驗證範圍取「這個 id 在這筆資料的脈絡裡合不合法」，而不是
「這個 id 屬不屬於這個使用者」。** 兩者不同時，取前者。

`events.playerId` 的落點是 `playerBelongsToEventMatch` / `playerBelongsToRallyMatch`
（兩支只差在能反推 matchId 的起點是 event 還是 rally）。既有的
`playerBelongsToMatch` 是同一條判準更早的實例，只是當時 matchId 在路徑上、不需要反推。

**同一條規則的每一條寫入路徑都要驗，不是只驗看起來危險的那條。** #385 因此順帶關掉了
`POST /rallies/:rallyId/events` 的既有缺口（原本 `body.playerId` 完全沒驗）。

## 後果

- 沒有 `playerBelongsToUser` 這支函式，而且不該有——player 沒有自己的 userId。
- 多一次 DB 查詢，但只在 body 真的帶了 id 時（`== null` 先短路），一鍵記分那條路不受影響。
- 錯誤碼仍是 404「Not found」，跟擁有權失敗共用同一個回覆，不外洩「這個 id 存在但不合法」。

## 不要重新提議

- **別把它降級成 `playerBelongsToUser`**（理由是「兩支 helper 太像、收斂成一支比較乾淨」）。
  那不是重複，是兩條不同強度的判準；換成弱的等於把守衛關掉，而且測試不會紅——
  「錯的球員也是你的球員」在單一使用者的 dev 環境下看起來完全正常。
- **別只驗 PATCH 不驗 POST。** 想繞過去只要刪掉那球重新 POST 一次，等於沒驗。
  「維持遷移前的既有行為」曾經是 POST 不驗的理由，那個理由到此為止。
- **別靠外鍵擋。** 外鍵保證 referential integrity（uuid 指得到一列），不保證那列在這個
  脈絡裡合不合法——這是 #225 那個 IDOR 的同一個誤解，已經復發過一次。
- **別為了對稱把這條推廣成「所有外鍵都要驗到 match」。** `matches.teamId` /
  `matches.tournamentId` 的正確範圍就是使用者（球隊、資料夾本來就跨比賽共用），
  驗到 match 反而是錯的。判準是**那個 id 在領域上屬於誰**，不是統一驗到哪一層。
