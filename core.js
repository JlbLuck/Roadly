(function (root) {
  'use strict';
  function distance(a, b) {
    const rad = n => n * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }
  function validatePoints(data) {
    if (!Array.isArray(data) || data.length > 10000) throw Error('Erwartet wird eine Liste mit höchstens 10.000 Punkten.');
    const ids = new Set();
    return data.map(p => {
      if (!p || typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id) ||
          typeof p.label !== 'string' || !p.label.trim() || p.label.length > 150 ||
          !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 ||
          !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180) throw Error('Ungültige Messstelle oder doppelte ID.');
      ids.add(p.id);
      return { id: p.id, label: p.label.trim(), lat: p.latitude, lon: p.longitude };
    });
  }
  class Proximity {
    constructor() { this.last = new Map(); }
    reset() { this.last.clear(); }
    check(fix, points, enabled, now = Date.now()) {
      if (!enabled || !fix || now - fix.time > 15000 || fix.time - now > 2000 || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 100) return null;
      let found = null;
      for (const p of points) {
        const meters = distance(fix, p);
        if (meters <= 500 && (!found || meters < found.meters)) found = { point: p, meters };
      }
      if (!found) return null;
      const previous = this.last.get(found.point.id);
      found.speak = previous === undefined || now - previous >= 180000;
      if (found.speak) this.last.set(found.point.id, now);
      return found;
    }
  }
  const api = { distance, validatePoints, Proximity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoadlyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
