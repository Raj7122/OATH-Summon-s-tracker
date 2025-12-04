/**
 * Calendar Dashboard Page
 *
 * Implements the "Calendar-Centric Layout" (Strategic Pivot #1):
 * - Split-View Layout: 35% Command Center (Calendar) | 65% DataGrid
 * - Heatmap Calendar with colored dots for hearing dates
 * - Simplified 5-column DataGrid with no horizontal scroll
 * - Comprehensive detail modal on row click
 * - Filter tabs attached directly to DataGrid
 *
 * This is the main dashboard for "Arthur" - designed for instant deadline
 * visibility and panic management per the UI/UX Design Guide.
 *
 * Uses AWS Amplify GraphQL API for real data.
 *
 * Premium Visual Layer: Egret-inspired design with soft shadows,
 * generous whitespace, and smooth transitions.
 *
 * @module pages/CalendarDashboard
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import {
  Box,
  Typography,
  Button,
  Grid,
  Paper,
  Chip,
  Skeleton,
  useTheme,
  useMediaQuery,
  Alert,
  Snackbar,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  IconButton,
  alpha,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TableChartIcon from '@mui/icons-material/TableChart';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import EventIcon from '@mui/icons-material/Event';
import GavelIcon from '@mui/icons-material/Gavel';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PaymentIcon from '@mui/icons-material/Payment';
import EditIcon from '@mui/icons-material/Edit';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import ArchiveIcon from '@mui/icons-material/Archive';
import { generateClient } from 'aws-amplify/api';

// Components
import CalendarCommandCenter from '../components/CalendarCommandCenter';
import SimpleSummonsTable from '../components/SimpleSummonsTable';

// GraphQL
import { listSummons } from '../graphql/queries';
import { updateSummons } from '../graphql/mutations';

// Types
import { Summons, isNewRecord, isUpdatedRecord } from '../types/summons';

// Theme colors
import { horizonColors } from '../theme';

// Configure dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

const NYC_TIMEZONE = 'America/New_York';

// Active Era cutoff (2022-01-01) - Pre-2022 records are considered "historical"
const ACTIVE_ERA_CUTOFF = dayjs('2022-01-01');

// Idling violation guardrail - only show IDLING violations
const IDLING_FILTER_KEYWORDS = ['IDLING', 'IDLE'];

// Amplify GraphQL client
const client = generateClient();

/**
 * Check if a summons is in the "Active Era" (2022+)
 */
function isActiveEra(summons: Summons): boolean {
  if (!summons.hearing_date) return true; // No date = assume active
  // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
  return dayjs.utc(summons.hearing_date) >= ACTIVE_ERA_CUTOFF;
}

/**
 * Check if a summons is an "Idling" violation
 * Safety guardrail to ensure no non-idling violations leak through
 */
function isIdlingViolation(summons: Summons): boolean {
  const codeDesc = (summons.code_description || '').toUpperCase();
  return IDLING_FILTER_KEYWORDS.some((keyword) => codeDesc.includes(keyword));
}

/**
 * Skeleton loader for the Command Center
 */
