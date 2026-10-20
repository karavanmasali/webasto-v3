import {HeatGenieBLE, isOffStep} from './ble.js?v=4.0.0';
import {AutoEngine} from './auto-engine.mjs?v=4.0.0';
import {History, fmtDuration} from './history.mjs?v=4.0.0';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const LOW_VOLT = 11.0;            // çalışırken bu değerin altı uyarı (cihaz ~10,8 V'ta kesiyor)
const STALE_MS = 30000;           // telemetri bu süreden eskiyse "kontrol çalışmıyor"
const LS_CFG = 'webasto.v4.cfg';

/* ---------- Ayarlar (kalıcı) ---------- */
const defaults = {auto:false, start:20, stop:25, stopDelay:30, restartDelay:180, minRun:600, notify:true, night:false, deviceId:null};
function sanitize(c) {
  c.start = clamp(Math.round(Number(c.start) || 20), 10, 38);
  c.stop = clamp(Math.round(Number(c.stop) || 25), c.start + 2, 40);
  c.auto = !!c.auto; c.notify = c.notify !== false; c.night = !!c.night;
  return c;
}
function loadCfg() {
  try { return sanitize({...defaults, ...JSON.parse(localStorage.getItem(LS_CFG) || '{}')}); }
  catch { return sanitize({...defaults}); }
}
let cfg = loadCfg();
const saveCfg = () => { try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch { /* kota */ } };

/* ---------- Durum ---------- */
const history = new History(localStorage);
const engine = new AutoEngine();
let last = null, lastAt = 0, everConnected = false, busy = false;
let prevRunning = null, stopRecorded = false, cooling = false, intent = null;
let lowSince = null, lastLowAlert = 0, targetSyncTries = 0, lastTargetSentAt = 0, lastSampleAt = 0;
let autoReasonText = '', wakeLock = null, range = '12', tab = 'home', toastTimer = null;
const logLines = [];

const fmtT = v => (typeof v === 'number' ? v.toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 1}) : '—');
const hhmm = t => new Date(t).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'});
const isIdle = s => isOffStep(s) && !s.fan && !s.pump && !s.glow;
const fresh = () => last && Date.now() - lastAt < STALE_MS;
const controlOk = () => ble.connected && fresh();

function log(m) {
  const d = new Date().toLocaleTimeString('tr-TR');
  logLines.push(`[${d}] ${m}`);
  if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
  if (tab === 'details') { const el = $('log'); el.textContent = logLines.join('\n'); el.scrollTop = el.scrollHeight; }
}
function toast(msg, ms = 4000) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- Bildirim / olay kaydı ---------- */
async function ensureNotifyPermission() {
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* yok say */ }
}
function pushNote(text, alert) {
  if (!cfg.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification('Webasto', {body: text, silent: !alert, tag: 'hg-' + Date.now()}); } catch { /* yok say */ }
}
function recordEvent(type, src, core) {
  const t = Date.now();
  history.addEvent({t, type, src, room: last?.roomTemp, text: core});
  log(`OLAY ${type.toUpperCase()} (${src}): ${core}`);
  // START/STOP sessiz, uyarılar sesli
  pushNote(`${hhmm(t)} — ${core}`, type === 'alert');
}
function alertUser(core) { recordEvent('alert', 'sistem', core); toast(core, 8000); }
function recordStop(src) {
  if (stopRecorded) return;
  stopRecorded = true; cooling = true;
  recordEvent('stop', src, `Ortam ${fmtT(last?.roomTemp)}°C, Webasto durduruldu.`);
}
function trackTransitions(s) {
  const running = !isIdle(s);
  if (prevRunning === null) { prevRunning = running; stopRecorded = false; cooling = false; return; }
  if (!prevRunning && running) {
    const mine = intent && intent.type === 'start' && Date.now() - intent.t < 150000;
    recordEvent('start', mine ? intent.src : 'cihaz', `Ortam ${fmtT(s.roomTemp)}°C, Webasto çalıştırıldı.`);
    stopRecorded = false; cooling = false; intent = null;
  } else if (prevRunning && !running) {
    if (!stopRecorded) recordStop('cihaz');   // kumandadan veya cihazdan durdurulmuş
    cooling = false; stopRecorded = false;
  }
  prevRunning = running;
}
function checkVoltage(s) {
  const running = !isIdle(s);
  // Yalnızca ısıtıcı çalışırken uyar; kapalıyken ve soğutmada sadece göster.
  if (running && !cooling && s.voltage < LOW_VOLT) {
    lowSince ??= Date.now();
    if (Date.now() - lowSince >= 30000 && Date.now() - lastLowAlert > 1800000) {
      lastLowAlert = Date.now();
      alertUser(`Akü gerilimi düşük: ${fmtT(s.voltage)} V. Cihaz yaklaşık 10,8 V’ta kesilir.`);
    }
  } else lowSince = null;
}

