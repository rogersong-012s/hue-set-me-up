// 調整手感與預覽時間時，優先從這裡修改數值。
const CONFIG = {
  PLAYER_BASE_SPEED: 100,
  // The final monster effective speed is capped after growth and all slow effects are applied.
  MONSTER_BASE_OFFSET_X: 2,
  MONSTER_SPEED_GROWTH_Y: 0.3,
  MONSTER_SPEED_GROWTH_INTERVAL_SECONDS : 1,
  MONSTER_SPEED_CAP: 115, // Final effective speed cap, not a base-speed cap.
  COMBO_MONSTER_SLOW_UNIT: 0.05,
  // Permanently subtract this amount for every correctly matched pair in the current run.
  MATCH_MONSTER_SLOW: 0.3,
  MONSTER_STUN_DURATION: 0.5,
  INITIAL_DISTANCE: 132,
  LOSE_DISTANCE: 0,
  // 追逐位置與距離共用同一個上限；怪物遠端錨點在跑道 25%。
  MAX_DISTANCE: 300,
  // 依角色插畫實際留白換算接觸點；位置圖的基準仍是跑道 25% 到 75%。
  VISUAL_COLLISION_OFFSET_RATIO: 0.7,

  // 預覽期間會暫停計時與相對距離更新；改這個值即可調整每副牌的記憶時間。
  PREVIEW_DURATION: 3,
  ROUND_CLEAR_DELAY_MS: 500,
  WRONG_CARD_REVEAL_MS: 760,
  CARD_PAIRS: 6,

  // 正式近似色目前使用 subtle；clear 已備妥，尚未用在遊戲或提示中。
  PALETTE_VARIANT: 'subtle',
  DANGER_DISTANCE: 70,
  QCC_TUTORIAL_DISTANCE: 70,

  QCC_INITIAL_COUNT: 1,
  QCC_MAX_COUNT: 2,
  QCC_UNLOCK_DECK: 4,
  QCC_FIRST_REWARD_DECK: 5,
  QCC_GRANT_INTERVAL: 4,
  QCC_TRANSITION_DURATION_MS: 500,

  // The one-time warning plays after this many completed decks, before the next preview.
  DANGER_TRANSITION_TRIGGER_DECK: 3,
  DANGER_ENTER_DURATION: 0.55,
  DANGER_HOLD_DURATION: 1.9,
  DANGER_EXIT_DURATION: 0.55,
};

// 內部索引 0、1、2 各用一組高辨識色；第 4 副牌起改用近似色。
const WARMUP_PALETTES = [
  ['#F04452', '#3478E8', '#F6CE36', '#32A56C', '#8959D8', '#F28A32'],
  ['#B9273E', '#14A5B8', '#F2B900', '#57972C', '#6A36A9', '#E96828'],
  ['#FF315F', '#2866D7', '#A6C928', '#00A878', '#B12BC1', '#F07924'],
];

// 每個色系的 subtle / clear 以陣列索引一一對應；每邊各 12 色。
// 一般新牌使用 subtle；QCC 替換當前牌組時才使用相同索引的 clear。
const COLOR_PALETTES = {
  pink: {
    subtle: [
      '#F58FA6', '#E97596', '#F4A28B', '#D96F82', '#EC8FAC', '#F2B8A0',
      '#E878AA', '#CC6F8F', '#EEA1BB', '#D88379', '#F0A5A0', '#C85F79',
    ],
    clear: [
      '#FF0F5B', '#E92863', '#FF764A', '#D82F4D', '#FF48A5', '#FF8B62',
      '#D92787', '#A73170', '#FF6FAE', '#B83A3A', '#F04C3E', '#8F1B53',
    ],
  },
  peach: {
    subtle: [
      '#EF855E', '#F39B67', '#DA765E', '#FFAD79', '#E98976', '#C97063',
      '#F1B084', '#D98570', '#F7A38A', '#C98161', '#EFA07D', '#DF6D57',
    ],
    clear: [
      '#F04420', '#FF9A00', '#B83B20', '#FFC247', '#EF5A45', '#9E321E',
      '#E77A16', '#A94736', '#FF7043', '#7F3C1D', '#F28C28', '#C83E18',
    ],
  },
  nude: {
    subtle: [
      '#C98776', '#DAA08C', '#B97768', '#E5B29B', '#D1907B', '#B98972',
      '#E6AA93', '#C98667', '#D99B78', '#B8767D', '#E4B5AA', '#CA9B87',
    ],
    clear: [
      '#A83424', '#E26A3B', '#7F2D24', '#F0A23A', '#C34735', '#734126',
      '#F07850', '#A94B1C', '#D98522', '#812C46', '#E66F72', '#9B5B37',
    ],
  },
  mauve: {
    subtle: [
      '#8E78B9', '#A692C7', '#755FA5', '#B59CC7', '#947FAD', '#716690',
      '#A98BB9', '#8370A2', '#C0A0B6', '#9C87D1', '#7D6BBD', '#B398AC',
    ],
    clear: [
      '#6032C2', '#A34BE0', '#39208C', '#D06BC8', '#6E49A8', '#343A79',
      '#C044A0', '#5136B2', '#DB8AAB', '#7046E8', '#4526B8', '#A64D83',
    ],
  },
  sage: {
    subtle: [
      '#789C82', '#8EB18A', '#608D85', '#A0AD76', '#78A69C', '#9DB48C',
      '#6F9278', '#B0B984', '#729E90', '#91AA79', '#65958A', '#ABC2A4',
    ],
    clear: [
      '#277C45', '#91B52A', '#17635C', '#C2A319', '#258FA0', '#759B32',
      '#356A35', '#D0B82E', '#318B72', '#6C8F1C', '#176C82', '#91B95B',
    ],
  },
};
const PALETTE_THEMES = Object.keys(COLOR_PALETTES);

