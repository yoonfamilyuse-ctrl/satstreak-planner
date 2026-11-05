import { BANDS, CAMERA, WINDOW_MARGIN_MIN } from '../config';
import { frameAt, type BandSpan, type NightPlan } from '../astro/schedule';
import { sunAltitude, SUN_ALTITUDES, type SunAltitude } from '../astro/sun';
import type { CloudAverage } from '../weather/openmeteo';
import { fmtDuration, fmtHM, fmtHMS, todayKST } from '../time';
import { cloudText, deg, dir, esc, moonIcon, openMeteoAttribution } from './util';
import { moonPhase, S } from '../i18n';
import { stepKey, stepLabel } from './steps';

/**
 * Night plan view (Stage 1), "contact sheet" layout:
 *  - a one-line whole-night bar (both bands marked, shot part filled, a line at the current frame),
 *  - a film strip of every frame that can be swiped and tapped,
 *  - the frame being exposed now (or the start time), its band, and the next step with a countdown,
 *  - the field timeline, the window summary, Sun and Moon.
 * Display only: every time and frame comes from the night plan (schedule.ts, frames.ts). "Now" uses frameAt()
 * on the phone clock and is shown only for tonight's plan; other dates show the plan for an on-time start.
 */

type Phase = 'plan' | 'before' | 'during' | 'after';

interface Now {
  phase: Phase;
  /** Frame being exposed (during), else null. */
  frame: number | null;
  /** Next timeline item after now (tonight only). */
  next: NightPlan['timeline'][number] | null;
}

const FRAME_W = 66; // px per frame in the strip; matches .fr width in style.css

export class NightView {
  private el: HTMLElement | null = null;
  private plan: NightPlan | null = null;
  private timer: number | null = null;
  private selected: number | null = null;
  private lastKey = '';
  /** Test hook: the clock. */
  now: () => number = () => Date.now();

  render(el: HTMLElement, plan: NightPlan, cloud: CloudAverage | null | undefined) {
    this.detach();
    this.el = el;
    this.plan = plan;
    this.selected = null;
    this.lastKey = '';
    el.innerHTML = [warnings(plan), plan.window ? liveBlock() : noWindow(), timelineCard(plan), summaryCard(plan, cloud), sunCard(plan), moonCard(plan)].join('');
    if (plan.window) {
      el.querySelector('#strip-row')!.innerHTML = stripFrames(plan);
      el.addEventListener('click', this.onClick);
      this.tick();
      this.scrollTo(this.focusFrame(), false);
      if (plan.dateStr === todayKST()) this.timer = window.setInterval(() => this.tick(), 1000);
    }
  }