/* ---------- Bluetooth ---------- */
const ble = new HeatGenieBLE(log,
  willReconnect => {
    lastAt = 0;
    if (willReconnect) {
      if (cfg.auto) alertUser('Bluetooth bağlantısı koptu. Otomatik kontrol ÇALIŞMIYOR; ısıtıcı kendi ayarıyla çalışır.');
      else toast('Bağlantı koptu, yeniden bağlanılıyor…');
    } else { prevRunning = null; if (cfg.auto) alertUser('Bluetooth bağlantısı kapandı. Otomatik kontrol çalışmıyor.'); }
    render();
  },
  onStatus);
ble.onReconnect = () => { toast('Yeniden bağlandı'); prevRunning = null; render(); };
ble.onGiveUp = () => { if (cfg.auto) alertUser('Yeniden bağlanılamadı. Otomatik kontrol çalışmıyor; ısıtıcıyı kontrol edin.'); render(); };

function onStatus(s) {
  last = s; lastAt = Date.now();
  const running = !isIdle(s);
  trackTransitions(s);
  checkVoltage(s);
  if (Date.now() - lastSampleAt >= 60000) { lastSampleAt = Date.now(); history.addSample(Date.now(), s.roomTemp, s.voltage, running); }
  autoStep(s);
  render();
}

/* ---------- Otomatik mod ---------- */
async function autoCommand(what) {
  if (busy) { engine.sendFailed(what); return; }
  busy = true; intent = {type: what, src: 'otomatik', t: Date.now()}; render();
  try {
    if (what === 'stop') { await ble.stop(); recordStop('otomatik'); }
    else await ble.start();
  } catch (e) { engine.sendFailed(what); intent = null; log(`Otomatik ${what} başarısız: ${e.message}`); toast(`Otomatik ${what.toUpperCase()} gönderilemedi: ${e.message}`, 6000); }
  finally { busy = false; render(); }
}
async function syncTarget(s) {
  if (s.target === cfg.stop) { targetSyncTries = 0; return; }
  if (busy || targetSyncTries >= 3 || Date.now() - lastTargetSentAt < 20000 || !ble.canControl) return;
  targetSyncTries++; lastTargetSentAt = Date.now(); busy = true;
  try { await ble.target(cfg.stop); log(`Webasto hedefi ${cfg.stop} °C olarak güncellendi.`); }
  catch (e) { log('Hedef eşitleme başarısız: ' + e.message); }
  finally { busy = false; render(); }
}
function autoStep(s) {
  if (!cfg.auto) { autoReasonText = ''; return; }
  engine.cfg = {...cfg, auto: true, maxStartsPerHour: 4};
  const d = engine.evaluate(s, Date.now());
  autoReasonText = d.reason;
  if (d.alert) alertUser(d.alert);
  if (d.disableAuto) { cfg.auto = false; engine.reset(); saveCfg(); updateWake(); toast('Güvenlik nedeniyle otomatik mod kapandı: ' + d.reason, 9000); return; }
  if (d.action === 'start') autoCommand('start');
  else if (d.action === 'stop') autoCommand('stop');
  else syncTarget(s);
}