const CommandCenterSkeleton = () => (
  <Paper
    elevation={0}
    sx={{
      p: 3,
      height: '100%',
      borderRadius: 4,
      border: '1px solid',
      borderColor: 'divider',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
      <Skeleton variant="circular" width={24} height={24} sx={{ mr: 1.5 }} />
      <Skeleton variant="text" width={140} height={28} />
    </Box>
    <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
      <Skeleton variant="rounded" width={80} height={28} />
      <Skeleton variant="rounded" width={100} height={28} />
      <Skeleton variant="rounded" width={70} height={28} />
    </Box>
    <Skeleton variant="rounded" width="100%" height={280} sx={{ mb: 2 }} />
    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
      <Skeleton variant="rounded" width="48%" height={36} />
      <Skeleton variant="rounded" width="48%" height={36} />
    </Box>
    <Skeleton variant="rounded" width="100%" height={100} />
  </Paper>
);

/**
 * Skeleton loader for the DataGrid
 */
const DataGridSkeleton = () => (
  <Paper
    elevation={0}
    sx={{
      height: '100%',
      borderRadius: 4,
      border: '1px solid',
      borderColor: 'divider',
      overflow: 'hidden',
    }}
  >
    {/* Filter tabs skeleton */}
    <Box sx={{ p: 2, backgroundColor: 'grey.50', display: 'flex', gap: 1, alignItems: 'center' }}>
      <Skeleton variant="circular" width={20} height={20} />
      <Skeleton variant="rounded" width={100} height={32} />
      <Skeleton variant="rounded" width={90} height={32} />
      <Skeleton variant="rounded" width={70} height={32} />
      <Box sx={{ flex: 1 }} />
      <Skeleton variant="text" width={80} />
    </Box>
    {/* Header row skeleton */}
    <Box sx={{ display: 'flex', p: 2, backgroundColor: 'grey.50', borderBottom: '1px solid', borderColor: 'grey.200' }}>
      <Skeleton variant="text" width="15%" height={24} sx={{ mr: 2 }} />
      <Skeleton variant="text" width="25%" height={24} sx={{ mr: 2 }} />
      <Skeleton variant="text" width="15%" height={24} sx={{ mr: 2 }} />
      <Skeleton variant="text" width="15%" height={24} sx={{ mr: 2 }} />
      <Skeleton variant="text" width="5%" height={24} />
    </Box>
    {/* Data rows skeleton */}
    {[...Array(8)].map((_, i) => (
      <Box
        key={i}
        sx={{
          display: 'flex',
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'grey.100',
          alignItems: 'center',
        }}
      >
        <Box sx={{ width: '15%', mr: 2, display: 'flex', gap: 0.5 }}>
          <Skeleton variant="rounded" width={50} height={24} />
          <Skeleton variant="rounded" width={70} height={24} />
        </Box>
        <Skeleton variant="text" width="25%" height={24} sx={{ mr: 2 }} />
        <Skeleton variant="text" width="15%" height={24} sx={{ mr: 2 }} />
        <Skeleton variant="text" width="15%" height={24} sx={{ mr: 2 }} />
        <Skeleton variant="circular" width={24} height={24} />
      </Box>
    ))}
  </Paper>
);

/**
 * Calendar Dashboard Page Component
 *
 * The main dashboard implementing the calendar-centric split-view layout.
 * Features:
 * - Left Column (35%): Calendar Command Center with heatmap dots
 * - Right Column (65%): Simplified Summons DataGrid
 * - Date selection filters the grid
 * - Activity filter tabs attached to grid
 * - Real-time data from AWS Amplify GraphQL API
 */
const CalendarDashboard: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // State
  const [loading, setLoading] = useState(true);
  const [summonses, setSummonses] = useState<Summons[]>([]);
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'updated' | 'new'>('all');
  // Horizon System filter for header chip clicks (Critical/Approaching/Future)
  // Also supports 'new' for NEW badge filter
  const [horizonFilter, setHorizonFilter] = useState<'critical' | 'approaching' | 'future' | 'new' | null>(null);

  // OVERRIDE C: Archive toggle removed from main dashboard.
  // The main dashboard is for active triage ONLY - always show 2022+ records.
  // Historical data belongs in the Client View, not here.
  // Hardcoded to false (never show pre-2022 on main dashboard).
  const showArchive = false;
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Mobile: Toggle between calendar and grid view
  const [mobileView, setMobileView] = useState<'calendar' | 'grid'>('grid');

  // Audit Trail drawer state
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);

  /**
   * Load summonses from GraphQL API with pagination
   * CRITICAL: Must paginate to get ALL records, not just the default limit
   */
  const loadSummonses = useCallback(async () => {
    setLoading(true);
    try {
      let allSummonses: Summons[] = [];
      let currentToken: string | null = null;
      let fetchCount = 0;
      const MAX_FETCHES = 50; // Safety limit: 50 * 1000 = 50,000 records max

      // Paginate through ALL summonses
      while (fetchCount < MAX_FETCHES) {
        const result = await client.graphql({
          query: listSummons,
          variables: {
            limit: 1000, // Fetch in large batches for efficiency
            nextToken: currentToken,
          },
        }) as { data: { listSummons: { items: Summons[]; nextToken: string | null } } };

        const items = result.data.listSummons.items;
        currentToken = result.data.listSummons.nextToken;

        allSummonses = [...allSummonses, ...items];
        fetchCount++;

        console.log(`Fetch ${fetchCount}: Got ${items.length} items, total: ${allSummonses.length}`);

        if (!currentToken) {
          break; // No more pages
        }
      }

      console.log('Loaded all summonses:', allSummonses.length);
      setSummonses(allSummonses);
    } catch (error) {
      console.error('Error loading summonses:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load summonses. Please try again.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadSummonses();
  }, [loadSummonses]);

  /**
   * Apply global filters: Active Era + Idling Guardrail
   *
   * These filters ensure:
   * 1. Only IDLING violations are shown (safety guardrail)
   * 2. Only Active Era (2022+) records are shown by default
   * 3. Archive toggle can show Pre-2022 records if needed
   */
  const globallyFilteredSummonses = useMemo(() => {
    return summonses
      // Safety guardrail: Only show IDLING violations
      // Even though backend filters, double-check to prevent Fire Code violations leaking through
      .filter(isIdlingViolation)
      // Active Era filter: Default to 2022+ unless archive toggle is on
      .filter((s) => showArchive || isActiveEra(s));
  }, [summonses, showArchive]);

  /**
   * Filter summonses by selected date and Horizon System filter
   *
   * Horizon System Logic:
   * - Critical (Red): Hearings within 7 days OR Status is "Default/Failure to Appear"
   * - Approaching (Orange): Hearings between 8 and 30 days from today
   * - Future (Green): Hearings > 30 days away
   *
   * Note: hearing_date is stored as ISO format (e.g., "2025-01-15T00:00:00.000Z")
   * We compare by extracting the date portion only.
   */
  const filteredByDate = useMemo(() => {
    const now = dayjs().tz(NYC_TIMEZONE);
    let filtered = globallyFilteredSummonses;

    // Apply Horizon System filter first (from header chip clicks)
    if (horizonFilter === 'critical') {
      // Critical: Future hearings that are either:
      // 1. Within 7 days (imminent deadline)
      // 2. Have dangerous status (Default, Judgment, etc.) - needs immediate attention
      // NOTE: Past hearings are excluded - Arthur doesn't need to panic about what already happened
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
        const hearingDate = dayjs.utc(s.hearing_date);
        const daysUntil = hearingDate.diff(now.startOf('day'), 'day');

        // Only include future/today hearings (not past)
        if (daysUntil < 0) return false;

        const isImminentDeadline = daysUntil <= 7;

        // Dangerous status check - still requires future hearing
        const status = (s.status || '').toUpperCase();
        const isDangerStatus =
          status.includes('DEFAULT') ||
          status.includes('JUDGMENT') ||
          status.includes('VIOLATION') ||
          status.includes('FAILURE TO APPEAR');

        return isImminentDeadline || isDangerStatus;
      });
    } else if (horizonFilter === 'approaching') {
      // Approaching: 8-30 days away
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
        const hearingDate = dayjs.utc(s.hearing_date);
        const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
        return daysUntil >= 8 && daysUntil <= 30;
      });
    } else if (horizonFilter === 'future') {
      // Future: > 30 days away
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
        const hearingDate = dayjs.utc(s.hearing_date);
        const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
        return daysUntil > 30;
      });
    } else if (horizonFilter === 'new') {
      filtered = filtered.filter(isNewRecord);
    }

    // Then apply date filter
    if (selectedDate) {
      const dateKey = selectedDate.format('YYYY-MM-DD');
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
        const hearingDateKey = dayjs.utc(s.hearing_date).format('YYYY-MM-DD');
        return hearingDateKey === dateKey;
      });
    }

    return filtered;
  }, [globallyFilteredSummonses, selectedDate, horizonFilter]);

  /**
   * Handle Horizon System chip click (toggle behavior)
   * Filters: critical (Red), approaching (Orange), future (Green), new
   */
  const handleHorizonFilterClick = useCallback((filter: 'critical' | 'approaching' | 'future' | 'new') => {
    // Toggle: if clicking the same filter, clear it; otherwise set it
    setHorizonFilter((prev) => (prev === filter ? null : filter));
    // Clear date selection when using horizon filter for better UX
    if (horizonFilter !== filter) {
      setSelectedDate(null);
    }
  }, [horizonFilter]);

  /**
   * Handle date selection from calendar
   */
  const handleDateSelect = useCallback((date: Dayjs | null) => {
    setSelectedDate(date);
    // Clear horizon filter when selecting a date for cleaner UX
    if (date) {
      setHorizonFilter(null);
    }
    // On mobile, switch to grid view when a date is selected
    if (isMobile && date) {
      setMobileView('grid');
    }
  }, [isMobile]);

  /**
   * Handle activity filter change
   */
  const handleFilterChange = useCallback((filter: 'all' | 'updated' | 'new') => {
    setActivityFilter(filter);
  }, []);

  /**
   * Handle data refresh
   */
  const handleRefresh = useCallback(() => {
    loadSummonses();
  }, [loadSummonses]);

  /**
   * Handle summons field update via GraphQL mutation
   */
  const handleSummonsUpdate = useCallback(async (id: string, field: string, value: unknown) => {
    try {
      console.log(`Updating ${field} = ${value} for summons ${id}...`);

      // Build the update input
      const updateInput: Record<string, unknown> = {
        id,
        [field]: value,
      };

      // If checking "evidence_requested" and it's being set to true,
      // auto-set the date if not already set
      if (field === 'evidence_requested' && value === true) {
        const summons = summonses.find(s => s.id === id);
        if (summons && !summons.evidence_requested_date) {
          updateInput.evidence_requested_date = new Date().toISOString();
        }
      }

      // Execute GraphQL mutation
      await client.graphql({
        query: updateSummons,
        variables: {
          input: updateInput,
        },
      });

      console.log(`Successfully updated ${field}`);

      // Update local state optimistically
      setSummonses((prev) =>
        prev.map((s) => {
          if (s.id === id) {
            return {
              ...s,
              [field]: value,
              updatedAt: new Date().toISOString(),
            };
          }
          return s;
        })
      );

      // Show success feedback for certain fields
      if (['notes', 'internal_status'].includes(field)) {
        setSnackbar({
          open: true,
          message: `${field.replace(/_/g, ' ')} updated`,
          severity: 'success',
        });
      }
    } catch (error) {
      console.error('Error updating summons:', error);
      setSnackbar({
        open: true,
        message: `Failed to update ${field}. Please try again.`,
        severity: 'error',
      });
    }
  }, [summonses]);

  /**
   * Get summary statistics for the header using Horizon System
   * Uses globally filtered summonses (Active Era + Idling only)
   *
   * Horizon System:
   * - Critical (Red): Hearings within 7 days OR Status is "Default/Failure to Appear"
   * - Approaching (Orange): Hearings between 8 and 30 days from today
   * - Future (Green): Hearings > 30 days away
   */
  const stats = useMemo(() => {
    const now = dayjs().tz(NYC_TIMEZONE);

    // Critical: Future hearings (daysUntil >= 0) that are either:
    // 1. Within 7 days (imminent deadline)
    // 2. Have dangerous status (Default, Judgment, etc.)
    // Past hearings are excluded - no point panicking about what already happened
    const criticalCount = globallyFilteredSummonses.filter((s) => {
      if (!s.hearing_date) return false;
      // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
      const hearingDate = dayjs.utc(s.hearing_date);
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');

      // Exclude past hearings
      if (daysUntil < 0) return false;

      const isImminentDeadline = daysUntil <= 7;

      const status = (s.status || '').toUpperCase();
      const isDangerStatus =
        status.includes('DEFAULT') ||
        status.includes('JUDGMENT') ||
        status.includes('VIOLATION') ||
        status.includes('FAILURE TO APPEAR');

      return isImminentDeadline || isDangerStatus;
    }).length;

    // Approaching: 8-30 days away
    const approachingCount = globallyFilteredSummonses.filter((s) => {
      if (!s.hearing_date) return false;
      // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
      const hearingDate = dayjs.utc(s.hearing_date);
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
      return daysUntil >= 8 && daysUntil <= 30;
    }).length;

    // Future: > 30 days away
    const futureCount = globallyFilteredSummonses.filter((s) => {
      if (!s.hearing_date) return false;
      // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
      const hearingDate = dayjs.utc(s.hearing_date);
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
      return daysUntil > 30;
    }).length;

    const newCount = globallyFilteredSummonses.filter(isNewRecord).length;
    const updatedCount = globallyFilteredSummonses.filter(isUpdatedRecord).length;

    // Count of Pre-2022 records (for archive indicator)
    const archivedCount = summonses.filter((s) => !isActiveEra(s) && isIdlingViolation(s)).length;

    return {
      criticalCount,
      approachingCount,
      futureCount,
      newCount,
      updatedCount,
      total: globallyFilteredSummonses.length,
      archivedCount,
    };
  }, [globallyFilteredSummonses, summonses]);

  /**
   * Close snackbar
   */
  const handleSnackbarClose = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  /**
   * Get icon for activity log entry type
   */
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'CREATED':
        return <AddCircleIcon sx={{ color: 'success.main' }} />;
      case 'STATUS_CHANGE':
        return <SwapHorizIcon sx={{ color: 'warning.main' }} />;
      case 'RESCHEDULE':
        return <EventIcon sx={{ color: 'info.main' }} />;
      case 'RESULT_CHANGE':
        return <GavelIcon sx={{ color: 'secondary.main' }} />;
      case 'AMOUNT_CHANGE':
        return <AttachMoneyIcon sx={{ color: 'error.main' }} />;
      case 'PAYMENT':
        return <PaymentIcon sx={{ color: 'success.main' }} />;
      case 'AMENDMENT':
        return <EditIcon sx={{ color: 'text.secondary' }} />;
      case 'OCR_COMPLETE':
        return <DocumentScannerIcon sx={{ color: 'info.main' }} />;
      case 'ARCHIVED':
        return <ArchiveIcon sx={{ color: 'text.disabled' }} />;
      default:
        return <HistoryIcon color="action" />;
    }
  };

  /**
   * Get all activity log entries across all summonses, sorted by date (most recent first)
   * This provides a comprehensive audit trail of all NYC API changes detected by daily sweep
   */
  const getAllActivityLogs = useMemo(() => {
    const allLogs: Array<{
      date: string;
      type: string;
      description: string;
      old_value: string | null;
      new_value: string | null;
      summons_number: string;
      respondent_name: string;
    }> = [];

    summonses.forEach((summons) => {
      if (summons.activity_log && Array.isArray(summons.activity_log)) {
        summons.activity_log.forEach((entry) => {
          allLogs.push({
            ...entry,
            summons_number: summons.summons_number,
            respondent_name: summons.respondent_name,
          });
        });
      }
    });

    // Sort by date, most recent first
    allLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return allLogs;
  }, [summonses]);

  // Show full-page loader while initial data is loading
  if (loading && summonses.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: { xs: 2, md: 3 } }}>
        {/* Header Skeleton */}
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 3,
            p: 2.5,
            borderRadius: 4,
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Skeleton variant="text" width={150} height={40} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Skeleton variant="rounded" width={100} height={36} />
            <Skeleton variant="rounded" width={100} height={36} />
          </Box>
        </Paper>

        {/* Main Content Skeleton */}
        <Grid container spacing={3} sx={{ flex: 1, minHeight: 0 }}>
          {!isMobile && (
            <Grid item xs={12} md={4} lg={3.5}>
              <CommandCenterSkeleton />
            </Grid>
          )}
          <Grid item xs={12} md={8} lg={8.5}>
            <DataGridSkeleton />
          </Grid>
        </Grid>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: { xs: 2, md: 3 } }}>
      {/* Header Section - Premium styling */}
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          p: 2.5,
          borderRadius: 4,
          backgroundColor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            Dashboard
          </Typography>

          {/* Active filter indicator - matches Horizon chip color */}
          {horizonFilter && (
            <Chip
              label={`Filtered: ${horizonFilter.charAt(0).toUpperCase() + horizonFilter.slice(1)}`}
              color={
                horizonFilter === 'critical' ? 'error' :
                horizonFilter === 'approaching' ? 'warning' :
                horizonFilter === 'future' ? 'success' :
                horizonFilter === 'new' ? 'info' : 'primary'
              }
              onDelete={() => setHorizonFilter(null)}
              sx={{
                fontWeight: 600,
                borderRadius: 2,
                // Use solid color for clear visibility
                backgroundColor:
                  horizonFilter === 'critical' ? horizonColors.critical :
                  horizonFilter === 'approaching' ? horizonColors.approaching :
                  horizonFilter === 'future' ? horizonColors.future :
                  horizonFilter === 'new' ? horizonColors.new : undefined,
                color: '#FFFFFF',
                '& .MuiChip-deleteIcon': {
                  color: 'rgba(255, 255, 255, 0.7)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    color: '#FFFFFF',
                  },
                },
              }}
            />
          )}

          {/* Date filter indicator */}
          {selectedDate && (
            <Chip
              label={`Date: ${selectedDate.format('MMM D, YYYY')}`}
              color="primary"
              variant="outlined"
              onDelete={() => setSelectedDate(null)}
              sx={{
                fontWeight: 600,
                borderRadius: 2,
                borderWidth: '1.5px',
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Mobile view toggle - Premium button group */}
          {isMobile && (
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                p: 0.5,
                borderRadius: 2,
              }}
            >
              <IconButton
                size="small"
                onClick={() => setMobileView('calendar')}
                sx={{
                  backgroundColor: mobileView === 'calendar' ? 'primary.main' : 'transparent',
                  color: mobileView === 'calendar' ? 'primary.contrastText' : 'primary.main',
                  borderRadius: 1.5,
                  '&:hover': {
                    backgroundColor: mobileView === 'calendar' ? 'primary.dark' : alpha(theme.palette.primary.main, 0.12),
                  },
                }}
              >
                <CalendarMonthIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setMobileView('grid')}
                sx={{
                  backgroundColor: mobileView === 'grid' ? 'primary.main' : 'transparent',
                  color: mobileView === 'grid' ? 'primary.contrastText' : 'primary.main',
                  borderRadius: 1.5,
                  '&:hover': {
                    backgroundColor: mobileView === 'grid' ? 'primary.dark' : alpha(theme.palette.primary.main, 0.12),
                  },
                }}
              >
                <TableChartIcon fontSize="small" />
              </IconButton>
            </Box>
          )}

          {/* Audit Trail button */}
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => setAuditTrailOpen(true)}
            size={isMobile ? 'small' : 'medium'}
            sx={{
              borderRadius: 2.5,
              borderWidth: '1.5px',
              '&:hover': {
                borderWidth: '1.5px',
              },
            }}
          >
            Audit Trail
          </Button>

          {/* Refresh button */}
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
            size={isMobile ? 'small' : 'medium'}
            sx={{
              borderRadius: 2.5,
              boxShadow: 'none',
              '&:hover': {
                boxShadow: '0px 4px 12px rgba(25, 118, 210, 0.25)',
              },
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>
      </Paper>

      {/* Main Content - Split View Layout with Skeleton loading */}
      <Grid container spacing={3} sx={{ flex: 1, minHeight: 0 }}>
        {/* LEFT COLUMN: Calendar Command Center (35%) */}
        {(!isMobile || mobileView === 'calendar') && (
          <Grid item xs={12} md={4} lg={3.5}>
            {loading ? (
              <CommandCenterSkeleton />
            ) : (
              <CalendarCommandCenter
                summonses={globallyFilteredSummonses}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                horizonFilter={horizonFilter}
                horizonStats={{
                  criticalCount: stats.criticalCount,
                  approachingCount: stats.approachingCount,
                  futureCount: stats.futureCount,
                  newCount: stats.newCount,
                }}
                onHorizonFilterClick={handleHorizonFilterClick}
              />
            )}
          </Grid>
        )}

        {/* RIGHT COLUMN: Summons DataGrid (65%) */}
        {(!isMobile || mobileView === 'grid') && (
          <Grid item xs={12} md={8} lg={8.5}>
            {loading ? (
              <DataGridSkeleton />
            ) : (
              <Paper
                elevation={0}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {/* Selected Date Header (when filtering) */}
                {selectedDate && (
                  <Alert
                    severity="info"
                    sx={{
                      borderRadius: 0,
                      '& .MuiAlert-message': { width: '100%' },
                    }}
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => setSelectedDate(null)}
                        sx={{ fontWeight: 600 }}
                      >
                        Show All
                      </Button>
                    }
                  >
                    <Typography variant="body2">
                      Showing {filteredByDate.length} hearing{filteredByDate.length !== 1 ? 's' : ''} for{' '}
                      <strong>{selectedDate.format('MMMM D, YYYY')}</strong>
                      {selectedDate.isSame(dayjs(), 'day') && ' (Today)'}
                    </Typography>
                  </Alert>
                )}

                {/* Summons Table with Attached Filters */}
                <SimpleSummonsTable
                  summonses={filteredByDate}
                  onUpdate={handleSummonsUpdate}
                  activeFilter={activityFilter}
                  onFilterChange={handleFilterChange}
                />
              </Paper>
            )}
          </Grid>
        )}
      </Grid>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Audit Trail Drawer - Premium styling */}
      <Drawer
        anchor="right"
        open={auditTrailOpen}
        onClose={() => setAuditTrailOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 480 },
            borderRadius: '16px 0 0 16px',
          },
        }}
      >
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 600 }}>
              <HistoryIcon color="primary" />
              Audit Trail
            </Typography>
            <IconButton
              onClick={() => setAuditTrailOpen(false)}
              size="small"
              sx={{
                backgroundColor: alpha(theme.palette.grey[500], 0.08),
                '&:hover': {
                  backgroundColor: alpha(theme.palette.grey[500], 0.16),
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
            Complete history of all changes detected by the daily sweep from NYC Open Data.
            This ledger persists beyond the 72-hour UPDATED badge window.
          </Typography>
          <Divider sx={{ mb: 2 }} />

          {getAllActivityLogs.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <HistoryIcon sx={{ fontSize: 56, color: 'grey.300', mb: 2 }} />
              <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                No activity recorded yet.
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Changes will appear here after the daily sweep runs.
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {getAllActivityLogs.map((entry, index) => (
                <Box key={`${entry.summons_number}-${entry.date}-${index}`}>
                  <ListItem
                    alignItems="flex-start"
                    sx={{
                      px: 1.5,
                      py: 1.5,
                      borderRadius: 2,
                      transition: 'background-color 0.2s ease',
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.04),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 44, mt: 0.5 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                        }}
                      >
                        {getActivityIcon(entry.type)}
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {entry.respondent_name}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            {new Date(entry.date).toLocaleDateString()}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2" color="text.secondary" component="span" sx={{ fontSize: '0.8rem' }}>
                            #{entry.summons_number}
                          </Typography>
                          <Typography variant="body2" component="div" sx={{ mt: 0.5, color: 'text.primary' }}>
                            {entry.description}
                          </Typography>
                          {entry.old_value && entry.new_value && (
                            <Typography
                              variant="caption"
                              component="div"
                              sx={{
                                mt: 0.5,
                                color: 'text.secondary',
                                backgroundColor: alpha(theme.palette.grey[500], 0.08),
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                display: 'inline-block',
                              }}
                            >
                              {entry.old_value} → {entry.new_value}
                            </Typography>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                  {index < getAllActivityLogs.length - 1 && <Divider variant="inset" component="li" sx={{ ml: 7 }} />}
                </Box>
              ))}
            </List>
          )}
        </Box>
      </Drawer>
    </Box>
  );
};

export default CalendarDashboard;
