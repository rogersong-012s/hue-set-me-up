// 調整手感與預覽時間時，優先從這裡修改數值。
const CONFIG = {
  BGM_VOLUME: 1.0, // Main background music volume (0–1).
  DANGER_ALERT_SFX_DELAY: -0.25, // Seconds after the danger entrance completes.
  DANGER_ALERT_SFX_VOLUME: 0.4,
  BGM_NORMAL_PLAYBACK_RATE: 1.0,
  BGM_POST_DANGER_PLAYBACK_RATE: 1.08,
  BGM_DANGER_DISTANCE_PLAYBACK_RATE: 1.3,
  PLAYER_BASE_SPEED: 100,
  // The final monster effective speed is capped after growth and all slow effects are applied.
  MONSTER_BASE_OFFSET_X: 3,
  MONSTER_SPEED_GROWTH_Y: 0.35,
  MONSTER_SPEED_GROWTH_INTERVAL_SECONDS: 1,
  // Every 10 seconds of active card play, future monster growth steps get larger.
  MONSTER_GROWTH_SCALE_INTERVAL: 10,
  MONSTER_SPEED_GROWTH_Y_STEP: 0.02,
  MONSTER_SPEED_CAP: 120, // Final effective speed cap, not a base-speed cap.
  COMBO_MONSTER_SLOW_UNIT: 0.05,
  // Permanent slow for a matched pair; dangerous-distance matches apply the configured multiplier.
  MATCH_MONSTER_SLOW: 0.3,
  DANGER_MATCH_SLOW_MULTIPLIER: 1.5,
  MONSTER_STUN_DURATION: 0.5,
  INITIAL_DISTANCE: 132,
  LOSE_DISTANCE: 0,
  // 追逐位置與距離共用同一個上限；怪物遠端錨點在跑道 25%。
  MAX_DISTANCE: 300,
  // Calibrated for the 1.3x right-anchored monster image: at distance 0, its right edge meets the runner's left edge.
  VISUAL_COLLISION_OFFSET_RATIO: 0.866,

  // 預覽期間會暫停計時與相對距離更新；改這個值即可調整每副牌的記憶時間。
  PREVIEW_DURATION: 3,
  ROUND_CLEAR_DELAY_MS: 500,
  WRONG_CARD_REVEAL_MS: 760,
  CARD_PAIRS: 6,

  // New decks use subtle; QCC swaps to clear while preserving the selected color indices.
  PALETTE_VARIANT: 'subtle',
  DANGER_DISTANCE: 70,
  QCC_TUTORIAL_DISTANCE: 70,
  QCC_TUTORIAL_OVERLAY_OPACITY: 0.6,

  QCC_INITIAL_COUNT: 1,
  QCC_MAX_COUNT: 2,
  QCC_UNLOCK_DECK: 4,
  // Active-play seconds after unlock before the next new deck becomes a QCC reward board.
  QCC_BOARD_RECHARGE_INTERVAL: 60,
  QCC_RECHARGE_CARD_IMAGE: 'assets/card/qcc-bottle.png',
  QCC_RECHARGE_DEBUG: true, // Temporary state-change / 10-second milestone diagnostics.
  QCC_TRANSITION_DURATION_MS: 500,

  // The one-time warning plays after this many completed decks, before the next preview.
  DANGER_TRANSITION_TRIGGER_DECK: 3,
  DANGER_ENTER_DURATION: 0.55,
  DANGER_HOLD_DURATION: 1.9,
  DANGER_EXIT_DURATION: 0.55,
};

// One audio instance is reused for the whole run. A relative URL works from
// both file:// and a GitHub Pages project subpath, and preload:none keeps idle silent.
const bgm = new Audio('musics/bgm/hue_set_me_up_bgm_loop.ogg');
bgm.loop = true;
bgm.preload = 'none';
bgm.volume = CONFIG.BGM_VOLUME;
const dangerAlert = new Audio('musics/sfx/danger_alert.ogg');
dangerAlert.loop = false;
dangerAlert.preload = 'auto';
dangerAlert.volume = CONFIG.DANGER_ALERT_SFX_VOLUME;

function resetAudio(audio) {
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers defer seeking until the media metadata is available.
  }
}

function requestAudioPlayback(audio) {
  try {
    const playRequest = audio.play();
    if (playRequest && typeof playRequest.catch === 'function') {
      // Gracefully absorb browser/media rejection rather than leaking an uncaught Promise error.
      playRequest.catch(() => {});
    }
  } catch {
    // Older browsers can also reject synchronously when a media source is unavailable.
  }
}

function startBgm(rate = CONFIG.BGM_NORMAL_PLAYBACK_RATE) {
  resetAudio(bgm);
  bgm.playbackRate = rate;
  bgm.loop = true;
  state.isDangerDistanceBgmActive = false;
  requestAudioPlayback(bgm);
}

function pauseBgm() {
  resetAudio(bgm);
  state.isDangerDistanceBgmActive = false;
}

function stopBgm() {
  resetAudio(bgm);
  bgm.playbackRate = CONFIG.BGM_NORMAL_PLAYBACK_RATE;
  state.isDangerDistanceBgmActive = false;
}

