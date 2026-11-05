/// <reference lib="webworker" />
import { parseElementText, type SatEntry } from './elements';
import { findPasses, predictCrossings, type PredictInput, type PassOptions } from './predict';

/** Heavy satellite work runs here so the UI never freezes. */

let cache: { id: string; sats: SatEntry[]; failures: { id: string; reason: string }[]; format: string } | null = null;

function ensure(setId: string, text?: string) {
  if (cache?.id === setId) return cache;
  if (text == null) throw new Error('Element set not loaded in worker');
  const p = parseElementText(text);
  cache = { id: setId, sats: p.sats, failures: p.failures, format: p.format };
  return cache;
}

export type WorkerRequest =
  | { type: 'parse'; reqId: number; setId: string; text: string }
  | { type: 'predict'; reqId: number; setId: string; text?: string; input: PredictInput }
  | { type: 'passes'; reqId: number; setId: string; text?: string; norad: number; options: PassOptions };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  const post = (msg: object) => (self as unknown as Worker).postMessage({ reqId: m.reqId, ...msg });
  try {
    const c = ensure(m.setId, 'text' in m ? m.text : undefined);
    if (m.type === 'parse') {
      let epochMin = Infinity;
      let epochMax = -Infinity;
      let sixDigit = 0;
      for (const s of c.sats) {
        if (s.epoch < epochMin) epochMin = s.epoch;
        if (s.epoch > epochMax) epochMax = s.epoch;
        if (s.norad >= 100000) sixDigit++;
      }
      post({
        type: 'parsed',
        format: c.format,
        loaded: c.sats.length,
        failed: c.failures.length,
        failures: c.failures.slice(0, 50),
        sixDigit,
        epochMin: c.sats.length ? epochMin : null,
        epochMax: c.sats.length ? epochMax : null,
      });
    } else if (m.type === 'predict') {
      const result = predictCrossings(c.sats, m.input, (f) => post({ type: 'progress', fraction: f }));
      post({ type: 'result', result });
    } else if (m.type === 'passes') {
      const sat = c.sats.find((s) => s.norad === m.norad);
      if (!sat) throw new Error(`NORAD ${m.norad} is not in this element set`);
      post({ type: 'passes', passes: findPasses(sat, m.options), epoch: sat.epoch, name: sat.name });
    }
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.message ?? err) });
  }
};
