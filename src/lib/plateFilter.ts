/**
 * Centralized License Plate Filtering Utility
 *
 * Provides per-client plate filtering for the entire app.
 * This is a frontend visibility filter only - the daily sweep Lambda
 * continues to ingest all matching summonses regardless of plate settings.
 *
 * @module lib/plateFilter
 */

import { Summons, Client } from '../types/summons';

/**
 * Normalize a license plate string for comparison.
 * Uppercases and trims whitespace.
 */
function normalizePlate(plate: string): string {
  return plate.toUpperCase().trim();
}

/**
 * Apply plate filter for a single client context (ClientDetail, CSV export per client).
 *
 * If plate_filter_enabled is false or plate_filter_list is empty/undefined,
 * returns all summonses unchanged.
 *
 * Otherwise, filters to only summonses whose plate matches the allowed list.
 * Checks both license_plate_ocr (OCR, higher accuracy) and license_plate (API).
 * Summonses with no plate data at all (both fields empty) are included when
 * filter is ON - conservative approach to avoid hiding potentially relevant records.
 */
export function applyClientPlateFilter(
  summonses: Summons[],
  client: Client
): Summons[] {
  // Filter disabled or no plates configured - return all
  if (!client.plate_filter_enabled) return summonses;
  if (!client.plate_filter_list || client.plate_filter_list.length === 0) return summonses;

  const allowedPlates = new Set(client.plate_filter_list.map(normalizePlate));

  return summonses.filter((s) => {
    const ocrPlate = s.license_plate_ocr?.trim();
    const apiPlate = s.license_plate?.trim();

    // No plate data at all - include conservatively to avoid hiding relevant records
    if (!ocrPlate && !apiPlate) return true;

    // Check if either plate field matches any allowed plate
    if (ocrPlate && allowedPlates.has(normalizePlate(ocrPlate))) return true;
    if (apiPlate && allowedPlates.has(normalizePlate(apiPlate))) return true;

    return false;
  });
}

/**
 * Apply plate filters for multi-client contexts (Dashboard, CalendarDashboard).
 *
 * Builds a Map<clientID, Set<plate>> from all clients with filtering enabled,
 * then filters summonses accordingly. Summonses belonging to clients without
 * plate filtering are passed through unchanged.
 */
export function applyPlateFilters(
  summonses: Summons[],
  clients: Client[]
): Summons[] {
  // Build a map of clientID -> allowed plates (only for clients with filtering enabled)
  const plateFilterMap = new Map<string, Set<string>>();

  for (const client of clients) {
    if (
      client.plate_filter_enabled &&
      client.plate_filter_list &&
      client.plate_filter_list.length > 0
    ) {
      plateFilterMap.set(
        client.id,
        new Set(client.plate_filter_list.map(normalizePlate))
      );
    }
  }

  // No clients have plate filtering enabled - return all
  if (plateFilterMap.size === 0) return summonses;

  return summonses.filter((s) => {
    const allowedPlates = plateFilterMap.get(s.clientID);

    // This client has no plate filter - pass through
    if (!allowedPlates) return true;

    const ocrPlate = s.license_plate_ocr?.trim();
    const apiPlate = s.license_plate?.trim();

    // No plate data at all - include conservatively
    if (!ocrPlate && !apiPlate) return true;

    // Check if either plate field matches any allowed plate
    if (ocrPlate && allowedPlates.has(normalizePlate(ocrPlate))) return true;
    if (apiPlate && allowedPlates.has(normalizePlate(apiPlate))) return true;

    return false;
  });
}
