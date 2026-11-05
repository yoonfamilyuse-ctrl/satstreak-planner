import { CAMERA, type Site } from '../config';
import { computeNight, type NightPlan } from '../astro/schedule';
import { sunAltitude } from '../astro/sun';
import { bandAtTime, FRAME_BAND_RULE, midExposure } from '../astro/frames';
import { ommArrayToTleText } from '../sat/elements';
import { deleteLog, getLog, getNightSet, getSetMeta, getSetText, listLogs, listSets, lockNightSet, putLog, type SetMeta } from '../sat/store';
import { loadCamera } from './sat-view';
import {
  bandFrames,
  clockModel,
  effectiveInterval,
  formatKst,
  frameAtTime,
  frameStart,
  logToCsv,
  migrateLog,
  newLog,
  parseKst,
  toTrueTime,
  trueStartEnd,
  TIME_SOURCES,
  type FieldLog,
  type TimeSource,
} from '../log/fieldlog';
import { makeZip } from '../log/zip';
import { SatWorker } from '../sat/client';
import { DEFAULT_CAMERA, inFov, makeFov } from '../sat/fov';
import { compass } from '../astro/moon';
import { fileStamp, fmtDateTime, fmtHM, fmtHMS, fmtShortDate, isValidDateString } from '../time';
import { esc } from './util';

export interface LogCtx {
  date: string;
  site: Site;
  plan: NightPlan;
}