function getBaseBgmPlaybackRate() {
  return state.hasCompletedDangerTransition
    ? CONFIG.BGM_POST_DANGER_PLAYBACK_RATE
    : CONFIG.BGM_NORMAL_PLAYBACK_RATE;
}

function updateBgmPlaybackRateForDistance() {
  if (state.phase === 'dangerTransition' || bgm.paused) return;
  const shouldUseDangerRate = state.distance < CONFIG.DANGER_DISTANCE;
  if (shouldUseDangerRate === state.isDangerDistanceBgmActive) return;
  state.isDangerDistanceBgmActive = shouldUseDangerRate;
  bgm.playbackRate = shouldUseDangerRate
    ? CONFIG.BGM_DANGER_DISTANCE_PLAYBACK_RATE
    : getBaseBgmPlaybackRate();
}

function playDangerAlert() {
  resetAudio(dangerAlert);
  dangerAlert.loop = false;
  requestAudioPlayback(dangerAlert);
}

function stopDangerAlert() {
  resetAudio(dangerAlert);
}

function clearDangerAlertTimer() {
  if (state.dangerAlertSfxTimer !== null) {
    window.clearTimeout(state.dangerAlertSfxTimer);
    state.dangerAlertSfxTimer = null;
  }
}

// 內部索引 0、1、2 各用一組高辨識色；第 4 副牌起改用近似色。
const WARMUP_PALETTES = [
  ['#F04452', '#3478E8', '#F6CE36', '#32A56C', '#8959D8', '#F28A32'],
  ['#B9273E', '#14A5B8', '#F2B900', '#57972C', '#6A36A9', '#E96828'],
  ['#FF315F', '#2866D7', '#A6C928', '#00A878', '#B12BC1', '#F07924'],
];

// 每個色系的 subtle / clear 以陣列索引一一對應；每邊各 12 色。
// 一般新牌使用 subtle；QCC 替換當前牌組時才使用相同索引的 clear。
// clear 刻意拉開明度、飽和度與色相；不要重排陣列，索引就是 QCC 的顏色身份。
const COLOR_PALETTES = {
  pink: {
    subtle: [
      '#F58FA6', '#E97596', '#F4A28B', '#D96F82', '#EC8FAC', '#F2B8A0',
      '#E878AA', '#CC6F8F', '#EEA1BB', '#D88379', '#F0A5A0', '#C85F79',
    ],
    clear: [
      '#720A76', '#F9012A', '#F8A5B3', '#FE06FE', '#760A1F', '#FE1B8C',
      '#FC8DFC', '#D001AE', '#F4627A', '#A1085E', '#F97BBA', '#B80529',
    ],
  },
  peach: {
    subtle: [
      '#EF855E', '#F39B67', '#DA765E', '#FFAD79', '#E98976', '#C97063',
      '#F1B084', '#D98570', '#F7A38A', '#C98161', '#EFA07D', '#DF6D57',
    ],
    clear: [
      '#691D16', '#FDE808', '#EED4AF', '#FD1C08', '#C57A02', '#FC8479',
      '#696216', '#DED063', '#A72002', '#FD7130', '#F9AE71', '#FDB708',
    ],
  },
  nude: {
    subtle: [
      '#C98776', '#DAA08C', '#B97768', '#E5B29B', '#D1907B', '#B98972',
      '#E6AA93', '#C98667', '#D99B78', '#B8767D', '#E4B5AA', '#CA9B87',
    ],
    clear: [
      '#3A2727', '#F4EFDD', '#C14444', '#8E7B2F', '#AB8282', '#7E482A',
      '#D7C888', '#CB8C62', '#716A4B', '#BCB29A', '#581D1D', '#CD7474',
    ],
  },
  mauve: {
    subtle: [
      '#8E78B9', '#A692C7', '#755FA5', '#B59CC7', '#947FAD', '#716690',
      '#A98BB9', '#8370A2', '#C0A0B6', '#9C87D1', '#7D6BBD', '#B398AC',
    ],
    clear: [
      '#630B75', '#3008FD', '#ECA7C9', '#FD0882', '#FD26F6', '#9F8DFC',
      '#FE77DE', '#880145', '#8740E2', '#B805A6', '#1B0490', '#B308FD',
    ],
  },
  sage: {
    subtle: [
      '#789C82', '#8EB18A', '#608D85', '#A0AD76', '#78A69C', '#9DB48C',
      '#6F9278', '#B0B984', '#729E90', '#91AA79', '#65958A', '#ABC2A4',
    ],
    clear: [
      '#29562F', '#26DF26', '#DEF099', '#26DFDF', '#1EB364', '#BADF26',
      '#718717', '#448D8D', '#B7DCC3', '#55AD1A', '#116F17', '#90EEB0',
    ],
  },
};
const PALETTE_THEMES = Object.keys(COLOR_PALETTES);

