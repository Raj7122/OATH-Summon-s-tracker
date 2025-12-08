/**
 * Sync Status Badge Component
 *
 * Displays a "traffic light" indicator showing data freshness in the app header.
 * Provides "Proof of Life" that the daily sweep is working correctly.
 *
 * Visual Logic:
 * - Green: "Synced: [Time Ago]" (< 24 hours since last sync)
 * - Yellow: "Data Stale: [Time Ago]" (24-48 hours)
 * - Red: "Sync Failed: [Time Ago]" (> 48 hours)
 * - Blue/Spinner: "Syncing..." (sync in progress)
 *
 * @module components/SyncStatusBadge
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Chip,
  Popover,
  Typography,
  CircularProgress,
  Divider,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import { generateClient } from 'aws-amplify/api';

import { getSyncStatus } from '../graphql/queries';
import { SyncStatus } from '../types/summons';

const apiClient = generateClient();

// Singleton ID for the global sync status record
const GLOBAL_SYNC_ID = 'GLOBAL';

// Time thresholds in hours
const FRESH_THRESHOLD_HOURS = 24;
const STALE_THRESHOLD_HOURS = 48;

// Polling interval (5 minutes)
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sync status badge color types
 */
type SyncStatusLevel = 'fresh' | 'stale' | 'failed' | 'syncing' | 'unknown';

/**
 * Calculate hours since a given timestamp
 */
function getHoursSince(timestamp: string | undefined | null): number {
  if (!timestamp) return Infinity;
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60);
}

/**
 * Format a timestamp as relative time (e.g., "2h ago", "1d ago")
 */
