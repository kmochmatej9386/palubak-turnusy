// Sběr pořadí (sequence_id) spojů z Golemio. Výsledek se ukládá do turnusy.json: { "trip_id": [pořadí, "kmenová/origin linka"] }
import fs from 'node:fs';
const LINES = ['347','358','336','164','174','352','301'];
const BASE = process.env.GOLEMIO_BASE || 'https://api.golemio.cz';
const token = process.env.GOLEMIO_TOKEN;
if (!token) { console.error('Chybí GOLEMIO_TOKEN'); process.exit(1); }
let db = {};
try { db = JSON.parse(fs.readFileSync('turnusy.json', 'utf8')); } catch {}
let added = 0, failed = 0;
for (const ln of LINES) {
  try {
    const r = await fetch(`${BASE}/v2/vehiclepositions?routeShortName=${ln}&limit=200`, { headers: { 'X-Access-Token': token } });
    if (!r.ok) { console.log(`Linka ${ln}: HTTP ${r.status}`); failed++; continue; }
    const j = await r.json();
    const fs_ = j.features || [];
    for (const f of fs_) {
      const t = (f.properties || {}).trip || {};
      const id = t.gtfs && t.gtfs.trip_id;
      if (!id || t.sequence_id == null) continue;
      const val = [t.sequence_id, t.origin_route_name ? String(t.origin_route_name) : ''];
      if (!db[id] || db[id][0] !== val[0] || db[id][1] !== val[1]) { db[id] = val; added++; }
    }
    console.log(`Linka ${ln}: ${fs_.length} vozidel`);
  } catch (e) { console.log(`Linka ${ln}: chyba ${e.message}`); failed++; }
}
const keys = Object.keys(db);
if (keys.length > 20000) keys.slice(0, keys.length - 20000).forEach(k => delete db[k]);
fs.writeFileSync('turnusy.json', JSON.stringify(db));
console.log(`Hotovo: ${Object.keys(db).length} spojů, změn ${added}, chyb ${failed}`);