const state = {
  phase: 'idle', // Normal: preview → playing → roundClear → preview; QCC tutorial pauses Playing.
  deckIndex: 0,
  elapsed: 0,
  // Shared gameplay clock for growth-Y upgrades; advances only in playing.
  activeGameplayTime: 0,
  qccRechargeElapsed: 0,
  qccRechargeLastLoggedMilestone: 0,
  qccRechargeState: 'locked', // locked → counting → pending → boardActive → counting.
  currentBoardHasQccPair: false,
  currentBoardQccPairId: null,
  qccPairMatched: false,
  qccRechargeRefreshPending: false,
  monsterGrowthStepsProcessed: 0,
  monsterGrowthTotal: 0,
  distance: Math.min(CONFIG.INITIAL_DISTANCE, CONFIG.MAX_DISTANCE),
  combo: 0,
  // Cumulative Combo milestone slow for this run; only Restart clears it.
  comboPermanentSlowTotal: 0,
  bestCombo: 0,
  matchedPairs: 0,
  // Lifetime successful pair count; unlike matchedPairs, this survives deck/QCC changes.
  matchedPairCount: 0,
  // Permanent pair slow accumulates per success because danger matches can have a different gain.
  matchPermanentSlowTotal: 0,
  hasShownDangerTransition: false,
  hasCompletedDangerTransition: false,
  isDangerDistanceBgmActive: false,
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
  dangerAlertSfxTimer: null,
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
const shareButton = $('#shareButton');
const shareStatus = $('#shareStatus');
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

const SHARE_IMAGE_WIDTH = 1080;
const SHARE_IMAGE_HEIGHT = 1350;
const SHARE_IMAGE_FILENAME = 'hue-set-me-up-result.png';
const SHARE_TITLE = '我被色記了｜Hue set me up!';
const SHARE_CONFIG = {
  SHARE_TEXT_ENABLED: true,
  SHARE_IMAGE_ENABLED: false,
  // Update this once the public game URL is finalized.
  SHARE_URL: 'https://rogersong-012s.github.io/hue-set-me-up/',
};
let shareInProgress = false;
let gameOverResultSnapshot = null;
let preparedShareFile = null;
let preparedShareBlob = null;
let shareImagePreparing = false;
let shareImageReady = false;

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
  const entries = palette.entries.map((entry) => ({ ...entry, pairType: 'color' }));
  state.currentBoardHasQccPair = false;
  state.currentBoardQccPairId = null;
  state.qccPairMatched = false;

  const shouldCreateQccRechargeBoard = state.qccRechargeState === 'pending'
    && !options.skipQccRechargeBoard;
  if (shouldCreateQccRechargeBoard && entries.length > 0) {
    const qccPairId = Math.floor(Math.random() * entries.length);
    entries[qccPairId] = {
      ...entries[qccPairId],
      pairType: 'qccRecharge',
      image: CONFIG.QCC_RECHARGE_CARD_IMAGE,
    };
    state.qccRechargeState = 'boardActive';
    state.currentBoardHasQccPair = true;
    state.currentBoardQccPairId = qccPairId;
    logQccRecharge(`board activated (pair ${qccPairId + 1})`);
  }

  const deck = entries.flatMap((entry, pairId) => [
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
    if (card.pairType === 'qccRecharge') {
      front.classList.add('card-front--qcc-recharge');
      const image = document.createElement('img');
      image.className = 'qcc-recharge-card-image';
      image.src = card.image;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.draggable = false;
      front.append(image);
    }
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
    const card = state.deck[index];
    const isQccRechargeCard = card?.pairType === 'qccRecharge';
    const matched = button.classList.contains('is-matched');
    button.classList.toggle('is-flipped', previewing && !matched);
    button.disabled = !playable || matched;
    if (matched) {
      button.setAttribute('aria-label', isQccRechargeCard ? '已配對的 QCC 補充卡' : '已配對的顏色卡');
    } else if (previewing) {
      button.setAttribute('aria-label', isQccRechargeCard
        ? `第 ${index + 1} 張，QCC 補充瓶預覽中`
        : `第 ${index + 1} 張，顏色預覽中`);
    } else {
      button.setAttribute('aria-label', `第 ${index + 1} 張，蓋住的顏色卡`);
    }
  });
}

function flipCard(button, index) {
  if (state.phase !== 'playing' || state.flipped.length >= 2) return;
  if (button.classList.contains('is-flipped') || button.classList.contains('is-matched')) return;

  button.classList.add('is-flipped');
  const card = state.deck[index];
  button.setAttribute('aria-label', card.pairType === 'qccRecharge'
    ? `第 ${index + 1} 張，QCC 補充瓶已翻開`
    : `第 ${index + 1} 張，已翻開`);
  state.flipped.push({ button, card });
  if (state.flipped.length === 2) resolveTurn();
}