  detach() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.el?.removeEventListener('click', this.onClick);
    this.el = null;
  }

  private state(): Now {
    const p = this.plan!;
    const w = p.window!;
    if (p.dateStr !== todayKST()) return { phase: 'plan', frame: null, next: null };
    const t = this.now();
    const next = p.timeline.find((i) => i.time.getTime() > t) ?? null;
    if (t < w.start.getTime()) return { phase: 'before', frame: null, next };
    if (t > w.end.getTime()) return { phase: 'after', frame: null, next };
    return { phase: 'during', frame: frameAt(w, new Date(t)), next };
  }

  /** Frame the strip centres on: the selection, else the current frame, else frame 1 (or the last after shooting). */
  private focusFrame(): number {
    const s = this.state();
    return this.selected ?? s.frame ?? (s.phase === 'after' ? this.plan!.window!.shots : 1);
  }

  /** Update the live parts. Cheap when nothing visible changed (same frame, same minute of countdown). */
  tick() {
    if (!this.el || !this.plan) return;
    const s = this.state();
    const t = this.now();
    const minsTo = (ms: number) => Math.round((ms - t) / 60000);
    const key = `${s.phase}|${s.frame}|${s.next?.label}|${s.next ? minsTo(s.next.time.getTime()) : ''}|${minsTo(this.plan.window!.start.getTime())}|${this.selected}`;
    if (key === this.lastKey) return;
    const prev = this.lastKey;
    this.lastKey = key;
    const p = this.plan;
    const $ = (id: string) => this.el!.querySelector<HTMLElement>(`#${id}`)!;
    $('nightbar').innerHTML = nightBar(p, s, this.selected);
    $('strip-info').innerHTML = stripInfo(p, s, this.selected);
    $('now-block').innerHTML = nowBlock(p, s, t);
    const nx = $('next-step');
    nx.hidden = !s.next;
    nx.innerHTML = s.next ? nextStep(p, s.next, t) : '';
    // Strip: mark shot frames and the current one.
    const shotUpTo = s.phase === 'during' ? s.frame! - 1 : s.phase === 'after' ? p.window!.shots : 0;
    this.el.querySelectorAll<HTMLButtonElement>('#strip-row .fr').forEach((b) => {
      const n = Number(b.dataset.n);
      b.classList.toggle('shot', n <= shotUpTo);
      b.classList.toggle('cur', n === s.frame);
      b.classList.toggle('sel', n === this.selected);
      b.tabIndex = n === (this.selected ?? s.frame ?? 1) ? 0 : -1;
    });
    // Timeline: past and next rows (tonight only).
    this.el.querySelectorAll<HTMLElement>('#timeline li').forEach((li) => {
      const at = Number(li.dataset.t);
      li.classList.toggle('past', s.phase !== 'plan' && at <= t);
      li.classList.toggle('next', !!s.next && at === s.next.time.getTime());
    });
    // Follow the current frame while nothing is selected.
    const prevFrame = prev.split('|')[1];
    if (this.selected === null && s.frame !== null && String(s.frame) !== prevFrame) this.scrollTo(s.frame, true);
  }

  private scrollTo(n: number, smooth: boolean) {
    const strip = this.el?.querySelector<HTMLElement>('#strip');
    if (!strip) return;
    const left = (n - 1) * FRAME_W;
    const near = Math.abs(strip.scrollLeft - left) < FRAME_W * 8;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof strip.scrollTo === 'function') strip.scrollTo({ left, behavior: smooth && near && !reduce ? 'smooth' : 'auto' });
    else strip.scrollLeft = left;
  }

  private select(n: number | null) {
    this.selected = n;
    this.tick();
    this.scrollTo(this.focusFrame(), true);
  }

  private onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const fr = target.closest<HTMLElement>('.fr');
    if (fr) return this.select(Number(fr.dataset.n));
    if (target.closest('#strip-now')) return this.select(null);
    const bar = target.closest<HTMLElement>('#nightbar-btn');
    if (bar && this.plan?.window) {
      const r = bar.getBoundingClientRect();
      const x = r.width > 0 ? ((e as MouseEvent).clientX - r.left) / r.width : 0;
      const shots = this.plan.window.shots;
      this.select(Math.min(shots, Math.max(1, Math.round(x * (shots - 1)) + 1)));
    }
  };
}

// ---------- pieces ----------

const bandOfFrame = (p: NightPlan, n: number): BandSpan | undefined =>
  p.bands.find((b) => b.plannedFirst !== null && b.plannedLast !== null && n >= b.plannedFirst && n <= b.plannedLast);

const frameStart = (p: NightPlan, n: number) => new Date(p.window!.start.getTime() + (n - 1) * CAMERA.intervalS * 1000);

const pct = (p: NightPlan, n: number) => ((n - 1) / Math.max(1, p.window!.shots - 1)) * 100;

const bandName = (key: 'twilight' | 'dark') => S().common.band[key];

/** The plan's warnings, in the current language (same rule as computeNight: a band edge the Sun never reaches). */
function warnings(p: NightPlan): string {
  const alts = ([-12, -20, -25, -35] as const).filter((a) => !p.sun.descending[a]);
  return alts.map((a) => `<div class="warn" role="alert">${esc(S().night.warnNoAlt(a, a <= -25))}</div>`).join('');
}

