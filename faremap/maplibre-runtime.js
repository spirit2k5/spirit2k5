// Host the pinned map runtime and its worker on the same origin as FareMap.
// If WebGL or the runtime is unavailable, the controller keeps the pickup list usable.
try {
  window.maplibregl = await import("./vendor/maplibre-gl.mjs");
} catch (_) {
  window.maplibregl = null;
}