function resolveTurn() {
  const [first, second] = state.flipped;
  if (first.card.pairId === second.card.pairId && first.card.pairType === second.card.pairType) {
    const isQccRechargeMatch = first.card.pairType === 'qccRecharge'
      && second.card.pairType === 'qccRecharge'
      && state.qccRechargeState === 'boardActive'
      && state.currentBoardHasQccPair
      && first.card.pairId === state.currentBoardQccPairId
      && second.card.pairId === state.currentBoardQccPairId
      && !state.qccPairMatched;
    first.button.classList.add('is-matched');
    second.button.classList.add('is-matched');
    const matchedCardLabel = isQccRechargeMatch ? '已配對的 QCC 補充卡' : '已配對的顏色卡';
    first.button.setAttribute('aria-label', matchedCardLabel);
    second.button.setAttribute('aria-label', matchedCardLabel);
    first.button.disabled = true;
    second.button.disabled = true;
    state.flipped = [];
    state.matchedPairs += 1;
    state.matchedPairCount += 1;
    onSuccessfulMatch();
    if (isQccRechargeMatch) rewardQccRechargePair(first.card.pairId);
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
  const matchSlowMultiplier = state.distance < CONFIG.DANGER_DISTANCE
    ? CONFIG.DANGER_MATCH_SLOW_MULTIPLIER
    : 1;
  state.matchPermanentSlowTotal += CONFIG.MATCH_MONSTER_SLOW * matchSlowMultiplier;

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

function rewardQccRechargePair(pairId) {
  if (!state.currentBoardHasQccPair
    || state.qccRechargeState !== 'boardActive'
    || state.currentBoardQccPairId !== pairId
    || state.qccPairMatched) return;
  state.qccPairMatched = true;
  state.qccCount = Math.min(CONFIG.QCC_MAX_COUNT, state.qccCount + 1);
  updateQccUI();
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
  qccTutorialOverlay.style.setProperty('--qcc-tutorial-overlay-opacity', CONFIG.QCC_TUTORIAL_OVERLAY_OPACITY);
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

  const qccSlowdown = state.qccPermanentSlowTotal;
  const matchSlowdown = state.matchPermanentSlowTotal;
  const comboPermanentSlow = state.comboPermanentSlowTotal;
  const monsterBaseSpeed = CONFIG.PLAYER_BASE_SPEED
    + CONFIG.MONSTER_BASE_OFFSET_X
    + state.monsterGrowthTotal;
  return Math.max(0, monsterBaseSpeed - comboPermanentSlow - matchSlowdown - qccSlowdown);
}

function currentMonsterGrowthY() {
  const growthUpgradeCount = Math.floor(state.activeGameplayTime / CONFIG.MONSTER_GROWTH_SCALE_INTERVAL);
  return CONFIG.MONSTER_SPEED_GROWTH_Y
    + growthUpgradeCount * CONFIG.MONSTER_SPEED_GROWTH_Y_STEP;
}

function updateMonsterGrowthProgress() {
  const reachedGrowthStepCount = Math.floor(state.elapsed / CONFIG.MONSTER_SPEED_GROWTH_INTERVAL_SECONDS);
  while (state.monsterGrowthStepsProcessed < reachedGrowthStepCount) {
    state.monsterGrowthStepsProcessed += 1;
    // Each interval adds the Y value current at that moment; later upgrades never recalculate past steps.
    state.monsterGrowthTotal += currentMonsterGrowthY();
  }
}

function updateQccRechargeTimer(dt) {
  if (dt <= 0) return;
  if (state.qccRechargeState === 'locked') {
    if (!isQccDeckUnlocked()) return;
    startQccRechargeCycle('unlocked');
  }
  if (state.qccRechargeState !== 'counting') return;

  state.qccRechargeElapsed += dt;
  const reachedMilestone = Math.floor(state.qccRechargeElapsed / 10);
  if (reachedMilestone > state.qccRechargeLastLoggedMilestone) {
    state.qccRechargeLastLoggedMilestone = reachedMilestone;
    logQccRecharge(`elapsed: ${reachedMilestone * 10}s`);
  }
  if (state.qccRechargeElapsed >= CONFIG.QCC_BOARD_RECHARGE_INTERVAL) {
    state.qccRechargeElapsed = CONFIG.QCC_BOARD_RECHARGE_INTERVAL;
    state.qccRechargeState = 'pending';
    logQccRecharge(`${CONFIG.QCC_BOARD_RECHARGE_INTERVAL}s reached → pending`);
  }
}

function logQccRecharge(message) {
  if (CONFIG.QCC_RECHARGE_DEBUG && typeof console !== 'undefined') {
    console.info(`[QCC Recharge] ${message}`);
  }
}

function startQccRechargeCycle(reason) {
  state.qccRechargeElapsed = 0;
  state.qccRechargeLastLoggedMilestone = 0;
  state.qccRechargeState = isQccDeckUnlocked() ? 'counting' : 'locked';
  state.currentBoardHasQccPair = false;
  state.currentBoardQccPairId = null;
  state.qccPairMatched = false;
  state.qccRechargeRefreshPending = false;
  if (state.qccRechargeState === 'counting') {
    logQccRecharge(`${reason} → counting`);
  }
}

function updateActiveGameplayTime(dt) {
  if (state.phase !== 'playing' || dt <= 0) return;
  state.activeGameplayTime += dt;
  updateQccRechargeTimer(dt);
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
  // A recharge cycle ends only when the whole reward board has been cleared.
  if (state.qccRechargeState === 'boardActive' && state.currentBoardHasQccPair) {
    startQccRechargeCycle('board resolved');
  }
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
  pauseBgm();
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
  clearDangerAlertTimer();
  const alertDelayMs = (CONFIG.DANGER_ENTER_DURATION + CONFIG.DANGER_ALERT_SFX_DELAY) * 1000;
  let alertTimerId;
  alertTimerId = window.setTimeout(() => {
    if (state.dangerAlertSfxTimer !== alertTimerId) return;
    state.dangerAlertSfxTimer = null;
    if (state.phase !== 'dangerTransition' || token !== state.phaseToken) return;
    playDangerAlert();
  }, alertDelayMs);
  state.dangerAlertSfxTimer = alertTimerId;
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
  clearDangerAlertTimer();
  stopDangerAlert();
  dangerTransition.hidden = true;
  dangerTransition.classList.remove('is-entering', 'is-holding', 'is-exiting');
  gameShell.classList.remove('is-danger-transition');
  state.hasCompletedDangerTransition = true;
  startBgm(CONFIG.BGM_POST_DANGER_PLAYBACK_RATE);
  advanceToNextDeck();
  updateBgmPlaybackRateForDistance();
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
  // Explicitly start the first recharge cycle as soon as the unlocked deck becomes playable.
  // Time still advances only from active playing deltaTime, never during this preview/tutorial transition.
  if (state.qccRechargeState === 'locked' && isQccDeckUnlocked()) {
    startQccRechargeCycle('unlocked');
  }
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

  // Only a currently active recharge board restarts its cycle after refresh.
  // Ordinary QCC refreshes keep both counting progress and pending state intact.
  state.qccRechargeRefreshPending = state.qccRechargeState === 'boardActive'
    && state.currentBoardHasQccPair;

  applyQccSpeedReduction();
  state.distance = Math.max(state.distance, 132);
  updateBgmPlaybackRateForDistance();

  state.qccCount -= 1;
  state.hasEverUsedQcc = true;
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
  const resolvedRechargeBoard = state.qccRechargeRefreshPending;
  gameShell.classList.remove('is-qcc-transitioning');
  state.matchedPairs = 0;
  state.flipped = [];
  createDeck({ theme, variant: 'clear', selectedColorIndices, skipQccRechargeBoard: true });
  if (resolvedRechargeBoard) startQccRechargeCycle('board resolved');
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
    updateActiveGameplayTime(playingDt);
    state.elapsed += playingDt;
    updateMonsterGrowthProgress();
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
  updateBgmPlaybackRateForDistance();
  renderChasePosition();
  updateDistanceUI();
  updateSpeedUI();
  state.animationFrame = window.requestAnimationFrame(frame);
}

function endGame() {
  if (state.phase === 'gameOver') return;
  state.phase = 'gameOver';
  stopBgm();
  clearTimers();
  resetPreparedShare();
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
  gameOverResultSnapshot = {
    survivalTime: `${state.elapsed.toFixed(1)} 秒`,
    bestCombo: String(state.bestCombo),
  };
  $('#finalTime').textContent = gameOverResultSnapshot.survivalTime;
  $('#finalCombo').textContent = gameOverResultSnapshot.bestCombo;
  shareStatus.textContent = '';
  gameOverOverlay.hidden = false;
  updateShareButtonState();
  $('#restartButton').focus({ preventScroll: true });
  if (SHARE_CONFIG.SHARE_IMAGE_ENABLED) {
    void prepareShareImage(gameOverResultSnapshot, state.runToken);
  }
}

function drawShareRoundRect(context, x, y, width, height, radius, fill, stroke = null) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 3;
    context.stroke();
  }
}

