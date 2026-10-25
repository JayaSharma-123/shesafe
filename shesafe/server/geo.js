// Haversine distance (km) between two lat/lng points; used to rank nearest on-duty stations.
const R = 6371, rad = d => d * Math.PI / 180;
exports.km = (a, b, c, d) => {
  const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
exports.rankStations = (db, lat, lng) => {
  const r = db.prepare('SELECT * FROM stations WHERE on_duty=1 AND verified=1').all()
    .map(s => ({ ...s, distanceKm: +exports.km(lat, lng, s.lat, s.lng).toFixed(2) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  // Demo mode: your own station (id 1) is always tried first, so the live demo is reliable.
  if (process.env.DEMO_FORCE_PRIMARY === 'true') {
    const i = r.findIndex(s => s.id === 1);
    if (i > 0) r.unshift(r.splice(i, 1)[0]);
  }
  return r;
};