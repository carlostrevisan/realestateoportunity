import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Formats a snake_case city slug into Title Case. "winter_garden" → "Winter Garden" */
export function formatCityName(city) {
  return city ? city.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';
}

/** Builds a Zillow listing search URL for a Florida property. */
export function buildZillowUrl(address, cityDisplay, zip) {
  return `https://www.zillow.com/homes/${encodeURIComponent(`${address}, ${cityDisplay}, FL ${zip}`)}_rb/`;
}

/** Formats an ISO timestamp as "Mon D, HH:MM" for display in job logs and run history. */
export function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