function noWindow(): string {
  return `<section class="block"><h2>${S().night.noWindowTitle}</h2><p>${S().night.noWindow}</p></section>`;
}

function liveBlock(): string {
  return `<div class="nightbar" id="nightbar"></div>
    <div class="strip" id="strip" role="group" aria-label="${S().night.stripAria}"><div class="strip-row" id="strip-row"></div></div>
    <div class="strip-info" id="strip-info" aria-live="polite"></div>
    <div class="now" id="now-block"></div>
    <div class="next-step" id="next-step"></div>`;
}

function nightBar(p: NightPlan, s: Now, selected: number | null): string {
  const w = p.window!;
  const d = p.dateStr;
  const shot = s.phase === 'during' ? pct(p, s.frame!) : s.phase === 'after' ? 100 : 0;
  const bands = p.bands
    .filter((b) => b.plannedFirst !== null && b.plannedLast !== null)
    .map((b) => `<span class="nb-band" style="left:${pct(p, b.plannedFirst!)}%;width:${pct(p, b.plannedLast!) - pct(p, b.plannedFirst!)}%"></span>`)
    .join('');
  return `<span class="nb-end tnum">${fmtHM(w.start, d)}</span>
    <button type="button" class="nb-btn" id="nightbar-btn" aria-label="${S().night.barAria(w.shots)}">
      <span class="nb-track"><span class="nb-shot" style="width:${shot}%"></span></span>${bands}
      ${s.phase === 'during' ? `<span class="nb-now" style="left:${pct(p, s.frame!)}%"></span>` : ''}
      ${selected !== null ? `<span class="nb-sel" style="left:${pct(p, selected)}%"></span>` : ''}
    </button>
    <span class="nb-end tnum">${fmtHM(w.end, d)}</span>`;
}

function stripFrames(p: NightPlan): string {
  const out: string[] = [];
  let prevKey = '';
  for (let n = 1; n <= p.window!.shots; n++) {
    const b = bandOfFrame(p, n);
    const key = b?.key ?? '';
    const E = S().night.edge;
    const edge = b && key !== prevKey ? (key === 'twilight' ? E.twilight : E.dark) : b ? (key === 'twilight' ? E.twilightShort : E.darkShort) : '';
    prevKey = key;
    out.push(
      `<button type="button" class="fr${b ? ' inband' : ''}" data-n="${n}" tabindex="-1" aria-label="${S().night.frameAria(n, b ? bandName(b.key) : null)}"><span class="fr-n tnum">${n}</span><span class="fr-img"></span><span class="fr-b">${edge}</span></button>`,
    );
  }
  return out.join('');
}

function stripInfo(p: NightPlan, s: Now, selected: number | null): string {
  if (selected !== null) {
    const st = frameStart(p, selected);
    const b = bandOfFrame(p, selected);
    const N = S().night;
    return `<span><b class="tnum">${N.frame(selected)}</b> · <span class="tnum">${fmtHMS(st, p.dateStr)}–${fmtHMS(new Date(st.getTime() + CAMERA.exposureS * 1000), p.dateStr)}</span> · ${b ? `<span class="mark-text">${esc(bandName(b.key))}</span>` : N.noBand}</span>
      <button type="button" class="pill-btn" id="strip-now">${s.phase === 'during' ? N.now : N.back}</button>`;
  }
  const N = S().night;
  const lead = s.phase === 'during' ? N.leadDuring(s.frame!) : s.phase === 'after' ? N.leadAfter : N.leadBefore(fmtHMS(p.window!.start, p.dateStr));
  return `<span>${lead} · ${N.tapHint}</span>`;
}

