# 我被色記了 / Hue set me up! — 目前機制確認

掃描日期：2026-10-07

用途：提供給 ChatGPT 作為目前專案狀態的參考，避免沿用過期的數值或要求 Codex 重做已存在的機制。

## 給 ChatGPT 的工作規則

這份文件記錄掃描當下的實作。提出修改 prompt 前，請遵守以下事項：

1. 手動平衡數值以 `game.js` 最上方 `CONFIG` 的**實際數值**為準，不要依舊對話、舊 prompt、註解或 README 猜測。
2. 將現有玩法視為已存在；除非使用者明確要求，勿重做、移除或改名既有機制。
3. 使用者會手動調整平衡數值。後續修改要保留目前 `CONFIG` 數值，不可擅自「校正」或恢復成舊值。
4. 新 prompt 若與此文件或目前程式碼衝突，先以使用者最新要求為準；需要確認現況時重新讀取 `game.js`，尤其是 `CONFIG`。
5. 本次重新掃描並實作 QCC 補充盤面、QCC 圖示與 EYE++ 疊層調整；本文同步更新對應設定和流程。

## 專案與執行方式

- 單頁靜態遊戲：`index.html`、`style.css`、`game.js`。
- 使用 HTML、CSS、Vanilla JavaScript；不需要 npm、bundler、伺服器或後端，可由 `file://` 開啟，也可部署到 GitHub Pages。
- `index.html` 以相對路徑載入 CSS 和 JS，沒有遊戲程式的網路依賴。
- 頁面以單頁舞台呈現；CSS 對 `html, body` 設定固定視窗尺寸與 `overflow: hidden`，另有 Desktop、Mobile 和較矮視窗的響應式樣式。

## 目前 CONFIG 數值

以下是本次直接從 `game.js` 讀到的值，手動調整後若與 README 或舊對話不同，請以這裡及最新程式碼為準。

| 設定 | 目前值 | 用途 |
|---|---:|---|
| `PLAYER_BASE_SPEED` | 100 | 主角速度 |
| `MONSTER_BASE_OFFSET_X` | 2 | 怪物起始速度比主角多出的量 |
| `MONSTER_SPEED_GROWTH_Y` | 0.3 | 怪物每個速度成長節點的初始增幅 |
| `MONSTER_SPEED_GROWTH_INTERVAL_SECONDS` | 1 秒 | 怪物速度增幅的基礎成長節點間隔 |
| `MONSTER_GROWTH_SCALE_INTERVAL` | 10 秒 | `Y` 增幅升級所需的 `activeGameplayTime` |
| `MONSTER_SPEED_GROWTH_Y_STEP` | 0.02 | 每次 `Y` 升級增加的幅度 |
| `MONSTER_SPEED_CAP` | 135 | 扣除各種減速後，怪物最終有效速度上限 |
| `COMBO_MONSTER_SLOW_UNIT` | 0.05 | Combo 永久減速單位 `Z` |
| `MATCH_MONSTER_SLOW` | 0.3 | 每次成功配對的基礎永久減速 |
| `DANGER_MATCH_SLOW_MULTIPLIER` | 1.5 | 危險距離內成功配對的減速倍率 |
| `MONSTER_STUN_DURATION` | 0.5 秒 | 清盤暈眩時間 |
| `INITIAL_DISTANCE` | 132 m | 新遊戲初始怪物距離 |
| `LOSE_DISTANCE` | 0 m | 怪物追上並結束遊戲的距離 |
| `MAX_DISTANCE` | 300 m | 距離狀態及舞台位置映射上限 |
| `DANGER_DISTANCE` | 70 m | 危險視覺及配對減速倍率門檻，判斷為嚴格小於 70 |
| `PREVIEW_DURATION` | 3 秒 | 每副牌的全牌預覽時間 |
| `ROUND_CLEAR_DELAY_MS` | 500 ms | 一般清盤後到下一副牌預覽前的停留 |
| `WRONG_CARD_REVEAL_MS` | 760 ms | 錯誤配對翻回前的顯示時間 |
| `CARD_PAIRS` | 6 | 每副牌 6 對、共 12 張 |
| `PALETTE_VARIANT` | `subtle` | 正常正式色盤版本 |
| `QCC_INITIAL_COUNT` / `QCC_MAX_COUNT` | 1 / 2 | QCC 初始數量與上限 |
| `QCC_UNLOCK_DECK` | 4 | 第 4 副牌開始解鎖 QCC |
| `QCC_BOARD_RECHARGE_INTERVAL` | 50 秒 | 解鎖後累積時間，讓下一副正常新牌成為 QCC 補充盤面 |
| `QCC_RECHARGE_CARD_IMAGE` | `assets/card/qcc-bottle.png` | QCC 補充配對的正面圖片 |
| `QCC_RECHARGE_DEBUG` | `true` | 輸出 QCC 週期狀態變化與每 10 秒一次的計時診斷 |
| `QCC_TRANSITION_DURATION_MS` | 500 ms | QCC 換牌過場 |
| `QCC_TUTORIAL_DISTANCE` | 70 m | QCC 強制指引距離條件，判斷為嚴格小於 70 |
| `QCC_TUTORIAL_OVERLAY_OPACITY` | 0.6 | QCC 指引遮罩透明度 |
| `DANGER_TRANSITION_TRIGGER_DECK` | 3 | 第 3 副牌清盤後觸發一次警告過場 |
| Danger 進場／停留／離場 | 0.55 / 1.9 / 0.55 秒 | 警告帶動畫時間 |
| `VISUAL_COLLISION_OFFSET_RATIO` | 0.866 | 怪物接觸主角插畫的視覺補償比例 |

