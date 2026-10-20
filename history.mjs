/** Çalışma geçmişi: olaylar + sıcaklık örnekleri. Saf mantık; depolama dışarıdan verilir (localStorage benzeri). */
const DAY = 86400000;
export class History {
  constructor(storage, key = 'webasto.history.v1') {
    this.storage = storage; this.key = key;
    this.events = []; this.samples = [];   // events: {t,type,src,room,text}  samples: [t,room,volt,running]
    this.dirty = 0;
    this.load();
  }
  load() {
    try {
      const d = JSON.parse(this.storage.getItem(this.key) || 'null');
      if (d && Array.isArray(d.events) && Array.isArray(d.samples)) { this.events = d.events; this.samples = d.samples; }
    } catch { /* bozuk kayıt: boş başla */ }
  }
  save() {
    try { this.storage.setItem(this.key, JSON.stringify({events: this.events, samples: this.samples})); this.dirty = 0; }
    catch { /* kota dolu: eski örnekleri at */ this.samples = this.samples.slice(-2000); }
  }
  prune(now) {
    this.samples = this.samples.filter(s => now - s[0] <= 7 * DAY);
    if (this.events.length > 600) this.events = this.events.slice(-600);
  }
  addEvent(ev) { this.events.push(ev); this.save(); }
  addSample(t, room, volt, running) {
    this.samples.push([t, room, volt, running ? 1 : 0]);
    this.prune(t);
    if (++this.dirty >= 5) this.save();
  }
  clear() { this.events = []; this.samples = []; this.save(); }
  eventsBetween(from, to) { return this.events.filter(e => e.t >= from && e.t <= to); }
  samplesBetween(from, to) { return this.samples.filter(s => s[0] >= from && s[0] <= to); }
  /** START/STOP sayısı, çalışma süresi (soğutma dahil, "kapalı değil" süresi), sıcaklık aralığı */
  stats(from, to) {
    const ev = this.eventsBetween(from, to);
    const sm = this.samplesBetween(from, to);
    let runMs = 0, min = null, max = null;
    for (let i = 0; i < sm.length; i++) {
      const [t, room, , run] = sm[i];
      if (typeof room === 'number') { min = min === null ? room : Math.min(min, room); max = max === null ? room : Math.max(max, room); }
      if (run) { const next = i + 1 < sm.length ? sm[i + 1][0] : t; runMs += Math.min(Math.max(next - t, 0), 120000); }
    }
    return {
      starts: ev.filter(e => e.type === 'start').length,
      stops: ev.filter(e => e.type === 'stop').length,
      alerts: ev.filter(e => e.type === 'alert').length,
      runMs, min, max
    };
  }
  toCsv() {
    const f = t => new Date(t).toISOString();
    const lines = ['tür;zaman;kaynak;oda;açıklama'];
    for (const e of this.events) lines.push([e.type, f(e.t), e.src ?? '', e.room ?? '', (e.text ?? '').replace(/;/g, ',')].join(';'));
    lines.push('', 'zaman;oda;akü;çalışıyor');
    for (const s of this.samples) lines.push([f(s[0]), s[1], s[2], s[3]].join(';'));
    return lines.join('\n');
  }
}
export const fmtDuration = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m/60)} sa ${m%60} dk` : `${m} dk`; };
