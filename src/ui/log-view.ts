import type { Site } from '../config';
import type { NightPlan } from '../astro/schedule';
import { sunAltitude } from '../astro/sun';
import { bandOf } from '../sat/predict';
import { ommArrayToTleText } from '../sat/elements';
import { deleteLog, getNightSet, getSetMeta, getSetText, listLogs, listSets, lockNightSet, putLog, type SetMeta } from '../sat/store';
import { loadCamera } from './sat-view';
import {
  bandFrames,
  clockModel,
  effectiveInterval,
  formatKst,
  frameAtTime,
  frameStart,
  logToCsv,
  newLog,
  parseKst,
  toTrueTime,
  trueStartEnd,
  type FieldLog,
} from '../log/fieldlog';
import { makeZip } from '../log/zip';
import { fileStamp, fmtDateTime, fmtHM, fmtHMS, fmtShortDate } from '../time';
import { esc } from './util';

export interface LogCtx {
  date: string;
  site: Site;
  plan: NightPlan;
}

const BAND_NAME: Record<string, string> = { twilight: 'Twilight band', dark: 'Dark band', gap: 'Between bands', outside: 'Outside bands' };

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function get(obj: any, path: string) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
function set(obj: any, path: string, v: unknown) {
  const ks = path.split('.');
  const last = ks.pop()!;
  ks.reduce((o, k) => o[k], obj)[last] = v;
}

export class LogView {
  private logs: FieldLog[] = [];
  private current: FieldLog | null = null;
  private setMeta: SetMeta | null = null;
  private el: HTMLElement | null = null;
  private ctx!: LogCtx;
  private saveTimer = 0;
  private status = '';
  private bound = new WeakSet<HTMLElement>();
  private loaded = false;

  constructor(private getCtx: () => LogCtx) {}

  render(el: HTMLElement) {
    this.el = el;
    this.ctx = this.getCtx();
    if (!this.bound.has(el)) {
      el.addEventListener('click', (e) => this.onClick(e));
      el.addEventListener('input', (e) => this.onInput(e));
      el.addEventListener('change', (e) => this.onInput(e));
      this.bound.add(el);
    }
    if (!this.loaded) {
      this.loaded = true;
      void this.reload();
    }
    this.paint();
  }

  detach() {
    this.el = null;
  }

  private async reload() {
    try {
      this.logs = await listLogs();
    } catch (e) {
      this.status = `Local storage unavailable: ${(e as Error).message}`;
    }
    this.paint();
  }

  // ---------------------------------------------------------------- events

  /** The night's locked element set is the research record; pick it up even if it was locked after the log was made. */
  private async syncElementSet(log: FieldLog) {
    const lock = await getNightSet(log.date).catch(() => null);
    if (lock && lock.setId !== log.elementSetId) {
      log.elementSetId = lock.setId;
      await putLog(log);
    }
    this.setMeta = log.elementSetId ? await getSetMeta(log.elementSetId) : null;
  }

  private async open(log: FieldLog) {
    this.current = log;
    await this.syncElementSet(log);
    this.status = '';
    this.paint();
    window.scrollTo(0, 0);
  }

  private async create() {
    const { date, site, plan } = this.ctx;
    const log = newLog(date);
    // Pre-fill from the plan and the Satellites camera settings.
    log.site = { latitude: site.latitude, longitude: site.longitude, elevation: site.elevation, accuracyM: null, source: 'manual' };
    const cam = loadCamera(); // same pointing the Satellites tab uses (saved or default)
    Object.assign(log.camera, { azimuth: cam.azimuth, altitude: cam.altitude, focalLength: cam.focalLength });
    log.camera.shotsPlanned = plan.window?.shots ?? null;
    const m = plan.moon;
    log.moon = `${m.illuminationPct.toFixed(0)}% lit (${m.phaseName}); ${m.minutesUp ? `above horizon ${m.minutesUp} min of the window, max alt ${m.maxAltitude?.toFixed(0)}°` : 'below the horizon for the whole window'} (predicted)`;
    await putLog(log);
    await this.reload();
    await this.open(log);
    this.gps(); // auto-fill from the phone's location (asks permission)
  }

