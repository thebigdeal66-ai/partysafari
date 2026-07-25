/**
 * Shared utilities for venue check-in display and calculations
 */

export type CrowdLevel = 'Quiet' | 'Getting Busy' | 'Busy' | 'Packed';

export const CROWD_THRESHOLDS = {
  quiet: { min: 0, max: 9 },
  gettingBusy: { min: 10, max: 39 },
  busy: { min: 40, max: 99 },
  packed: { min: 100, max: Infinity },
} as const;

/**
 * Calculate crowd level from live check-in count
 */
export function getCrowdLevel(count: number): CrowdLevel {
  if (count < CROWD_THRESHOLDS.gettingBusy.min) return 'Quiet';
  if (count < CROWD_THRESHOLDS.busy.min) return 'Getting Busy';
  if (count < CROWD_THRESHOLDS.packed.min) return 'Busy';
  return 'Packed';
}

/**
 * Get color classes for crowd level badge
 */
export function getCrowdLevelColorClass(level: CrowdLevel): string {
  switch (level) {
    case 'Quiet':
      return 'bg-blue-500/20 text-blue-200 border-blue-500/30';
    case 'Getting Busy':
      return 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30';
    case 'Busy':
      return 'bg-orange-500/20 text-orange-200 border-orange-500/30';
    case 'Packed':
      return 'bg-red-500/20 text-red-200 border-red-500/30';
    default:
      return 'bg-white/10 text-white/70';
  }
}

/**
 * Get emoji for crowd level
 */
export function getCrowdLevelEmoji(level: CrowdLevel): string {
  switch (level) {
    case 'Quiet':
      return '😴';
    case 'Getting Busy':
      return '🔥';
    case 'Busy':
      return '🌶️';
    case 'Packed':
      return '💥';
    default:
      return '?';
  }
}

/**
 * Format count with commas for display
 */
export function formatCheckInCount(count: number): string {
  return count.toLocaleString('en-US');
}

/**
 * Get animation class for crowd visualization based on level
 * Respects prefers-reduced-motion media query
 */
export function getCrowdAnimationClass(level: CrowdLevel): string {
  // Check for prefers-reduced-motion
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return '';
  }

  switch (level) {
    case 'Quiet':
      return '';
    case 'Getting Busy':
      return 'animate-pulse';
    case 'Busy':
      return 'animate-bounce';
    case 'Packed':
      return 'animate-ping';
    default:
      return '';
  }
}

/**
 * Get shadow/glow class for marker visualization
 */
export function getCrowdGlowClass(level: CrowdLevel): string {
  switch (level) {
    case 'Quiet':
      return 'shadow-sm';
    case 'Getting Busy':
      return 'shadow-md shadow-yellow-500/25';
    case 'Busy':
      return 'shadow-lg shadow-orange-500/35';
    case 'Packed':
      return 'shadow-xl shadow-red-500/45';
    default:
      return 'shadow-md';
  }
}

/**
 * Get descriptive text for crowd level
 */
export function getCrowdLevelDescription(level: CrowdLevel): string {
  switch (level) {
    case 'Quiet':
      return 'Relaxed vibe right now';
    case 'Getting Busy':
      return 'Starting to pick up';
    case 'Busy':
      return 'Great energy happening';
    case 'Packed':
      return 'Peak crowd energy';
    default:
      return 'Unknown vibe';
  }
}