const state = {
  phase: 'idle', // Normal: preview → playing → roundClear → preview; QCC tutorial pauses Playing.
  deckIndex: 0,
  elapsed: 0,
  distance: Math.min(CONFIG.INITIAL_DISTANCE, CONFIG.MAX_DISTANCE),
  combo: 0,
  // Cumulative Combo milestone slow for this run; only Restart clears it.
  comboPermanentSlowTotal: 0,
  bestCombo: 0,
  matchedPairs: 0,
  // Lifetime successful pair count; unlike matchedPairs, this survives deck/QCC changes.
  matchedPairCount: 0,
  hasShownDangerTransition: false,
  flipped: [],
  monsterStunRemaining: 0,
  monsterStunPending: false,
  deck: [],
  currentPaletteTheme: null,
  currentSelectedColorIndices: [],
  currentPaletteVariant: null,
  qccCount: CONFIG.QCC_INITIAL_COUNT,
  // QCC's cumulative additive speed offset; Restart is the only reset.
  qccPermanentSlowTotal: 0,
  hasEverUsedQcc: false,
  qccTutorialShown: false,
  lastQccRewardDeck: 0,
  lastFramePhase: 'idle',
  previousTime: 0,
  lastTimeShown: -1,
  lastDistanceShown: null,
  lastSpeedShown: null,
  mismatchTimer: null,
  previewTimer: null,
  roundClearTimer: null,
  boardClearStunTimer: null,
  dangerTransitionTimer: null,
  qccTransitionTimer: null,
  feedbackTimer: null,
  phaseToken: 0,
  runToken: 0,
  feedbackToken: 0,
  animationFrame: null,
};

const $ = (selector) => document.querySelector(selector);
const gameShell = $('#gameShell');
const cardGrid = $('#cardGrid');
const chaseStage = $('.chase-stage');
const startPanel = $('#startPanel');
const startButton = $('#startButton');
const gameOverOverlay = $('#gameOverOverlay');
const dangerTransition = $('#dangerTransition');
const dangerTape = $('#dangerTape');
const monster = $('#monster');
const hero = $('#hero');
const track = $('.track');
const comboReadout = $('#comboReadout');
const feedback = $('#feedback');
const qccButton = $('#qccButton');
const qccCount = $('#qccCount');
const qccLock = $('#qccLock');
const qccFlash = $('#qccFlash');
const qccTutorialOverlay = $('#qccTutorialOverlay');
const qccTutorialArrow = $('#qccTutorialArrow');
const qccTutorialCopy = $('#qccTutorialCopy');
const qccTutorialArrowPath = $('#qccTutorialArrowPath');
const qccTutorialShields = [...qccTutorialOverlay.querySelectorAll('.qcc-tutorial-shield')];

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function paletteColorAt(theme, slot, variant = CONFIG.PALETTE_VARIANT) {
  return COLOR_PALETTES[theme][variant][slot];
}

// deckIndex 0–2 對應三組暖身色；deckIndex 3 起抽正式 palette 的六個不同色位。
function paletteForDeck(deckIndex, options = {}) {
  if (deckIndex < WARMUP_PALETTES.length) {
    return {
      entries: shuffle(WARMUP_PALETTES[deckIndex]).slice(0, CONFIG.CARD_PAIRS).map((color) => ({
        color,
        paletteTheme: null,
        paletteSlot: null,
      })),
      theme: null,
      variant: null,
      selectedColorIndices: [],
    };
  }

  const themeIndex = (deckIndex - WARMUP_PALETTES.length) % PALETTE_THEMES.length;
  const theme = options.theme || PALETTE_THEMES[themeIndex];
  const variant = options.variant || CONFIG.PALETTE_VARIANT;
  const selectedColorIndices = options.selectedColorIndices
    ? [...options.selectedColorIndices]
    : shuffle(COLOR_PALETTES[theme][variant].map((_, paletteSlot) => paletteSlot)).slice(0, CONFIG.CARD_PAIRS);
  const entries = selectedColorIndices.map((paletteSlot) => ({
      color: paletteColorAt(theme, paletteSlot, variant),
      paletteTheme: theme,
      paletteSlot,
  }));
  return { entries, theme, variant, selectedColorIndices };
}

function createDeck(options = {}) {
  const palette = paletteForDeck(state.deckIndex, options);
  state.currentPaletteTheme = palette.theme;
  state.currentSelectedColorIndices = palette.selectedColorIndices;
  state.currentPaletteVariant = palette.variant;
  const deck = palette.entries.flatMap((entry, pairId) => [
    { id: `${state.deckIndex}-${pairId}-a`, pairId, ...entry },
    { id: `${state.deckIndex}-${pairId}-b`, pairId, ...entry },
  ]);
  state.deck = shuffle(deck);
}

