import type { Site } from '../config';
import { frameAt, type NightPlan } from '../astro/schedule';
import { moonPosition } from '../astro/moon';
import { sunAltitude, sunAzAlt } from '../astro/sun';
import { ommArrayToTleText } from '../sat/elements';
import type { PhaseLaw } from '../sat/magnitude';
import { evaluateDetection, pixelScaleDeg, type DetectionModel, type DetectionSettings, type Sample } from '../sat/detection';
import { CAMERA as CAMERA_SETTINGS } from '../config';
import { CELESTRAK_ACTIVE_URL, CELESTRAK_LABEL, downloadActive, nextAllowedAt } from '../sat/celestrak';
import { SatWorker } from '../sat/client';
import { angularSeparation, azimuthDifference, DEFAULT_CAMERA, fieldOfView, fovOutline, makeFov, pointingGrid, type Camera } from '../sat/fov';
import { STATION_KM, TRAIN_KM, type BandKey, type Crossing, type Pass, type PredictResult } from '../sat/predict';
import { getNightSet, getSetText, listNightSets, listSets, lockNightSet, deleteSet, putSet, type NightSet, type SetMeta } from '../sat/store';
import { DAY_MS, fileStamp, fmtDateTime, fmtHM, fmtHMS, kstDateString, kstNoon, todayKST } from '../time';
import { S, shortDate as fmtShortDate } from '../i18n';
import { skyChart } from './skychart';
import { deg, dir, esc } from './util';

export interface SatCtx {
  date: string;
  site: Site;
  plan: NightPlan;
}

const CAMERA_KEY = 'satstreak.camera';
const MAG_KEY = 'satstreak.magnitude';

interface MagSettings {
  /** Which model's verdict is shown in bold in the crossing list (all models are always computed). */
  mode: DetectionModel;
  /** Stellar (point-source) limiting magnitude of one 15-s frame. PLACEHOLDER until calibrated from photos. */
  starLimit: number;
  /** Fixed limit for the simple criterion. PLACEHOLDER. (Stored as `limit` for compatibility.) */
  limit: number;
  /** PSF FWHM in pixels. */
  fwhmPx: number;
  /** Pixels across the sensor width (Sony a7 III: 6000). */
  pixelsAcross: number;
  phaseLaw: PhaseLaw;
  /** Optional assumed 1000-km magnitude for objects with no published value (null = leave them unknown). */
  assumed: number | null;
}

function loadMag(): MagSettings {
  const d: MagSettings = { mode: 'matched', starLimit: 9, limit: 6, fwhmPx: 2, pixelsAcross: 6000, phaseLaw: 'fraction', assumed: null };
  try {
    const m = JSON.parse(localStorage.getItem(MAG_KEY) ?? 'null');
    if (m && Number.isFinite(m.limit) && (m.phaseLaw === 'fraction' || m.phaseLaw === 'lambert')) {
      const merged = { ...d, ...m };
      if (!['peak', 'matched', 'fixed'].includes(merged.mode)) merged.mode = merged.mode === 'trailing' ? 'peak' : d.mode; // older setting
      return merged;
    }
  } catch {
    /* ignore */
  }
  return d;
}
const ISS = 25544;
const LOCK_ICON = '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const bandLabel = (b: BandKey) => S().sats.band[b] ?? b;
/** Full band name from the glossary (박명 구간 / 어두운 구간 / 구간 사이 / 구간 밖), for running text. */
const bandFull = (b: BandKey) => (b === 'twilight' || b === 'dark' ? S().common.band[b] : S().log.band[b] ?? b);

/** CelesTrak module errors (English) in the current language. */
function translateErr(msg: string): string {
  const T = S().sats;
  let m = msg.match(/^CelesTrak policy: next download allowed after (.+) KST\.$/);
  if (m) return T.errPolicy(m[1]);
  if (msg.startsWith('Could not reach CelesTrak')) return T.errOffline;
  m = msg.match(/^CelesTrak refused the request \((.+)\)\. Not retrying/);
  if (m) return T.errRefused(m[1]);
  return msg;
}

