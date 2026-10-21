// Sběr pořadí (sequence_id) spojů z Golemio pro VŠECHNY linky PID.
// Výsledek se ukládá do turnusy.json: { "trip_id": [pořadí] } nebo { "trip_id": [pořadí, "kmenová linka"] }
import fs from 'node:fs';
const BASE = process.env.GOLEMIO_BASE || 'https://api.golemio.cz';
const token = process.env.GOLEMIO_TOKEN;
if (!token) { console.error('Chybí GOLEMIO_TOKEN'); process.exit(1); }
const MAX = 250000;
let db = {};
try { db = JSON.parse(fs.readFileSync('turnusy.json', 'utf8')); } catch {}
let variant = 0; // 0: limit 1000 + includePositions=false, 1: limit 1000, 2: limit 200
const lim = () => (variant === 2 ? 200 : 1000);
const url = (o) => `${BASE}/v2/vehiclepositions?limit=${lim()}&offset=${o}` + (variant === 0 ? '&includePositions=false' : '');
const hdr = { headers: { 'X-Access-Token': token } };
const all = [];
let off = 0, failed = false;
for (let page = 0; page < 60; page++) {
  let r = await fetch(url(off), hdr);
  while (!r.ok && r.status === 400 && variant < 2) { variant++; r = await fetch(url(off), hdr); }
  if (!r.ok) { console.log(`HTTP ${r.status} (offset ${off})`); failed = true; break; }
  const j = await r.json();
  const fs_ = j.features || [];
  for (const f of fs_) all.push(f);
  if (fs_.length < lim()) break;
  off += lim();
  await new Promise((res) => setTimeout(res, 300));
}
let added = 0;
for (const f of all) {
  const t = (f.properties || {}).trip || {};
  const id = t.gtfs && t.gtfs.trip_id;
  if (!id || t.sequence_id == null) continue;
  const origin = t.origin_route_name ? String(t.origin_route_name) : '';
  const val = origin && origin !== String(id).split('_')[0] ? [t.sequence_id, origin] : [t.sequence_id];
  if (!db[id] || db[id][0] !== val[0] || (db[id][1] || '') !== (val[1] || '')) { db[id] = val; added++; }
}
const keys = Object.keys(db);
if (keys.length > MAX) keys.slice(0, keys.length - MAX).forEach((k) => delete db[k]);
fs.writeFileSync('turnusy.json', JSON.stringify(db));
console.log(`Vozidel: ${all.length}, spojů celkem: ${Object.keys(db).length}, změn: ${added}${failed ? ', CHYBA při stahování' : ''}`);
if (failed && !all.length) process.exit(1);
