import type { WorkerRequest } from './worker';

type Req = WorkerRequest extends infer R ? (R extends { reqId: number } ? Omit<R, 'reqId'> : never) : never;

/** Promise wrapper around the satellite worker. */
export class SatWorker {
  private w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private next = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; progress?: (f: number) => void }>();
  /** Set ids the worker has already parsed (so we don't resend the text). */
  loaded: string | null = null;

  constructor() {
    this.w.onmessage = (e) => {
      const m = e.data;
      const p = this.pending.get(m.reqId);
      if (!p) return;
      if (m.type === 'progress') return p.progress?.(m.fraction);
      this.pending.delete(m.reqId);
      if (m.type === 'error') p.reject(new Error(m.message));
      else p.resolve(m);
    };
    this.w.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Worker error'));
      this.pending.clear();
    };
  }

  call<T = any>(req: Req, progress?: (f: number) => void): Promise<T> {
    const reqId = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject, progress });
      this.w.postMessage({ ...req, reqId });
    });
  }
}