function renderDeck() {
  cardGrid.replaceChildren();
  state.deck.forEach((card, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'memory-card';
    button.dataset.index = String(index);

    const inner = document.createElement('span');
    inner.className = 'card-inner';
    const back = document.createElement('span');
    back.className = 'card-face card-back';
    back.setAttribute('aria-hidden', 'true');
    const mark = document.createElement('span');
    mark.className = 'card-back-mark';
    mark.textContent = '✦';
    back.append(mark);

    const front = document.createElement('span');
    front.className = 'card-face card-front';
    front.style.setProperty('--card-color', card.color);
    front.setAttribute('aria-hidden', 'true');
    inner.append(back, front);
    button.append(inner);
    cardGrid.append(button);
  });
  syncCardState();
  updateMatchUI();
}

function syncCardState() {
  const previewing = state.phase === 'preview';
  const playable = state.phase === 'playing';
  cardGrid.querySelectorAll('.memory-card').forEach((button) => {
    const index = Number(button.dataset.index);
    const matched = button.classList.contains('is-matched');
    button.classList.toggle('is-flipped', previewing && !matched);
    button.disabled = !playable || matched;
    if (matched) {
      button.setAttribute('aria-label', '已配對的顏色卡');
    } else if (previewing) {
      button.setAttribute('aria-label', `第 ${index + 1} 張，顏色預覽中`);
    } else {
      button.setAttribute('aria-label', `第 ${index + 1} 張，蓋住的顏色卡`);
    }
  });
}

function flipCard(button, index) {
  if (state.phase !== 'playing' || state.flipped.length >= 2) return;
  if (button.classList.contains('is-flipped') || button.classList.contains('is-matched')) return;

  button.classList.add('is-flipped');
  button.setAttribute('aria-label', `第 ${index + 1} 張，已翻開`);
  state.flipped.push({ button, card: state.deck[index] });
  if (state.flipped.length === 2) resolveTurn();
}

function resolveTurn() {
  const [first, second] = state.flipped;
  if (first.card.pairId === second.card.pairId) {
    first.button.classList.add('is-matched');
    second.button.classList.add('is-matched');
    first.button.setAttribute('aria-label', '已配對的顏色卡');
    second.button.setAttribute('aria-label', '已配對的顏色卡');
    first.button.disabled = true;
    second.button.disabled = true;
    state.flipped = [];
    state.matchedPairs += 1;
    state.matchedPairCount += 1;
    onSuccessfulMatch();
    updateMatchUI();

    if (state.matchedPairs === CONFIG.CARD_PAIRS) completeDeck();
    return;
  }

  state.combo = 0;
  first.button.classList.add('is-wrong');
  second.button.classList.add('is-wrong');
  updateComboUI(false);
  showFeedback('配錯了，Combo 斷掉！', 'wrong');
  const runToken = state.runToken;
  let timerId;
  timerId = window.setTimeout(() => {
    if (runToken !== state.runToken || state.phase !== 'playing' || state.mismatchTimer !== timerId) return;
    [first, second].forEach(({ button }) => {
      button.classList.remove('is-flipped', 'is-wrong');
      const index = Number(button.dataset.index);
      button.setAttribute('aria-label', `第 ${index + 1} 張，蓋住的顏色卡`);
    });
    state.flipped = [];
    state.mismatchTimer = null;
  }, CONFIG.WRONG_CARD_REVEAL_MS);
  state.mismatchTimer = timerId;
}

function onSuccessfulMatch() {
  state.combo += 1;
  // Each newly reached Combo milestone adds a permanent slow award:
  // Combo 1 = 0 units, 2 = 1, 3 = 2, 4 = 3, then 4 more for every Combo >= 5.
  const awardedSlowUnits = state.combo >= 5 ? 4 : Math.max(0, state.combo - 1);
  state.comboPermanentSlowTotal += awardedSlowUnits * CONFIG.COMBO_MONSTER_SLOW_UNIT;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  updateComboUI(true);

  const message = state.combo >= 2
    ? `COMBO ${state.combo}！怪物持續減速！`
    : '配對成功！連續配對可持續拖慢怪物。';
  showFeedback(message, state.combo >= 3 ? 'big' : 'good');
}

function updateComboUI(pop) {
  $('#comboValue').textContent = `COMBO ${state.combo}`;
  comboReadout.classList.toggle('is-hot', state.combo > 0);
  comboReadout.classList.toggle('combo-high', state.combo >= 3);
  if (pop && state.combo > 0) {
    comboReadout.classList.remove('did-pop');
    void comboReadout.offsetWidth;
    comboReadout.classList.add('did-pop');
  }
}

function isQccDeckUnlocked() {
  return state.deckIndex + 1 >= CONFIG.QCC_UNLOCK_DECK;
}

function canUseQcc() {
  return (state.phase === 'playing' || state.phase === 'qccTutorial')
    && isQccDeckUnlocked()
    && state.qccCount > 0
    && state.currentPaletteTheme !== null
    && state.currentSelectedColorIndices.length === CONFIG.CARD_PAIRS;
}