`MONSTER_GROWTH_SCALE_INTERVAL` 的設定與程式註解目前一致；怪物增幅升級使用 `activeGameplayTime`，QCC 補充另用 `qccRechargeElapsed`。

## 速度與計時機制

### 兩份時間，不要混為一談

- `state.elapsed` 是存活時間，也用來計算已經走過幾個怪物基礎速度成長節點。主遊戲迴圈在 `playing` 和特殊的 `boardClearStun` phase 累加它。
- `state.activeGameplayTime` 只在 `phase === 'playing'` 時累加，用於 `Y` 增幅升級；QCC 補充另用 `qccRechargeElapsed`。
- 因此，預覽、`roundClear`、`dangerTransition`、`qccTutorial`、`qccTransition`、`idle`、`gameOver` 不累加 `activeGameplayTime`。特殊 `boardClearStun` 也不累加它。
- 一般清盤後的 0.5 秒暈眩是在 `phase === 'playing'` 中生效，所以這段時間仍算進 `elapsed` 和 `activeGameplayTime`；怪物速度為 0，但主角和距離仍按追逐迴圈更新。這和特殊 `boardClearStun` phase 不同。
- 遊戲用 `requestAnimationFrame` 主迴圈推進時間，單次 delta 最多 0.05 秒；phase 切換後第一個 frame 不套用切換期間的時間差。沒有用 `setInterval` 計算補充或成長。

### 怪物速度

每個基礎成長節點會把**當下的 `currentMonsterGrowthY()`** 累加到 `monsterGrowthTotal`。目前基礎節點間隔 1 秒。`Y` 為：

```text
currentMonsterGrowthY
= MONSTER_SPEED_GROWTH_Y
 + floor(activeGameplayTime / MONSTER_GROWTH_SCALE_INTERVAL)
   * MONSTER_SPEED_GROWTH_Y_STEP
```

目前代表 `Y` 從 0.3 開始，每 10 秒增加 0.02：10 秒時 0.32、20 秒時 0.34、100 秒時 0.50。升級只影響之後累加的成長節點，不會重新計算先前累積的節點，也不會直接瞬間替怪物加 0.02。

目前有效速度流程：