/* ---------- Manuel komutlar ---------- */
const nightOn = () => document.body.classList.contains('night');
async function manualStart() {
  if (busy) return;
  if (!nightOn() && !window.confirm('Isıtıcı başlatılsın mı? Cihaz başında, havalandırma ve CO alarmı hazır mı?')) return;
  busy = true; intent = {type: 'start', src: 'manuel', t: Date.now()}; engine.markStart(Date.now()); render();
  try {
    const r = await ble.start();
    if (!r?.confirmed) { toast('START gönderildi ama ısıtıcı henüz başlamadı.', 6000); log('Manuel START: durum değişimi görülmedi.'); }
  } catch (e) { engine.sendFailed('start'); intent = null; toast('START gönderilemedi: ' + e.message, 6000); }
  finally { busy = false; render(); }
}
async function manualStop() {
  const wasAuto = cfg.auto;
  if (wasAuto) { cfg.auto = false; engine.reset(); saveCfg(); updateWake(); }
  try {
    await ble.stop(); engine.markStop(Date.now()); recordStop('manuel');
    toast(wasAuto ? 'STOP gönderildi. Otomatik mod kapatıldı.' : 'STOP gönderildi.');
  } catch (e) { toast('STOP gönderilemedi: ' + e.message + (wasAuto ? ' (Otomatik mod kapatıldı)' : ''), 7000); }
  render();
}

/* ---------- Ekran uyku kilidi ---------- */
async function requestWake() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } }
  catch (e) { log('Ekran uyku kilidi alınamadı: ' + e.message); }
}
function releaseWake() { try { wakeLock?.release(); } catch { /* yok say */ } wakeLock = null; }
function updateWake() { if (cfg.auto || cfg.night) requestWake(); else releaseWake(); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateWake(); else history.save(); });
window.addEventListener('pagehide', () => history.save());