function positionQccTutorial() {
  if (state.phase !== 'qccTutorial' || qccTutorialOverlay.hidden) return;

  const overlayRect = qccTutorialOverlay.getBoundingClientRect();
  const targetRect = qccButton.getBoundingClientRect();
  const width = overlayRect.width;
  const height = overlayRect.height;
  if (!width || !height || !targetRect.width || !targetRect.height) return;

  // Four independent scrims leave a real hit-test hole over the existing QCC button.
  const holePadding = 12;
  const hole = {
    left: Math.max(0, targetRect.left - overlayRect.left - holePadding),
    top: Math.max(0, targetRect.top - overlayRect.top - holePadding),
    right: Math.min(width, targetRect.right - overlayRect.left + holePadding),
    bottom: Math.min(height, targetRect.bottom - overlayRect.top + holePadding),
  };
  const regions = {
    top: { left: 0, top: 0, width, height: hole.top },
    left: { left: 0, top: hole.top, width: hole.left, height: hole.bottom - hole.top },
    right: { left: hole.right, top: hole.top, width: width - hole.right, height: hole.bottom - hole.top },
    bottom: { left: 0, top: hole.bottom, width, height: height - hole.bottom },
  };
  qccTutorialShields.forEach((shield) => {
    const rect = regions[shield.dataset.region];
    shield.style.left = `${rect.left}px`;
    shield.style.top = `${rect.top}px`;
    shield.style.width = `${Math.max(0, rect.width)}px`;
    shield.style.height = `${Math.max(0, rect.height)}px`;
  });

  const buttonX = targetRect.left - overlayRect.left + targetRect.width / 2;
  const buttonTop = targetRect.top - overlayRect.top;
  const buttonBottom = targetRect.bottom - overlayRect.top;
  const copyWidth = qccTutorialCopy.getBoundingClientRect().width;
  const copyHeight = qccTutorialCopy.getBoundingClientRect().height;
  const copyLeft = Math.max(12, Math.min(width - copyWidth - 12, buttonX - copyWidth / 2));
  const roomAbove = buttonTop - copyHeight - 50;
  const roomBelow = height - buttonBottom - copyHeight - 50;
  const copyAbove = roomAbove >= 12 || roomAbove >= roomBelow;
  const copyTop = copyAbove
    ? Math.max(12, buttonTop - copyHeight - 50)
    : Math.min(height - copyHeight - 12, buttonBottom + 50);
  qccTutorialCopy.style.left = `${copyLeft}px`;
  qccTutorialCopy.style.top = `${copyTop}px`;

  const startX = Math.max(copyLeft + 36, Math.min(copyLeft + copyWidth - 36, buttonX));
  const startY = copyAbove ? copyTop + copyHeight + 3 : copyTop - 3;
  const endY = copyAbove ? buttonTop - 4 : buttonBottom + 4;
  const bendY = (startY + endY) / 2;
  qccTutorialArrowPath.setAttribute('d', `M ${startX} ${startY} C ${startX} ${bendY}, ${buttonX} ${bendY}, ${buttonX} ${endY}`);
  qccTutorialArrow.setAttribute('viewBox', `0 0 ${width} ${height}`);
}

function hideQccTutorial() {
  qccTutorialOverlay.hidden = true;
  gameShell.classList.remove('is-qcc-tutorial');
  qccButton.removeAttribute('aria-describedby');
}

function maybeShowQccTutorial() {
  const qccReady = isQccDeckUnlocked()
    && state.qccCount > 0
    && state.currentPaletteTheme !== null
    && state.currentSelectedColorIndices.length === CONFIG.CARD_PAIRS;
  if (state.phase !== 'playing'
    || state.distance >= CONFIG.QCC_TUTORIAL_DISTANCE
    || state.hasEverUsedQcc
    || state.qccTutorialShown
    || !qccReady) return false;

  state.qccTutorialShown = true;
  state.phase = 'qccTutorial';
  qccTutorialOverlay.hidden = false;
  gameShell.classList.add('is-qcc-tutorial');
  qccButton.setAttribute('aria-describedby', 'qccTutorialTitle qccTutorialCopy');
  syncCardState();
  updateQccUI();
  positionQccTutorial();
  qccButton.focus({ preventScroll: true });
  return true;
}

function updateQccUI() {
  const lockedByDeck = !isQccDeckUnlocked();
  qccCount.textContent = `×${state.qccCount}`;
  qccLock.hidden = !lockedByDeck;
  qccButton.classList.toggle('is-locked', lockedByDeck);
  qccButton.disabled = !canUseQcc();
  qccButton.setAttribute('aria-label', `QCC 道具，剩餘 ${state.qccCount} 個${lockedByDeck ? '，目前鎖定' : ''}`);
}

function monsterSpeedBeforeCap() {
  if (state.monsterStunRemaining > 0) return 0;

  const elapsedGrowthSteps = Math.floor(state.elapsed / CONFIG.MONSTER_SPEED_GROWTH_INTERVAL_SECONDS);
  const qccSlowdown = state.qccPermanentSlowTotal;
  const matchSlowdown = state.matchedPairCount * CONFIG.MATCH_MONSTER_SLOW;
  const comboPermanentSlow = state.comboPermanentSlowTotal;
  const monsterBaseSpeed = CONFIG.PLAYER_BASE_SPEED
    + CONFIG.MONSTER_BASE_OFFSET_X
    + elapsedGrowthSteps * CONFIG.MONSTER_SPEED_GROWTH_Y;
  return Math.max(0, monsterBaseSpeed - comboPermanentSlow - matchSlowdown - qccSlowdown);
}

