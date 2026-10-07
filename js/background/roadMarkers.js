(() => {
  'use strict';

  const ROAD_MARKER_CONFIG = Object.freeze({
    ROAD_MARKER_SCROLL_SPEED: 96, // CSS pixels per second.
    MARKER_WIDTH: 38,
    MARKER_SPACING: 78,
  });

  const layer = document.querySelector('[data-road-marker-layer]');
  if (!layer) return;

  const strip = document.createElement('div');
  strip.className = 'road-marker-strip';
  layer.replaceChildren(strip);

  function syncMarkers() {
    const viewportWidth = Math.max(1, layer.getBoundingClientRect().width);
    const count = Math.ceil(viewportWidth / ROAD_MARKER_CONFIG.MARKER_SPACING) + 2;
    while (strip.children.length < count) {
      strip.appendChild(document.createElement('span')).className = 'road-marker';
    }
    while (strip.children.length > count) {
      strip.lastElementChild.remove();
    }

    Array.from(strip.children).forEach((marker, index) => {
      marker.style.left = `${index * ROAD_MARKER_CONFIG.MARKER_SPACING}px`;
    });
    strip.style.width = `${count * ROAD_MARKER_CONFIG.MARKER_SPACING}px`;
    strip.style.setProperty('--road-marker-travel', `-${ROAD_MARKER_CONFIG.MARKER_SPACING}px`);
    strip.style.setProperty(
      '--road-marker-loop-duration',
      `${ROAD_MARKER_CONFIG.MARKER_SPACING / ROAD_MARKER_CONFIG.ROAD_MARKER_SCROLL_SPEED}s`,
    );
  }

  syncMarkers();
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncMarkers);
    observer.observe(layer);
  } else {
    window.addEventListener('resize', syncMarkers, { passive: true });
  }

  window.RoadMarkerBackground = Object.freeze({ config: ROAD_MARKER_CONFIG });
})();
