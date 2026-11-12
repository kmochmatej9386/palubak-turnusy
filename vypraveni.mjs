// Záznam vypravení: který vůz jel na kterém spoji (z Golemia), uloženo po linkách na posledních 60 dní.
// Výstup do složky (argument), soubor <kmenová linka>.json:
//   { "2026-11-12": { "17": { "347_740_251103": ["8836", "ARRIVA CITY s.r.o.", "05:31"] } } }
// Nic nemění na turnusy.json ani collect.mjs – jen čte turnusy.json (kvůli kmenové lince a pořadí).
import fs from 'node:fs';
import path from 'node:path';
const DIR = process.argv[2] || 'vyp';
const DNI = 60;
const BASE = process.env.GOLEMIO_BASE || 'https://api.golemio.cz';
const token = process.env.GOLEMIO_TOKEN;
if (!token) { console.error('Chybí GOLEMIO_TOKEN'); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });
let turnusy = {};
try { turnusy = JSON.parse(fs.readFileSync('turnusy.json', 'utf8')); } catch {}

const VARIANTY = ['&includeNotTracking=true&includePositions=false', '&includeNotTracking=true', '&includePositions=false', ''];
const hdr = { headers: { 'X-Access-Token': token } };
const all = [];
let vi = 0;
for (let off = 0, page = 0; page < 60; page++) {
  let r = await fetch(`${BASE}/v2/vehiclepositions?limit=1000&offset=${off}${VARIANTY[vi]}`, hdr);
  while (!r.ok && r.status === 400 && vi < VARIANTY.length - 1) { vi++; r = await fetch(`${BASE}/v2/vehiclepositions?limit=1000&offset=${off}${VARIANTY[vi]}`, hdr); }
  if (!r.ok) { console.log(`HTTP ${r.status}`); break; }
  const f = (await r.json()).features || [];
  all.push(...f);
  if (f.length < 1000) break;
  off += 1000;
  await new Promise((res) => setTimeout(res, 300));
}

// datum a čas v Praze; spoje začínající před 3:00 patří ještě k předchozímu provoznímu dni
const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function praha(d) { const s = fmt.format(d); return { datum: s.slice(0, 10), cas: s.slice(11, 16), h: +s.slice(11, 13) }; }
function provozniDen(d) { const p = praha(d); if (p.h < 3) { const q = praha(new Date(d.getTime() - 4 * 3600e3)); return q.datum; } return p.datum; }
const ted = praha(new Date());
const souborLinky = (kmen) => path.join(DIR, String(kmen).replace(/[^A-Za-z0-9_-]/g, '_') + '.json');

const zmeny = {};   // kmen -> { datum: { por: { tid: rec } } }
let n = 0;
for (const f of all) {
  const p = f.properties || {}, t = p.trip || {}, g = t.gtfs || {};
  const tid = g.trip_id;
  if (!tid) continue;
  const vuz = t.vehicle_registration_number ?? p.vehicle_registration_number ?? (p.vehicle || {}).registration_number;
  if (vuz == null || vuz === '') continue;
  const ag = t.agency_name;
  const dop = typeof ag === 'string' ? ag : (ag && (ag.real || ag.scheduled)) || '';
  const tu = turnusy[tid];
  const por = t.sequence_id != null ? t.sequence_id : (tu ? tu[0] : null);
  if (por == null) continue;
  const kmen = (tu && tu[1]) || t.origin_route_name || g.route_short_name || String(tid).split('_')[0];
  if (!kmen) continue;
  const start = t.start_timestamp ? new Date(t.start_timestamp) : new Date();
  const den = provozniDen(isNaN(start) ? new Date() : start);
  const d = ((zmeny[kmen] ||= {})[den] ||= {});
  const o = (d[String(por)] ||= {});
  const prev = o[tid];
  const v = String(vuz);
  if (!prev) o[tid] = [v, dop, ted.cas];
  else if (!prev[0].split('+').includes(v)) prev[0] += '+' + v;
  n++;
}

const hranice = new Date(Date.now() - DNI * 86400e3).toISOString().slice(0, 10);
let souboru = 0;
for (const [kmen, dny] of Object.entries(zmeny)) {
  const fn = souborLinky(kmen);
  let db = {};
  try { db = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch {}
  let zmena = false;
  for (const [den, pory] of Object.entries(dny)) for (const [por, spoje] of Object.entries(pory)) for (const [tid, rec] of Object.entries(spoje)) {
    const o = ((db[den] ||= {})[por] ||= {});
    const x = o[tid];
    if (!x) { o[tid] = rec; zmena = true; }
    else for (const v of rec[0].split('+')) if (!x[0].split('+').includes(v)) { x[0] += '+' + v; zmena = true; }
  }
  for (const den of Object.keys(db)) if (den < hranice) { delete db[den]; zmena = true; }
  if (zmena) { fs.writeFileSync(fn, JSON.stringify(db)); souboru++; }
}
// staré soubory linek, kde už nic nezbylo
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.json') || f === 'info.json') continue;
  try { const db = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); if (Object.keys(db).every((d) => d < hranice)) fs.unlinkSync(path.join(DIR, f)); } catch {}
}
fs.writeFileSync(path.join(DIR, 'info.json'), JSON.stringify({ aktualizace: new Date().toISOString(), vozidel: all.length }));
console.log(`Vozidel: ${all.length}, zaznamenaných spojů: ${n}, změněných linek: ${souboru}`);