function monsterSpeed() {
  if (state.monsterStunRemaining > 0) return 0;
  return Math.min(CONFIG.MONSTER_SPEED_CAP, monsterSpeedBeforeCap());
}

function applyQccSpeedReduction() {
  const currentMonsterSpeed = monsterSpeed();
  if (currentMonsterSpeed <= 100) return 0;

  const targetMonsterSpeed = 100 + (currentMonsterSpeed - 100) / 2;
  // Account for any overshoot hidden by the final cap so the visible speed
  // lands exactly on the target after this persistent offset is applied.
  const reduction = Math.max(0, monsterSpeedBeforeCap() - targetMonsterSpeed);
  state.qccPermanentSlowTotal += reduction;
  return reduction;
}

function renderChasePosition() {
  // Measure the actual runway every frame so desktop, mobile, and resize all use the same track.
  const trackWidth = Math.max(1, track.getBoundingClientRect().width);
  const playerX = trackWidth * 0.75;
  const maxMonsterX = trackWidth * 0.25;
  const normalizedDistance = Math.max(0, Math.min(1, state.distance / CONFIG.MAX_DISTANCE));

  // The linear distance map puts the monster center at 25%, 50%, and 75%.
  const mappedFrontX = playerX - normalizedDistance * (playerX - maxMonsterX);
  // Near zero, move the center back by the measured art-edge gap so distance 0
  // ends with the monster touching the runner's trailing scarf instead of overlapping centers.
  const collisionEase = (1 - normalizedDistance) ** 4;
  const collisionOffset = Math.min(hero.offsetWidth, monster.offsetWidth) * CONFIG.VISUAL_COLLISION_OFFSET_RATIO;
  const monsterCenterX = mappedFrontX - collisionEase * collisionOffset;
  monster.style.setProperty('--monster-x', `${monsterCenterX.toFixed(2)}px`);
  chaseStage.classList.toggle('danger-near', state.distance < CONFIG.DANGER_DISTANCE);
}

function updateMonsterStun(dt) {
  if (state.monsterStunRemaining <= 0) return;
  state.monsterStunRemaining = Math.max(0, state.monsterStunRemaining - dt);
  if (state.monsterStunRemaining === 0) gameShell.classList.remove('is-monster-stunned');
}

function updateDistance(dt) {
  if (state.phase !== 'playing' && state.phase !== 'boardClearStun') return;
  const playerCurrentSpeed = CONFIG.PLAYER_BASE_SPEED;
  const monsterCurrentSpeed = monsterSpeed();
  state.distance += (playerCurrentSpeed - monsterCurrentSpeed) * dt;
  state.distance = Math.max(CONFIG.LOSE_DISTANCE, Math.min(CONFIG.MAX_DISTANCE, state.distance));
  const runCycle = 0.82;
  gameShell.style.setProperty('--run-cycle', `${runCycle.toFixed(2)}s`);
  if (state.distance <= CONFIG.LOSE_DISTANCE) endGame();
}

function completeDeck() {
  if (state.phase !== 'playing') return;
  const shouldPlayDangerTransition = state.deckIndex + 1 === CONFIG.DANGER_TRANSITION_TRIGGER_DECK
    && !state.hasShownDangerTransition;
  state.phase = shouldPlayDangerTransition ? 'boardClearStun' : 'roundClear';
  state.monsterStunPending = !shouldPlayDangerTransition;
  if (shouldPlayDangerTransition) {
    state.hasShownDangerTransition = true;
    state.monsterStunRemaining = CONFIG.MONSTER_STUN_DURATION;
    gameShell.classList.add('is-monster-stunned');
  }
  gameShell.classList.remove('is-previewing');
  syncCardState();
  updateQccUI();
  updateMatchUI();
  showFeedback('配對完成！', 'big');

  if (shouldPlayDangerTransition) {
    const token = ++state.phaseToken;
    if (state.boardClearStunTimer !== null) window.clearTimeout(state.boardClearStunTimer);
    state.boardClearStunTimer = window.setTimeout(
      () => finishBoardClearStunBeforeDanger(token),
      CONFIG.MONSTER_STUN_DURATION * 1000,
    );
    return;
  }

  if (state.roundClearTimer !== null) window.clearTimeout(state.roundClearTimer);
  const token = ++state.phaseToken;
  state.roundClearTimer = window.setTimeout(() => finishRoundClear(token), CONFIG.ROUND_CLEAR_DELAY_MS);
}

function finishRoundClear(token) {
  if (state.phase !== 'roundClear' || token !== state.phaseToken) return;
  state.roundClearTimer = null;
  advanceToNextDeck();
}

function advanceToNextDeck() {
  state.deckIndex += 1;
  grantQccForEnteredDeck(state.deckIndex + 1);
  state.matchedPairs = 0;
  state.flipped = [];
  createDeck();
  startPreview(true);
}

function finishBoardClearStunBeforeDanger(token) {
  if (state.phase !== 'boardClearStun' || token !== state.phaseToken) return;
  state.boardClearStunTimer = null;
  state.monsterStunRemaining = 0;
  gameShell.classList.remove('is-monster-stunned');
  beginDangerTransition();
}

