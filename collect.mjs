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
const hm = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false });
let added = 0;
for (const f of all) {
  const t = (f.properties || {}).trip || {};
  const id = t.gtfs && t.gtfs.trip_id;
  if (!id || t.sequence_id == null) continue;
  const origin = t.origin_route_name ? String(t.origin_route_name) : '';
  const kmen = origin && origin !== String(id).split('_')[0] ? origin : '';
  // čas odjezdu spoje (HH:MM, Praha): podle něj aplikace ověří, že nová verze spoje se stejným číslem je opravdu tentýž spoj
  const cas = t.start_timestamp ? hm.format(new Date(t.start_timestamp)) : '';
  const val = cas ? [t.sequence_id, kmen, cas] : (kmen ? [t.sequence_id, kmen] : [t.sequence_id]);
  if (JSON.stringify(db[id]) !== JSON.stringify(val)) { db[id] = val; added++; }
}
const keys = Object.keys(db);
if (keys.length > MAX) keys.slice(0, keys.length - MAX).forEach((k) => delete db[k]);
fs.writeFileSync('turnusy.json', JSON.stringify(db));
console.log(`Vozidel: ${all.length}, spojů celkem: ${Object.keys(db).length}, změn: ${added}${failed ? ', CHYBA při stahování' : ''}`);
if (failed && !all.length) process.exit(1);