export function loadCamera(): Camera {
  try {
    const c = JSON.parse(localStorage.getItem(CAMERA_KEY) ?? 'null');
    if (c && ['azimuth', 'altitude', 'focalLength', 'sensorWidth', 'sensorHeight'].every((k) => Number.isFinite(c[k]))) return c;
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CAMERA };
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: string | number | boolean) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export class SatView {
  private worker = new SatWorker();
  private sets: SetMeta[] = [];
  private nightLocks = new Map<string, NightSet>();
  private night: NightSet | null = null;
  private nightDate = '';
  private selectedId: string | null = null;
  private camera = loadCamera();
  private busy: string | null = null;
  private busyProgress = false;
  private msg: { text: string; kind: 'info' | 'error' } | null = null;
  private result: { key: string; setId: string; r: PredictResult; issPasses: Pass[] } | null = null;
  private passes: { setId: string; passes: Pass[]; epoch: number; name: string; computedAt: number } | null = null;
  private showAllPasses = false;
  private leoOnly = true;
  private mag = loadMag();
  private el: HTMLElement | null = null;
  private ctx!: SatCtx;
  private bound = new WeakSet<HTMLElement>();

  constructor(private getCtx: () => SatCtx) {
    void this.reloadSets();
  }

  /** Called by main when the Satellites tab is shown (or the date/site changes). */
  render(el: HTMLElement) {
    this.el = el;
    this.ctx = this.getCtx();
    if (!this.bound.has(el)) {
      el.addEventListener('click', (e) => this.onClick(e));
      el.addEventListener('change', (e) => this.onChange(e));
      this.bound.add(el);
    }
    if (this.ctx.date !== this.nightDate) {
      this.nightDate = this.ctx.date;
      this.night = null;
    }
    // Re-read the lock on every render: the Log tab can lock a night too, so a cached value may be stale.
    void this.refreshLock();
    this.paint();
  }

  /** Reload the night lock (and the per-set lock list) from storage; repaint if it changed. */
  private async refreshLock(): Promise<void> {
    const date = this.ctx.date;
    try {
      const [n, all] = await Promise.all([getNightSet(date), listNightSets()]);
      if (date !== this.ctx.date) return; // the date changed meanwhile
      const changed = JSON.stringify(n) !== JSON.stringify(this.night) || all.length !== this.nightLocks.size;
      this.night = n;
      this.nightLocks = new Map(all.map((x) => [x.date, x]));
      if (changed) this.paint();
    } catch {
      /* storage errors are reported by reloadSets */
    }
  }

  detach() {
    this.el = null;
  }

  private async reloadSets() {
    try {
      this.sets = await listSets();
      this.nightLocks = new Map((await listNightSets()).map((n) => [n.date, n]));
    } catch (e) {
      this.msg = { text: S().sats.storageErr((e as Error).message), kind: 'error' };
    }
    if (!this.selectedId || !this.sets.some((s) => s.id === this.selectedId)) this.selectedId = this.sets[0]?.id ?? null;
    this.paint();
  }

  private activeId(): string | null {
    return this.night?.setId ?? this.selectedId;
  }
  private meta(id: string | null) {
    return this.sets.find((s) => s.id === id) ?? null;
  }
  private lastCelestrak(): number | null {
    return this.sets.find((s) => s.source === 'celestrak')?.downloadedAt ?? null;
  }
  private resultKey(): string {
    const { date, site } = this.ctx;
    return JSON.stringify([this.activeId(), date, site.latitude, site.longitude, site.elevation, this.camera, this.mag.phaseLaw]);
  }

  // ---------------------------------------------------------------- actions

  private setBusy(b: string | null) {
    this.busy = b;
    this.paint();
  }

  private async ensureWorkerHas(id: string) {
    if (this.worker.loaded === id) return;
    const text = await getSetText(id);
    if (text == null) throw new Error(S().sats.setTextMissing);
    await this.worker.call({ type: 'parse', setId: id, text });
    this.worker.loaded = id;
  }

  private async importText(text: string, source: SetMeta['source'], label: string, downloadedAt: number, url?: string) {
    const id = `${source}-${new Date(downloadedAt).toISOString()}`;
    const p = await this.worker.call<any>({ type: 'parse', setId: id, text });
    this.worker.loaded = id;
    const meta: SetMeta = {
      id,
      source,
      label,
      url,
      downloadedAt,
      format: p.format,
      bytes: text.length,
      loaded: p.loaded,
      failed: p.failed,
      sixDigit: p.sixDigit,
      epochMin: p.epochMin,
      epochMax: p.epochMax,
      failures: p.failures,
    };
    if (!meta.loaded) throw new Error(S().sats.noUsable(label, meta.failed));
    await putSet(meta, text);
    this.selectedId = id;
    this.msg = { text: S().sats.savedSet(meta.loaded.toLocaleString(), meta.failed), kind: 'info' };
    await this.reloadSets();
  }

  private async run(label: string, fn: () => Promise<void>, progress = false) {
    if (this.busy) return;
    this.msg = null;
    this.busyProgress = progress;
    this.setBusy(label);
    try {
      await fn();
    } catch (e) {
      this.msg = { text: translateErr((e as Error).message), kind: 'error' };
    } finally {
      this.setBusy(null);
    }
  }

  private onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!btn || !this.el?.contains(btn)) return;
    const act = btn.dataset.act!;
    const id = btn.dataset.id ?? this.activeId();
    switch (act) {
      case 'download':
        return void this.run(S().sats.busyDownload, async () => {
          const { text, downloadedAt } = await downloadActive(this.lastCelestrak());
          await this.importText(text, 'celestrak', CELESTRAK_LABEL, downloadedAt, CELESTRAK_ACTIVE_URL);
        });
      case 'paste':
        return void this.run(S().sats.busyPaste, async () => {
          const ta = this.el!.querySelector<HTMLTextAreaElement>('#tle-paste')!;
          if (!ta.value.trim()) throw new Error(S().sats.pasteFirst);
          await this.importText(ta.value, 'paste', 'Pasted text', Date.now());
          ta.value = '';
        });
      case 'lock':
        return void this.run(S().sats.busySaving, async () => {
          const target = this.selectedId;
          if (!target) return;
          if (this.night && this.night.setId !== target) {
            const ok = confirm(S().sats.confirmRelock(this.ctx.date, fmtDateTime(this.meta(this.night.setId)?.downloadedAt ?? 0)));
            if (!ok) return;
          }
          this.night = await lockNightSet(this.ctx.date, target);
          await this.reloadSets();
        });
      case 'export-json':
      case 'export-tle':
        return void this.run(S().sats.busyFile, async () => this.exportSet(id!, act === 'export-json' ? 'json' : 'tle'));
      case 'delete':
        return void this.run(S().sats.busyDelete, async () => {
          if (!id || !confirm(S().sats.confirmDelete)) return;
          await deleteSet(id);
          if (this.worker.loaded === id) this.worker.loaded = null;
          await this.reloadSets();
        });
      case 'predict':
        return void this.predict();
      case 'passes':
        return void this.run(S().sats.busyPasses, async () => {
          const setId = this.activeId();
          if (!setId) throw new Error(S().sats.loadFirst);
          await this.ensureWorkerHas(setId);
          const start = kstNoon(todayKST()).getTime();
          const r = await this.worker.call<any>({ type: 'passes', setId, norad: ISS, options: { start, end: start + 14 * DAY_MS, site: this.ctx.site, phaseLaw: this.mag.phaseLaw } });
          this.passes = { setId, passes: r.passes, epoch: r.epoch, name: r.name, computedAt: Date.now() };
        });
      case 'csv':
        return this.exportCrossings();
    }
  }

  private onChange(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.id === 'set-select') {
      this.selectedId = t.value;
      return this.paint();
    }
    if (t.id === 'tle-file' && t.files?.[0]) {
      const f = t.files[0];
      void this.run(S().sats.busyLoading(f.name), async () => this.importText(await f.text(), 'file', f.name, Date.now()));
      return;
    }
    if (t.dataset.det) {
      const k = t.dataset.det as 'starLimit' | 'fwhmPx' | 'pixelsAcross';
      if (t.value !== '' && Number(t.value) > (k === 'starLimit' ? -30 : 0)) this.mag[k] = Number(t.value);
      try {
        localStorage.setItem(MAG_KEY, JSON.stringify(this.mag));
      } catch {
        /* ignore */
      }
      return this.paint();
    }
    if (t.id === 'limit-mag' || t.id === 'assumed-mag' || t.id === 'phase-law' || t.id === 'det-mode') {
      if (t.id === 'phase-law') this.mag.phaseLaw = t.value as PhaseLaw;
      else if (t.id === 'det-mode') this.mag.mode = t.value as DetectionModel;
      else if (t.id === 'limit-mag' && Number.isFinite(Number(t.value)) && t.value !== '') this.mag.limit = Number(t.value);
      else if (t.id === 'assumed-mag') this.mag.assumed = t.value.trim() === '' || !Number.isFinite(Number(t.value)) ? null : Number(t.value);
      try {
        localStorage.setItem(MAG_KEY, JSON.stringify(this.mag));
      } catch {
        /* ignore */
      }
      return this.paint();
    }
    if (t.id === 'leo-only') {
      this.leoOnly = t.checked;
      return this.paint();
    }
    if (t.id === 'show-all-passes') {
      this.showAllPasses = t.checked;
      return this.paint();
    }
    if (t.dataset.cam) {
      const v = Number(t.value);
      const k = t.dataset.cam as keyof Camera;
      if (!Number.isFinite(v)) return;
      this.camera = { ...this.camera, [k]: k === 'azimuth' ? ((v % 360) + 360) % 360 : v };
      try {
        localStorage.setItem(CAMERA_KEY, JSON.stringify(this.camera));
      } catch {
        /* ignore */
      }
      this.paint();
    }
  }

  private async exportSet(id: string, kind: 'json' | 'tle') {
    const m = this.meta(id);
    const text = await getSetText(id);
    if (!m || text == null) throw new Error(S().sats.setNotFound);
    const base = `elements_${this.ctx.date}_${m.source}-${fileStamp(m.downloadedAt)}KST`;
    if (kind === 'json') {
      if (m.format !== 'omm-json') throw new Error(S().sats.tleOnly);
      download(`${base}_omm.json`, text, 'application/json');
      return;
    }
    if (m.format === 'tle') {
      download(`${base}.tle.txt`, text, 'text/plain');
      return;
    }
    const r = ommArrayToTleText(JSON.parse(text));
    download(`${base}.tle.txt`, r.text, 'text/plain');
    this.msg = { text: S().sats.tleWritten(r.written.toLocaleString(), r.skipped.toLocaleString()), kind: 'info' };
  }

  private detSettings(): DetectionSettings {
    const g = this.mag;
    return {
      starLimit: g.starLimit,
      fixedLimit: g.limit,
      fwhmPx: g.fwhmPx,
      pixelsAcross: g.pixelsAcross,
      sensorWidthMm: this.camera.sensorWidth,
      focalLengthMm: this.camera.focalLength,
      exposureS: CAMERA_SETTINGS.exposureS,
    };
  }

  /** Predicted magnitude, trail length, applicable limit and detectability of a crossing. */
  private det(x: { m1000: number | null; samples: Sample[] }) {
    return evaluateDetection(x, this.mag.assumed, this.detSettings());
  }

  private exportCrossings() {
    if (!this.result) return;
    const m = this.meta(this.result.setId);
    const head = ['norad', 'name', 'regime', 'band', 'entry_utc', 'exit_utc', 'entry_kst', 'exit_kst', 'duration_s', 'entry_az', 'entry_alt', 'exit_az', 'exit_alt', 'max_alt', 'entry_clipped', 'exit_clipped', 'element_epoch_utc', 'mag_pred', 'm1000', 'm1000_assumed', 'mag_source', 'mag_geometric_part', 'starlink_version', 'angular_speed_deg_s', 'trail_px', 'n_samples', 'limit_peak', 'detectable_peak', 'limit_matched', 'detectable_matched', 'limit_fixed', 'detectable_fixed', 'merged_colocated_norad', 'train', 'train_neighbors_norad', 'train_min_sep_km'];
    const rows = this.result.r.crossings.map((c) => {
      const d = this.det(c);
      return [
        c.norad,
        c.name,
        c.regime,
        c.band,
        new Date(c.entry).toISOString(),
        new Date(c.exit).toISOString(),
        fmtDateTime(c.entry) + ':' + fmtHMS(new Date(c.entry)).slice(6),
        fmtDateTime(c.exit) + ':' + fmtHMS(new Date(c.exit)).slice(6),
        ((c.exit - c.entry) / 1000).toFixed(1),
        c.entryAz.toFixed(2),
        c.entryAlt.toFixed(2),
        c.exitAz.toFixed(2),
        c.exitAlt.toFixed(2),
        c.maxAlt.toFixed(2),
        c.entryClipped,
        c.exitClipped,
        new Date(c.epoch).toISOString(),
        d.mag?.toFixed(2) ?? '',
        c.m1000 ?? this.mag.assumed ?? '',
        c.m1000 === null && this.mag.assumed !== null,
        c.magKey ?? '',
        c.magRel.toFixed(2),
        c.starlinkVersion ?? '',
        brightestOmega(c.samples)?.toFixed(4) ?? '',
        d.trailPx?.toFixed(0) ?? '',
        c.samples.length,
        d.peak.limit?.toFixed(2) ?? '',
        d.peak.detectable ?? '',
        d.matched.limit?.toFixed(2) ?? '',
        d.matched.detectable ?? '',
        d.fixed.limit?.toFixed(2) ?? '',
        d.fixed.detectable ?? '',
        c.merged.map((x) => x.norad).join(' '),
        c.train.length > 0,
        c.train.map((x) => x.norad).join(' '),
        c.train.length ? Math.min(...c.train.map((x) => x.minKm)).toFixed(3) : '',
      ]
        .map(csvCell)
        .join(',');
    });
    const cam = this.camera;
    const meta = [
      `# Predicted camera-frame crossings, night ${this.ctx.date}, site ${this.ctx.site.latitude},${this.ctx.site.longitude},${this.ctx.site.elevation}m`,
      `# camera az ${cam.azimuth} alt ${cam.altitude} f ${cam.focalLength}mm sensor ${cam.sensorWidth}x${cam.sensorHeight}mm; step 10 s, entry/exit refined to 0.1 s`,
      `# magnitudes: m = m1000 + 5log10(d/1000km) - 2.5log10 F(phase), phase law '${this.mag.phaseLaw}', brightest 10-s sample in frame; m1000 sources in README; assumed m1000 for unknown objects: ${this.mag.assumed ?? 'none'}`,
      `# detection (PLACEHOLDER limits; all models on the same in-frame 10-s samples; detectable = any sample with m <= limit): star limit ${this.mag.starLimit} per ${CAMERA_SETTINGS.exposureS}-s frame, PSF FWHM ${this.mag.fwhmPx} px, ${this.mag.pixelsAcross} px across ${this.camera.sensorWidth} mm, x = trail_px/FWHM`,
      `#   peak: m_lim = m_lim,star - 2.5log10(x) (Hainaut & Williams 2020, A&A 636, A121, Sec. 5)`,
      `#   matched: m_lim = m_lim,star - 1.25log10(1 + 0.67x^2/(1 + 1.16x)) (Jones et al. 2018, Icarus, doi:10.1016/j.icarus.2017.11.033, Eqs. 4-5, SNR trailing loss)`,
      `#   fixed: m <= ${this.mag.limit}; limit_* = limit at the most favourable sample; trail_px and angular_speed at the brightest sample`,
      `# elements: ${m?.label ?? ''} downloaded ${m ? new Date(m.downloadedAt).toISOString() : ''} (set id ${this.result.setId})`,
    ];
    download(`predictions_${this.ctx.date}_az${cam.azimuth}_alt${cam.altitude}.csv`, [...meta, head.join(','), ...rows].join('\n') + '\n', 'text/csv');
  }

  private async predict() {
    const w = this.ctx.plan.window;
    await this.refreshLock(); // never auto-lock over a lock made elsewhere (Log tab) since the last render
    const setId = this.activeId();
    if (!w) return void (this.msg = { text: S().sats.noWindowDate, kind: 'error' }), this.paint();
    if (!setId) return void (this.msg = { text: S().sats.loadFirst, kind: 'error' }), this.paint();
    const key = this.resultKey();
    await this.run(S().sats.busyPropagate, async () => {
      // Research record: predictions computed for tonight lock tonight's element set automatically.
      if (this.ctx.date === todayKST() && !this.night) {
        this.night = await lockNightSet(this.ctx.date, setId);
        void this.reloadSets();
      }
      await this.ensureWorkerHas(setId);
      const r = await this.worker.call<{ result: PredictResult }>(
        { type: 'predict', setId, input: { start: w.start.getTime(), end: w.end.getTime(), stepS: 10, site: this.ctx.site, camera: this.camera, pointing: pointingGrid(this.camera), phaseLaw: this.mag.phaseLaw } },
        (f) => {
          const bar = this.el?.querySelector<HTMLElement>('#sat-progress');
          if (bar) bar.style.transform = `scaleX(${f.toFixed(3)})`;
        },
      );
      // ISS passes overlapping the window (±20 min), for the "ISS tonight" check.
      let issPasses: Pass[] = [];
      try {
        const pr = await this.worker.call<{ passes: Pass[] }>({
          type: 'passes',
          setId,
          norad: ISS,
          options: { start: w.start.getTime() - 20 * 60_000, end: w.end.getTime() + 20 * 60_000, site: this.ctx.site, phaseLaw: this.mag.phaseLaw },
        });
        issPasses = pr.passes.filter((p) => p.set.t >= w.start.getTime() && p.rise.t <= w.end.getTime());
      } catch {
        /* ISS not in this element set */
      }
      this.result = { key, setId, r: r.result, issPasses };
    }, true);
  }

  // ---------------------------------------------------------------- rendering

  private paint() {
    if (!this.el || !this.ctx) return;
    this.el.innerHTML = [this.message(), this.tonightBlock(), this.resultsCard(), this.elementsCard(), this.cameraCard(), this.issCard()].join('');
  }

  private message(): string {
    const busy = this.busy ? `<div class="busy" role="status">${esc(this.busy)}${this.busyProgress ? '<div class="progress"><div id="sat-progress"></div></div>' : ''}</div>` : '';
    const m = this.msg ? `<div class="${this.msg.kind === 'error' ? 'warn' : 'info'}" role="${this.msg.kind === 'error' ? 'alert' : 'status'}">${esc(this.msg.text)}</div>` : '';
    return busy + m;
  }

  private elementsCard(): string {
    const date = this.ctx.date;
    const active = this.meta(this.activeId());
    const next = nextAllowedAt(this.lastCelestrak());
    const policyOk = Date.now() >= next;
    const canDownload = policyOk && !this.busy;
    const dis = this.busy ? ' disabled' : '';
    const T = S().sats;
    const ov = active ? T.objectsVal(active.loaded.toLocaleString(), active.failed, active.sixDigit.toLocaleString()) : [];
    const status = active
      ? `<dl class="kv">
          <dt>${T.source}</dt><dd>${esc(active.label)}</dd>
          <dt>${active.source === 'celestrak' ? T.downloadedAt : T.importedAt}</dt><dd class="tnum"><b>${fmtDateTime(active.downloadedAt)} KST</b></dd>
          <dt>${T.objects}</dt><dd class="tnum"><b>${ov[0]}</b> · <span class="${active.failed ? 'bad' : ''}">${ov[1]}</span> · ${ov[2]}</dd>
          <dt>${T.epochs}</dt><dd class="tnum">${active.epochMin ? `${fmtDateTime(active.epochMin)} → ${fmtDateTime(active.epochMax!)} KST` : '—'}</dd>
        </dl>
        ${active.failures.length ? `<details class="how"><summary>${T.parseFailures(active.failed)}</summary><ul>${active.failures.map((f) => `<li>${esc(f.id)}: ${esc(f.reason)}</li>`).join('')}</ul></details>` : ''}`
      : `<p>${T.noSetYet}</p>`;
    const lock = this.night
      ? `<p class="lock ok">${LOCK_ICON} ${T.locked(date, fmtDateTime(this.meta(this.night.setId)?.downloadedAt ?? 0), this.night.history.length)}</p>`
      : `<p class="lock">${T.notLocked(date)}</p>`;
    const options = this.sets
      .map((s) => `<option value="${esc(s.id)}"${s.id === this.selectedId ? ' selected' : ''}>${fmtDateTime(s.downloadedAt)} · ${s.source} · ${s.loaded.toLocaleString()} ${T.obj}</option>`)
      .join('');
    const lockedDates = new Map<string, string[]>();
    for (const n of this.nightLocks.values()) lockedDates.set(n.setId, [...(lockedDates.get(n.setId) ?? []), n.date]);
    const saved = this.sets
      .map((s) => {
        const nights = lockedDates.get(s.id) ?? [];
        return `<tr><td class="tnum">${fmtDateTime(s.downloadedAt)}<div class="sec">${esc(s.source)} · ${s.loaded.toLocaleString()} ${T.obj} · ${(s.bytes / 1e6).toFixed(1)} MB${nights.length ? T.lockedFor(nights.join(', ')) : ''}</div></td>
          <td class="r actions-cell">${s.format === 'omm-json' ? `<button data-act="export-json" data-id="${esc(s.id)}"${dis}>JSON</button>` : ''}<button data-act="export-tle" data-id="${esc(s.id)}"${dis}>TLE</button>${nights.length ? '' : `<button data-act="delete" data-id="${esc(s.id)}"${dis}>${T.delete}</button>`}</td></tr>`;
      })
      .join('');
    return `<section class="block"><h2>${T.elementsTitle}</h2>
      ${status}
      <div class="btn-row">
        <button type="button" class="primary" data-act="download"${canDownload ? '' : ' disabled'}>${T.download}</button>
        <label class="btn file-btn">${T.loadFile}<input id="tle-file" type="file" accept=".json,.txt,.tle,.3le,application/json,text/plain"${dis}></label>
      </div>
      <p class="note">${policyOk ? T.policyOk : T.policyWait(fmtHM(new Date(next)))}</p>
      <details class="how"><summary>${T.pasteTitle}</summary>
        <textarea id="tle-paste" rows="5" placeholder="${esc(T.pastePh)}"></textarea>
        <button type="button" data-act="paste"${dis}>${T.loadPasted}</button>
      </details>
      ${this.sets.length ? `<div class="set-pick"><label for="set-select">${T.setFor(date)}</label><select id="set-select"${dis}>${options}</select>
        <button type="button" data-act="lock"${dis || !this.selectedId ? ' disabled' : ''}>${this.night ? (this.night.setId === this.selectedId ? T.lockedBtn : T.relock) : T.lockNight}</button></div>` : ''}
      ${this.sets.length ? lock : ''}
      ${this.night && this.selectedId && this.night.setId !== this.selectedId ? `<p class="warn">${T.differs}</p>` : ''}
      ${this.sets.length ? `<details class="how"><summary>${T.savedSets(this.sets.length)}</summary><table class="saved">${saved}</table>
        <p class="note">${T.savedNote}</p></details>` : ''}
    </section>`;
  }

  private cameraCard(): string {
    const c = this.camera;
    const f = fieldOfView(c);
    const input = (k: keyof Camera, label: string, step = 'any') =>
      `<label>${label}<input data-cam="${k}" inputmode="decimal" type="number" step="${step}" value="${c[k]}"></label>`;
    const T = S().sats;
    return `<section class="block"><h2>${T.cameraTitle}</h2>
      <div class="cam-grid">
        ${input('azimuth', T.azimuth, '1')}${input('altitude', T.altitude, '1')}${input('focalLength', T.focal)}
        ${input('sensorWidth', T.sensorW)}${input('sensorHeight', T.sensorH)}
        <div class="fov-out"><span class="sec">${T.fov}</span><b class="tnum">${f.horizontal.toFixed(1)}° × ${f.vertical.toFixed(1)}°</b><span class="sec tnum">${T.diagonal(f.diagonal.toFixed(1))}</span></div>
      </div>
      <p class="note">${T.cameraNote(dir(c.azimuth))}</p>
    </section>`;
  }

  /** The computed result for the current inputs, if any. */
  private currentResult() {
    return this.result && this.result.key === this.resultKey() ? this.result : null;
  }

  private predictButton(big = false): string {
    const ready = this.activeId() && this.ctx.plan.window;
    const res = this.currentResult();
    return `<button type="button" class="primary${big ? ' big-btn' : ''}" data-act="predict"${ready && !this.busy ? '' : ' disabled'}>${res ? S().sats.recompute : S().sats.compute}</button>`;
  }

  /** First section: the ISS answer for tonight's frame, then the band counts. */
  private tonightBlock(): string {
    const p = this.ctx.plan;
    const w = p.window;
    const T = S().sats;
    const head = `<h2>${T.inFrame(fmtShortDate(this.ctx.date))}</h2>`;
    if (!w) return `<section class="block">${head}<p>${T.noWindowDate}</p></section>`;
    const res = this.currentResult();
    if (!res) {
      const need = this.activeId() ? '' : `<p class="warn">${T.loadSetFirst}</p>`;
      return `<section class="block">${head}
        <div class="iss-card"><span class="iss-kicker">${T.issBadge}</span><p class="iss-big-line">${T.computeIss}</p></div>
        ${need}${this.predictButton(true)}
        <p class="note">${T.computeNote(fmtHM(w.start, p.dateStr), fmtHM(w.end, p.dateStr))}</p>
      </section>`;
    }
    const r = res.r;
    const keep = (x: { regime: string }) => !this.leoOnly || x.regime === 'LEO';
    const crossings = r.crossings.filter(keep);
    const nonLeo = r.crossings.length - r.crossings.filter((c) => c.regime === 'LEO').length;
    const bandMin = (k: 'twilight' | 'dark') => {
      const b = p.bands.find((x) => x.key === k)!;
      return b.start && b.end ? (b.end.getTime() - b.start.getTime()) / 60000 : 0;
    };
    const count = (k: BandKey) => crossings.filter((c) => c.band === k).length;
    const stat = (k: 'twilight' | 'dark') => {
      const inBand = crossings.filter((c) => c.band === k);
      const n = inBand.length;
      const dets = inBand.map((c) => this.det(c));
      const cnt = (mdl: DetectionModel) => dets.filter((x) => x[mdl].detectable === true).length;
      const unknown = dets.filter((x) => x.mag === null).length;
      const m = bandMin(k);
      const perH = (x: number) => (m ? ((x / m) * 60).toFixed(1) : '—');
      const line = (mdl: DetectionModel, label: string) => `<div class="det-line"><b class="tnum">${cnt(mdl)}</b> <span class="s">${label} · ${S().common.perHour(perH(cnt(mdl)))}</span></div>`;
      return `<div class="fact band-fact"><span class="fact-k">${T.bandMin(bandFull(k), m.toFixed(0))}</span>
        <b class="tnum">${n}</b><span class="fact-s tnum">${T.perH(perH(n))}</span>
        <span class="fact-s" style="margin-top:6px">${T.detectable}</span>
        ${line('peak', T.peak)}${line('matched', T.matched)}${line('fixed', T.fixedLe(this.mag.limit))}
        <span class="fact-s tnum">${T.unknownBright(unknown)}</span></div>`;
    };
    const m = this.meta(res.setId);
    return `<section class="block">${head}
      ${this.issTonight(r, res.issPasses)}
      <label class="check"><input type="checkbox" id="leo-only"${this.leoOnly ? ' checked' : ''}> ${T.leoOnly(nonLeo, this.leoOnly)}</label>
      <div class="facts">${stat('twilight')}${stat('dark')}</div>
      <p class="note tnum">${T.summary(count('gap'), count('outside'), r.objects.toLocaleString(), r.propagationFailed, r.mergedObjects, r.stationMerged ?? 0, STATION_KM, r.crossings.filter((c) => c.train.length).length, TRAIN_KM, r.steps, (r.elapsedMs / 1000).toFixed(1), m ? fmtDateTime(m.downloadedAt) : '?')}</p>
      <div class="btn-row">${this.predictButton()}</div>
    </section>`;
  }

  private resultsCard(): string {
    const p = this.ctx.plan;
    const w = p.window;
    const res = this.currentResult();
    if (!w || !res) return '';
    const r = res.r;
    const T = S().sats;
    const keep = (x: { regime: string }) => !this.leoOnly || x.regime === 'LEO';
    const crossings = r.crossings.filter(keep);
    const tracks = r.tracks.filter(keep);
    const fov = fovOutline(makeFov(this.camera));
    const mid = new Date((w.start.getTime() + w.end.getTime()) / 2);
    const mp = moonPosition(mid, this.ctx.site);
    const chart = skyChart({ tracks, fov, moon: { az: mp.azimuth, alt: mp.altitude } });
    const rows = crossings
      .map(
        (c: Crossing) => `<tr class="${c.band === 'twilight' || c.band === 'dark' ? c.band : ''}${c.norad === ISS ? ' iss-row' : ''}">
          <td class="t tnum">${fmtHMS(new Date(c.entry))}${c.entryClipped ? '*' : ''}<div class="sec">${fmtHMS(new Date(c.exit))}${c.exitClipped ? '*' : ''}</div></td>
          <td>${esc(c.name)}<div class="sec tnum">${c.norad} · ${c.regime}${c.starlinkVersion ? ` · ${c.starlinkVersion === 'uncertain' || c.starlinkVersion === 'not-in-gcat' ? `<b>${T.version(c.starlinkVersion)}</b>` : c.starlinkVersion}` : ''}${c.merged.length ? T.docked(c.merged.length) : ''}${c.train.length ? T.train(c.train.length, TRAIN_KM) : ''}</div></td>
          <td class="r tnum">${deg(c.maxAlt, 0)}</td>
          <td class="r tnum">${this.magCell(c)}</td>
          <td class="r">${bandLabel(c.band)}</td></tr>`,
      )
      .join('');
    return `<section class="block"><h2>${T.crossings(crossings.length)}</h2>
      ${chart}
      <div class="scroll-y"><table><thead><tr><th>${T.thEnterExit}</th><th>${T.thObject}</th><th class="r">${T.thMaxAlt}</th><th class="r">${T.thMag}</th><th class="r">${T.thBand}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">${T.listNote}</p>
      <div class="btn-row"><button type="button" data-act="csv">${T.csv}</button></div>
      ${this.magSettings()}
      ${this.pointingTable(r)}
    </section>`;
  }

  private magCell(c: Crossing): string {
    const d = this.det(c);
    const trail = d.trailPx !== null ? `${d.trailPx.toFixed(0)} px` : '';
    if (d.mag === null) return `<span class="sec">—</span><div class="sec nw">${trail}</div>`;
    const cls = d[this.mag.mode].detectable ? 'bright' : 'sec';
    const v = (r: { limit: number | null; detectable: boolean | null }) => `${r.limit?.toFixed(1)}${r.detectable ? '✓' : '✗'}`;
    return `<span class="${cls}">${d.mag.toFixed(1)}${c.m1000 === null ? 'a' : ''}</span><div class="sec mag-lims"><span class="nw">P ${v(d.peak)}</span> <span class="nw">M ${v(d.matched)}</span></div><div class="sec nw">${trail}</div>`;
  }

  /** Does the ISS cross the chosen frame tonight? Large, first on the tab, readable at a glance in night mode. */
  private issTonight(r: PredictResult, passes: Pass[]): string {
    const xs = r.crossings.filter((c) => c.norad === ISS);
    const d = this.ctx.date;
    const w = this.ctx.plan.window!;
    const T = S().sats;
    const pt = (p: { t: number; alt: number; az: number }) => `${fmtHMS(new Date(p.t))} ${p.alt.toFixed(0)}° ${dir(p.az)}`;
    const passTxt = passes
      .map((p) => (p.visible ? T.passVisible(pt(p.visible.start), pt(p.visible.max), pt(p.visible.end)) : T.passNotVisible(fmtHM(new Date(p.rise.t), d), fmtHM(new Date(p.set.t), d))))
      .join('; ');
    if (xs.length) {
      const rows = xs
        .map((c) => {
          const det = this.det(c);
          const f1 = frameAt(w, new Date(c.entry));
          const f2 = frameAt(w, new Date(c.exit));
          return `<div class="iss-pass">
            <div class="iss-times"><span><span class="fact-k">${T.enters}</span><b class="tnum">${fmtHMS(new Date(c.entry))}</b></span><span><span class="fact-k">${T.exits}</span><b class="tnum">${fmtHMS(new Date(c.exit))}</b></span></div>
            <p class="iss-line tnum">${f1 !== null ? `<b>${T.issFrames(f1, f2)}</b>${T.ifOnTime}` : ''}${T.inFrameS(((c.exit - c.entry) / 1000).toFixed(0))} · <span class="mark-text">${T.bandOf(bandFull(c.band))}</span></p>
            <p class="sec tnum">${T.issDetail(c.maxAlt.toFixed(0), det.mag === null ? '—' : det.mag.toFixed(1), det.trailPx !== null ? det.trailPx.toFixed(0) : null, det.peak.limit !== null ? T.issLims(det.peak.limit.toFixed(1), !!det.peak.detectable, det.matched.limit!.toFixed(1), !!det.matched.detectable) : null)}</p>
          </div>`;
        })
        .join('');
      return `<div class="iss-card yes"><span class="iss-kicker">${T.issBadge}</span><p class="iss-big-line">${T.issCrosses}</p>${rows}<p class="sec">${T.pass(passTxt || '—')}</p></div>`;
    }
    if (passes.length) return `<div class="iss-card"><span class="iss-kicker">${T.issBadge}</span><p class="iss-big-line">${T.issNo}</p><p class="sec">${T.pass(passTxt)}. ${T.passOtherFrames}</p></div>`;
    return `<div class="iss-card"><span class="iss-kicker">${T.issBadge}</span><p class="iss-big-line">${T.issNoPass}</p></div>`;
  }

  private magSettings(): string {
    const g = this.mag;
    const T = S().sats;
    const ps = pixelScaleDeg(this.camera.sensorWidth, g.pixelsAcross, this.camera.focalLength);
    return `<details class="how mag-settings"><summary>${T.magTitle}</summary>
      <div class="cam-grid">
        <label>${T.starLimit(CAMERA_SETTINGS.exposureS)} <span class="sec">${T.placeholder}</span><input data-det="starLimit" type="number" step="0.5" inputmode="decimal" value="${g.starLimit}"></label>
        <label>${T.fwhm}<input data-det="fwhmPx" type="number" step="0.5" min="0.5" inputmode="decimal" value="${g.fwhmPx}"></label>
        <label>${T.pixels}<input data-det="pixelsAcross" type="number" step="1" inputmode="numeric" value="${g.pixelsAcross}"></label>
        <div class="fov-out"><span class="sec">${T.pixScale}</span><b class="tnum">${(ps * 3600).toFixed(1)}″/px</b></div>
        <label>${T.fixedLimit} <span class="sec">${T.placeholder}</span><input id="limit-mag" type="number" step="0.5" inputmode="decimal" value="${g.limit}"></label>
        <label>${T.boldIn}<select id="det-mode">${(['peak', 'matched', 'fixed'] as DetectionModel[]).map((mdl) => `<option value="${mdl}"${g.mode === mdl ? ' selected' : ''}>${T.model[mdl]}</option>`).join('')}</select></label>
        <label>${T.phaseLaw}<select id="phase-law"><option value="fraction"${g.phaseLaw === 'fraction' ? ' selected' : ''}>${T.lawFraction}</option><option value="lambert"${g.phaseLaw === 'lambert' ? ' selected' : ''}>${T.lawLambert}</option></select></label>
        <label class="full">${T.assumed} <input id="assumed-mag" type="number" step="0.5" inputmode="decimal" placeholder="${T.assumedPh}" value="${g.assumed ?? ''}"></label>
      </div>
      <p class="note">${T.magNote(CAMERA_SETTINGS.exposureS, g.starLimit, g.limit)}</p>
    </details>`;
  }

  private pointingTable(r: PredictResult): string {
    if (!r.pointing.length) return '';
    const stats = r.pointing.map((pc) => {
      const runs = pc.runs.filter((x) => !this.leoOnly || x.leo);
      const c = (b: BandKey) => {
        const rb = runs.filter((x) => x.band === b);
        const ds = rb.map((x) => this.det(x));
        return { all: rb.length, peak: ds.filter((d) => d.peak.detectable === true).length, matched: ds.filter((d) => d.matched.detectable === true).length };
      };
      const iss = pc.runs.filter((x) => x.norad === ISS);
      return { pc, tw: c('twilight'), dk: c('dark'), iss };
    });
    // Twilight glow: Sun's azimuth when the twilight band starts (Sun at −12°).
    const t12 = this.ctx.plan.sun.descending[-12];
    const sun = t12 ? sunAzAlt(t12, this.ctx.site) : null;
    // Moon: smallest angular distance while the Moon is above the horizon during the window (5-min samples).
    const w = this.ctx.plan.window!;
    const moonUp: { az: number; alt: number }[] = [];
    for (let t = w.start.getTime(); t <= w.end.getTime(); t += 5 * 60_000) {
      const m = moonPosition(new Date(t), this.ctx.site);
      if (m.altitude > 0) moonUp.push({ az: m.azimuth, alt: m.altitude });
    }
    const moonSep = (az: number, alt: number) => (moonUp.length ? Math.min(...moonUp.map((m) => angularSeparation(az, alt, m.az, m.alt))) : null);
    const best = Math.max(...stats.map((x) => x.tw.all + x.dk.all));
    const bestPeak = Math.max(...stats.map((x) => x.tw.peak + x.dk.peak));
    const bestMatched = Math.max(...stats.map((x) => x.tw.matched + x.dk.matched));
    const T = S().sats;
    const rows = stats
      .sort((a, b) => a.pc.azimuth - b.pc.azimuth || a.pc.altitude - b.pc.altitude)
      .map(({ pc, tw, dk, iss }) => {
        const cur = this.camera.azimuth === pc.azimuth && this.camera.altitude === pc.altitude;
        const ms = moonSep(pc.azimuth, pc.altitude);
        return `<tr class="${cur ? 'cur' : ''}"><td>${dir(pc.azimuth)} <span class="sec">${pc.azimuth}°/${pc.altitude}°</span></td>
          <td class="r tnum">${sun ? `${azimuthDifference(pc.azimuth, sun.azimuth).toFixed(0)}°` : '—'}</td>
          <td class="r tnum">${ms === null ? `<span class="sec">${T.down}</span>` : `${ms.toFixed(0)}°`}</td>
          <td class="r tnum${tw.all + dk.all === best ? ' best' : ''}">${tw.all} / ${dk.all}</td>
          <td class="r tnum${tw.peak + dk.peak === bestPeak && bestPeak > 0 ? ' best' : ''}">${tw.peak} / ${dk.peak}</td>
          <td class="r tnum${tw.matched + dk.matched === bestMatched && bestMatched > 0 ? ' best' : ''}">${tw.matched} / ${dk.matched}</td>
          <td class="r tnum">${iss.length ? iss.map((x) => `${fmtHMS(new Date(x.start))}–${fmtHMS(new Date(x.end))}`).join('<br>') : '<span class="sec">—</span>'}</td></tr>`;
      })
      .join('');
    const tk = `<div class="sec">${T.twDk}</div>`;
    return `<h3>${T.pointingTitle}</h3>
      <div class="scroll-x"><table class="pointing"><thead><tr><th>${T.thAzAlt}</th><th class="r">${T.thSunDaz}</th><th class="r">${T.thMoon}</th><th class="r">${T.thAll}${tk}</th><th class="r">${T.thPeak}${tk}</th><th class="r">${T.thMatched}${tk}</th><th class="r">${T.thIss}<div class="sec">${T.issRes}</div></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">${T.pointingNote(this.leoOnly, sun && t12 ? T.sunAt(sun.azimuth.toFixed(0), dir(sun.azimuth), fmtHM(t12)) : 'n/a')}</p>`;
  }

  private issCard(): string {
    const ready = this.activeId() && !this.busy;
    const T = S().sats;
    const btn = `<button type="button" data-act="passes"${ready ? '' : ' disabled'}>${this.passes ? T.recomputePasses : T.findPasses}</button>`;
    if (!this.passes) {
      return `<section class="block"><h2>${T.passesTitle}</h2><p class="note">${T.passesIntro}</p><div class="btn-row">${btn}</div></section>`;
    }
    const all = this.passes.passes.filter((p) => p.visible);
    const evening = (p: Pass) => {
      const h = Number(fmtHM(new Date(p.visible!.start.t)).slice(0, 2));
      return h >= 12;
    };
    const shown = this.showAllPasses ? all : all.filter((p) => evening(p) && p.visible!.max.alt >= 30);
    const pt = (x: { t: number; alt: number; az: number }) => `<span class="tnum">${fmtHMS(new Date(x.t))}</span><div class="sec tnum">${x.alt.toFixed(0)}° ${dir(x.az)}</div>`;
    const rows = shown
      .map((p) => {
        const v = p.visible!;
        const sun = sunAltitude(new Date(v.max.t), this.ctx.site);
        return `<tr><td>${fmtShortDate(kstDateString(new Date(v.start.t)))}<div class="sec tnum">${T.sunAlt(sun.toFixed(0))}</div></td><td>${pt(v.start)}</td><td>${pt(v.max)}</td><td>${pt(v.end)}</td></tr>`;
      })
      .join('');
    const ageDays = (Date.now() - this.passes.epoch) / DAY_MS;
    return `<section class="block"><h2>${T.passesTitle}</h2>
      <label class="check"><input type="checkbox" id="show-all-passes"${this.showAllPasses ? ' checked' : ''}> ${T.showAll}</label>
      <div class="scroll-x"><table><thead><tr><th>${T.thDate}</th><th>${T.thStart}</th><th>${T.thHighest}</th><th>${T.thEnd}</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${T.noPasses}</td></tr>`}</tbody></table></div>
      <p class="note">${T.passesNote(fmtDateTime(this.passes.epoch), ageDays.toFixed(1))}</p>
      <div class="btn-row">${btn}</div>
    </section>`;
  }

}

/** Apparent angular speed (deg/s) at the brightest in-frame sample. */
function brightestOmega(samples: Sample[]): number | null {
  let best: Sample | null = null;
  for (const x of samples) if (Number.isFinite(x[0]) && (!best || x[0] < best[0])) best = x;
  return best && Number.isFinite(best[1]) ? best[1] : null;
}
