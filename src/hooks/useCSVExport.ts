/**
 * useCSVExport Hook
 *
 * Custom hook for handling CSV export functionality.
 * Implements "Fetch All" strategy to bypass pagination limits.
 *
 * Key Features:
 * - Fetches ALL records for a client (no pagination cap)
 * - Progress tracking during fetch and generation
 * - Support for AKA-based client matching
 * - Respects "Idling Only" filter context
 *
 * @module hooks/useCSVExport
 */

import { useState, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { listSummons } from '../graphql/queries';
import { Summons, Client } from '../types/summons';
import {
  ExportConfig,
  generateCSV,
  generateFilename,
  downloadCSV,
} from '../lib/csvExport';

const apiClient = generateClient();

// Pre-2022 cutoff for Active Era filtering
const PRE_2022_CUTOFF = new Date('2022-01-01T00:00:00.000Z');

// Maximum records per fetch (GraphQL limit)
const FETCH_BATCH_SIZE = 1000;

// Safety limit for total fetches (prevents infinite loops)
const MAX_FETCH_ITERATIONS = 100;

// ============================================================================
// TYPES
// ============================================================================

export interface ExportProgress {
  phase: 'idle' | 'fetching' | 'processing' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}

export interface UseCSVExportResult {
  progress: ExportProgress;
  isExporting: boolean;
  error: string | null;
  exportClientSummonses: (
    client: Client,
    config: ExportConfig
  ) => Promise<void>;
  exportAllSummonses: (config: ExportConfig) => Promise<void>;
  resetExport: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Filter summonses for a specific client (by clientID OR respondent_name AKA match)
 */
function filterSummonsesForClient(
  allSummonses: Summons[],
  client: Client
): Summons[] {
  // Build a set of names to match (primary name + AKAs)
  const matchNames = new Set<string>();
  matchNames.add(client.name.toLowerCase().trim());
  if (client.akas) {
    client.akas.forEach((aka) => matchNames.add(aka.toLowerCase().trim()));
  }

  return allSummonses.filter((s) => {
    // Direct clientID match
    if (s.clientID === client.id) return true;

    // AKA match: respondent_name matches client name or any AKA
    if (s.respondent_name) {
      const respondentNormalized = s.respondent_name.toLowerCase().trim();
      for (const name of matchNames) {
        if (respondentNormalized.includes(name) || name.includes(respondentNormalized)) {
          return true;
        }
      }
    }
    return false;
  });
}

/**
 * Filter to Active Era (2022+) if historical not included
 */
function filterByDateRange(summonses: Summons[], includeHistorical: boolean): Summons[] {
  if (includeHistorical) {
    return summonses;
  }

  return summonses.filter((s) => {
    if (!s.hearing_date) return true;
    return new Date(s.hearing_date) >= PRE_2022_CUTOFF;
  });
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useCSVExport(): UseCSVExportResult {
  const [progress, setProgress] = useState<ExportProgress>({
    phase: 'idle',
    current: 0,
    total: 0,
    message: '',
  });
  const [error, setError] = useState<string | null>(null);

  const isExporting = progress.phase !== 'idle' && progress.phase !== 'complete' && progress.phase !== 'error';

  /**
   * Fetch ALL summonses using pagination (bypasses any limits)
   * This is the "Fetch All" strategy - critical for export
   */
  const fetchAllSummonses = useCallback(async (): Promise<Summons[]> => {
    let allSummonses: Summons[] = [];
    let nextToken: string | null = null;
    let fetchCount = 0;

    setProgress({
      phase: 'fetching',
      current: 0,
      total: 0,
      message: 'Fetching records...',
    });

    while (fetchCount < MAX_FETCH_ITERATIONS) {
      const result = await apiClient.graphql({
        query: listSummons,
        variables: {
          limit: FETCH_BATCH_SIZE,
          nextToken,
        },
      }) as { data: { listSummons: { items: Summons[]; nextToken: string | null } } };

      const items = result.data.listSummons.items;
      allSummonses = [...allSummonses, ...items];
      nextToken = result.data.listSummons.nextToken;
      fetchCount++;

      setProgress({
        phase: 'fetching',
        current: allSummonses.length,
        total: 0, // Unknown total during fetch
        message: `Fetched ${allSummonses.length} records...`,
      });

      if (!nextToken) break;
    }

    return allSummonses;
  }, []);

  /**
   * Export summonses for a specific client
   */
  const exportClientSummonses = useCallback(async (
    client: Client,
    config: ExportConfig
  ): Promise<void> => {
    setError(null);

    try {
      // Phase 1: Fetch ALL summonses
      const allSummonses = await fetchAllSummonses();

      // Phase 2: Filter for this client (with AKA support)
      setProgress({
        phase: 'processing',
        current: 0,
        total: allSummonses.length,
        message: 'Filtering records for client...',
      });

      let clientSummonses = filterSummonsesForClient(allSummonses, client);

      // Phase 3: Apply date range filter
      clientSummonses = filterByDateRange(clientSummonses, config.includeHistorical);

      setProgress({
        phase: 'processing',
        current: clientSummonses.length,
        total: clientSummonses.length,
        message: `Preparing ${clientSummonses.length} records...`,
      });

      // Phase 4: Generate CSV
      const csvContent = generateCSV(clientSummonses, config, (current, total, message) => {
        setProgress({
          phase: 'processing',
          current,
          total,
          message,
        });
      });

      // Phase 5: Download file
      const filename = generateFilename(client.name);
      downloadCSV(csvContent, filename);

      setProgress({
        phase: 'complete',
        current: clientSummonses.length,
        total: clientSummonses.length,
        message: `Exported ${clientSummonses.length} records to ${filename}`,
      });

    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
      setProgress({
        phase: 'error',
        current: 0,
        total: 0,
        message: 'Export failed',
      });
    }
  }, [fetchAllSummonses]);

  /**
   * Export summonses for ALL clients (Global Export)
   */
  const exportAllSummonses = useCallback(async (config: ExportConfig): Promise<void> => {
    setError(null);

    try {
      // Phase 1: Fetch ALL summonses
      const allSummonses = await fetchAllSummonses();

      // Check if too large (> 5000 records warning)
      if (allSummonses.length > 5000) {
        console.warn(`Large export: ${allSummonses.length} records. Consider chunking.`);
      }

      // Phase 2: Apply date range filter
      setProgress({
        phase: 'processing',
        current: 0,
        total: allSummonses.length,
        message: 'Applying filters...',
      });

      const filteredSummonses = filterByDateRange(allSummonses, config.includeHistorical);

      setProgress({
        phase: 'processing',
        current: filteredSummonses.length,
        total: filteredSummonses.length,
        message: `Preparing ${filteredSummonses.length} records...`,
      });

      // Phase 3: Generate CSV
      const csvContent = generateCSV(filteredSummonses, config, (current, total, message) => {
        setProgress({
          phase: 'processing',
          current,
          total,
          message,
        });
      });

      // Phase 4: Download file
      const filename = generateFilename(undefined, true);
      downloadCSV(csvContent, filename);

      setProgress({
        phase: 'complete',
        current: filteredSummonses.length,
        total: filteredSummonses.length,
        message: `Exported ${filteredSummonses.length} records to ${filename}`,
      });

    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
      setProgress({
        phase: 'error',
        current: 0,
        total: 0,
        message: 'Export failed',
      });
    }
  }, [fetchAllSummonses]);

  /**
   * Reset export state
   */
  const resetExport = useCallback(() => {
    setProgress({
      phase: 'idle',
      current: 0,
      total: 0,
      message: '',
    });
    setError(null);
  }, []);

  return {
    progress,
    isExporting,
    error,
    exportClientSummonses,
    exportAllSummonses,
    resetExport,
  };
}

export default useCSVExport;
