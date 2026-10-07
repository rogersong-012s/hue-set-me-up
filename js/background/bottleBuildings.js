(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VIEWBOX = '0 0 1200 420';
  const BACKGROUND_CONFIG = Object.freeze({
    BACKGROUND_SCROLL_SPEED: 72, // CSS pixels per second; doubled from 36.
  });
  // Shared family proportions in the SVG's 200×320 bottle coordinate space.
  // Product configs may vary their overall size by a few percent, while the
  // cap and standard label keep the same dimensions and placement.
  const BASE_BOTTLE_PROPORTIONS = Object.freeze({
    width: 176,
    height: 288,
    cap: Object.freeze({ x: 42, y: 28, width: 116, height: 37 }),
    label: Object.freeze({ x: 25, y: 112, width: 150, height: 108 }),
  });
  const mountedLayerCleanups = new WeakMap();

  function sizeFromBase(widthScale = 1, heightScale = 1) {
    return {
      width: Math.round(BASE_BOTTLE_PROPORTIONS.width * widthScale),
      height: Math.round(BASE_BOTTLE_PROPORTIONS.height * heightScale),
    };
  }

  // Each entry is data for the shared SVG factory: position/size, primary label,
  // depth, variant, and all of the bottle/label/window colors can be tuned here.
  const BOTTLE_BUILDINGS = [
    {
      id: 'pnn-far-tower',
      x: 76, y: 190, ...sizeFromBase(0.64, 0.64),
      depth: 'far', opacity: 0.38, styleVariant: 'tall', showLabel: false, showWindows: false,
      bodyColor: '#436239', bodyHighlightColor: '#78916a', bodyShadowColor: '#273f37',
      capColor: '#bcae98', capHighlightColor: '#eee5d5', capShadowColor: '#72695f',
      labelColor: '#38592f', labelTextColor: '#f2efd9', decorationColor: '#d3c28b',
      windowColor: '#b9d5a1', windowGlowColor: '#f0e3a4',
      labelText: 'PNN+3',
    },
    {
      id: 'pnn-main-tower',
      x: 350, y: 83, ...sizeFromBase(1.02, 1.02),
      depth: 'mid', opacity: 0.9, styleVariant: 'decorated-roof',
      bodyColor: '#456832', bodyHighlightColor: '#7e9860', bodyShadowColor: '#294638',
      capColor: '#b9aa92', capHighlightColor: '#f0e4cf', capShadowColor: '#776d63',
      labelColor: '#496d32', labelTextColor: '#fff5df', decorationColor: '#e3c86d',
      windowColor: '#b9d5a1', windowGlowColor: '#f6e2a0',
      labelText: 'PNN+3', labelFontSize: 23,
    },
    {
      id: 'ree-main-tower',
      x: 205, y: 95, ...sizeFromBase(0.97, 0.98),
      depth: 'mid', opacity: 0.9, styleVariant: 'cylinder',
      // Clean red-and-silver palette inspired by the REE+5 reference.
      bodyColor: '#e7e9ee', bodyHighlightColor: '#ffffff', bodyShadowColor: '#7f8996',
      capColor: '#cfcfd4', capHighlightColor: '#f3f4f7', capShadowColor: '#777d89',
      labelColor: '#f22a2f', labelTextColor: '#fff8f8', decorationColor: '#ffd6d8',
      windowColor: '#ffe1e2', windowGlowColor: '#fff0f0',
      labelText: 'REE+5', labelFontSize: 23,
    },
    {
      id: 'qcc-main-tower',
      x: 624, y: 89, ...sizeFromBase(),
      depth: 'mid', opacity: 0.9, styleVariant: 'cylinder',
      bodyColor: '#58a943', bodyHighlightColor: '#99d26b', bodyShadowColor: '#34794a',
      capColor: '#c7b596', capHighlightColor: '#f1e6d4', capShadowColor: '#80756a',
      labelColor: '#49a633', labelTextColor: '#f7ffe9', decorationColor: '#d7ee9b',
      windowColor: '#cce9ae', windowGlowColor: '#fff1ad',
      labelText: 'QCC+4', labelFontSize: 23,
      roofDecoration: true,
    },
    {
      id: 'rtt-main-tower',
      x: 825, y: 92, ...sizeFromBase(1.01, 0.99),
      depth: 'mid', opacity: 0.9, styleVariant: 'cylinder',
      // Warm golden label with the same silver cap and glass treatment.
      bodyColor: '#f1e7ce', bodyHighlightColor: '#fff9e7', bodyShadowColor: '#a68d59',
      capColor: '#cfcfd4', capHighlightColor: '#f3f4f7', capShadowColor: '#777d89',
      labelColor: '#e1a90f', labelTextColor: '#fffdf5', decorationColor: '#ffe59a',
      windowColor: '#fff0bd', windowGlowColor: '#fff8d2',
      labelText: 'RTT+5', labelFontSize: 23,
    },
    {
      id: 'qcc-side-kiosk',
      x: 1007, y: 190, ...sizeFromBase(0.64, 0.64),
      depth: 'accent', opacity: 0.48, styleVariant: 'sign',
      bodyColor: '#5caa47', bodyHighlightColor: '#a0d77a', bodyShadowColor: '#39734d',
      capColor: '#bda989', capHighlightColor: '#eee0c7', capShadowColor: '#766d61',
      labelColor: '#4b9f38', labelTextColor: '#f7ffe9', decorationColor: '#f2d878',
      windowColor: '#cce9ae', windowGlowColor: '#fff1ad',
      labelText: 'QCC+4', signText: 'QCC',
      showLabel: false, showWindows: false,
    },
  ];

  // Presets are additive: new colors, text, dimensions, or feature flags can be
  // supplied per building without changing the SVG construction below.
  const VARIANTS = Object.freeze({
    cylinder: Object.freeze({
      labelMode: 'standard',
      defaultWidth: BASE_BOTTLE_PROPORTIONS.width,
      defaultHeight: BASE_BOTTLE_PROPORTIONS.height,
    }),
    tall: Object.freeze({ labelMode: 'standard', defaultWidth: 166, defaultHeight: 300 }),
    short: Object.freeze({ labelMode: 'standard', defaultWidth: 208, defaultHeight: 248 }),
    'wide-label': Object.freeze({ labelMode: 'wide', defaultWidth: 180, defaultHeight: 270 }),
    'double-label': Object.freeze({ labelMode: 'double', defaultWidth: 180, defaultHeight: 270 }),
    sign: Object.freeze({ labelMode: 'standard', sign: true, defaultWidth: 180, defaultHeight: 270 }),
    'glowing-windows': Object.freeze({ labelMode: 'standard', glowingWindows: true, defaultWidth: 180, defaultHeight: 270 }),
    'decorated-roof': Object.freeze({ labelMode: 'standard', roofDecoration: true, defaultWidth: 180, defaultHeight: 270 }),
  });

  const DEFAULTS = Object.freeze({
    bodyColor: '#4c7b43',
    bodyHighlightColor: '#91b577',
    bodyShadowColor: '#304d40',
    capColor: '#c1b298',
    capHighlightColor: '#f1e7d5',
    capShadowColor: '#796f65',
    labelColor: '#426a35',
    labelTextColor: '#fff6df',
    decorationColor: '#e2cb76',
    windowColor: '#c8dda9',
    windowGlowColor: '#fff0a8',
    labelText: 'PNN+3',
    labelFontSize: 22,
    styleVariant: 'cylinder',
    showLabel: true,
    showWindows: true,
    opacity: 0.8,
  });

  function svgElement(name, attributes = {}, parent = null) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) element.setAttribute(key, String(value));
    }
    if (parent) parent.appendChild(element);
    return element;
  }

  function addStop(gradient, offset, color, opacity = 1) {
    svgElement('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }, gradient);
  }

  function safeId(value) {
    return String(value || 'bottle').replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function createGradients(defs, id, config) {
    const ids = {
      body: `${id}-body`,
      cap: `${id}-cap`,
      glow: `${id}-glow`,
    };

    const body = svgElement('linearGradient', { id: ids.body, x1: '0', x2: '1', y1: '0', y2: '0' }, defs);
    addStop(body, '0', config.bodyShadowColor);
    addStop(body, '0.18', config.bodyColor);
    addStop(body, '0.47', config.bodyHighlightColor, 0.92);
    addStop(body, '0.73', config.bodyColor);
    addStop(body, '1', config.bodyShadowColor);

    const cap = svgElement('linearGradient', { id: ids.cap, x1: '0', x2: '0', y1: '0', y2: '1' }, defs);
    addStop(cap, '0', config.capHighlightColor);
    addStop(cap, '0.28', config.capColor);
    addStop(cap, '0.52', config.capHighlightColor);
    addStop(cap, '0.78', config.capShadowColor);
    addStop(cap, '1', config.capColor);

    const glow = svgElement('filter', { id: ids.glow, x: '-80%', y: '-80%', width: '260%', height: '260%' }, defs);
    svgElement('feGaussianBlur', { stdDeviation: 2.5, result: 'softGlow' }, glow);
    const merge = svgElement('feMerge', {}, glow);
    svgElement('feMergeNode', { in: 'softGlow' }, merge);
    svgElement('feMergeNode', { in: 'SourceGraphic' }, merge);

    return ids;
  }

  function addText(parent, value, attributes) {
    const text = svgElement('text', attributes, parent);
    text.textContent = value == null ? '' : String(value);
    return text;
  }

  function drawRoofDecoration(group, config) {
    if (!(config.roofDecoration || config.styleVariant === 'decorated-roof')) return;
    const decor = svgElement('g', {
      class: 'bottle-building__roof-mark',
      fill: config.decorationColor,
      stroke: config.capShadowColor,
      'stroke-width': 1.2,
    }, group);
    svgElement('circle', { cx: 100, cy: 7, r: 7 }, decor);
    svgElement('circle', { cx: 91, cy: 12, r: 6 }, decor);
    svgElement('circle', { cx: 109, cy: 12, r: 6 }, decor);
    svgElement('circle', { cx: 100, cy: 17, r: 6 }, decor);
    svgElement('path', { d: 'M100 14 Q105 21 100 24', fill: 'none', 'stroke-width': 2.4 }, decor);
  }

  function drawBottle(group, config, gradientIds) {
    const variant = VARIANTS[config.styleVariant] || VARIANTS.cylinder;
    const labelMode = config.labelMode || variant.labelMode;
    const body = svgElement('g', { class: 'bottle-building__body' }, group);

    // Glass bottle silhouette and softly shaded vertical edges.
    svgElement('path', {
      d: 'M67 58 H133 C135 70 141 78 153 88 C164 97 170 111 170 128 V278 C170 295 159 306 143 306 H57 C41 306 30 295 30 278 V128 C30 111 36 97 47 88 C59 78 65 70 67 58 Z',
      fill: `url(#${gradientIds.body})`,
      stroke: config.bodyShadowColor,
      'stroke-width': 3,
      'stroke-linejoin': 'round',
    }, body);
    svgElement('path', {
      d: 'M42 112 C48 98 55 91 64 85 L60 283 Q58 294 50 291 Z',
      fill: config.bodyHighlightColor,
      opacity: 0.27,
    }, body);
    svgElement('path', {
      d: 'M145 95 Q161 107 161 132 V282 Q159 294 151 298 Z',
      fill: config.bodyShadowColor,
      opacity: 0.28,
    }, body);

    // Cap, neck, and simple metallic ridges echo the reference jars.
    svgElement('rect', {
      x: 65, y: 52, width: 70, height: 28, rx: 5,
      fill: config.bodyColor,
      stroke: config.bodyShadowColor,
      'stroke-width': 2,
    }, body);
    svgElement('rect', {
      ...BASE_BOTTLE_PROPORTIONS.cap, rx: 8,
      fill: `url(#${gradientIds.cap})`,
      stroke: config.capShadowColor,
      'stroke-width': 2,
    }, body);
    svgElement('ellipse', {
      cx: 100, cy: 30, rx: 57, ry: 8,
      fill: config.capHighlightColor,
      stroke: config.capShadowColor,
      'stroke-width': 1.5,
    }, body);
    svgElement('path', {
      d: 'M44 47 H156 M46 53 H154 M49 58 H151',
      fill: 'none',
      stroke: config.capShadowColor,
      'stroke-width': 2,
      opacity: 0.78,
    }, body);
    svgElement('path', {
      d: 'M47 41 H153',
      fill: 'none',
      stroke: config.capHighlightColor,
      'stroke-width': 2.4,
      opacity: 0.86,
    }, body);

    drawRoofDecoration(body, config);

    if (config.showLabel) {
      const label = svgElement('g', { class: 'bottle-building__label' }, body);
      const labelX = labelMode === 'wide' ? 18 : BASE_BOTTLE_PROPORTIONS.label.x;
      const labelWidth = labelMode === 'wide' ? 164 : BASE_BOTTLE_PROPORTIONS.label.width;
      const labelY = BASE_BOTTLE_PROPORTIONS.label.y;
      const labelHeight = labelMode === 'double' ? 118 : BASE_BOTTLE_PROPORTIONS.label.height;
      svgElement('rect', {
        x: labelX, y: labelY, width: labelWidth, height: labelHeight, rx: 6,
        fill: config.labelColor,
        stroke: config.decorationColor,
        'stroke-width': 2,
        opacity: 0.96,
      }, label);
      svgElement('rect', {
        x: labelX, y: labelY, width: labelWidth, height: 8, rx: 4,
        fill: config.decorationColor,
        opacity: 0.84,
      }, label);
      // All readable bottle labels share one centered primary-name template.
      addText(label, config.labelText, {
        x: 100, y: labelY + labelHeight / 2,
        fill: config.labelTextColor,
        'font-family': 'Trebuchet MS, Noto Sans TC, sans-serif',
        'font-size': config.labelFontSize,
        'font-weight': 900,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'letter-spacing': '-0.5',
      });
    }

    if (config.showWindows !== false) {
      const windows = svgElement('g', {
        class: 'bottle-building__windows',
        fill: variant.glowingWindows || config.glowingWindows ? config.windowGlowColor : config.windowColor,
        filter: variant.glowingWindows || config.glowingWindows ? `url(#${gradientIds.glow})` : undefined,
        opacity: variant.glowingWindows || config.glowingWindows ? 0.92 : 0.68,
      }, body);
      const windowY = 232;
      for (const x of [50, 82, 114, 146]) {
        svgElement('rect', { x, y: windowY, width: 12, height: 23, rx: 6 }, windows);
      }
      svgElement('path', {
        d: `M44 ${windowY + 32} H156 M52 ${windowY + 38} H148`,
        fill: 'none',
        stroke: config.decorationColor,
        'stroke-width': 2,
        opacity: 0.55,
      }, body);
    }

    if (config.signText || variant.sign || config.styleVariant === 'sign') {
      const sign = svgElement('g', { class: 'bottle-building__sign' }, body);
      svgElement('path', {
        d: 'M153 86 H194 V124 H153 Z',
        fill: config.labelColor,
        stroke: config.decorationColor,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      }, sign);
      addText(sign, config.signText || config.labelText, {
        x: 174, y: 106,
        fill: config.labelTextColor,
        'font-family': 'Trebuchet MS, Noto Sans TC, sans-serif',
        'font-size': config.signFontSize || 11,
        'font-weight': 900,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
    }

    // A tiny base rim makes the bottle read as a landmark; foreground ground
    // intentionally covers part of it so the towers sit inside the landscape.
    svgElement('path', {
      d: 'M42 296 Q100 308 158 296',
      fill: 'none',
      stroke: config.bodyHighlightColor,
      'stroke-width': 3,
      opacity: 0.72,
    }, body);
  }

  function renderStrip(configs, copyIndex) {
    const svg = svgElement('svg', {
      class: 'bottle-city-strip',
      viewBox: VIEWBOX,
      preserveAspectRatio: 'xMidYMax slice',
      focusable: 'false',
      'aria-hidden': 'true',
    });
    const defs = svgElement('defs', {}, svg);

    for (const rawConfig of configs) {
      const config = { ...DEFAULTS, ...rawConfig };
      const variant = VARIANTS[config.styleVariant] || VARIANTS.cylinder;
      const id = `${safeId(config.id)}-${copyIndex}`;
      const gradientIds = createGradients(defs, id, config);
      const x = Number(config.x) || 0;
      const y = Number(config.y) || 0;
      const width = Math.max(1, Number(config.width) || variant.defaultWidth);
      const height = Math.max(1, Number(config.height) || variant.defaultHeight);
      const group = svgElement('g', {
        class: `bottle-building bottle-building--${safeId(config.styleVariant)}`,
        'data-building-id': config.id,
        'data-depth': config.depth || 'mid',
        opacity: config.opacity,
        transform: `translate(${x} ${y}) scale(${width / 200} ${height / 320})`,
      }, svg);
      drawBottle(group, config, gradientIds);
    }

    return svg;
  }

  function setLoopDuration(target, track) {
    const viewportWidth = Math.max(1, target.getBoundingClientRect().width);
    const speed = Math.max(1, BACKGROUND_CONFIG.BACKGROUND_SCROLL_SPEED);
    track.style.setProperty('--bottle-city-loop-duration', `${viewportWidth / speed}s`);
  }

  function render(target, configs = BOTTLE_BUILDINGS) {
    if (!target) return null;

    const cleanupPreviousObserver = mountedLayerCleanups.get(target);
    if (cleanupPreviousObserver) cleanupPreviousObserver();

    const order = { far: 0, mid: 1, accent: 2 };
    const orderedConfigs = [...configs].sort((a, b) => (order[a.depth] ?? 1) - (order[b.depth] ?? 1));
    const track = document.createElement('div');
    track.className = 'bottle-city-track';
    track.setAttribute('aria-hidden', 'true');
    track.appendChild(renderStrip(orderedConfigs, 0));
    track.appendChild(renderStrip(orderedConfigs, 1));
    target.replaceChildren(track);

    const updateDuration = () => setLoopDuration(target, track);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(updateDuration);
      observer.observe(target);
      mountedLayerCleanups.set(target, () => observer.disconnect());
    } else {
      window.addEventListener('resize', updateDuration, { passive: true });
      mountedLayerCleanups.set(target, () => window.removeEventListener('resize', updateDuration));
    }
    updateDuration();
    return track;
  }

  window.BottleBuildingBackground = Object.freeze({
    config: BACKGROUND_CONFIG,
    configs: BOTTLE_BUILDINGS,
    variants: Object.keys(VARIANTS),
    render,
  });

  const mount = document.querySelector('[data-bottle-building-layer]');
  if (mount) render(mount);
})();