function beginDangerTransition() {
  state.phase = 'dangerTransition';
  clearFeedback();
  syncCardState();
  updateQccUI();
  dangerTransition.hidden = false;
  dangerTape.style.setProperty('--danger-enter-duration', `${CONFIG.DANGER_ENTER_DURATION}s`);
  dangerTape.style.setProperty('--danger-exit-duration', `${CONFIG.DANGER_EXIT_DURATION}s`);
  dangerTransition.classList.remove('is-entering', 'is-holding', 'is-exiting');
  gameShell.classList.add('is-danger-transition');
  // Restart the CSS entrance cleanly in case the player replayed after Restart.
  void dangerTape.offsetWidth;
  dangerTransition.classList.add('is-entering');

  const token = ++state.phaseToken;
  if (state.dangerTransitionTimer !== null) window.clearTimeout(state.dangerTransitionTimer);
  state.dangerTransitionTimer = window.setTimeout(
    () => holdDangerTransition(token),
    CONFIG.DANGER_ENTER_DURATION * 1000,
  );
}

function holdDangerTransition(token) {
  if (state.phase !== 'dangerTransition' || token !== state.phaseToken) return;
  state.dangerTransitionTimer = null;
  dangerTransition.classList.remove('is-entering');
  dangerTransition.classList.add('is-holding');
  state.dangerTransitionTimer = window.setTimeout(
    () => exitDangerTransition(token),
    CONFIG.DANGER_HOLD_DURATION * 1000,
  );
}

function exitDangerTransition(token) {
  if (state.phase !== 'dangerTransition' || token !== state.phaseToken) return;
  state.dangerTransitionTimer = null;
  dangerTransition.classList.remove('is-holding');
  dangerTransition.classList.add('is-exiting');
  state.dangerTransitionTimer = window.setTimeout(
    () => finishDangerTransition(token),
    CONFIG.DANGER_EXIT_DURATION * 1000,
  );
}

function finishDangerTransition(token) {
  if (state.phase !== 'dangerTransition' || token !== state.phaseToken) return;
  state.dangerTransitionTimer = null;
  dangerTransition.hidden = true;
  dangerTransition.classList.remove('is-entering', 'is-holding', 'is-exiting');
  gameShell.classList.remove('is-danger-transition');
  advanceToNextDeck();
}

function grantQccForEnteredDeck(internalDeckNumber) {
  const rewardOffset = internalDeckNumber - CONFIG.QCC_FIRST_REWARD_DECK;
  if (rewardOffset < 0 || rewardOffset % CONFIG.QCC_GRANT_INTERVAL !== 0) return;
  if (state.lastQccRewardDeck === internalDeckNumber) return;

  state.lastQccRewardDeck = internalDeckNumber;
  state.qccCount = Math.min(CONFIG.QCC_MAX_COUNT, state.qccCount + 1);
  updateQccUI();
}

function startPreview(renderNewDeck = false) {
  state.phase = 'preview';
  clearFeedback();
  gameShell.classList.add('is-previewing');
  if (renderNewDeck) renderDeck();
  else syncCardState();

  $('#sceneMessage').textContent = '記住顏色與位置，準備甩開追兵！';
  $('#memoryHint').textContent = '3 秒內記住 12 張牌的顏色與位置。';
  $('#boardFooterText').textContent = '所有卡片蓋回後，找到六組相同的顏色。';
  $('#chaseTip').textContent = `記住顏色與位置 · ${CONFIG.PREVIEW_DURATION} 秒後開始`;
  updateQccUI();

  if (state.previewTimer !== null) window.clearTimeout(state.previewTimer);
  const token = ++state.phaseToken;
  state.previewTimer = window.setTimeout(() => finishPreview(token), CONFIG.PREVIEW_DURATION * 1000);
}

function finishPreview(token) {
  if (state.phase !== 'preview' || token !== state.phaseToken) return;
  state.previewTimer = null;
  state.phase = 'playing';
  gameShell.classList.remove('is-previewing');
  if (state.monsterStunPending) {
    state.monsterStunPending = false;
    state.monsterStunRemaining = CONFIG.MONSTER_STUN_DURATION;
    gameShell.classList.add('is-monster-stunned');
  }
  if (maybeShowQccTutorial()) return;
  syncCardState();
  updateQccUI();
  $('#sceneMessage').textContent = '連續配對會拖慢怪物，完成牌組還能讓牠暈眩！';
  $('#memoryHint').textContent = '一次翻開兩張；連續配對會持續拖慢追兵。';
  $('#boardFooterText').textContent = '連續配對會持續拖慢追兵；清盤後怪物暈眩 0.5 秒。';
  $('#chaseTip').textContent = '連續配對會持續拖慢追兵 · 配錯會中斷 Combo';
  const firstCard = cardGrid.querySelector('.memory-card:not(:disabled)');
  if (firstCard) firstCard.focus({ preventScroll: true });
}

