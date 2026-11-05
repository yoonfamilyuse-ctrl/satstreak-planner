import type { TimelineItem } from '../astro/schedule';
import { S } from '../i18n';

/**
 * Short display labels for the field-timeline steps. The schedule (astro/schedule.ts) keeps its own descriptive
 * English labels, which its tests and the field log use; the UI maps each step to a key and shows the short label
 * of the current language. tests/steps.test.ts checks that every step of a real plan maps to a key.
 */
export type StepKey = keyof ReturnType<typeof S>['night']['steps'];

const RULES: [RegExp, StepKey][] = [
  [/^Arrive/, 'arrive'],
  [/^Focus/, 'focus'],
  [/time\.is.*before/, 'timeisBefore'],
  [/^Start shooting/, 'start'],
  [/^End shooting/, 'end'],
  [/time\.is.*after/, 'timeisAfter'],
  [/^Twilight band begins/, 'twilightStart'],
  [/^Twilight band ends/, 'twilightEnd'],
  [/^Dark band begins/, 'darkStart'],
  [/^Dark band ends/, 'darkEnd'],
];

export function stepKey(it: Pick<TimelineItem, 'label'>): StepKey | null {
  return RULES.find(([re]) => re.test(it.label))?.[1] ?? null;
}

/** The step's short label in the current language (the schedule label if a new step has no key yet). */
export function stepLabel(it: Pick<TimelineItem, 'label'>): string {
  const k = stepKey(it);
  return k ? S().night.steps[k] : it.label;
}
