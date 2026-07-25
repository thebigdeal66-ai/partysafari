/**
 * Shared date/time formatting utilities for consistent display across
 * event cards, feed, venue pages, and event detail pages.
 */

export function formatEventDateTime(startTime: string | null | undefined): string {
  if (!startTime) return 'Date and time unavailable';
  
  try {
    const date = new Date(startTime);
    if (Number.isNaN(date.getTime())) {
      return 'Date and time unavailable';
    }

    // Format: "August 8, 2026 • 9:56 PM"
    const dateStr = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return `${dateStr} • ${timeStr}`;
  } catch {
    return 'Date and time unavailable';
  }
}

export function formatEventDateOnly(startTime: string | null | undefined): string {
  if (!startTime) return 'Date unavailable';
  
  try {
    const date = new Date(startTime);
    if (Number.isNaN(date.getTime())) {
      return 'Date unavailable';
    }

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Date unavailable';
  }
}

export function formatEventTimeOnly(startTime: string | null | undefined): string {
  if (!startTime) return 'Time unavailable';
  
  try {
    const date = new Date(startTime);
    if (Number.isNaN(date.getTime())) {
      return 'Time unavailable';
    }

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Time unavailable';
  }
}
