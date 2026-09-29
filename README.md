# 色逃 Color Dash

「近似色記憶翻牌 × 角色逃生追逐」的純前端網頁遊戲 DEMO。以 HTML、CSS 和原生 JavaScript 製作，沒有建置步驟、套件或後端。

## 本地遊玩

直接雙擊 `index.html`，或將它拖進瀏覽器即可遊玩；不需要啟動 localhost，也不需要安裝 npm 套件。按「開始逃跑」後先有 3 秒全牌預覽，蓋牌後才開始生存計時與追逐。

## 發布到 GitHub Pages

1. 將 `index.html`、`style.css`、`game.js` 和 `README.md` 推送到 GitHub Repository。
2. 開啟 Repository 的 **Settings → Pages**。
3. 在 **Build and deployment** 選擇 **Deploy from a branch**。
4. 選擇 `main` 分支與 `/ (root)`，再按 **Save**。

GitHub Pages 發布完成後，透過 Pages 顯示的網址即可遊玩。所有遊戲程式和牌組資料都在本地檔案內，不使用 fetch、ES Module 或後端。

## 調整遊戲平衡

打開 `game.js` 最上方的 `CONFIG`，可修改角色與怪物速度、初始距離、失敗距離、Combo Buff、牌面預覽時間、牌組完成後的停留時間、危險距離，以及 QCC 數量、解鎖、補充、減速和替換動畫。`PREVIEW_DURATION` 預設為 3 秒，`ROUND_CLEAR_DELAY_MS` 和 `QCC_TRANSITION_DURATION_MS` 預設各為 500 毫秒；預覽、完成停留與 QCC 替換期間會凍結追逐距離。距離只會在重新開始整局時重設。

前三副牌使用 `WARMUP_PALETTES` 的三組高辨識顏色；接下來使用 `COLOR_PALETTES` 的近似色。每個正式色系的 `subtle` 與 `clear` 各有 12 色，陣列相同索引互相對應。正常新牌組使用 `CONFIG.PALETTE_VARIANT` 的 `subtle`；使用 QCC 時，會保留當前色系和抽中的六個索引，短暫替換成同索引的 `clear` 色，下一副正常牌即恢復 `subtle`。

QCC 初始數量為 1、上限為 2，第四副牌開始可使用。正常進入第五、九、十三副牌等指定牌組時補充 1 個，QCC 替換不推進牌組，也不觸發補充。每次使用會永久降低怪物一個速度成長單位；效果可累積，重新開始時清除。怪物距離低於 `DANGER_DISTANCE` 時，只有上方追逐舞台顯示 6–8px 紅框與脈動光暈。

主角固定在實際跑道寬度的 75%，怪物位置每個 animation frame 從同一個 `distance` 計算：基準映射在 `MAX_DISTANCE`、一半距離時分別對應跑道 25%、50%。距離接近 0 時，`VISUAL_COLLISION_OFFSET_RATIO` 以平滑漸進方式補償兩張角色插畫的透明留白，讓 0m 時怪物貼到主角後方的飄帶，不用等兩個角色中心重疊才結束。

每副牌從當前色組抽 6 色、各做成一對，再隨機排列 12 張牌。想調整正式近似色的辨識難度，改 `COLOR_PALETTES` 中的 `subtle` 色碼；`clear` 陣列則保留作為未來提示或模式使用。配錯會重置 Combo，成功配對的加速 Buff 會覆蓋前一個 Buff，不會累加。

## 操作與玩法

- 按「開始逃跑」啟動遊戲；滑鼠和觸控都能翻牌。
- 每次翻開兩張。相同就配對、增加 Combo 並暫時加速；不同則短暫顯示後翻回並重置 Combo。
- 追逐狀態列中的 QCC 按鈕可替換當前近似色牌組；使用時顯示 `EYE++`，並套用同一色系的高辨識版本。
- 每副牌開始時會先預覽 3 秒；卡片蓋回後才能操作。預覽期間怪物距離與存活計時會暫停。
- 怪物在沒有加速時會逐漸追近。配對成功會增加 Combo 並暫時加速；完成六對後，已配對的牌會停留 0.5 秒，再預覽下一組牌，追逐距離會保留。
- 怪物追上後可查看存活時間和最高 Combo，並按「再玩一次」重置整局。