function nowBlock(p: NightPlan, s: Now, t: number): string {
  const w = p.window!;
  const d = p.dateStr;
  const N = S().night;
  if (s.phase === 'during') {
    const b = bandOfFrame(p, s.frame!);
    const where = b
      ? `<span class="now-band mark-text">${esc(bandName(b.key))}</span><span class="now-sub tnum">${N.framesRange(b.plannedFirst!, b.plannedLast!)}</span>`
      : `<span class="now-band">${s.frame! < (p.bands[0].plannedFirst ?? 0) ? N.beforeTwilight : s.frame! < (p.bands[1].plannedFirst ?? Infinity) ? N.between : N.afterDark}</span><span class="now-sub">${N.noBand}</span>`;
    return `<span class="now-big tnum" aria-label="${N.frame(s.frame!)}">${s.frame}</span><span class="now-text"><span class="now-sub tnum">${N.frameNowOf(w.shots)}</span>${where}</span>`;
  }
  if (s.phase === 'after') {
    return `<span class="now-big tnum">${w.shots}</span><span class="now-text"><span class="now-sub">${N.framesPlanned}</span><span class="now-band">${N.done}</span><span class="now-sub tnum">${N.ended(fmtHMS(w.end, d))}</span></span>`;
  }
  const lead = s.phase === 'before' ? N.startsIn(fmtDuration(w.start.getTime() - t)) : N.durFrames(fmtDuration(w.durationMs), w.shots);
  return `<span class="now-big tnum">${fmtHM(w.start, d)}</span><span class="now-text"><span class="now-sub">${N.startShooting}</span><span class="now-band">${lead}</span><span class="now-sub tnum">${N.frame1At(fmtHMS(w.start, d))}</span></span>`;
}

function nextStep(p: NightPlan, next: NightPlan['timeline'][number], t: number): string {
  const N = S().night;
  return `<span class="ns-what"><span class="now-sub">${N.next}</span><b>${esc(stepLabel(next))}</b></span>
    <span class="ns-when"><b class="mark-text tnum">${fmtHMS(next.time, p.dateStr)}</b><span class="now-sub tnum">${N.inDur(fmtDuration(next.time.getTime() - t))}</span></span>`;
}

function timelineCard(p: NightPlan): string {
  if (!p.window) return '';
  const d = p.dateStr;
  const rows = p.timeline
    .map((it) => {
      const k = stepKey(it);
      const key = k === 'start' || k === 'end' ? ' key' : '';
      return `<li class="${it.kind === 'band' ? 'band' : 'task'}${key}" data-t="${it.time.getTime()}"><span class="tl-t tnum">${fmtHMS(it.time, d)}</span><span class="tl-l">${esc(stepLabel(it))}</span><span class="tl-f tnum">${it.frame ?? ''}</span></li>`;
    })
    .join('');
  const N = S().night;
  return `<section class="block"><h2>${N.timelineTitle}</h2>
    <ol class="tl" id="timeline" aria-label="${N.timelineAria}">${rows}</ol>
    <p class="note">${N.timelineNote}</p>
  </section>`;
}

function summaryCard(p: NightPlan, cloud: CloudAverage | null | undefined): string {
  const w = p.window;
  if (!w) return '';
  const d = p.dateStr;
  const N = S().night;
  const band = (b: BandSpan) =>
    `<div class="fact"><span class="fact-k">${esc(bandName(b.key))} <span class="tnum">${b.from}° → ${b.to}°</span></span><b class="tnum">${b.plannedFirst !== null ? `${b.plannedFirst}–${b.plannedLast}` : '—'}</b>
      <span class="fact-s tnum">${fmtHM(b.start, d)}–${fmtHM(b.end, d)} · ${b.start && b.end ? fmtDuration(b.end.getTime() - b.start.getTime()) : '—'} · ${N.nFrames(b.frames ?? '—')}</span></div>`;
  return `<section class="block"><h2>${N.windowTitle}</h2>
    <div class="facts">
      <div class="fact"><span class="fact-k">${N.window}</span><b class="tnum">${fmtHM(w.start, d)}–${fmtHM(w.end, d)}</b><span class="fact-s tnum">${fmtDuration(w.durationMs)} · ${Math.round(w.durationMs / 1000)} s</span></div>
      <div class="fact"><span class="fact-k">${N.shots}</span><b class="tnum">${w.shots}</b><span class="fact-s">${N.expInt(CAMERA.exposureS, CAMERA.intervalS)}</span></div>
      ${p.bands.map(band).join('')}
    </div>
    ${cloud !== undefined ? `<p class="cloud-line">${N.cloudLine} <b>${cloudText(cloud)}</b><br>${openMeteoAttribution()} (CC BY 4.0)</p>` : ''}
    <p class="note">${N.windowNote(WINDOW_MARGIN_MIN, BANDS.twilight.from, BANDS.dark.to, CAMERA.intervalS)}</p>
  </section>`;
}