function useQcc() {
  const fromTutorial = state.phase === 'qccTutorial';
  const qccReady = isQccDeckUnlocked()
    && state.qccCount > 0
    && state.currentPaletteTheme !== null
    && state.currentSelectedColorIndices.length === CONFIG.CARD_PAIRS;
  if (!qccReady || (!fromTutorial && !canUseQcc())) return;

  applyQccSpeedReduction();
  state.distance = Math.max(state.distance, 132);

  state.qccCount -= 1;
  state.hasEverUsedQcc = true;
  state.combo = 0;
  state.matchedPairs = 0;
  state.flipped = [];
  if (state.mismatchTimer !== null) window.clearTimeout(state.mismatchTimer);
  state.mismatchTimer = null;
  state.runToken += 1;

  if (fromTutorial) {
    hideQccTutorial();
  }

  updateComboUI(false);
  updateMatchUI();
  updateQccUI();
  clearFeedback();

  qccFlash.classList.remove('is-visible');
  qccFlash.textContent = '';
  void qccFlash.offsetWidth;
  qccFlash.textContent = 'EYE++';
  qccFlash.classList.add('is-visible');
  $('#sceneMessage').textContent = 'EYE++ · 色彩辨識升級！';

  state.phase = 'qccTransition';
  gameShell.classList.add('is-qcc-transitioning');
  gameShell.classList.remove('is-previewing');
  syncCardState();
  updateQccUI();

  if (state.qccTransitionTimer !== null) window.clearTimeout(state.qccTransitionTimer);
  const token = ++state.phaseToken;
  state.qccTransitionTimer = window.setTimeout(() => finishQccTransition(token), CONFIG.QCC_TRANSITION_DURATION_MS);
}

function finishQccTransition(token) {
  if (state.phase !== 'qccTransition' || token !== state.phaseToken) return;
  state.qccTransitionTimer = null;
  const theme = state.currentPaletteTheme;
  const selectedColorIndices = [...state.currentSelectedColorIndices];
  gameShell.classList.remove('is-qcc-transitioning');
  state.matchedPairs = 0;
  state.flipped = [];
  createDeck({ theme, variant: 'clear', selectedColorIndices });
  startPreview(true);
}

function updateMatchUI() {
  $('#matchedValue').innerHTML = `${state.matchedPairs} <small>/ ${CONFIG.CARD_PAIRS} 對</small>`;
}

function updateDistanceUI() {
  const shownDistance = Math.max(0, Math.round(state.distance));
  if (shownDistance === state.lastDistanceShown) return;
  $('#distanceValue').innerHTML = `${shownDistance}<span>m</span>`;
  state.lastDistanceShown = shownDistance;
}

function updateSpeedUI() {
  const shownSpeed = monsterSpeed().toFixed(1);
  if (shownSpeed === state.lastSpeedShown) return;
  $('#speedValue').textContent = shownSpeed;
  state.lastSpeedShown = shownSpeed;
}

function frame(timestamp) {
  if (state.previousTime === 0) state.previousTime = timestamp;
  const elapsedSinceFrame = Math.max(0, (timestamp - state.previousTime) / 1000);
  const dt = Math.min(0.05, elapsedSinceFrame);
  state.previousTime = timestamp;
  // A timeout can change phase while RAF is throttled. Never apply that frozen gap as playing physics.
  const phaseChangedSinceFrame = state.lastFramePhase !== state.phase;
  state.lastFramePhase = state.phase;
  const playingDt = phaseChangedSinceFrame ? 0 : dt;

  // Monster growth uses elapsed playing time; previews and transitions do not grow or move it.
  const chaseIsActive = state.phase === 'playing' || state.phase === 'boardClearStun';
  if (chaseIsActive) {
    state.elapsed += playingDt;
    updateDistance(playingDt);
    if (state.phase === 'playing') maybeShowQccTutorial();
    // The third-deck cutscene stun is timer-controlled; regular post-preview stuns
    // continue to use the normal playing-phase countdown.
    if (state.phase === 'playing') updateMonsterStun(playingDt);
    const displayedTenths = Math.floor(state.elapsed * 10);
    if (displayedTenths !== state.lastTimeShown) {
      $('#timeValue').innerHTML = `${(displayedTenths / 10).toFixed(1)}<span>s</span>`;
      state.lastTimeShown = displayedTenths;
    }
  }
  // Distance is only integrated above while playing; positions and the readout
  // render from that one state on every animation frame, including frozen phases.
  renderChasePosition();
  updateDistanceUI();
  updateSpeedUI();
  state.animationFrame = window.requestAnimationFrame(frame);
}

function endGame() {
  if (state.phase === 'gameOver') return;
  state.phase = 'gameOver';
  clearTimers();
  state.monsterStunRemaining = 0;
  state.monsterStunPending = false;
  gameShell.classList.remove('is-running', 'is-monster-stunned', 'is-previewing', 'is-qcc-transitioning');
  hideQccTutorial();
  gameShell.classList.remove('is-danger-transition');
  dangerTransition.hidden = true;
  dangerTransition.classList.remove('is-entering', 'is-holding', 'is-exiting');
  gameShell.classList.add('is-caught');
  disableCards(true);
  updateQccUI();
  $('#finalTime').textContent = `${state.elapsed.toFixed(1)} 秒`;
  $('#finalCombo').textContent = String(state.bestCombo);
  gameOverOverlay.hidden = false;
  $('#restartButton').focus({ preventScroll: true });
}