```text
怪物基礎速度 = PLAYER_BASE_SPEED + MONSTER_BASE_OFFSET_X + monsterGrowthTotal
減速後速度 = max(0, 怪物基礎速度 - Combo 永久減速 - 配對永久減速 - QCC 永久減速)
一般有效速度 = min(MONSTER_SPEED_CAP, 減速後速度)
暈眩時有效速度 = 0
```

135 限制的是**套用所有減速後的最終有效速度上限**，不是只限制怪物基礎速度。怪物速度 Debug 數字顯示目前有效速度；玩家速度與各個隱藏減速總額沒有另外顯示。

### Combo 與配對減速

- 成功配對才增加 `matchedPairs`、`matchedPairCount`、配對永久減速和 Combo。
- 每對基礎減速為 0.3；配對當下若 `distance < 70`，該次配對減速乘 1.5，成為 0.45。倍率只作用於該次配對減速。
- Combo 1 不增加 Combo 減速；Combo 2、3、4 各依序增加 `1Z`、`2Z`、`3Z`；Combo 5 及之後每次成功配對增加 `4Z`，其中 `Z = 0.05`。
- 配錯只把當前 `combo` 歸零；已累積的 Combo 和配對永久減速不退回。
- QCC 保留當前 Combo 和已累積減速。QCC 棄掉的牌不算成功配對；在 QCC 替換後真正配對成功仍照常累積配對減速與 Combo。
- `matchedPairCount` 是全局成功配對計數；`matchPermanentSlowTotal` 才是實際套進速度公式的累積配對減速。

## QCC

- 開局 1 個，最多 2 個；牌組未到第 4 副時鎖定。前 3 副是暖身色，QCC 需要正式色盤，因此實際可用條件也要求目前牌組具有 palette 與 6 個已選色位。
- QCC 解鎖前 recharge state 為 `locked`。第 4 副牌預覽結束、進入可玩階段時呼叫 `startQccRechargeCycle('unlocked')` 明確開始第一次週期，不必先使用 QCC；只有 `playing` 的 deltaTime 累加 `qccRechargeElapsed`，所以 preview、QCC tutorial、QCC transition、round clear 與 Danger transition 都不計時。
- 累積滿 `QCC_BOARD_RECHARGE_INTERVAL`（50 秒）後，state 轉為 `pending`，不改動目前牌面，也不直接增加庫存。下一次正常建立新牌時，從當副牌 6 組隨機挑 1 組，保留原始 `color`，並將該組兩張的 `pairType` 標為 `qccRecharge`、疊加 `QCC_RECHARGE_CARD_IMAGE`；牌組仍為 6 對、12 張，palette 與其他 5 組顏色維持原本選擇。預覽可看到顏色底與 QCC 瓶圖，蓋牌仍使用一般卡背。
- QCC 補充盤面進入 `boardActive` 後暫停 recharge 計時。只有該盤完整清空，或該盤被 QCC 刷新並建立新盤後，才把 elapsed 歸零並回到 `counting`。尚未配到的 QCC pair 隨刷新作廢，不補庫存；已成功配對取得的 QCC 不追回。
- 真正的 QCC pair 仍走一般 Match、Combo、配對慢速與清盤流程；成功時額外即時增加 1 個 QCC，並以 `QCC_MAX_COUNT` 為上限。已滿仍可配對消除但不超過上限。
- 普通盤面使用 QCC 時仍保留 theme、color indices 並換成對應 `clear` 顏色；若 recharge 正在 `counting` 或 `pending`，普通刷新不重置 elapsed/state，也不會把 pending 提前放進被刷新牌組。
- 遊戲速度高於 100 時，QCC 將「高於 100 的部分」減半並把差額累積成 `qccPermanentSlowTotal`；速度不高於 100 時不增加此減速。
- 每次使用會把距離設為 `max(目前距離, 132)`；低於 132 m 時拉回 132 m，高於 132 m 時保留原距離。
- 使用後放棄當前牌面進度，`matchedPairs` 歸零，`deckIndex` 不前進，也不觸發清盤暈眩；Combo、全局配對計數與既有永久減速保留。
- QCC 對正式色盤保留 palette theme 及本副牌抽到的 6 個 color indices，將同一批索引換成 `clear` 色，進入 QCC 過場後再給 3 秒全牌預覽。QCC 後的成功配對照常計算。
- 每局最多顯示一次強制 QCC 指引：QCC 已解鎖且可用、距離低於 70 m、尚未用過且本局尚未顯示時轉進 `qccTutorial`。指引期間只允許點擊高亮的 QCC 按鈕；這個 phase 不累加 `activeGameplayTime`。

