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

打開 `game.js` 最上方的 `CONFIG`，可調整玩家基礎速度、怪物起始差值、每 3 秒的怪物速度增幅、怪物基礎速度上限、Combo 減速、每次成功配對的永久減速、清盤暈眩、暖身結束警告帶的觸發牌組與動畫時間、初始距離、牌面預覽時間、牌組完成停留時間、危險距離，以及 QCC 數量、解鎖、補充和減速。預覽、清盤停留與 QCC 替換期間距離凍結；怪物的每 3 秒速度成長也只計算實際 playing 時間。距離只會在重新開始整局時重設。

前三副牌使用 `WARMUP_PALETTES` 的三組高辨識顏色；接下來使用 `COLOR_PALETTES` 的近似色。每個正式色系的 `subtle` 與 `clear` 各有 12 色，陣列相同索引互相對應。正常新牌組使用 `CONFIG.PALETTE_VARIANT` 的 `subtle`；使用 QCC 時，會保留當前色系和抽中的六個索引，短暫替換成同索引的 `clear` 色，下一副正常牌即恢復 `subtle`。

QCC 初始數量為 1、上限為 2，第四副牌開始可使用。正常進入第五、九、十三副牌等指定牌組時補充 1 個，QCC 替換不推進牌組，也不觸發清盤暈眩。每次使用會永久降低怪物 1.5 速度單位；效果可累積，重新開始時清除。怪物距離低於 `DANGER_DISTANCE` 時，只有上方追逐舞台顯示紅框與脈動光暈。

速度公式為：主角固定 `PLAYER_BASE_SPEED`；怪物基礎速度從「主角速度 + `MONSTER_BASE_OFFSET_X`」開始，每累積 `MONSTER_SPEED_GROWTH_INTERVAL_SECONDS` 秒 playing 時間增加 `MONSTER_SPEED_GROWTH_Y`，並只在基礎速度階段限制到 `MONSTER_SPEED_CAP`。之後再扣除 Combo、整局成功配對累積的 `MATCH_MONSTER_SLOW`，以及 QCC 減速；有效速度最低為 0。每成功配對一對就永久累積一次配對減速，只有 Restart 歸零。Combo 1 不減速；Combo 2、3、4、5+ 分別減 3、6、9、12。清完整副牌後，下一副牌預覽結束才開始 `MONSTER_STUN_DURATION` 暈眩，這段期間怪物速度優先固定為 0；QCC 棄牌不觸發暈眩，也不清除已累積的配對減速。當前設定為 x=5、y=0.2、z=3、每對配對減速 0.3。

完成第 `DANGER_TRANSITION_TRIGGER_DECK` 副牌時，會先進行一次既有時長的清盤暈眩，接著顯示 `DANGER! DANGER!` 警告帶；警告帶進場、停留、離場時間可分別透過 `DANGER_ENTER_DURATION`、`DANGER_HOLD_DURATION`、`DANGER_EXIT_DURATION` 調整。動畫結束後才建立下一副牌並進入原有預覽。這段過場只觸發一次，Restart 後重置。

主角固定在實際跑道寬度的 75%，怪物位置每個 animation frame 從同一個 `distance` 計算：基準映射在 `MAX_DISTANCE`、一半距離時分別對應跑道 25%、50%。距離接近 0 時，`VISUAL_COLLISION_OFFSET_RATIO` 以平滑漸進方式補償兩張角色插畫的透明留白，讓 0m 時怪物貼到主角後方的飄帶，不用等兩個角色中心重疊才結束。

每副牌從當前色組抽 6 色、各做成一對，再隨機排列 12 張牌。想調整正式近似色的辨識難度，改 `COLOR_PALETTES` 中的 `subtle` 色碼；`clear` 陣列則保留作為 QCC 高辨識版本。配錯會重置 Combo 減速；整局配對減速和 QCC 減速則會保留。

## 操作與玩法

- 按「開始逃跑」啟動遊戲；滑鼠和觸控都能翻牌。
- 每次翻開兩張。相同就配對並增加 Combo，同時讓怪物速度永久降低 `MATCH_MONSTER_SLOW`；Combo 2 起也逐級降低怪物速度。不同則短暫顯示後翻回並重置 Combo。
- 追逐狀態列中的 QCC 按鈕可替換當前近似色牌組；使用時顯示 `EYE++`，並套用同一色系的高辨識版本。
- 每副牌開始時會先預覽 3 秒；卡片蓋回後才能操作。預覽期間怪物距離與存活計時會暫停。
- 怪物基礎速度起始為 105，每 3 秒 playing 時間增加 0.2，最高 135；成功配對的永久減速會持續累積。完成六對後，牌面停留 0.5 秒，再預覽下一組牌；預覽結束後怪物暈眩 0.5 秒，追逐距離會保留。
- 怪物追上後可查看存活時間和最高 Combo，並按「再玩一次」重置整局。
