# 我被色記了 / Hue set me up!

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

打開 `game.js` 最上方的 `CONFIG`，可調整玩家基礎速度、怪物起始差值、怪物速度增幅與最終有效速度上限、速度增幅升級間隔與幅度、Combo 永久減速單位、每次成功配對的永久減速與危險距離倍率、清盤暈眩、暖身結束警告帶的觸發牌組與動畫時間、QCC 教學距離及遮罩透明度、初始距離、牌面預覽時間、牌組完成停留時間、危險距離，以及 QCC 數量、解鎖與補充間隔。QCC 補充與怪物速度增幅升級共用只在 `playing` 前進的 `activeGameplayTime`；預覽、過場、QCC 替換、教學與暈眩期間不計時。距離只會在重新開始整局時重設。

前三副牌使用 `WARMUP_PALETTES` 的三組高辨識顏色；接下來使用 `COLOR_PALETTES` 的近似色。每個正式色系的 `subtle` 與 `clear` 各有 12 色，陣列相同索引互相對應。正常新牌組使用 `CONFIG.PALETTE_VARIANT` 的 `subtle`；使用 QCC 時，會保留當前色系和抽中的六個索引，短暫替換成同索引的 `clear` 色，下一副正常牌即恢復 `subtle`。

QCC 初始數量為 1、上限為 2，第四副牌開始可使用；每累積 `QCC_RECHARGE_INTERVAL` 秒的實際 `playing` 時間補充 1 個。補充使用固定時間節點；到節點時若已滿，該次不補，但節點仍會消耗，之後使用 QCC 不會立刻補回。使用時保留 palette 和色彩索引，將目前牌組換成對應 `clear` 顏色，且不推進牌組或觸發清盤暈眩。若當下怪物有效速度高於 100，QCC 將超出 100 的部分減半，並把差額累積為永久減速；速度不高於 100 時不減速，但仍正常換牌。每次使用 QCC 會將距離至少拉回 132m，不會縮短原本大於 132m 的距離，也會保留當前 Combo。每局第一次在第 4 副牌起、距離低於 `QCC_TUTORIAL_DISTANCE` 且尚未用過 QCC 時，會強制顯示透明度由 `QCC_TUTORIAL_OVERLAY_OPACITY` 控制的遮罩、箭頭與說明，並只讓玩家點擊原位 QCC 按鈕。重新開始會清除 QCC 補充計時、減速及教學狀態。怪物距離低於 `DANGER_DISTANCE` 時，上方追逐舞台顯示紅框與脈動光暈。

速度公式為：主角固定 `PLAYER_BASE_SPEED`；怪物基礎速度從「主角速度 + `MONSTER_BASE_OFFSET_X`」開始，每經過 `MONSTER_SPEED_GROWTH_INTERVAL_SECONDS` 秒增加當前成長幅度。當前成長幅度從 `MONSTER_SPEED_GROWTH_Y` 起算，每累積 `MONSTER_GROWTH_SCALE_INTERVAL` 秒的實際 `playing` 時間增加 `MONSTER_SPEED_GROWTH_Y_STEP`；CONFIG 基礎值不會被修改，升級也不會回算過去已累積的成長步數。接著扣除 Combo 永久減速、逐對累加的 `matchPermanentSlowTotal`，以及 QCC 永久減速，最後將有效速度限制在 `0` 至 `MONSTER_SPEED_CAP`。每次成功配對時依當下距離決定配對減速：距離低於 `DANGER_DISTANCE` 時，該對的 `MATCH_MONSTER_SLOW` 乘上 `DANGER_MATCH_SLOW_MULTIPLIER`；Combo 永久減速則獨立計算，不受此倍率影響。Combo 2、3、4 分別永久增加 `1Z`、`2Z`、`3Z` 的減速；每次連鎖新達到 Combo 5 或以上，再永久增加 `4Z`。`Z` 由 `CONFIG.COMBO_MONSTER_SLOW_UNIT` 設定。配錯會把當前 Combo 歸零，但已累積的 Combo 減速不會退回；只有 Restart 清除。清完整副牌後，下一副牌預覽結束才開始 `MONSTER_STUN_DURATION` 暈眩，這段期間怪物速度優先固定為 0；QCC 棄牌不觸發暈眩，也不清除既有累積減速。

完成第 `DANGER_TRANSITION_TRIGGER_DECK` 副牌時，會先進行一次既有時長的清盤暈眩，接著顯示中間整條紅底白色粗字、上下各有細紅白斜紋的 `DANGER! DANGER!` 警告帶；警告帶仍從左側快速進場、停留後離場，時間可分別透過 `DANGER_ENTER_DURATION`、`DANGER_HOLD_DURATION`、`DANGER_EXIT_DURATION` 調整。動畫結束後才建立下一副牌並進入原有預覽。這段過場只觸發一次，Restart 後重置。

主角固定在實際跑道寬度的 75%，怪物位置每個 animation frame 從同一個 `distance` 計算：基準映射在 `MAX_DISTANCE`、一半距離時分別對應跑道 25%、50%。距離接近 0 時，`VISUAL_COLLISION_OFFSET_RATIO` 以平滑漸進方式補償兩張角色插畫的透明留白，讓 0m 時怪物貼到主角後方的飄帶，不用等兩個角色中心重疊才結束。

每副牌從當前色組抽 6 色、各做成一對，再隨機排列 12 張牌。想調整正式近似色的辨識難度，改 `COLOR_PALETTES` 中的 `subtle` 色碼；`clear` 陣列則保留作為 QCC 高辨識版本。配錯會重置當前 Combo 連鎖；整局累積的 Combo 減速、配對減速和 QCC 減速都會保留。

## 操作與玩法

- 按「開始逃跑」啟動遊戲；滑鼠和觸控都能翻牌。
- 每次翻開兩張。相同就配對並增加 Combo，同時累加配對永久減速；進入危險距離時該對減速乘上 `DANGER_MATCH_SLOW_MULTIPLIER`。Combo 2 起會依達成的連鎖門檻永久累積獨立減速。不同則短暫顯示後翻回並重置當前 Combo，已累積的減速保留。
- 追逐狀態列中的 QCC 按鈕可替換當前近似色牌組；使用時顯示 `EYE++`、套用同一色系的高辨識版本，並依當下有效速度套用永久減速。QCC 保留當前 Combo；接續配對會正常提高連鎖，配錯時才重置 Combo。
- 每副牌開始時會先預覽 3 秒；卡片蓋回後才能操作。預覽期間怪物距離與存活計時會暫停。
- 怪物基礎速度依 `MONSTER_BASE_OFFSET_X` 與 playing 時間成長；扣除所有減速後，有效速度最高為 `MONSTER_SPEED_CAP`。成功配對與 Combo 的永久減速會持續累積。完成六對後，牌面停留 0.5 秒，再預覽下一組牌；預覽結束後怪物暈眩 0.5 秒，追逐距離會保留。
- 怪物追上後可查看存活時間和最高 Combo，並按「再玩一次」重置整局。