function drawShareSparkle(context, x, y, size, color) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.quadraticCurveTo(x + size * 0.18, y - size * 0.18, x + size, y);
  context.quadraticCurveTo(x + size * 0.18, y + size * 0.18, x, y + size);
  context.quadraticCurveTo(x - size * 0.18, y + size * 0.18, x - size, y);
  context.quadraticCurveTo(x - size * 0.18, y - size * 0.18, x, y - size);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function drawShareMonsterIcon(context, centerX, centerY) {
  const x = centerX - 72;
  const y = centerY - 72;
  const face = context.createLinearGradient(x, y, x + 144, y + 144);
  face.addColorStop(0, '#b794f5');
  face.addColorStop(1, '#7753c7');
  drawShareRoundRect(context, x, y, 144, 144, 42, face, '#fffdf5');

  context.fillStyle = '#49336e';
  context.beginPath();
  context.moveTo(centerX - 43, centerY - 51);
  context.lineTo(centerX - 54, centerY - 85);
  context.lineTo(centerX - 18, centerY - 61);
  context.moveTo(centerX + 43, centerY - 51);
  context.lineTo(centerX + 54, centerY - 85);
  context.lineTo(centerX + 18, centerY - 61);
  context.fill();

  context.fillStyle = '#fff4cf';
  context.beginPath();
  context.ellipse(centerX - 27, centerY - 7, 10, 15, -0.12, 0, Math.PI * 2);
  context.ellipse(centerX + 27, centerY - 7, 10, 15, 0.12, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#34264e';
  context.beginPath();
  context.arc(centerX - 25, centerY - 5, 4, 0, Math.PI * 2);
  context.arc(centerX + 25, centerY - 5, 4, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#49336e';
  context.lineWidth = 7;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(centerX - 16, centerY + 30);
  context.quadraticCurveTo(centerX, centerY + 18, centerX + 16, centerY + 30);
  context.stroke();
}

function drawShareStat(context, x, label, value, valueSize = 54) {
  const y = 724;
  const width = 390;
  const height = 250;
  drawShareRoundRect(context, x, y, width, height, 30, '#fffdf5', '#efd7a6');
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#806e88';
  context.font = '700 28px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  context.fillText(label, x + width / 2, y + 67);
  context.fillStyle = '#4f3c6c';
  context.font = `900 ${valueSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
  context.fillText(value, x + width / 2, y + 157, width - 30);
}

function drawShareCard(context, result) {
  const background = context.createLinearGradient(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
  background.addColorStop(0, '#17152b');
  background.addColorStop(0.52, '#29203f');
  background.addColorStop(1, '#493052');
  context.fillStyle = background;
  context.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  context.fillStyle = 'rgba(255, 226, 122, 0.10)';
  context.beginPath();
  context.arc(130, 185, 116, 0, Math.PI * 2);
  context.arc(966, 1128, 168, 0, Math.PI * 2);
  context.fill();
  drawShareSparkle(context, 894, 170, 18, '#ffe27a');
  drawShareSparkle(context, 157, 1075, 14, '#c7a8fa');
  drawShareSparkle(context, 908, 570, 11, '#ffad66');

  context.save();
  context.shadowColor = 'rgba(7, 5, 20, 0.42)';
  context.shadowBlur = 36;
  context.shadowOffsetY = 18;
  drawShareRoundRect(context, 72, 58, 936, 1234, 48, '#fff5df', '#ffe6a4');
  context.restore();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#806e88';
  context.font = '900 24px Arial, sans-serif';
  context.letterSpacing = '0.16em';
  context.fillText('CHASE RESULT', 540, 132);
  context.letterSpacing = '0px';

  context.fillStyle = '#302749';
  context.font = '900 58px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  context.fillText('我被色記了', 540, 208);
  context.fillStyle = '#806e88';
  context.font = '700 30px Arial, sans-serif';
  context.fillText('Hue set me up!', 540, 255);

  context.strokeStyle = '#ecd8aa';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(206, 296);
  context.lineTo(874, 296);
  context.stroke();

  drawShareMonsterIcon(context, 540, 399);
  context.fillStyle = '#302749';
  context.font = '1000 72px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  context.fillText('被追上了！', 540, 542);
  context.fillStyle = '#806e88';
  context.font = '700 30px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  context.fillText('喘口氣，再挑戰一次吧。', 540, 600);

  drawShareStat(context, 132, '生存時間', result.survivalTime, 48);
  drawShareStat(context, 558, '最高 Combo', result.bestCombo, result.bestCombo.length > 4 ? 58 : 70);

  context.fillStyle = '#493052';
  context.font = '800 28px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  context.fillText('我被追上了，你能撐多久？', 540, 1054);
  drawShareRoundRect(context, 330, 1110, 420, 64, 32, '#ffe9be');
  context.fillStyle = '#6e527f';
  context.font = '900 22px Arial, sans-serif';
  context.fillText('HUE MEMORY  ·  CHASE', 540, 1142);
  drawShareSparkle(context, 279, 1142, 10, '#b794f5');
  drawShareSparkle(context, 801, 1142, 10, '#ffad66');
}

function createSharePngBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas.toBlob is unavailable.'));
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas PNG export returned no Blob.'));
        return;
      }
      if (blob.type !== 'image/png') {
        reject(new Error(`Canvas returned unexpected image type: ${blob.type || '(empty)'}`));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function generateShareImageBlob(result) {
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  drawShareCard(context, result);
  return createSharePngBlob(canvas);
}

function createShareFile(blob) {
  if (!(blob instanceof Blob) || blob.type !== 'image/png') {
    throw new Error('Share image must be an image/png Blob.');
  }
  if (typeof File !== 'function') {
    throw new Error('The File constructor is unavailable.');
  }

  const file = new File([blob], SHARE_IMAGE_FILENAME, {
    type: 'image/png',
    lastModified: Date.now(),
  });
  if (!(file instanceof File) || file.type !== 'image/png') {
    throw new Error('Could not create a valid PNG File for sharing.');
  }
  return file;
}

function downloadShareImage(blob) {
  const imageUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = SHARE_IMAGE_FILENAME;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1500);
}

function setShareStatus(message, runToken) {
  if (state.phase === 'gameOver' && state.runToken === runToken) {
    shareStatus.textContent = message;
  }
}

function resetPreparedShare() {
  preparedShareFile = null;
  preparedShareBlob = null;
  shareImagePreparing = false;
  shareImageReady = false;
}

function updateShareButtonState() {
  const shareEnabled = isShareEnabled();
  shareButton.hidden = !shareEnabled;
  shareButton.disabled = !shareEnabled
    || state.phase !== 'gameOver'
    || shareInProgress
    || (SHARE_CONFIG.SHARE_IMAGE_ENABLED && shareImagePreparing);
  shareButton.textContent = shareInProgress
    ? '分享中…'
    : shareImagePreparing
      ? '準備分享…'
      : getShareButtonLabel();
}

async function prepareShareImage(result, runToken) {
  if (!SHARE_CONFIG.SHARE_IMAGE_ENABLED || !result) return;
  preparedShareFile = null;
  preparedShareBlob = null;
  shareImagePreparing = true;
  shareImageReady = false;
  updateShareButtonState();
  setShareStatus('正在準備分享圖片…', runToken);

  try {
    const blob = await generateShareImageBlob(result);
    if (state.runToken !== runToken || state.phase !== 'gameOver') return;
    preparedShareBlob = blob;
    console.info('[Share] PNG blob ready', { type: blob.type, size: blob.size });

    const file = createShareFile(blob);
    if (state.runToken !== runToken || state.phase !== 'gameOver') return;
    preparedShareFile = file;
    shareImageReady = true;
    console.info('[Share] File ready', {
      isFile: file instanceof File,
      name: file.name,
      type: file.type,
      size: file.size,
    });
    setShareStatus('', runToken);
  } catch (error) {
    if (state.runToken !== runToken || state.phase !== 'gameOver') return;
    console.error('[Share] image preparation failed', error);
    setShareStatus(
      SHARE_CONFIG.SHARE_TEXT_ENABLED
        ? '圖片準備失敗，仍可分享文字與網址'
        : '分享圖片準備失敗',
      runToken,
    );
  } finally {
    if (state.runToken === runToken && state.phase === 'gameOver') {
      shareImagePreparing = false;
      updateShareButtonState();
    }
  }
}

function isMobileShareClient() {
  const userAgentMobile = navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    && (window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(any-pointer: coarse)').matches);
  const hasCoarseTouchInput = Number(navigator.maxTouchPoints) > 0 && hasCoarsePointer;
  return userAgentMobile || hasCoarseTouchInput;
}

function getShareButtonLabel() {
  if (!isShareEnabled()) return '分享已停用';
  if (SHARE_CONFIG.SHARE_IMAGE_ENABLED) {
    if (isMobileShareClient() && SHARE_CONFIG.SHARE_TEXT_ENABLED) return '分享';
    if (!isMobileShareClient() && SHARE_CONFIG.SHARE_TEXT_ENABLED) return '下載圖片並複製';
    return isMobileShareClient() ? '分享圖片' : '下載圖片';
  }
  return isMobileShareClient() ? '分享' : '複製分享內容';
}

function isShareEnabled() {
  return SHARE_CONFIG.SHARE_TEXT_ENABLED || SHARE_CONFIG.SHARE_IMAGE_ENABLED;
}

function checkCanShare(shareData, payloadName) {
  if (typeof navigator.canShare !== 'function') {
    console.info(`[Share] navigator.canShare unavailable for ${payloadName}`);
    return null;
  }
  try {
    const canShare = navigator.canShare(shareData);
    console.info(`[Share] canShare ${payloadName}:`, canShare);
    return canShare;
  } catch (error) {
    console.info(`[Share] canShare ${payloadName} threw`, error);
    return false;
  }
}

function buildShareText(result) {
  return `我在《我被色記了》撐了 ${result.survivalTime}！\n最高 Combo：${result.bestCombo}\n\n你能撐多久？`;
}

function buildShareData(result, file = null) {
  const canIncludeFile =
    SHARE_CONFIG.SHARE_IMAGE_ENABLED &&
    typeof File === 'function' &&
    file instanceof File;
  const includeText = SHARE_CONFIG.SHARE_TEXT_ENABLED;
  const data = {
    ...(canIncludeFile ? { files: [file] } : {}),
    ...(includeText
      ? {
          title: SHARE_TITLE,
          text: buildShareText(result),
          url: SHARE_CONFIG.SHARE_URL,
        }
      : SHARE_CONFIG.SHARE_IMAGE_ENABLED
        ? { title: SHARE_TITLE }
        : {}),
  };
  return data;
}

function buildShareClipboardText(result) {
  return `${buildShareText(result)}\n\n${SHARE_CONFIG.SHARE_URL}`;
}

function writeShareTextToClipboard(text) {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    return Promise.resolve(false);
  }

  try {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

async function callNativeShare(shareData, runToken, payloadName) {
  console.info('[Share] invoking navigator.share', payloadName);
  try {
    await navigator.share(shareData);
    console.info('[Share] success', payloadName);
    setShareStatus('分享完成', runToken);
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.info('[Share] cancelled');
      setShareStatus('', runToken);
      return;
    }
    console.error('[Share] navigator.share failed', error);
    setShareStatus('分享未完成，請再試一次', runToken);
  }
}

function logShareDiagnostics(file, canShareFiles, canShareFullPayload) {
  console.info('[Share] diagnostics', {
    browser: navigator.userAgent,
    fileType: file?.type ?? null,
    fileSize: file?.size ?? null,
    canShareFiles,
    canShareFullPayload,
  });
}

async function handleShareClick() {
  if (state.phase !== 'gameOver' || shareInProgress || !gameOverResultSnapshot) return;
  if (!isShareEnabled()) {
    updateShareButtonState();
    setShareStatus('分享功能目前已停用', state.runToken);
    return;
  }
  if (SHARE_CONFIG.SHARE_IMAGE_ENABLED && shareImagePreparing) return;

  shareInProgress = true;
  const runToken = state.runToken;
  updateShareButtonState();
  shareStatus.textContent = '';

  try {
    const isMobile = isMobileShareClient();
    const hasNativeShare = typeof navigator.share === 'function';

    if (isMobile && hasNativeShare) {
      const textPayload = buildShareData(gameOverResultSnapshot);
      if (SHARE_CONFIG.SHARE_IMAGE_ENABLED && shareImageReady && preparedShareFile) {
        const file = preparedShareFile;
        const canFiles = checkCanShare({ files: [file] }, 'files');
        const fullShareData = buildShareData(gameOverResultSnapshot, file);
        const canFullPayload = checkCanShare(fullShareData, 'full payload');

        if (canFiles === true && canFullPayload === true) {
          await callNativeShare(fullShareData, runToken, 'title + text + url + PNG');
          return;
        }

        logShareDiagnostics(file, canFiles, canFullPayload);
        if (SHARE_CONFIG.SHARE_TEXT_ENABLED) {
          setShareStatus('目前瀏覽器不支援圖片分享，改分享文字與網址', runToken);
          await callNativeShare(textPayload, runToken, 'text + URL fallback');
          return;
        }

        if (preparedShareBlob) {
          downloadShareImage(preparedShareBlob);
          setShareStatus('目前瀏覽器不支援圖片分享，已下載 PNG', runToken);
        } else {
          setShareStatus('目前瀏覽器不支援圖片分享', runToken);
        }
        return;
      }

      if (SHARE_CONFIG.SHARE_TEXT_ENABLED) {
        if (SHARE_CONFIG.SHARE_IMAGE_ENABLED) {
          console.info('[Share] prepared image File unavailable; using text + URL payload');
        }
        await callNativeShare(textPayload, runToken, 'text + URL');
        return;
      }

      if (SHARE_CONFIG.SHARE_IMAGE_ENABLED && preparedShareBlob) {
        downloadShareImage(preparedShareBlob);
        setShareStatus('圖片無法透過 Share API 傳送，已下載 PNG', runToken);
      } else {
        setShareStatus('分享圖片無法使用', runToken);
      }
      return;
    }

    // Preserve the existing desktop / no-Web-Share experience: download the image and copy text.
    if (SHARE_CONFIG.SHARE_IMAGE_ENABLED && preparedShareBlob) {
      downloadShareImage(preparedShareBlob);
    }
    if (SHARE_CONFIG.SHARE_TEXT_ENABLED) {
      const copied = await writeShareTextToClipboard(buildShareClipboardText(gameOverResultSnapshot));
      if (SHARE_CONFIG.SHARE_IMAGE_ENABLED && preparedShareBlob) {
        setShareStatus(copied ? '已下載分享圖；分享文字與網址已複製' : '已下載分享圖，分享文字複製失敗', runToken);
      } else {
        setShareStatus(copied ? '分享文字與網址已複製' : '複製失敗，請確認瀏覽器剪貼簿權限', runToken);
      }
    } else if (SHARE_CONFIG.SHARE_IMAGE_ENABLED && preparedShareBlob) {
      setShareStatus('已下載分享圖', runToken);
    } else {
      setShareStatus('分享圖片無法使用', runToken);
    }
  } catch {
    setShareStatus('分享處理失敗，請再試一次', runToken);
  } finally {
    if (state.runToken === runToken) {
      shareInProgress = false;
      updateShareButtonState();
    }
  }
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
  clearDangerAlertTimer();
  state.qccTransitionTimer = null;
  state.feedbackTimer = null;
  stopDangerAlert();
}

function restartGame() {
  clearTimers();
  stopBgm();
  resetPreparedShare();
  Object.assign(state, {
    phase: 'idle',
    deckIndex: 0,
    elapsed: 0,
    activeGameplayTime: 0,
    qccRechargeElapsed: 0,
    qccRechargeLastLoggedMilestone: 0,
    qccRechargeState: 'locked',
    currentBoardHasQccPair: false,
    currentBoardQccPairId: null,
    qccPairMatched: false,
    qccRechargeRefreshPending: false,
    monsterGrowthStepsProcessed: 0,
    monsterGrowthTotal: 0,
    distance: Math.min(CONFIG.INITIAL_DISTANCE, CONFIG.MAX_DISTANCE),
    combo: 0,
    comboPermanentSlowTotal: 0,
    bestCombo: 0,
    matchedPairs: 0,
    matchedPairCount: 0,
    matchPermanentSlowTotal: 0,
    hasShownDangerTransition: false,
    hasCompletedDangerTransition: false,
    isDangerDistanceBgmActive: false,
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
  gameOverResultSnapshot = null;
  shareInProgress = false;
  updateShareButtonState();
  shareStatus.textContent = '';
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
  startBgm();
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
shareButton.addEventListener('click', handleShareClick);
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