function formatTimeAgo(timestamp: string | undefined | null): string {
  if (!timestamp) return 'Never';

  const hours = getHoursSince(timestamp);

  if (hours < 1) {
    const minutes = Math.floor(hours * 60);
    return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${Math.floor(hours)}h ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Determine the sync status level based on the sync data
 */
function getSyncLevel(syncStatus: SyncStatus | null): SyncStatusLevel {
  if (!syncStatus) return 'unknown';

  // If sync is currently in progress
  if (syncStatus.sync_in_progress) return 'syncing';

  // Check time since last successful sync
  const hoursSinceSync = getHoursSince(syncStatus.last_successful_sync);

  if (hoursSinceSync < FRESH_THRESHOLD_HOURS) return 'fresh';
  if (hoursSinceSync < STALE_THRESHOLD_HOURS) return 'stale';
  return 'failed';
}

/**
 * Get the chip color for a sync level
 */
function getChipColor(level: SyncStatusLevel): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (level) {
    case 'fresh':
      return 'success';
    case 'stale':
      return 'warning';
    case 'failed':
      return 'error';
    case 'syncing':
      return 'info';
    default:
      return 'default';
  }
}

/**
 * Get the chip icon for a sync level
 */
function getChipIcon(level: SyncStatusLevel): React.ReactElement {
  switch (level) {
    case 'fresh':
      return <CheckCircleIcon sx={{ fontSize: 16 }} />;
    case 'stale':
      return <WarningIcon sx={{ fontSize: 16 }} />;
    case 'failed':
      return <ErrorIcon sx={{ fontSize: 16 }} />;
    case 'syncing':
      return <CircularProgress size={14} color="inherit" />;
    default:
      return <SyncIcon sx={{ fontSize: 16 }} />;
  }
}

/**
 * Get the chip label for a sync level
 */
function getChipLabel(level: SyncStatusLevel, syncStatus: SyncStatus | null): string {
  const timeAgo = formatTimeAgo(syncStatus?.last_successful_sync);

  switch (level) {
    case 'fresh':
      return `Synced: ${timeAgo}`;
    case 'stale':
      return `Data Stale: ${timeAgo}`;
    case 'failed':
      return `Sync Failed: ${timeAgo}`;
    case 'syncing':
      return 'Syncing...';
    default:
      return 'Unknown';
  }
}

/**
 * Sync Status Badge Component
 *
 * Displays sync status with clickable tooltip for details.
 */
const SyncStatusBadge: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  /**
   * Fetch sync status from GraphQL API
   */
  const fetchSyncStatus = useCallback(async () => {
    try {
      const result = await apiClient.graphql({
        query: getSyncStatus,
        variables: { id: GLOBAL_SYNC_ID },
      }) as { data: { getSyncStatus: SyncStatus | null } };

      setSyncStatus(result.data.getSyncStatus);
    } catch (error) {
      console.error('Error fetching sync status:', error);
      // Don't clear existing status on error - keep showing last known state
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchSyncStatus();

    // Poll for updates
    const interval = setInterval(fetchSyncStatus, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  /**
   * Handle popover open
   */
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  /**
   * Handle popover close
   */
  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const level = getSyncLevel(syncStatus);

  // Calculate total records processed in last sweep
  const totalRecords =
    (syncStatus?.phase1_new_records || 0) +
    (syncStatus?.phase1_updated_records || 0) +
    (syncStatus?.phase1_unchanged_records || 0);

  return (
    <>
      <Chip
        icon={loading ? <CircularProgress size={14} color="inherit" /> : getChipIcon(level)}
        label={loading ? 'Loading...' : getChipLabel(level, syncStatus)}
        color={getChipColor(level)}
        size="small"
        onClick={handleClick}
        sx={{
          cursor: 'pointer',
          fontWeight: 500,
          // Ensure visibility on dark header background
          bgcolor: level === 'fresh' ? 'success.main'
            : level === 'stale' ? 'warning.main'
            : level === 'failed' ? 'error.main'
            : level === 'syncing' ? 'info.main'
            : 'grey.600',
          color: '#FFFFFF !important',
          '& .MuiChip-label': {
            color: '#FFFFFF',
          },
          '& .MuiChip-icon': {
            color: '#FFFFFF',
          },
          '&:hover': {
            opacity: 0.9,
            bgcolor: level === 'fresh' ? 'success.dark'
              : level === 'stale' ? 'warning.dark'
              : level === 'failed' ? 'error.dark'
              : level === 'syncing' ? 'info.dark'
              : 'grey.700',
          },
        }}
      />

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          paper: {
            sx: { p: 2, minWidth: 280, maxWidth: 360 },
          },
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Sync Status Details
        </Typography>

        <Divider sx={{ mb: 1.5 }} />

        {/* Last Successful Sync */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Last Full Sweep
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {syncStatus?.last_successful_sync
              ? new Date(syncStatus.last_successful_sync).toLocaleString()
              : 'Never'}
          </Typography>
        </Box>

        {/* Records Processed */}
        {totalRecords > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Records Processed
            </Typography>
            <Typography variant="body2">
              {totalRecords.toLocaleString()} total
              {syncStatus?.phase1_new_records ? ` (${syncStatus.phase1_new_records} new)` : ''}
              {syncStatus?.phase1_updated_records ? ` (${syncStatus.phase1_updated_records} updated)` : ''}
            </Typography>
          </Box>
        )}

        {/* Phase 1 Status */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Metadata Sweep
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={syncStatus?.phase1_status || 'N/A'}
              size="small"
              color={
                syncStatus?.phase1_status === 'success'
                  ? 'success'
                  : syncStatus?.phase1_status === 'partial'
                  ? 'warning'
                  : 'default'
              }
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
            {syncStatus?.phase1_completed_at && (
              <Typography variant="caption" color="text.secondary">
                {formatTimeAgo(syncStatus.phase1_completed_at)}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Phase 2 Status (OCR) */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            OCR Processing
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={syncStatus?.phase2_status || 'N/A'}
              size="small"
              color={
                syncStatus?.phase2_status === 'success'
                  ? 'success'
                  : syncStatus?.phase2_status === 'partial'
                  ? 'warning'
                  : 'default'
              }
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
            {syncStatus?.phase2_ocr_remaining !== undefined && syncStatus.phase2_ocr_remaining > 0 && (
              <Typography variant="caption" color="text.secondary">
                {syncStatus.phase2_ocr_remaining} pending
              </Typography>
            )}
          </Box>
        </Box>

        {/* API Health */}
        <Box>
          <Typography variant="caption" color="text.secondary">
            NYC OATH API
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {syncStatus?.oath_api_reachable ? (
              <Chip label="Reachable" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />
            ) : (
              <Chip label="Unreachable" size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
            )}
            {syncStatus?.oath_api_error && (
              <Typography variant="caption" color="error.main">
                {syncStatus.oath_api_error}
              </Typography>
            )}
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default SyncStatusBadge;