function sunCard(p: NightPlan): string {
  const d = p.dateStr;
  const N = S().night;
  const rowClass = (a: SunAltitude) => (a === -12 || a === -20 || a === -25 || a === -35 ? 'hi' : '');
  const rows = [
    `<tr><td>${N.sunset} <span class="sec-s">${N.sunsetDetail}</span></td><td class="r tnum">−0.8°</td><td class="t r tnum">${fmtHMS(p.sun.sunset, d)}</td></tr>`,
    ...SUN_ALTITUDES.map(
      (a) => `<tr class="${rowClass(a)}"><td>${N.sunLabels[String(a)]}</td><td class="r tnum">${a}°</td><td class="t r tnum">${fmtHMS(p.sun.descending[a], d)}</td></tr>`,
    ),
  ].join('');
  return `<section class="block"><h2>${N.sunTitle}</h2>
    <table><thead><tr><th>${N.thEvent}</th><th class="r">${N.thSunAlt}</th><th class="r">KST</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">${N.sunNote}</p>
  </section>`;
}

function moonCard(p: NightPlan): string {
  const m = p.moon;
  const d = p.dateStr;
  const w = p.window;
  const N = S().night;
  const upTxt = w ? N.upOf(m.minutesUp, Math.round(w.durationMs / 60000)) : '—';
  const rows = m.samples
    .map((s) => {
      const sa = sunAltitude(s.time, p.site);
      const band = (sa <= BANDS.twilight.from && sa >= BANDS.twilight.to) || (sa <= BANDS.dark.from && sa >= BANDS.dark.to) ? 'hi' : '';
      return `<tr class="${band}"><td class="t tnum">${fmtHM(s.time, d)}</td><td class="r tnum">${deg(sa)}</td>
        <td class="r tnum">${s.altitude > 0 ? deg(s.altitude) : `<span class="sec-s">${deg(s.altitude)}</span>`}</td>
        <td class="r tnum">${deg(s.azimuth, 0)} ${dir(s.azimuth)}</td></tr>`;
    })
    .join('');
  return `<section class="block"><h2>${N.moonTitle}</h2>
    <div class="moon-head">${moonIcon(m.illuminationPct, m.waxing)}
      <div><div class="big tnum">${N.lit(m.illuminationPct.toFixed(0))}</div><div class="sec-s">${N.phaseAt(moonPhase(m.phaseName), fmtHM(m.phaseAt, d))}</div></div></div>
    <dl class="kv">
      <dt>${N.moonrise}</dt><dd class="tnum">${fmtHM(m.rise, d)}</dd>
      <dt>${N.moonset}</dt><dd class="tnum">${fmtHM(m.set, d)}</dd>
      <dt>${N.upDuring}</dt><dd class="tnum">${upTxt}${m.maxAltitude !== null ? N.maxAlt(deg(m.maxAltitude)) : ''}</dd>
    </dl>
    ${
      rows
        ? `<div class="scroll-x" style="margin-top:12px"><table><thead><tr><th>KST</th><th class="r">${N.thSunAlt}</th><th class="r">${N.thMoonAlt}</th><th class="r">${N.thMoonAz}</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : ''
    }
    <p class="note">${N.moonNote}</p>
  </section>`;
}