## 牌組與遊戲流程

- 內部 `deckIndex` 從 0 開始；玩家介面不顯示 Round 編號。
- 第 1～3 副牌使用 `WARMUP_PALETTES` 三組鮮明顏色，各副牌的 6 色順序會洗牌。
- 第 4 副起使用近似色 palette，theme 順序依物件順序循環：`pink` → `peach` → `nude` → `mauve` → `sage`。每個 theme 的 subtle 和 clear 各有 12 色；一般牌組從當前 subtle 抽 6 個不同索引，各做 2 張，再洗牌成 12 張。
- 每副新牌及 QCC 換出的牌都先 12 張全翻開預覽 3 秒。預覽不能操作卡片；到時全部蓋回才進入 playing。
- 一次最多翻兩張。配對成功就留下完成牌；配錯顯示 760 ms 後翻回並中斷 Combo。
- 一般清完 6 對進入 `roundClear`，停留 500 ms，再建立下一副牌並預覽。距離不重設。
- 一般清盤設定 `monsterStunPending`；下一副牌預覽結束後開始 0.5 秒暈眩。這時 phase 是 `playing`，怪物速度為 0，距離仍隨主角速度變化。
- 第 3 副牌清完時，改走一次性特殊流程：進入 `boardClearStun` 並暈眩 0.5 秒，之後播放 Danger 警告帶進場 0.55 秒、停留 1.9 秒、離場 0.55 秒，然後才建立第 4 副牌。警告動畫期間不更新追逐距離或 active gameplay time。這次特殊流程不再安排一般的預覽後暈眩。
- 怪物追上（距離到 0）即 `gameOver`；結算顯示存活時間和最高 Combo。Restart 才把整局距離、速度成長、配對／Combo／QCC 累積、QCC 數量、計時與一次性旗標重置。

## 距離、危險提示與畫面資訊

- 距離初始 132 m，更新式為 `(PLAYER_BASE_SPEED - monsterSpeed()) * dt`，並限制在 0～300 m。只有 `playing` 與特殊 `boardClearStun` 執行距離積分。
- 主角固定在跑道寬度的 75%；怪物位置以同一個 `distance` 映射，距離越小越接近主角；距離 0 時加入插畫邊緣補償，視覺上接觸主角後方。
- 距離低於 70 m 時追逐舞台進入 `danger-near` 紅色警示樣式；它和第 3 副牌結束時的一次性 DANGER 警告過場是兩套不同機制。
- 頂部資訊顯示存活秒數、怪物距離與暫時保留的怪物速度 Debug 值。下方顯示 Combo、QCC 和本副牌配對數；沒有玩家可見的 Round 數字。
- 預覽、`roundClear`、Danger 過場、QCC tutorial/transition、idle 和 game over 會停止追逐距離更新。特殊 `boardClearStun` 不同：怪物暈眩為 0 速度，但距離積分仍執行，所以主角會拉開距離。

## 掃描來源

- 遊戲邏輯與數值：`game.js`（`CONFIG`、`state`、`currentMonsterGrowthY()`、`updateMonsterGrowthProgress()`、`updateQccRechargeTimer()`、`updateDistance()`、牌組／QCC phase handlers）。
- 可見資訊和 DOM：`index.html`。
- 版面與 phase 樣式：`style.css`。
- 使用說明：`README.md`。README 和註解可能落後於手動平衡數值；數值以當下 `game.js` 的 CONFIG 為準。