function clearTimers() {
  state.phaseToken += 1;
  state.runToken += 1;
  state.feedbackToken += 1;
  if (state.mismatchTimer !== null) window.clearTimeout(state.mismatchTimer);
  if (state.previewTimer !== null) window.clearTimeout(state.previewTimer);
  if (state.roundClearTimer !== null) window.clearTimeout(state.roundClearTimer);
  if (state.boardClearStunTimer !== null) window.clearTimeout(state.boardClearStunTimer);
  if (state.dangerTransitionTimer !== null) window.clearTimeout(state.dangerTransitionTimer);
  if (state.qccTransitionTimer !== null) window.clearTimeout(state.qccTransitionTimer);
  if (state.feedbackTimer !== null) window.clearTimeout(state.feedbackTimer);
  state.mismatchTimer = null;
  state.previewTimer = null;
  state.roundClearTimer = null;
  state.boardClearStunTimer = null;
  state.dangerTransitionTimer = null;
  state.qccTransitionTimer = null;
  state.feedbackTimer = null;
}

function restartGame() {
  clearTimers();
  Object.assign(state, {
    phase: 'idle',
    deckIndex: 0,
    elapsed: 0,
    distance: Math.min(CONFIG.INITIAL_DISTANCE, CONFIG.MAX_DISTANCE),
    combo: 0,
    comboPermanentSlowTotal: 0,
    bestCombo: 0,
    matchedPairs: 0,
    matchedPairCount: 0,
    hasShownDangerTransition: false,
    flipped: [],
    monsterStunRemaining: 0,
    monsterStunPending: false,
    currentPaletteTheme: null,
    currentSelectedColorIndices: [],
    currentPaletteVariant: null,
    qccCount: CONFIG.QCC_INITIAL_COUNT,
    qccPermanentSlowTotal: 0,
    hasEverUsedQcc: false,
    qccTutorialShown: false,
    lastQccRewardDeck: 0,
    previousTime: 0,
    lastFramePhase: 'idle',
    lastTimeShown: -1,
    lastDistanceShown: null,
    lastSpeedShown: null,
  });
  gameShell.classList.remove('is-running', 'is-monster-stunned', 'is-caught', 'is-previewing', 'is-qcc-transitioning');
  gameShell.classList.remove('is-danger-transition');
  hideQccTutorial();
  dangerTransition.hidden = true;
  dangerTransition.classList.remove('is-entering', 'is-holding', 'is-exiting');
  qccFlash.classList.remove('is-visible');
  qccFlash.textContent = '';
  gameShell.style.removeProperty('--run-cycle');
  gameOverOverlay.hidden = true;
  startPanel.hidden = false;
  $('#timeValue').innerHTML = '0.0<span>s</span>';
  $('#sceneMessage').textContent = '記住顏色與位置，準備甩開追兵！';
  $('#memoryHint').textContent = '開始後先用 3 秒記住全牌顏色與位置，接著配對。';
  $('#boardFooterText').textContent = '連續配對會持續拖慢追兵；清盤後怪物暈眩 0.5 秒。';
  $('#chaseTip').textContent = `記住顏色與位置 · ${CONFIG.PREVIEW_DURATION} 秒後開始`;
  feedback.textContent = '';
  feedback.className = 'feedback';
  updateComboUI(false);
  updateQccUI();
  renderChasePosition();
  createDeck();
  renderDeck();
  updateDistanceUI();
  updateSpeedUI();
  if (state.animationFrame === null) state.animationFrame = window.requestAnimationFrame(frame);
}

function disableCards(disabled) {
  cardGrid.querySelectorAll('.memory-card').forEach((button) => {
    button.disabled = disabled || button.classList.contains('is-matched');
  });
}

function beginGame() {
  if (state.phase !== 'idle') return;
  state.previousTime = 0;
  startPanel.hidden = true;
  gameShell.classList.add('is-running');
  createDeck();
  startPreview(true);
}

function showFeedback(message, kind) {
  if (state.feedbackTimer !== null) window.clearTimeout(state.feedbackTimer);
  feedback.textContent = message;
  feedback.className = `feedback is-visible ${kind === 'good' ? 'is-good' : kind === 'wrong' ? 'is-wrong' : 'is-big'}`;
  const token = ++state.feedbackToken;
  state.feedbackTimer = window.setTimeout(() => {
    if (token !== state.feedbackToken) return;
    feedback.classList.remove('is-visible');
    state.feedbackTimer = null;
  }, kind === 'big' ? 1000 : 720);
}

function clearFeedback() {
  if (state.feedbackTimer !== null) window.clearTimeout(state.feedbackTimer);
  state.feedbackTimer = null;
  state.feedbackToken += 1;
  feedback.textContent = '';
  feedback.className = 'feedback';
}

cardGrid.addEventListener('click', (event) => {
  const button = event.target.closest('.memory-card');
  if (!button || button.disabled) return;
  flipCard(button, Number(button.dataset.index));
});

startButton.addEventListener('click', beginGame);
$('#restartButton').addEventListener('click', restartGame);
qccButton.addEventListener('click', useQcc);
document.addEventListener('keydown', (event) => {
  if (state.phase !== 'qccTutorial') return;
  if (event.key === 'Tab') {
    event.preventDefault();
    qccButton.focus({ preventScroll: true });
  } else if (event.key === 'Escape') {
    event.preventDefault();
  }
});
window.addEventListener('resize', positionQccTutorial);

createDeck();
renderDeck();
updateComboUI(false);
updateMatchUI();
updateQccUI();
$('#chaseTip').textContent = `記住顏色與位置 · ${CONFIG.PREVIEW_DURATION} 秒後開始`;
renderChasePosition();
updateDistanceUI();
updateSpeedUI();
state.animationFrame = window.requestAnimationFrame(frame);