/* ---------- Arayüz ---------- */
function connLabel() {
  if (ble.connected) return fresh() || !last ? ['Bağlı', 'ok'] : ['Bağlı · veri gecikti', 'warn'];
  if (ble.reconnecting) return ['Yeniden bağlanıyor', 'warn'];
  return everConnected ? ['Bağlantı kesildi', 'bad'] : ['Bağlı değil', 'bad'];
}
function lastEvent(type) { for (let i = history.events.length - 1; i >= 0; i--) if (history.events[i].type === type) return history.events[i]; return null; }
function evText(label, ev) {
  if (!ev) return `${label}: —`;
  const d = new Date(ev.t), today = new Date();
  const day = d.toDateString() === today.toDateString() ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} `;
  return `${label}: ${day}${hhmm(ev.t)}`;
}
function banner(text, cls, btnText, btnFn) {
  const d = document.createElement('div'); d.className = 'banner ' + (cls || ''); const sp = document.createElement('span'); sp.textContent = text; d.appendChild(sp);
  if (btnText) { const b = document.createElement('button'); b.textContent = btnText; b.onclick = btnFn; d.appendChild(b); }
  return d;
}
function render() {
  const [cl, cc] = connLabel();
  const pill = $('connState'); pill.textContent = cl; pill.className = 'pill ' + cc;
  $('roomTemp').textContent = last ? fmtT(last.roomTemp) : '--.-';
  document.title = last ? `${fmtT(last.roomTemp)}° Karavan Webasto` : 'Karavan Webasto';
  const st = $('heaterState');
  if (!last) { st.textContent = 'Veri bekleniyor'; st.className = 'state'; }
  else if (isIdle(last)) { st.textContent = 'Kapalı'; st.className = 'state'; }
  else { st.textContent = cooling ? 'Soğutuyor (durduruluyor)' : 'Çalışıyor'; st.className = 'state run'; }
  const bat = $('battery');
  if (last) { bat.textContent = `Akü ${fmtT(last.voltage)} V`; bat.className = (!isIdle(last) && !cooling && last.voltage < LOW_VOLT) ? 'low' : ''; } else { bat.textContent = 'Akü —'; bat.className = ''; }
  $('lastStart').textContent = evText('Son START', lastEvent('start'));
  $('lastStop').textContent = evText('Son STOP', lastEvent('stop'));
  $('startVal').textContent = cfg.start; $('stopVal').textContent = cfg.stop;
  $('autoToggle').checked = cfg.auto;
  let line = 'Kapalı';
  if (cfg.auto) line = controlOk() ? (autoReasonText || 'Açık') : 'Açık — kontrol ÇALIŞMIYOR';
  $('autoLine').textContent = line;
  // uyarı şeritleri
  const bn = $('banners'); bn.replaceChildren();
  if (last?.errorFlags) bn.appendChild(banner(`Cihaz hata bildiriyor (0x${last.errorFlags.toString(16).toUpperCase()}). Kumandadan kontrol edin.`));
  if (cfg.auto && !controlOk()) bn.appendChild(banner(`Otomatik mod AÇIK ama kontrol çalışmıyor: ${ble.reconnecting ? 'yeniden bağlanılıyor' : (ble.connected ? 'veri gecikti' : 'Bluetooth bağlantısı yok')}.`));
  if (last && ble.connected && ((last.flags >> 5) & 3) !== 0) bn.appendChild(banner(`Cihaz Mod ${(last.flags >> 5) & 3}: otomatik START çalışmaz.`, 'warn', 'Mod 0’a dön', () => ble.restoreTemperatureMode().catch(e => toast(e.message, 6000))));
  $('startBtn').disabled = !ble.canControl || busy || (last && !isIdle(last)) || Date.now() - ble.lastStartAt < 60000;
  $('stopBtn').disabled = !ble.canStop || (last && isIdle(last) && Date.now() - ble.lastStartAt > 90000);
  $('connectBtn').hidden = ble.connected || ble.reconnecting;
  $('nightExit').hidden = !cfg.night; $('holdHint').hidden = !cfg.night;
  $('notifyToggle').checked = cfg.notify;
  $('selStopDelay').value = String(cfg.stopDelay); $('selMinRun').value = String(cfg.minRun); $('selRestart').value = String(cfg.restartDelay);
  document.body.classList.toggle('night', cfg.night);
  if (tab === 'history') renderHistory();
}

/* ---------- Geçmiş sekmesi ---------- */
function bounds() {
  const now = Date.now();
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return [d.getTime(), now]; }
  return [now - Number(range) * 3600000, now];
}
function renderHistory() {
  const [from, to] = bounds();
  const s = history.stats(from, to);
  $('sStarts').textContent = s.starts; $('sStops').textContent = s.stops; $('sRun').textContent = fmtDuration(s.runMs);
  $('sRange').textContent = s.min === null ? '—' : `${fmtT(s.min)}–${fmtT(s.max)}°`;
  const ul = $('events'); ul.replaceChildren();
  const evs = history.eventsBetween(from, to).slice().reverse().slice(0, 150);
  if (!evs.length) { const li = document.createElement('li'); li.textContent = 'Bu aralıkta olay yok.'; ul.appendChild(li); }
  for (const e of evs) {
    const li = document.createElement('li'); if (e.type === 'alert') li.className = 'alert';
    const d = new Date(e.t), today = new Date();
    const day = d.toDateString() === today.toDateString() ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} `;
    li.textContent = `${day}${hhmm(e.t)} — ${e.text} `;
    if (e.src && e.type !== 'alert') { const sm = document.createElement('small'); sm.textContent = `(${e.src})`; li.appendChild(sm); }
    ul.appendChild(li);
  }
  drawChart(history.samplesBetween(from, to), from, to);
}
function drawChart(samples, from, to) {
  const svg = $('chart'); const NS = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const W = 600, H = 220, L = 38, R = 8, T = 10, B = 24;
  const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; svg.appendChild(e); return e; };
  const rooms = samples.map(s => s[1]).filter(v => typeof v === 'number');
  if (rooms.length < 2) { mk('text', {x: W / 2, y: H / 2, 'text-anchor': 'middle', style: 'fill:var(--muted);font-size:14px'}, 'Henüz grafik verisi yok'); return; }
  const lo = Math.floor(Math.min(...rooms, cfg.start) - 1), hi = Math.ceil(Math.max(...rooms, cfg.stop) + 1);
  const x = t => L + (t - from) / (to - from) * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  for (let v = lo; v <= hi; v += Math.max(1, Math.ceil((hi - lo) / 5))) {
    mk('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), style: 'stroke:var(--line);stroke-width:1'});
    mk('text', {x: L - 6, y: y(v) + 4, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:11px'}, v + '°');
  }
  for (let i = 0; i <= 4; i++) { const t = from + (to - from) * i / 4; mk('text', {x: x(t), y: H - 6, 'text-anchor': i === 0 ? 'start' : (i === 4 ? 'end' : 'middle'), style: 'fill:var(--muted);font-size:11px'}, hhmm(t)); }
  // çalışma aralıkları
  for (let i = 0; i < samples.length; i++) if (samples[i][3]) { const t0 = samples[i][0], t1 = Math.min(i + 1 < samples.length ? samples[i + 1][0] : t0 + 60000, t0 + 120000); mk('rect', {x: x(t0), y: T, width: Math.max(1, x(t1) - x(t0)), height: H - T - B, style: 'fill:var(--warn);opacity:.18'}); }
  mk('line', {x1: L, x2: W - R, y1: y(cfg.start), y2: y(cfg.start), style: 'stroke:var(--ok);stroke-dasharray:5 4;stroke-width:1.5'});
  mk('line', {x1: L, x2: W - R, y1: y(cfg.stop), y2: y(cfg.stop), style: 'stroke:var(--bad);stroke-dasharray:5 4;stroke-width:1.5'});
  let d = '', prevT = null;
  for (const s of samples) { if (typeof s[1] !== 'number') continue; d += (prevT === null || s[0] - prevT > 300000 ? 'M' : 'L') + x(s[0]).toFixed(1) + ' ' + y(s[1]).toFixed(1) + ' '; prevT = s[0]; }
  mk('path', {d, style: 'fill:none;stroke:var(--acc);stroke-width:2;stroke-linejoin:round'});
}

/* ---------- Olay bağlama ---------- */
function bindAction(btn, fn) {
  let timer = null;
  btn.addEventListener('click', () => { if (!nightOn()) fn(); });
  btn.addEventListener('pointerdown', () => { if (!nightOn()) return; btn.classList.add('holding'); timer = setTimeout(() => { timer = null; btn.classList.remove('holding'); fn(); }, 1500); });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } btn.classList.remove('holding'); };
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, cancel));
}
function bindHold(btn, ms, fn) {
  let timer = null;
  btn.addEventListener('pointerdown', () => { btn.classList.add('holding'); timer = setTimeout(() => { timer = null; btn.classList.remove('holding'); fn(); }, ms); });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } btn.classList.remove('holding'); };
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, cancel));
}
function setTab(name) {
  tab = name;
  for (const t of ['home', 'history', 'details']) $('tab-' + t).hidden = t !== name;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name === 'details') { $('log').textContent = logLines.join('\n'); }
  render();
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const changed = () => { saveCfg(); render(); };