  private gps() {
    if (!this.current || !('geolocation' in navigator)) return;
    const log = this.current;
    this.status = 'Getting GPS position…';
    this.paintStatus();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        log.site = {
          latitude: +pos.coords.latitude.toFixed(6),
          longitude: +pos.coords.longitude.toFixed(6),
          elevation: pos.coords.altitude != null ? Math.round(pos.coords.altitude) : log.site.elevation,
          accuracyM: Math.round(pos.coords.accuracy),
          source: 'gps',
        };
        this.status = `GPS filled (±${Math.round(pos.coords.accuracy)} m).`;
        void this.save();
        if (this.current === log) this.paint();
      },
      (err) => {
        this.status = `GPS failed: ${err.message}. Site left as the planning site.`;
        this.paintStatus();
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-log]');
    if (!b || !this.el?.contains(b)) return;
    const act = b.dataset.log!;
    if (act === 'new') return void this.create();
    if (act === 'open') {
      const l = this.logs.find((x) => x.id === b.dataset.id);
      if (l) void this.open(structuredClone(l));
      return;
    }
    if (act === 'back') {
      this.current = null;
      return void this.reload();
    }
    if (act === 'gps') return this.gps();
    if (act === 'now') {
      const target = b.dataset.target!;
      set(this.current, target, formatKst(Date.now()));
      void this.save();
      return this.paint();
    }
    if (act === 'delete') {
      if (this.current && confirm('Delete this log from this device? Export it first if you need it.')) {
        void deleteLog(this.current.id).then(() => {
          this.current = null;
          void this.reload();
        });
      }
      return;
    }
    if (act === 'zip' || act === 'csv' || act === 'json') return void this.export(act);
    if (act === 'lock-latest') {
      const log = this.current!;
      void (async () => {
        const latest = (await listSets())[0];
        if (!latest) {
          this.status = 'No element set on this device. Download or load one in the Satellites tab.';
          return this.paintStatus();
        }
        if (!confirm(`Lock the element set downloaded ${fmtDateTime(latest.downloadedAt)} KST as the record for ${log.date}?`)) return;
        await lockNightSet(log.date, latest.id);
        await this.syncElementSet(log);
        this.paint();
      })();
      return;
    }
  }

  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (!this.current) return;
    if (t.dataset.f) {
      const kind = t.dataset.kind;
      let v: unknown = t.value;
      if (kind === 'num') v = t.value.trim() === '' || !Number.isFinite(Number(t.value)) ? null : Number(t.value);
      if (t.type === 'datetime-local' && t.value && t.value.length === 16) v = `${t.value}:00`;
      set(this.current, t.dataset.f, v);
      this.queueSave();
      this.paintDerived();
    } else if (t.id === 'conv-exif' || t.id === 'conv-frame') {
      this.paintDerived();
    }
  }

  private queueSave() {
    clearTimeout(this.saveTimer);
    this.status = 'Saving…';
    this.paintStatus();
    this.saveTimer = window.setTimeout(() => void this.save(), 500);
  }

  private async save() {
    if (!this.current) return;
    this.current.updatedAt = Date.now();
    try {
      await putLog(this.current);
      this.status = `Saved on this device ${fmtHMS(new Date())}`;
    } catch (e) {
      this.status = `NOT saved: ${(e as Error).message}`;
    }
    this.paintStatus();
  }

  // ---------------------------------------------------------------- derived timing

  private derived() {
    const log = this.current!;
    const plan = this.ctx.plan;
    const clock = clockModel(log);
    const { start, end, corrected } = trueStartEnd(log);
    const interval = log.camera.intervalS ?? 16;
    const shots = log.camera.shotsTaken ?? log.camera.shotsPlanned;
    const eff = effectiveInterval(start, end, shots);
    const bands = start !== null ? bandFrames(start, interval, shots, plan.bands) : [];
    const lateS = start !== null && plan.window ? (start - plan.window.start.getTime()) / 1000 : null;
    return { clock, start, end, corrected, interval, shots, eff, bands, lateS };
  }

  private derivedFlat(): Record<string, string | number | null> {
    const d = this.derived();
    const bf = (k: string) => d.bands.find((b) => b.key === k);
    return {
      clock_offset_before_s: d.clock.before,
      clock_offset_after_s: d.clock.after,
      clock_drift_s: d.clock.drift,
      true_start_kst: d.start !== null ? formatKst(d.start) : null,
      true_end_kst: d.end !== null ? formatKst(d.end) : null,
      start_offset_from_plan_s: d.lateS !== null ? +d.lateS.toFixed(1) : null,
      effective_interval_s: d.eff !== null ? +d.eff.toFixed(3) : null,
      twilight_first_frame: bf('twilight')?.firstFrame ?? null,
      twilight_last_frame: bf('twilight')?.lastFrame ?? null,
      dark_first_frame: bf('dark')?.firstFrame ?? null,
      dark_last_frame: bf('dark')?.lastFrame ?? null,
      sun_minus12_kst: this.ctx.plan.sun.descending[-12] ? formatKst(this.ctx.plan.sun.descending[-12]!.getTime()) : null,
      sun_minus20_kst: this.ctx.plan.sun.descending[-20] ? formatKst(this.ctx.plan.sun.descending[-20]!.getTime()) : null,
      sun_minus25_kst: this.ctx.plan.sun.descending[-25] ? formatKst(this.ctx.plan.sun.descending[-25]!.getTime()) : null,
      sun_minus35_kst: this.ctx.plan.sun.descending[-35] ? formatKst(this.ctx.plan.sun.descending[-35]!.getTime()) : null,
    };
  }

  // ---------------------------------------------------------------- export

  private async export(kind: 'zip' | 'csv' | 'json') {
    const log = this.current!;
    await this.syncElementSet(log);
    await this.save();
    const stamp = log.start ? log.start.slice(11, 16).replace(':', '') : fileStamp(log.createdAt).slice(9);
    const base = `fieldlog_${log.date}_${stamp}`;
    const derived = this.derivedFlat();
    const csv = logToCsv(log, derived);
    const json = JSON.stringify(
      {
        app: 'Sat-Streak Planner',
        exportedAt: new Date().toISOString(),
        timeZone: 'Asia/Seoul (KST, UTC+9); all *_kst fields',
        log,
        derived,
        elementSet: this.setMeta,
        notes: 'Clock offset = camera − true (s). True time = camera time − offset (linear between checks). Frame n starts at true_start + (n−1)·interval.',
      },
      null,
      2,
    );
    if (kind === 'csv') return download(`${base}.csv`, csv, 'text/csv');
    if (kind === 'json') return download(`${base}.json`, json, 'application/json');

    const files: { name: string; data: string }[] = [
      { name: `${base}.csv`, data: csv },
      { name: `${base}.json`, data: json },
    ];
    let elementsNote = 'No element set was locked for this night.';
    if (log.elementSetId) {
      const text = await getSetText(log.elementSetId);
      const m = this.setMeta;
      if (text && m) {
        const sbase = `elements_${log.date}_${m.source}-${fileStamp(m.downloadedAt)}KST`;
        if (m.format === 'omm-json') {
          const r = ommArrayToTleText(JSON.parse(text));
          files.push({ name: `${sbase}.tle.txt`, data: r.text });
          files.push({ name: `${sbase}_omm.json`, data: text });
          elementsNote = `${sbase}.tle.txt: ${r.written} objects in TLE format (catalog numbers ≤ 99999). ${r.skipped} objects with 6-digit catalog numbers cannot be written as TLE; they are in ${sbase}_omm.json, the exact OMM data as ${m.source === 'celestrak' ? 'downloaded from CelesTrak' : `imported from ${m.label}`} at ${new Date(m.downloadedAt).toISOString()}.`;
        } else {
          files.push({ name: `${sbase}.tle.txt`, data: text });
          elementsNote = `${sbase}.tle.txt: the element set as imported (TLE).`;
        }
      }
    }
    files.push({
      name: 'README.txt',
      data: [
        `Field log export for the night of ${log.date} (Sat-Streak Planner).`,
        `${base}.csv / .json: the log, the measured camera clock offset and the derived timing (true start/end, frame numbers of the solar bands).`,
        elementsNote,
        'Recompute predictions for this night with these elements, not newer ones: newer elements give different positions.',
        'Times are KST (UTC+9) unless the field name says utc.',
      ].join('\n'),
    });
    download(`${base}.zip`, makeZip(files), 'application/zip');
  }

  // ---------------------------------------------------------------- rendering

  private paint() {
    if (!this.el || !this.ctx) return;
    this.el.innerHTML = this.current ? this.formHtml() : this.listHtml();
    if (this.current) this.paintDerived();
  }

  private paintStatus() {
    const s = this.el?.querySelector('#log-status');
    if (s) s.textContent = this.status;
  }

  private listHtml(): string {
    const rows = this.logs
      .map(
        (l) => `<tr><td><button class="linklike" data-log="open" data-id="${esc(l.id)}">${fmtShortDate(l.date)}</button><div class="sec">${esc(l.observers || '—')}</div></td>
          <td class="tnum">${l.start ? esc(l.start.slice(11)) : '—'}</td><td class="r tnum">${l.camera.shotsTaken ?? '—'}</td></tr>`,
      )
      .join('');
    return `<section class="card"><h2>Field log</h2>
      <p class="note">One log per night: site (GPS), camera settings, conditions, actual start/end and the camera clock check against time.is. Saved on this device as you type.</p>
      <div class="btn-row"><button class="primary" data-log="new">New log for ${fmtShortDate(this.ctx.date)}</button></div>
      ${this.status ? `<p class="note">${esc(this.status)}</p>` : ''}
    </section>
    <section class="card"><h2>Past logs (${this.logs.length})</h2>
      ${this.logs.length ? `<table><thead><tr><th>Night</th><th>Start</th><th class="r">Shots</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="note">No logs yet.</p>'}
    </section>`;
  }

  private formHtml(): string {
    const l = this.current!;
    const num = (path: string, label: string, step = 'any', extra = '') =>
      `<label>${label}<input data-f="${path}" data-kind="num" type="number" inputmode="decimal" step="${step}" value="${get(l, path) ?? ''}" ${extra}></label>`;
    const txt = (path: string, label: string, ph = '') => `<label class="full">${label}<input data-f="${path}" type="text" value="${esc(String(get(l, path) ?? ''))}" placeholder="${esc(ph)}"></label>`;
    const dt = (path: string, label: string) =>
      `<label class="full">${label}<span class="dt-row"><input data-f="${path}" type="datetime-local" step="1" value="${esc(String(get(l, path) ?? ''))}"><button type="button" class="small" data-log="now" data-target="${path}">Now</button></span></label>`;
    const sel = (path: string, label: string, opts: string[]) =>
      `<label class="full">${label}<select data-f="${path}">${['', ...opts].map((o) => `<option${get(l, path) === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    const plan = this.ctx.plan;
    const dateWarn = l.date !== this.ctx.date ? `<p class="warn">This log is for ${l.date}; the date selector shows ${this.ctx.date}. Band times below are for ${this.ctx.date}. Switch the date to ${l.date} to see the correct bands.</p>` : '';
    return `<div class="btn-row" style="margin:0 0 12px"><button data-log="back">‹ All logs</button><span class="sec" id="log-status" role="status">${esc(this.status)}</span></div>
    ${dateWarn}
    <section class="card"><h2>Night &amp; site · ${fmtShortDate(l.date)}</h2>
      <div class="cam-grid">
        <label>Night (evening date)<input data-f="date" type="date" value="${l.date}"></label>
        ${txt('observers', 'Observers')}
        ${num('site.latitude', 'Latitude (°N)')}${num('site.longitude', 'Longitude (°E)')}
        ${num('site.elevation', 'Elevation (m)')}${num('site.accuracyM', 'GPS accuracy (m)')}
      </div>
      <div class="btn-row"><button data-log="gps">Use GPS</button><span class="sec">Source: ${l.site.source || '—'}</span></div>
    </section>
    <section class="card"><h2>Camera</h2>
      <div class="cam-grid">
        ${num('camera.azimuth', 'Azimuth (°)', '1')}${num('camera.altitude', 'Altitude (°)', '1')}
        ${num('camera.focalLength', 'Focal length (mm)')}${num('camera.iso', 'ISO', '1')}
        ${num('camera.aperture', 'Aperture (f/)', '0.1')}${num('camera.exposureS', 'Exposure (s)')}
        ${num('camera.intervalS', 'Interval (s)')}${num('camera.shotsPlanned', 'Number of Shots (set)', '1')}
        ${num('camera.shotsTaken', 'Frames actually taken', '1')}
      </div>
    </section>
    <section class="card"><h2>Conditions</h2>
      <div class="cam-grid">
        ${sel('clouds', 'Clouds', ['Clear', 'Thin high cloud', 'Partly cloudy', 'Mostly cloudy', 'Overcast'])}
        ${txt('weather', 'Weather (wind, humidity, dew, temperature)')}
        ${txt('moon', 'Moon')}
        <label class="full">Notes (airplanes, lights, interruptions)<textarea data-f="notes" rows="4">${esc(l.notes)}</textarea></label>
      </div>
    </section>
    <section class="card"><h2>Actual start / end</h2>
      <div class="cam-grid">
        ${dt('start', 'Start (first frame)')}${dt('end', 'End (last frame)')}
        <label class="full">These times were read from
          <select data-f="timeSource"><option value="camera"${l.timeSource === 'camera' ? ' selected' : ''}>Camera clock (EXIF of first/last frame)</option><option value="true"${l.timeSource === 'true' ? ' selected' : ''}>True time (phone / time.is)</option></select></label>
      </div>
      <p class="note">Plan: start ${plan.window ? fmtHMS(plan.window.start) : '—'}, end ${plan.window ? fmtHMS(plan.window.end) : '—'} KST.</p>
    </section>
    <section class="card"><h2>Camera clock check (time.is)</h2>
      <p class="note">For each time.is photo enter its EXIF time (camera clock) and the time shown on the screen in the photo. Offset = EXIF − screen.</p>
      <h3>Before shooting</h3>
      <div class="cam-grid">${dt('clockBefore.exif', 'EXIF time of the photo')}${dt('clockBefore.actual', 'Time shown on time.is')}</div>
      <h3>After shooting</h3>
      <div class="cam-grid">${dt('clockAfter.exif', 'EXIF time of the photo')}${dt('clockAfter.actual', 'Time shown on time.is')}</div>
    </section>
    <section class="card"><h2>Timing for band sorting</h2>
      <div id="log-derived"></div>
      <h3>Photo → band</h3>
      <div class="cam-grid">
        <label class="full">EXIF time of any photo<input id="conv-exif" type="datetime-local" step="1"></label>
        <label class="full">…or frame number<input id="conv-frame" type="number" inputmode="numeric" min="1" step="1"></label>
      </div>
      <div id="log-conv"></div>
    </section>
    <section class="card"><h2>Export</h2>
      <p class="note">${l.elementSetId ? `Element set: ${this.setMeta ? `${esc(this.setMeta.label)}, downloaded ${fmtDateTime(this.setMeta.downloadedAt)} KST` : esc(l.elementSetId)}` : `<b>No element set locked for ${l.date}.</b> The export needs the elements used that night.`}</p>
      ${l.elementSetId ? '' : '<div class="btn-row"><button data-log="lock-latest">Lock the most recent element set for this night</button></div>'}
      <div class="btn-row"><button class="primary" data-log="zip">Download bundle (.zip)</button><button data-log="csv">CSV</button><button data-log="json">JSON</button></div>
      <p class="note">The bundle contains the log (CSV + JSON), the night’s elements as TLE text (.txt) plus the original OMM JSON (needed for 6-digit catalog numbers), and a README.</p>
      <div class="btn-row"><button data-log="delete">Delete log</button></div>
    </section>`;
  }

  private paintDerived() {
    const box = this.el?.querySelector<HTMLElement>('#log-derived');
    if (!box || !this.current) return;
    const keepExif = this.el!.querySelector<HTMLInputElement>('#conv-exif')?.value ?? '';
    const keepFrame = this.el!.querySelector<HTMLInputElement>('#conv-frame')?.value ?? '';
    const d = this.derived();
    const plan = this.ctx.plan;
    const s = (x: number | null, u = 's') => (x === null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)} ${u}`);
    const clockTxt =
      d.clock.before === null && d.clock.after === null
        ? '<b>Not measured yet.</b> Without it, camera times are used as true times.'
        : `before ${s(d.clock.before)}, after ${s(d.clock.after)}${d.clock.drift !== null ? `, drift ${s(d.clock.drift)}` : ''} <span class="sec">(+ = camera fast)</span>`;
    const driftWarn = d.clock.drift !== null && Math.abs(d.clock.drift) > 2 ? '<p class="warn">Clock drift over 2 s: check both time.is photos.</p>' : '';
    const intWarn = d.eff !== null && Math.abs(d.eff - d.interval) > 0.05 ? `<p class="warn">Effective interval ${d.eff.toFixed(3)} s differs from the ${d.interval} s setting. Check the frame count and the end time; frame numbers below assume ${d.interval} s.</p>` : '';
    const bandRows = d.bands
      .map((b) => {
        const sched = plan.timeline.filter((i) => i.kind === 'band' && i.label.startsWith(b.key === 'twilight' ? 'Twilight' : 'Dark')).map((i) => i.frame ?? '—');
        return `<tr class="${b.key}"><td>${BAND_NAME[b.key]}</td><td class="tnum">${b.start ? fmtHMS(new Date(b.start)) : '—'}–${b.end ? fmtHMS(new Date(b.end)) : '—'}</td>
          <td class="r tnum"><b>${b.firstFrame ?? '—'}–${b.lastFrame ?? '—'}</b></td><td class="r tnum sec">${sched.join('–')}</td></tr>`;
      })
      .join('');
    // Converters
    let conv = '';
    if (d.start !== null) {
      const camT = parseKst(keepExif);
      if (camT !== null) {
        const tt = toTrueTime(this.current, camT);
        const fr = frameAtTime(d.start, d.interval, tt, d.shots);
        const sa = sunAltitude(new Date(tt), this.ctx.site);
        conv += `<p class="tnum">True ${fmtHMS(new Date(tt))} · frame ${fr ?? 'outside run'} · Sun ${sa.toFixed(2)}° · <b>${BAND_NAME[bandOf(sa)]}</b></p>`;
      }
      const n = Number(keepFrame);
      if (keepFrame && Number.isInteger(n) && n >= 1) {
        const tt = frameStart(d.start, d.interval, n);
        const sa = sunAltitude(new Date(tt + 7500), this.ctx.site);
        conv += `<p class="tnum">Frame ${n}: starts ${fmtHMS(new Date(tt))} true · Sun ${sa.toFixed(2)}° at mid-exposure · <b>${BAND_NAME[bandOf(sa)]}</b></p>`;
      }
    }
    const convBox = this.el!.querySelector<HTMLElement>('#log-conv');
    if (convBox) convBox.innerHTML = conv || '<p class="note">EXIF times are the most accurate way to sort a frame: they are corrected by the clock offset, then classified by the Sun’s altitude.</p>';
    box.innerHTML = `<dl class="kv">
        <dt>Clock offset</dt><dd class="tnum">${clockTxt}</dd>
        <dt>True start</dt><dd class="tnum">${d.start !== null ? `<b>${fmtHMS(new Date(d.start))}</b>${d.corrected ? ' (corrected)' : ''}${d.lateS !== null ? ` · ${d.lateS >= 0 ? `${(d.lateS / 60).toFixed(1)} min after` : `${(-d.lateS / 60).toFixed(1)} min before`} the planned start` : ''}` : 'enter the start time'}</dd>
        <dt>True end</dt><dd class="tnum">${d.end !== null ? fmtHMS(new Date(d.end)) : '—'}</dd>
        <dt>Effective interval</dt><dd class="tnum">${d.eff !== null ? `${d.eff.toFixed(3)} s (${d.shots} frames)` : '—'}</dd>
      </dl>
      ${driftWarn}${intWarn}
      ${d.start !== null ? `<table style="margin-top:10px"><thead><tr><th>Band</th><th>Sun-angle times (KST)</th><th class="r">Frames (actual)</th><th class="r">Planned</th></tr></thead><tbody>${bandRows}</tbody></table>
      <p class="note">Frames whose exposure starts inside the band, from the true start and the ${d.interval}-s interval. "Planned" assumed the scheduled start (${plan.window ? fmtHM(plan.window.start) : '—'}).</p>` : ''}`;
  }
}
