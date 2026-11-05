/** Project-wide constants for the satellite-streak observation plan. */

export interface Site {
  name: string;
  /** Geodetic latitude, degrees, north positive. */
  latitude: number;
  /** Longitude, degrees, east positive. */
  longitude: number;
  /** Height above mean sea level, metres. */
  elevation: number;
}

/** Default site: school sports field, Hoengseong, Gangwon-do, South Korea. */
export const DEFAULT_SITE: Site = {
  name: 'Hoengseong school field',
  latitude: 37.48,
  longitude: 128.16,
  elevation: 300,
};

/** Display time zone. All times in the UI are KST (UTC+9, no DST). */
export const TIME_ZONE = 'Asia/Seoul';

/** Solar-elevation bands used to compare detection rates (degrees). */
export const BANDS = {
  twilight: { label: 'Twilight band', from: -12, to: -20 },
  dark: { label: 'Dark band', from: -25, to: -35 },
} as const;

/** Sony a7 III intervalometer settings. */
export const CAMERA = {
  exposureS: 15,
  intervalS: 16,
};

/** Shooting window = [t(−12°) − margin, t(−35°) + margin]. */
export const WINDOW_MARGIN_MIN = 5;

/** Field timeline offsets in minutes relative to start (negative) or end (positive) of shooting. */
export const TIMELINE = {
  arriveBeforeStartMin: 25,
  focusBeforeStartMin: 5,
  timeIsPhotoBeforeStartMin: 2,
  timeIsPhotoAfterEndMin: 1,
};