const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_L = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
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
  /** Log with an edit waiting for the debounced save (saved even if the user has moved to another log). */
  private pending: FieldLog | null = null;
  /** Ids deleted in this session: a save still in flight must not write them back. */
  private deleted = new Set<string>();
  private status = '';
  private bound = new WeakSet<HTMLElement>();
  private loaded = false;
  private worker: SatWorker | null = null;
  private issCheck: { html: string; csv: string } | null = null;
  private planCache: { key: string; plan: NightPlan } | null = null;

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
      this.logs = (await listLogs()).map(migrateLog);
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
    await this.flush();
    this.current = log;
    this.issCheck = null;
    await this.syncElementSet(log);
    this.status = '';
    this.paint();
    window.scrollTo(0, 0);
  }

  private async create() {
    await this.flush();
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
    if (!this.current || !navigator.geolocation) return;
    const id = this.current.id;
    this.status = 'Getting GPS position…';
    this.paintStatus();
    navigator.geolocation.getCurrentPosition(
      (pos) => void this.applyGps(id, pos),
      (err) => {
        this.status = `GPS failed: ${err.message}. Site left as the planning site.`;
        this.paintStatus();
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  /**
   * A fix can take up to 20 s; by then the user may have left this log or opened another one. Write it to the log
   * it was requested for: the open copy if that log is still open, otherwise the stored copy.
   */
  private async applyGps(id: string, pos: GeolocationPosition) {
    const open = this.current?.id === id;
    const log = open ? this.current : await getLog(id).catch(() => null);
    if (!log) return; // deleted meanwhile
    log.site = {
      latitude: +pos.coords.latitude.toFixed(6),
      longitude: +pos.coords.longitude.toFixed(6),
      elevation: pos.coords.altitude != null ? Math.round(pos.coords.altitude) : log.site.elevation,
      accuracyM: Math.round(pos.coords.accuracy),
      source: 'gps',
    };
    await this.save(log);
    if (open && this.current === log) {
      this.status = `GPS filled (±${Math.round(pos.coords.accuracy)} m).`;
      this.paint();
    } else if (!this.current) void this.reload();
  }

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-log]');
    if (!b || !this.el?.contains(b)) return;
    const act = b.dataset.log!;
    if (act === 'new') return void this.create();
    if (act === 'open') {
      const l = this.logs.find((x) => x.id === b.dataset.id);
      if (l) void this.open(migrateLog(structuredClone(l)));
      return;
    }
    if (act === 'back') {
      const saved = this.flush(); // the save is queued before the reload reads the list
      this.current = null;
      return void saved.then(() => this.reload());
    }
    if (act === 'gps') return this.gps();
    if (act === 'pick') {
      const path = b.dataset.f!;
      set(this.current, path, get(this.current, path) === b.dataset.v ? '' : b.dataset.v);
      this.queueSave(this.current!);
      this.el!.querySelectorAll<HTMLElement>(`[data-log="pick"][data-f="${path}"]`).forEach((c) => c.setAttribute('aria-pressed', String(get(this.current, path) === c.dataset.v)));
      return;
    }
    if (act === 'add-reading' || act === 'del-reading') {
      const side = b.dataset.side as 'clockBefore' | 'clockAfter';
      const list = this.current![side];
      if (act === 'add-reading') list.push({ exif: '', actual: '' });
      else if (list.length > 1) list.splice(Number(b.dataset.i), 1);
      else list[0] = { exif: '', actual: '' };
      void this.save();
      return this.paint();
    }
    if (act === 'now') {
      const target = b.dataset.target as 'start' | 'end';
      set(this.current, target, formatKst(Date.now()));
      this.current!.timeSource[target] = 'phone'; // the phone's clock, not the camera's: no offset correction
      void this.save();
      return this.paint();
    }
    if (act === 'delete') {
      const log = this.current;
      if (log && confirm('Delete this log from this device? Export it first if you need it.')) {
        // The debounce timer may be overdue by now (confirm() blocks): cancel it before it can re-save the log.
        if (this.pending?.id === log.id) {
          clearTimeout(this.saveTimer);
          this.pending = null;
        }
        this.deleted.add(log.id);
        this.current = null;
        void deleteLog(log.id).then(() => this.reload());
      }
      return;
    }
    if (act === 'zip' || act === 'csv' || act === 'json') return void this.export(act);
    if (act === 'iss-check') return void this.runIssCheck();
    if (act === 'iss-csv' && this.issCheck) return download(`iss_timing_${this.current!.date}.csv`, this.issCheck.csv, 'text/csv');
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
      // A cleared or half-typed date input reports ''. Keep the stored night instead of saving an invalid date.
      if (t.dataset.f === 'date' && !isValidDateString(t.value)) {
        this.status = 'Night not changed: enter a complete date.';
        return this.paintStatus();
      }
      const kind = t.dataset.kind;
      let v: unknown = t.value;
      if (kind === 'num') v = t.value.trim() === '' || !Number.isFinite(Number(t.value)) ? null : Number(t.value);
      if (t.type === 'datetime-local' && t.value && t.value.length === 16) v = `${t.value}:00`;
      set(this.current, t.dataset.f, v);
      this.queueSave(this.current);
      this.paintDerived();
    } else if (t.id === 'conv-exif' || t.id === 'conv-frame') {
      this.paintDerived();
    }
  }

  /** Debounced save of `log` (the log being edited now, captured at edit time). */
  private queueSave(log: FieldLog) {
    if (this.pending && this.pending !== log) void this.save(this.pending);
    clearTimeout(this.saveTimer);
    this.pending = log;
    this.status = 'Saving…';
    this.paintStatus();
    this.saveTimer = window.setTimeout(() => void this.flush(), 500);
  }

  /** Save a pending debounced edit now. */
  private flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    const log = this.pending;
    this.pending = null;
    return log ? this.save(log) : Promise.resolve();
  }

  private async save(log: FieldLog | null = this.current) {
    if (!log || this.deleted.has(log.id)) return;
    if (this.pending === log) {
      clearTimeout(this.saveTimer);
      this.pending = null;
    }
    log.updatedAt = Date.now();
    try {
      await putLog(log);
      this.status = `Saved on this device ${fmtHMS(new Date())}`;
    } catch (e) {
      this.status = `NOT saved: ${(e as Error).message}`;
    }
    this.paintStatus();
  }

  // ---------------------------------------------------------------- derived timing

  /**
   * Night plan (solar bands, planned window) for the log's own night at the planning site. The date selector may
   * show another night; derived timing and exports must not use that one. Null if the stored date is malformed.
   */
  private planFor(log: FieldLog): NightPlan | null {
    const { date, site, plan } = this.ctx;
    if (log.date === date) return plan;
    if (!isValidDateString(log.date)) return null;
    const key = JSON.stringify([log.date, site.latitude, site.longitude, site.elevation]);
    if (this.planCache?.key !== key) this.planCache = { key, plan: computeNight(log.date, site) };
    return this.planCache.plan;
  }

  private derived() {
    const log = this.current!;
    const plan = this.planFor(log);
    const clock = clockModel(log);
    const { start, end, corrected, startCorrected, endCorrected } = trueStartEnd(log);
    const interval = log.camera.intervalS ?? 16;
    const exposure = log.camera.exposureS ?? 15;
    const shots = log.camera.shotsTaken ?? log.camera.shotsPlanned;
    const eff = effectiveInterval(start, end, shots);
    const bands = start !== null && plan ? bandFrames(start, interval, exposure, shots, plan.bands) : [];
    const lateS = start !== null && plan?.window ? (start - plan.window.start.getTime()) / 1000 : null;
    return { plan, clock, start, end, corrected, startCorrected, endCorrected, interval, exposure, shots, eff, bands, lateS };
  }

  private derivedFlat(): Record<string, string | number | null> {
    const d = this.derived();
    const bf = (k: string) => d.bands.find((b) => b.key === k);
    const sunAt = (alt: keyof NightPlan['sun']['descending']) => {
      const t = d.plan?.sun.descending[alt];
      return t ? formatKst(t.getTime()) : null;
    };
    return {
      clock_offset_before_s: d.clock.before !== null ? +d.clock.before.toFixed(3) : null,
      clock_offset_before_n: d.clock.beforeDetail?.n ?? null,
      clock_offset_before_range_s: d.clock.beforeDetail ? `${d.clock.beforeDetail.min}..${d.clock.beforeDetail.max}` : null,
      clock_offset_after_s: d.clock.after !== null ? +d.clock.after.toFixed(3) : null,
      clock_offset_after_n: d.clock.afterDetail?.n ?? null,
      clock_offset_after_range_s: d.clock.afterDetail ? `${d.clock.afterDetail.min}..${d.clock.afterDetail.max}` : null,
      clock_drift_s: d.clock.drift,
      true_start_kst: d.start !== null ? formatKst(d.start) : null,
      true_end_kst: d.end !== null ? formatKst(d.end) : null,
      start_offset_from_plan_s: d.lateS !== null ? +d.lateS.toFixed(1) : null,
      effective_interval_s: d.eff !== null ? +d.eff.toFixed(3) : null,
      twilight_first_frame: bf('twilight')?.firstFrame ?? null,
      twilight_last_frame: bf('twilight')?.lastFrame ?? null,
      dark_first_frame: bf('dark')?.firstFrame ?? null,
      dark_last_frame: bf('dark')?.lastFrame ?? null,
      sun_minus12_kst: sunAt(-12),
      sun_minus20_kst: sunAt(-20),
      sun_minus25_kst: sunAt(-25),
      sun_minus35_kst: sunAt(-35),
    };
  }

  // ---------------------------------------------------------------- ISS timing check

  /**
   * Predicted ISS positions at the start and end of each exposure that contains the ISS, under both EXIF conventions:
   *  A: DateTimeOriginal = exposure START  → frame n starts at T₀ + (n−1)·Δ
   *  B: DateTimeOriginal = exposure END    → frame n starts at T₀ + (n−1)·Δ − t_exp
   * (T₀ = true time of the first frame from the logged start and clock offset.) Compare with the measured streak
   * endpoints after plate-solving (README: "Timing check with the ISS").
   */
  private async runIssCheck() {
    const log = this.current!;
    const d = this.derived();
    const out = (html: string) => {
      this.issCheck = { html, csv: this.issCheck?.csv ?? '' };
      this.paintDerived();
    };
    if (d.start === null) return out('<p class="warn">Enter the actual start first.</p>');
    if (!log.elementSetId) return out('<p class="warn">Lock an element set for this night first (see Export).</p>');
    const text = await getSetText(log.elementSetId);
    if (!text) return out('<p class="warn">Element set not found on this device.</p>');
    out('<p class="note">Computing…</p>');
    this.worker ??= new SatWorker();
    const exp = log.camera.exposureS ?? 15;
    const interval = d.interval;
    const shots = d.shots ?? 600;
    const site = { name: '', latitude: log.site.latitude ?? this.ctx.site.latitude, longitude: log.site.longitude ?? this.ctx.site.longitude, elevation: log.site.elevation ?? this.ctx.site.elevation };
    const cam = { ...DEFAULT_CAMERA, azimuth: log.camera.azimuth ?? DEFAULT_CAMERA.azimuth, altitude: log.camera.altitude ?? DEFAULT_CAMERA.altitude, focalLength: log.camera.focalLength ?? DEFAULT_CAMERA.focalLength };
    const fov = makeFov(cam);
    // 1-s samples over the whole run (both conventions), then keep frames with the ISS sunlit inside the frame.
    const t0 = d.start - exp * 1000;
    const tEnd = d.start + (shots - 1) * interval * 1000 + exp * 1000;
    const times: number[] = [];
    for (let t = t0; t <= tEnd; t += 1000) times.push(t);
    let r: { points: { t: number; az: number; alt: number; sunlit: boolean }[]; epoch: number };
    try {
      if (this.worker.loaded !== log.elementSetId) {
        await this.worker.call({ type: 'parse', setId: log.elementSetId, text });
        this.worker.loaded = log.elementSetId;
      }
      r = await this.worker.call({ type: 'track', setId: log.elementSetId, norad: 25544, times, site });
    } catch (e) {
      return out(`<p class="warn">${esc((e as Error).message)}</p>`);
    }
    const D2R = Math.PI / 180;
    const at = (t: number) => r.points[Math.round((t - t0) / 1000)];
    const exact = async (ts: number[]) =>
      (await this.worker!.call<{ points: { t: number; az: number; alt: number; sunlit: boolean }[] }>({ type: 'track', setId: log.elementSetId!, norad: 25544, times: ts, site })).points;
    const rows: string[] = [];
    const csv: string[] = ['convention,frame,band,frame_start_true_kst,frame_end_true_kst,iss_az_start,iss_alt_start,iss_az_end,iss_alt_end,sunlit_start,sunlit_end'];
    const bandsOfNight = d.plan?.bands ?? [];
    for (const conv of ['A', 'B'] as const) {
      const shift = conv === 'A' ? 0 : -exp * 1000;
      const frames: number[] = [];
      for (let n = 1; n <= shots; n++) {
        const fs = d.start + (n - 1) * interval * 1000 + shift;
        let hit = false;
        for (let t = fs; t <= fs + exp * 1000; t += 1000) {
          const p = at(t);
          if (p && p.sunlit && p.alt > 0 && inFov(fov, p.az * D2R, p.alt * D2R)) hit = true;
        }
        if (hit) frames.push(n);
      }
      for (const n of frames) {
        const fs = d.start + (n - 1) * interval * 1000 + shift;
        const [a, b] = await exact([fs, fs + exp * 1000]);
        const pos = (p: typeof a) => `${p.az.toFixed(2)}° ${compass(p.az)}, ${p.alt.toFixed(2)}°${p.sunlit ? '' : ' (shadow)'}`;
        const band = bandAtTime(fs + exp * 500, bandsOfNight); // mid-exposure rule (frames.ts)
        rows.push(`<tr><td>${conv}</td><td class="r tnum">${n}</td><td>${BAND_NAME[band]}</td><td class="tnum">${fmtHMS(new Date(fs))}</td><td class="tnum">${pos(a)}</td><td class="tnum">${pos(b)}</td></tr>`);
        csv.push([conv, n, band, formatKst(fs), formatKst(fs + exp * 1000), a.az.toFixed(4), a.alt.toFixed(4), b.az.toFixed(4), b.alt.toFixed(4), a.sunlit, b.sunlit].join(','));
      }
    }
    const meta = this.setMeta;
    this.issCheck = {
      csv:
        `# ISS predicted positions per frame, night ${log.date}; A: EXIF = exposure start, B: EXIF = exposure end; elements ${meta?.label ?? log.elementSetId} (ISS epoch ${new Date(r.epoch).toISOString()})\n` +
        `# band: ${FRAME_BAND_RULE}\n` +
        csv.join('\n') +
        '\n',
      html: rows.length
        ? `<div class="scroll-x"><table><thead><tr><th>Conv.</th><th class="r">Frame</th><th>Band</th><th>Exposure start (true)</th><th>ISS at start (az, alt)</th><th>ISS at end</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
           <p class="note">A = EXIF marks the exposure start; B = EXIF marks the end (true start ${exp} s earlier). The ISS moves ≈ 1°/s here, so 1 s of timing error ≈ 1° along the track. Band: Sun at mid-exposure (frame start + ${exp / 2} s). ISS element epoch ${fmtDateTime(r.epoch)} KST.</p>
           <div class="btn-row"><button type="button" data-log="iss-csv">Download ISS timing CSV</button></div>`
        : '<p class="note">The ISS does not enter this frame during the logged run (check pointing, start time and frame count).</p>',
    };
    this.paintDerived();
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
        notes: `Clock offset = camera − true (s). True time = camera time − offset (linear between checks). Frame n starts at true_start + (n−1)·interval. Band frames: ${FRAME_BAND_RULE}`,
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
        `Band frames: ${FRAME_BAND_RULE}`,
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
        (l) => `<li><button type="button" class="log-row" data-log="open" data-id="${esc(l.id)}">
          <span class="log-row-main"><b>${fmtShortDate(l.date)}</b><span class="sec">${esc(l.observers || 'No observers entered')}</span></span>
          <span class="log-row-side tnum">${l.start ? esc(l.start.slice(11)) : '—'}<span class="sec">${l.camera.shotsTaken ?? '—'} frames</span></span>
          ${CHEVRON}</button></li>`,
      )
      .join('');
    const hasTonight = this.logs.some((l) => l.date === this.ctx.date);
    return `<section class="block log-intro">
      <h2>Field log</h2>
      <p class="note">One log per night: actual start and end, the camera clock check against time.is, conditions, camera and site. Saved on this phone as you type.</p>
      <button type="button" class="primary big-btn" data-log="new">${hasTonight ? 'Another' : 'New'} log for ${fmtShortDate(this.ctx.date)}</button>
      ${this.status ? `<p class="note">${esc(this.status)}</p>` : ''}
    </section>
    <section class="block"><h2>Past logs (${this.logs.length})</h2>
      ${this.logs.length ? `<ul class="log-list">${rows}</ul>` : '<p class="note">No logs yet. Logs stay on this phone until you delete them; export each one after the night.</p>'}
    </section>`;
  }

  private formHtml(): string {
    const l = this.current!;
    const num = (path: string, label: string, step = 'any', extra = '') =>
      `<label>${label}<input data-f="${path}" data-kind="num" type="number" inputmode="${step === '1' ? 'numeric' : 'decimal'}" enterkeyhint="done" step="${step}" value="${get(l, path) ?? ''}" ${extra}></label>`;
    const txt = (path: string, label: string, ph = '') => `<label class="full">${label}<input data-f="${path}" type="text" enterkeyhint="done" value="${esc(String(get(l, path) ?? ''))}" placeholder="${esc(ph)}"></label>`;
    const SRC_LABEL: Record<TimeSource, string> = { camera: 'Camera clock (EXIF)', true: 'True time (time.is)', phone: 'Phone clock (Now)' };
    const plan = this.planFor(l);
    const planned = (path: 'start' | 'end') => (plan?.window ? fmtHMS(path === 'start' ? plan.window.start : plan.window.end) : '—');
    const dt = (path: 'start' | 'end', label: string) =>
      `<div class="when">
        <div class="when-head"><span class="when-label">${label}</span><span class="sec tnum">plan ${planned(path)}</span></div>
        <button type="button" class="primary big-btn" data-log="now" data-target="${path}">${path === 'start' ? 'Start' : 'End'} now</button>
        <div class="cam-grid">
          <label>Time<input data-f="${path}" type="datetime-local" step="1" value="${esc(String(get(l, path) ?? ''))}"></label>
          <label>Read from<select data-f="timeSource.${path}" aria-label="${label}: clock it was read from">${TIME_SOURCES.map((o) => `<option value="${o}"${l.timeSource[path] === o ? ' selected' : ''}>${SRC_LABEL[o]}</option>`).join('')}</select></label>
        </div>
      </div>`;
    const CLOUDS = ['Clear', 'Thin high cloud', 'Partly cloudy', 'Mostly cloudy', 'Overcast'];
    const chips = (path: string, opts: string[]) =>
      `<div class="chips" role="group" aria-label="Clouds">${opts.map((o) => `<button type="button" class="chip" data-log="pick" data-f="${path}" data-v="${esc(o)}" aria-pressed="${get(l, path) === o}">${esc(o)}</button>`).join('')}</div>`;
    const dateWarn = l.date !== this.ctx.date ? `<p class="warn">This log is for ${esc(fmtShortDate(l.date))}; the date bar shows ${fmtShortDate(this.ctx.date)}. Plan times, bands and exports here use the log’s night.</p>` : '';
    return `<div class="log-top"><button type="button" class="pill-btn" data-log="back">${CHEVRON_L} All logs</button><span class="sec" id="log-status" role="status">${esc(this.status)}</span></div>
    <h2 class="log-title">Log · ${fmtShortDate(l.date)}</h2>
    ${dateWarn}
    <section class="block"><h2>Shooting</h2>
      ${dt('start', 'Start (first frame)')}
      ${dt('end', 'End (last frame)')}
      <div class="cam-grid">
        ${num('camera.shotsTaken', 'Frames taken', '1')}${num('camera.shotsPlanned', 'Number of Shots (set)', '1')}
      </div>
      <p class="note">Camera-clock times are corrected by the measured offset; time.is and phone times are used as they are. “Now” fills the phone’s time and sets the source to Phone clock.</p>
    </section>
    <section class="block"><h2>Camera clock check (time.is)</h2>
      <p class="note">For each photo of the time.is screen: the EXIF time (camera clock) and the time shown in the photo. Offset = EXIF − screen; each side uses the mean.</p>
      ${this.readingsHtml('clockBefore', 'Before shooting')}
      ${this.readingsHtml('clockAfter', 'After shooting')}
      <details class="how"><summary>How to take the time.is photos</summary>
        <p class="note">Use a <b>fast shutter speed (e.g. 1/100 s)</b> so the digits are sharp. Take <b>5–10 shots before and 5–10 after</b>, a few seconds apart, without changing the camera time settings. EXIF DateTimeOriginal has whole-second resolution (CIPA DC-008), and time.is shows whole seconds, so one reading is only good to about ±1 s. Readings taken at different fractions of a second average to a much better estimate. If your files contain <code>SubSecTimeOriginal</code> (check with <code>exiftool -time:all</code>), enter the EXIF time to the second and note the fraction in Notes.</p>
      </details>
    </section>
    <section class="block"><h2>Conditions</h2>
      <span class="field-label">Clouds</span>
      ${chips('clouds', CLOUDS)}
      <div class="cam-grid">
        ${txt('weather', 'Weather (wind, humidity, dew, temperature)')}
        ${txt('moon', 'Moon')}
        <label class="full">Notes (airplanes, lights, interruptions)<textarea data-f="notes" rows="4">${esc(l.notes)}</textarea></label>
      </div>
    </section>
    <section class="block"><h2>Camera</h2>
      <div class="cam-grid">
        ${num('camera.azimuth', 'Azimuth (°)', '1')}${num('camera.altitude', 'Altitude (°)', '1')}
        ${num('camera.focalLength', 'Focal length (mm)')}${num('camera.iso', 'ISO', '1')}
        ${num('camera.aperture', 'Aperture (f/)', '0.1')}${num('camera.exposureS', 'Exposure (s)')}
        ${num('camera.intervalS', 'Interval (s)')}
      </div>
    </section>
    <section class="block"><h2>Night &amp; site</h2>
      <div class="cam-grid">
        <label>Night (evening date)<input data-f="date" type="date" value="${l.date}"></label>
        ${num('site.accuracyM', 'GPS accuracy (m)')}
        ${txt('observers', 'Observers')}
        ${num('site.latitude', 'Latitude (°N)')}${num('site.longitude', 'Longitude (°E)')}
        ${num('site.elevation', 'Elevation (m)')}
      </div>
      <div class="btn-row"><button type="button" data-log="gps">Use GPS</button><span class="sec">Source: ${l.site.source || '—'}</span></div>
    </section>
    <section class="block"><h2>Timing for band sorting</h2>
      <div id="log-derived"></div>
      <h3>Photo → band</h3>
      <div class="cam-grid">
        <label class="full">EXIF time of any photo<input id="conv-exif" type="datetime-local" step="1"></label>
        <label class="full">…or frame number<input id="conv-frame" type="number" inputmode="numeric" min="1" step="1"></label>
      </div>
      <div id="log-conv"></div>
      <h3>ISS timing check</h3>
      <p class="note">If the ISS crossed the frame, this lists its predicted position at the start and end of each exposure, for both EXIF conventions. Use it with the README procedure to confirm the convention and any leftover clock offset.</p>
      <div class="btn-row"><button type="button" data-log="iss-check">Predict ISS positions per frame</button></div>
      <div id="log-iss"></div>
    </section>
    <section class="block"><h2>Export</h2>
      <p class="note">${l.elementSetId ? `Element set: ${this.setMeta ? `${esc(this.setMeta.label)}, downloaded ${fmtDateTime(this.setMeta.downloadedAt)} KST` : esc(l.elementSetId)}` : `<b>No element set locked for ${l.date}.</b> The export needs the elements used that night.`}</p>
      ${l.elementSetId ? '' : '<div class="btn-row"><button type="button" data-log="lock-latest">Lock the most recent element set for this night</button></div>'}
      <div class="btn-row"><button type="button" class="primary" data-log="zip">Download bundle (.zip)</button><button type="button" data-log="csv">CSV</button><button type="button" data-log="json">JSON</button></div>
      <p class="note">The bundle contains the log (CSV + JSON), the night’s elements as TLE text (.txt) plus the original OMM JSON (needed for 6-digit catalog numbers), and a README.</p>
      <div class="btn-row danger-row"><button type="button" class="danger" data-log="delete">Delete log</button></div>
    </section>`;
  }

  private readingsHtml(side: 'clockBefore' | 'clockAfter', title: string): string {
    const list = this.current![side];
    const rows = list
      .map(
        (c, i) => `<div class="reading"><span class="reading-n tnum">${i + 1}</span>
          <label>EXIF time<input data-f="${side}.${i}.exif" type="datetime-local" step="1" value="${esc(c.exif)}"></label>
          <label>time.is screen<input data-f="${side}.${i}.actual" type="datetime-local" step="1" value="${esc(c.actual)}"></label>
          <button type="button" class="icon-btn" data-log="del-reading" data-side="${side}" data-i="${i}" aria-label="Remove reading ${i + 1}">${CROSS}</button></div>`,
      )
      .join('');
    return `<h3>${title}</h3>${rows}<button type="button" class="add-btn" data-log="add-reading" data-side="${side}">Add a reading</button>`;
  }

  private paintDerived() {
    const box = this.el?.querySelector<HTMLElement>('#log-derived');
    if (!box || !this.current) return;
    const keepExif = this.el!.querySelector<HTMLInputElement>('#conv-exif')?.value ?? '';
    const keepFrame = this.el!.querySelector<HTMLInputElement>('#conv-frame')?.value ?? '';
    const d = this.derived();
    const plan = d.plan;
    const s = (x: number | null, u = 's') => (x === null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)} ${u}`);
    const clockTxt =
      d.clock.before === null && d.clock.after === null
        ? '<b>Not measured yet.</b> Without it, camera times are used as true times.'
        : `before ${s(d.clock.before)}${d.clock.beforeDetail ? ` <span class="sec">(n = ${d.clock.beforeDetail.n}, ${d.clock.beforeDetail.min}…${d.clock.beforeDetail.max})</span>` : ''}, after ${s(d.clock.after)}${d.clock.afterDetail ? ` <span class="sec">(n = ${d.clock.afterDetail.n}, ${d.clock.afterDetail.min}…${d.clock.afterDetail.max})</span>` : ''}${d.clock.drift !== null ? `, drift ${s(d.clock.drift)}` : ''} <span class="sec">(+ = camera fast)</span>`;
    const driftWarn = d.clock.drift !== null && Math.abs(d.clock.drift) > 2 ? '<p class="warn">Clock drift over 2 s: check both time.is photos.</p>' : '';
    const intWarn = d.eff !== null && Math.abs(d.eff - d.interval) > 0.05 ? `<p class="warn">Effective interval ${d.eff.toFixed(3)} s differs from the ${d.interval} s setting. Check the frame count and the end time; frame numbers below assume ${d.interval} s.</p>` : '';
    const bandRows = d.bands
      .map((b) => {
        const p = plan?.bands.find((x) => x.key === b.key);
        const sched = p?.plannedFirst ? [p.plannedFirst, p.plannedLast] : ['—'];
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
        // The EXIF time is read like the logged start (as the exposure start), so mid-exposure = tt + E/2.
        const mid = tt + d.exposure * 500;
        const sa = sunAltitude(new Date(mid), this.ctx.site);
        conv += `<p class="tnum">True ${fmtHMS(new Date(tt))} · frame ${fr ?? 'outside run'} · Sun ${sa.toFixed(2)}° at mid-exposure · <b>${BAND_NAME[bandAtTime(mid, plan?.bands ?? [])]}</b></p>`;
      }
      const n = Number(keepFrame);
      if (keepFrame && Number.isInteger(n) && n >= 1) {
        const tt = frameStart(d.start, d.interval, n);
        const mid = midExposure(d.start, d.interval, d.exposure, n); // logged exposure (15 s if not entered)
        const sa = sunAltitude(new Date(mid), this.ctx.site);
        conv += `<p class="tnum">Frame ${n}: starts ${fmtHMS(new Date(tt))} true · Sun ${sa.toFixed(2)}° at mid-exposure · <b>${BAND_NAME[bandAtTime(mid, plan?.bands ?? [])]}</b></p>`;
      }
    }
    const issBox = this.el!.querySelector<HTMLElement>('#log-iss');
    if (issBox) issBox.innerHTML = this.issCheck?.html ?? '';
    const convBox = this.el!.querySelector<HTMLElement>('#log-conv');
    if (convBox) convBox.innerHTML = conv || '<p class="note">EXIF times are the most accurate way to sort a frame: they are corrected by the clock offset, then classified by the Sun’s altitude at mid-exposure (EXIF time + exposure/2, reading the EXIF time as the exposure start, as for the logged start).</p>';
    box.innerHTML = `<dl class="kv">
        <dt>Clock offset</dt><dd class="tnum">${clockTxt}</dd>
        <dt>True start</dt><dd class="tnum">${d.start !== null ? `<b>${fmtHMS(new Date(d.start))}</b>${d.startCorrected ? ' (corrected)' : ''}${d.lateS !== null ? ` · ${d.lateS >= 0 ? `${(d.lateS / 60).toFixed(1)} min after` : `${(-d.lateS / 60).toFixed(1)} min before`} the planned start` : ''}` : 'enter the start time'}</dd>
        <dt>True end</dt><dd class="tnum">${d.end !== null ? `${fmtHMS(new Date(d.end))}${d.endCorrected ? ' (corrected)' : ''}` : '—'}</dd>
        <dt>Effective interval</dt><dd class="tnum">${d.eff !== null ? `${d.eff.toFixed(3)} s (${d.shots} frames)` : '—'}</dd>
      </dl>
      ${driftWarn}${intWarn}
      ${d.start !== null ? `<table style="margin-top:10px"><thead><tr><th>Band</th><th>Sun-angle times (KST)</th><th class="r">Frames (actual)</th><th class="r">Planned</th></tr></thead><tbody>${bandRows}</tbody></table>
      <p class="note">A frame belongs to a band if the Sun’s altitude at its mid-exposure (frame start + ${d.exposure / 2} s) is inside the band; frames from the true start and the ${d.interval}-s interval. "Planned" assumes the scheduled start (${plan?.window ? fmtHM(plan.window.start) : '—'}) with the planned ${CAMERA.exposureS}-s exposure and ${CAMERA.intervalS}-s interval.</p>` : ''}`;
  }
}