$('startMinus').onclick = () => { cfg.start = clamp(cfg.start - 1, 10, 38); changed(); };
$('startPlus').onclick = () => { cfg.start = clamp(cfg.start + 1, 10, 38); if (cfg.stop < cfg.start + 2) cfg.stop = cfg.start + 2; changed(); };
$('stopMinus').onclick = () => { cfg.stop = clamp(cfg.stop - 1, cfg.start + 2, 40); targetSyncTries = 0; changed(); };
$('stopPlus').onclick = () => { cfg.stop = clamp(cfg.stop + 1, cfg.start + 2, 40); targetSyncTries = 0; changed(); };
$('autoToggle').onchange = async e => {
  if (e.target.checked) {
    const note = controlOk() ? '' : '\n\n(Şu an Bluetooth bağlantısı yok; bağlanınca devreye girer.)';
    if (!window.confirm(`Otomatik mod açılsın mı?\n\nOda ≤ ${cfg.start} °C olunca START, ≥ ${cfg.stop} °C olunca STOP gönderilir. Isıtıcı sen yokken kendiliğinden açılıp kapanabilir. CO alarmı, havalandırma ve cihaz güvenliği sende olmalı.${note}`)) { e.target.checked = false; return; }
    await ensureNotifyPermission();
    cfg.auto = true; engine.reset(); targetSyncTries = 0; log('Otomatik mod AÇILDI.');
  } else { cfg.auto = false; engine.reset(); log('Otomatik mod KAPATILDI.'); }
  saveCfg(); updateWake(); render();
};
bindAction($('startBtn'), manualStart);
bindAction($('stopBtn'), manualStop);
$('connectBtn').onclick = async () => {
  try { const name = await ble.connect(); everConnected = true; cfg.deviceId = ble.device?.id ?? null; saveCfg(); log('Bağlandı: ' + name); }
  catch (e) { if (e.name !== 'NotFoundError') toast('Bağlanılamadı: ' + e.message, 6000); log('Bağlantı hatası: ' + e.message); }
  render();
};
$('nightBtn').onclick = () => { cfg.night = true; saveCfg(); setTab('home'); updateWake(); render(); };
bindHold($('nightExit'), 1500, () => { cfg.night = false; saveCfg(); updateWake(); render(); });
$('tabs').addEventListener('click', e => { const b = e.target.closest?.('button[data-tab]'); if (b) setTab(b.dataset.tab); });
$('range').addEventListener('click', e => {
  const b = e.target.closest?.('button[data-h]'); if (!b) return;
  range = b.dataset.h; document.querySelectorAll('#range button').forEach(x => x.classList.toggle('on', x === b)); render();
});
$('exportBtn').onclick = () => download('webasto-gecmis.csv', history.toCsv(), 'text/csv');
$('clearBtn').onclick = () => { if (window.confirm('Tüm geçmiş silinsin mi?')) { history.clear(); render(); } };
$('notifyToggle').onchange = async e => { cfg.notify = e.target.checked; if (cfg.notify) await ensureNotifyPermission(); changed(); };
$('selStopDelay').onchange = e => { cfg.stopDelay = Number(e.target.value); changed(); };
$('selMinRun').onchange = e => { cfg.minRun = Number(e.target.value); changed(); };
$('selRestart').onchange = e => { cfg.restartDelay = Number(e.target.value); changed(); };
$('mode0Btn').onclick = () => ble.restoreTemperatureMode().then(() => toast('Mod 0 gönderildi.')).catch(e => toast(e.message, 6000));
$('disconnectBtn').onclick = () => { ble.disconnect(); prevRunning = null; render(); };
$('logDownload').onclick = () => download('webasto-kayit.txt', logLines.join('\n'), 'text/plain');
$('logClear').onclick = () => { logLines.length = 0; $('log').textContent = ''; };

/* ---------- Başlangıç ---------- */
setInterval(() => {
  if (ble.connected && ble.writeChar && Date.now() - (ble.lastStatusAt || 0) > 20000) ble.requestStatus();
  render();
}, 5000);
(async function init() {
  render(); updateWake();
  try {
    const name = await ble.reconnectKnown(cfg.deviceId);
    if (name) { everConnected = true; log('Önceki cihaza otomatik bağlanıldı: ' + name); }
  } catch (e) { log('Otomatik bağlanma yapılamadı: ' + e.message); }
  render();
})();
window.__hg = {ble, engine, history, onStatus, render, get cfg() { return cfg; }, get state() { return {cooling, busy, stopRecorded}; }};
