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
import isoWeek from 'dayjs/plugin/isoWeek';
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
  IconButton,
  alpha,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
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
import ArchiveIcon from '@mui/icons-material/Archive';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import DownloadIcon from '@mui/icons-material/Download';
import DescriptionIcon from '@mui/icons-material/Description';
import DateRangeIcon from '@mui/icons-material/DateRange';
import { generateClient } from 'aws-amplify/api';

// Components
import CalendarCommandCenter from '../components/CalendarCommandCenter';
import SimpleSummonsTable from '../components/SimpleSummonsTable';

// GraphQL
import { listSummons } from '../graphql/queries';
import { listClientsWithPlateFilter } from '../graphql/customQueries';
import { updateSummons } from '../graphql/mutations';

// Types
import { Summons, Client, isNewRecord, isUpdatedRecord, ActivityLogEntry } from '../types/summons';

// Plate filtering
import { applyPlateFilters } from '../lib/plateFilter';

// Theme colors
import { horizonColors } from '../theme';

// CSV Export
import { generateCSV, downloadCSV } from '../lib/csvExport';

// Notice of Appearance DOCX
import { generateNoticeOfAppearance } from '../utils/noticeOfAppearance';

// Week utilities
import { getISOWeekRange } from '../utils/weekFilters';

// Configure dayjs
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

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
  // Week mode state: selectedDate and selectedWeek are mutually exclusive
  const [weekMode, setWeekMode] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<{ start: Dayjs; end: Dayjs } | null>(null);
  const [weekStatusFilter, setWeekStatusFilter] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'updated' | 'new'>('all');
  // Horizon System filter for header chip clicks (Critical/Approaching/Future)
  // Also supports 'new' for NEW badge filter and 'has_evidence' for evidence filter
  const [horizonFilter, setHorizonFilter] = useState<'critical' | 'approaching' | 'future' | 'new' | 'has_evidence' | null>(null);

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

  // Dashboard search state - filters summonses by company name or summons number
  const [dashboardSearch, setDashboardSearch] = useState('');

  // Audit Trail drawer state
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);

  // Audit Trail filter state
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditDateStart, setAuditDateStart] = useState<Dayjs | null>(null);
  const [auditDateEnd, setAuditDateEnd] = useState<Dayjs | null>(null);
  const [auditActionType, setAuditActionType] = useState<string>('all');

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

      // Apply plate filtering (graceful degradation if client fetch fails)
      let finalSummonses = allSummonses;
      try {
        let allClients: Client[] = [];
        let clientNextToken: string | null = null;
        do {
          const clientResult = await client.graphql({
            query: listClientsWithPlateFilter,
            variables: { limit: 100, nextToken: clientNextToken },
          }) as { data: { listClients: { items: Client[]; nextToken: string | null } } };
          allClients = [...allClients, ...clientResult.data.listClients.items];
          clientNextToken = clientResult.data.listClients.nextToken;
        } while (clientNextToken);
        finalSummonses = applyPlateFilters(allSummonses, allClients);
      } catch (plateError) {
        console.warn('Plate filter skipped (client fetch failed):', plateError);
      }
      setSummonses(finalSummonses);
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
      .filter((s) => showArchive || isActiveEra(s))
      // Dashboard search filter: matches company name, summons number, or license plate
      .filter((s) => {
        if (!dashboardSearch.trim()) return true;
        const query = dashboardSearch.toLowerCase().trim();
        const matchesCompany = (s.respondent_name || '').toLowerCase().includes(query);
        const matchesSummons = (s.summons_number || '').toLowerCase().includes(query);
        const matchesPlate = (s.license_plate || '').toLowerCase().includes(query);
        return matchesCompany || matchesSummons || matchesPlate;
      });
  }, [summonses, showArchive, dashboardSearch]);

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
    } else if (horizonFilter === 'has_evidence') {
      // Has Evidence: Summonses with file attachments
      filtered = filtered.filter((s) => {
        if (!s.attachments) return false;
        let parsed: unknown[] = [];
        if (typeof s.attachments === 'string') {
          try {
            parsed = JSON.parse(s.attachments);
          } catch {
            return false;
          }
        } else if (Array.isArray(s.attachments)) {
          parsed = s.attachments;
        }
        return parsed.length > 0;
      });
    }

    // Date filters are mutually exclusive: week takes priority over single date
    if (selectedWeek) {
      // Week range filter (Mon-Sun)
      const weekStartStr = selectedWeek.start.format('YYYY-MM-DD');
      const weekEndStr = selectedWeek.end.format('YYYY-MM-DD');
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        const key = dayjs.utc(s.hearing_date).format('YYYY-MM-DD');
        return key >= weekStartStr && key <= weekEndStr;
      });
    } else if (selectedDate) {
      // Single date filter
      const dateKey = selectedDate.format('YYYY-MM-DD');
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
        const hearingDateKey = dayjs.utc(s.hearing_date).format('YYYY-MM-DD');
        return hearingDateKey === dateKey;
      });
    }

    return filtered;
  }, [globallyFilteredSummonses, selectedDate, selectedWeek, horizonFilter]);

  /**
   * Handle Horizon System chip click (toggle behavior)
   * Filters: critical (Red), approaching (Orange), future (Green), new, has_evidence (Purple)
   */
  const handleHorizonFilterClick = useCallback((filter: 'critical' | 'approaching' | 'future' | 'new' | 'has_evidence') => {
    // Toggle: if clicking the same filter, clear it; otherwise set it
    setHorizonFilter((prev) => (prev === filter ? null : filter));
    // Clear date/week selection when using horizon filter for better UX
    if (horizonFilter !== filter) {
      setSelectedDate(null);
      setSelectedWeek(null);
      setWeekStatusFilter(null);
      setWeekMode(false);
    }
  }, [horizonFilter]);

  /**
   * Handle week mode toggle from the Command Center "Week" button.
   * Turning ON: compute the ISO week around selectedDate (or today) and apply it.
   * Turning OFF: clear week state.
   */
  const handleWeekModeToggle = useCallback(() => {
    setWeekMode((prev) => {
      if (!prev) {
        // Turning ON — use selectedDate as anchor, fall back to today
        const anchor = selectedDate || dayjs().tz(NYC_TIMEZONE);
        const { start, end } = getISOWeekRange(anchor);
        setSelectedWeek({ start, end });
        setHorizonFilter(null);
        setWeekStatusFilter(null);
        // Keep selectedDate for calendar visual feedback
      } else {
        // Turning OFF — clear week-related state
        setSelectedWeek(null);
        setWeekStatusFilter(null);
      }
      return !prev;
    });
  }, [selectedDate]);

  /**
   * Handle date selection from calendar
   */
  const handleDateSelect = useCallback((date: Dayjs | null) => {
    if (weekMode && date) {
      // Week mode: shift the week range to the clicked date's Mon-Sun
      const { start, end } = getISOWeekRange(date);
      setSelectedWeek({ start, end });
      setSelectedDate(date); // Keep for calendar visual highlight
      setWeekStatusFilter(null); // Reset status sub-filter on new week
      setHorizonFilter(null);
    } else if (weekMode && !date) {
      // Week mode "Clear": exit week mode entirely
      setWeekMode(false);
      setSelectedWeek(null);
      setSelectedDate(null);
      setWeekStatusFilter(null);
    } else {
      // Single-date mode
      setSelectedDate(date);
      setSelectedWeek(null);
      setWeekStatusFilter(null);
      if (date) setHorizonFilter(null);
    }
    // On mobile, switch to grid view when a date is selected
    if (isMobile && date) {
      setMobileView('grid');
    }
  }, [isMobile, weekMode]);

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
  const handleSummonsUpdate = useCallback(async (id: string, field: string, value: unknown, extraFields?: Record<string, unknown>) => {
    try {
      console.log(`Updating ${field} = ${value} for summons ${id}...`);

      // Build the update input — merge extraFields for consolidated mutations
      const updateInput: Record<string, unknown> = {
        id,
        [field]: value,
        ...extraFields,
      };

      // Execute GraphQL mutation
      await client.graphql({
        query: updateSummons,
        variables: {
          input: updateInput,
        },
      });

      console.log(`Successfully updated ${field}`);

      // Update local state optimistically
      // For AWSJSON fields like attachments, parse back to array for local state
      let localValue = value;
      if ((field === 'attachments' || field === 'notes_comments') && typeof value === 'string') {
        try {
          localValue = JSON.parse(value);
        } catch {
          localValue = [];
        }
      }

      setSummonses((prev) =>
        prev.map((s) => {
          if (s.id === id) {
            return {
              ...s,
              [field]: localValue,
              ...extraFields,
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

    // Has Evidence: Summonses with file attachments
    const hasEvidenceCount = globallyFilteredSummonses.filter((s) => {
      if (!s.attachments) return false;
      let parsed: unknown[] = [];
      if (typeof s.attachments === 'string') {
        try {
          parsed = JSON.parse(s.attachments);
        } catch {
          return false;
        }
      } else if (Array.isArray(s.attachments)) {
        parsed = s.attachments;
      }
      return parsed.length > 0;
    }).length;

    // Count of Pre-2022 records (for archive indicator)
    const archivedCount = summonses.filter((s) => !isActiveEra(s) && isIdlingViolation(s)).length;

    return {
      criticalCount,
      approachingCount,
      futureCount,
      newCount,
      updatedCount,
      hasEvidenceCount,
      total: globallyFilteredSummonses.length,
      archivedCount,
    };
  }, [globallyFilteredSummonses, summonses]);

  /**
   * Secondary memo: applies status filter on top of week-filtered data.
   * This drives both the grid display and CSV export when in week mode.
   */
  const weeklyFilteredSummonses = useMemo(() => {
    if (!selectedWeek || !weekStatusFilter) return filteredByDate;
    return filteredByDate.filter((s) =>
      (s.status || '').toUpperCase().includes(weekStatusFilter.toUpperCase())
    );
  }, [filteredByDate, selectedWeek, weekStatusFilter]);

  /**
   * Export the currently displayed week data as CSV.
   * Respects the status filter — only exports what Jackie sees in the grid.
   */
  const handleExportWeekCSV = useCallback(() => {
    if (!selectedWeek) return;
    const data = weeklyFilteredSummonses;
    if (data.length === 0) {
      setSnackbar({ open: true, message: 'No hearings to export for this week.', severity: 'error' });
      return;
    }

    const config = {
      columns: ['hearing_date', 'respondent_name', 'summons_number', 'license_plate', 'status', 'violation_date', 'amount_due'],
      dateFormat: 'us' as const,
      includeHistorical: true,
    };

    const csv = generateCSV(data, config);
    const filename = `WeeklyDocket_${selectedWeek.start.format('MMMDD')}-${selectedWeek.end.format('MMMDD')}_${selectedWeek.end.format('YYYY')}.csv`;
    downloadCSV(csv, filename);
    setSnackbar({ open: true, message: `Exported ${data.length} hearing${data.length !== 1 ? 's' : ''} to CSV.`, severity: 'success' });
  }, [selectedWeek, weeklyFilteredSummonses]);

  /**
   * Generate Notice of Appearance DOCX for the selected single date.
   */
  const handleGenerateNoticeDay = useCallback(async () => {
    if (!selectedDate || filteredByDate.length === 0) {
      setSnackbar({ open: true, message: 'No hearings for this date.', severity: 'error' });
      return;
    }
    const dateLabel = selectedDate.format('dddd, MMMM D, YYYY');
    try {
      await generateNoticeOfAppearance(filteredByDate, dateLabel);
      setSnackbar({ open: true, message: `Notice of Appearance generated for ${dateLabel}.`, severity: 'success' });
    } catch (err) {
      console.error('Notice of Appearance generation failed:', err);
      setSnackbar({ open: true, message: 'Failed to generate Notice of Appearance.', severity: 'error' });
    }
  }, [selectedDate, filteredByDate]);

  /**
   * Generate Notice of Appearance DOCX(s) for the selected week — one per hearing day.
   */
  const handleGenerateNoticeWeek = useCallback(async () => {
    if (!selectedWeek || weeklyFilteredSummonses.length === 0) {
      setSnackbar({ open: true, message: 'No hearings to generate notices for this week.', severity: 'error' });
      return;
    }
    // Group summonses by hearing date (YYYY-MM-DD)
    const byDate = new Map<string, Summons[]>();
    for (const s of weeklyFilteredSummonses) {
      const key = s.hearing_date ? dayjs.utc(s.hearing_date).format('YYYY-MM-DD') : 'unknown';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(s);
    }
    try {
      let count = 0;
      for (const [dateKey, daySummonses] of byDate) {
        if (dateKey === 'unknown') continue;
        const dateLabel = dayjs.utc(dateKey).format('dddd, MMMM D, YYYY');
        await generateNoticeOfAppearance(daySummonses, dateLabel);
        count++;
      }
      setSnackbar({ open: true, message: `Generated ${count} Notice${count !== 1 ? 's' : ''} of Appearance.`, severity: 'success' });
    } catch (err) {
      console.error('Notice of Appearance generation failed:', err);
      setSnackbar({ open: true, message: 'Failed to generate Notice of Appearance.', severity: 'error' });
    }
  }, [selectedWeek, weeklyFilteredSummonses]);

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
      case 'ARCHIVED':
        return <ArchiveIcon sx={{ color: 'text.disabled' }} />;
      default:
        return <HistoryIcon color="action" />;
    }
  };

  /**
   * Extended activity log entry type with summons context
   */
  type AuditLogEntry = ActivityLogEntry & {
    summons_number: string;
    respondent_name: string;
  };

  /**
   * Get all activity log entries across all summonses (MASTER LEDGER)
   * This aggregates every history event from every summons in the database.
   *
   * CRITICAL: Parses activity_log from JSON string (AWSJSON from DynamoDB)
   * NO temporal limits - this is the permanent master ledger.
   */
  const getAllActivityLogs = useMemo((): AuditLogEntry[] => {
    const allLogs: AuditLogEntry[] = [];

    // Debug: Count summonses with activity_log
    const withActivityLog = summonses.filter(s => s.activity_log);
    console.log(`[Audit Trail] Total summonses: ${summonses.length}, with activity_log: ${withActivityLog.length}`);

    // Debug: Sample the first few with activity_log
    if (withActivityLog.length > 0) {
      withActivityLog.slice(0, 3).forEach((sample, i) => {
        console.log(`[Audit Trail] Sample ${i + 1} (${sample.summons_number}):`, {
          type: typeof sample.activity_log,
          isArray: Array.isArray(sample.activity_log),
          value: sample.activity_log
        });
      });
    }

    summonses.forEach((summons) => {
      if (!summons.activity_log) return;

      // Handle different formats that activity_log might come in
      let activityLog: ActivityLogEntry[] = [];

      if (typeof summons.activity_log === 'string') {
        // AWSJSON comes as string - parse it
        try {
          activityLog = JSON.parse(summons.activity_log);
        } catch {
          console.warn(`Failed to parse activity_log string for summons ${summons.summons_number}`);
          return;
        }
      } else if (Array.isArray(summons.activity_log)) {
        // Already an array (Amplify DataStore or parsed by GraphQL)
        activityLog = summons.activity_log;
      } else if (typeof summons.activity_log === 'object' && summons.activity_log !== null) {
        // Might be an object with nested structure
        console.warn(`[Audit Trail] Object format for ${summons.summons_number}:`, summons.activity_log);
        // Try to extract if it has an array inside
        const obj = summons.activity_log as Record<string, unknown>;
        if (Array.isArray(obj.L)) {
          activityLog = obj.L as ActivityLogEntry[];
        } else if (Array.isArray(obj.items)) {
          activityLog = obj.items as ActivityLogEntry[];
        }
      } else {
        console.warn(`[Audit Trail] Unknown format for ${summons.summons_number}:`, typeof summons.activity_log);
        return;
      }

      // Add each entry with summons context
      activityLog.forEach((entry) => {
        if (entry && entry.type && entry.date) {
          allLogs.push({
            ...entry,
            summons_number: summons.summons_number,
            respondent_name: summons.respondent_name || 'Unknown',
          });
        }
      });
    });

    // Sort by date, most recent first (All Time view)
    allLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`[Audit Trail] Total log entries before filter: ${allLogs.length}`);
    return allLogs;
  }, [summonses]);

  /**
   * Filtered activity logs based on user-selected filters
   * Applies: date range, action type, and search query
   * Excludes: OCR_COMPLETE entries (internal system events, not relevant for Arthur)
   */
  const filteredActivityLogs = useMemo(() => {
    return getAllActivityLogs.filter((entry) => {
      // Exclude OCR_COMPLETE entries - internal system events not relevant for audit trail
      if (entry.type === 'OCR_COMPLETE') return false;

      // Date range filter
      if (auditDateStart) {
        const entryDate = dayjs(entry.date);
        if (entryDate.isBefore(auditDateStart, 'day')) return false;
      }
      if (auditDateEnd) {
        const entryDate = dayjs(entry.date);
        if (entryDate.isAfter(auditDateEnd, 'day')) return false;
      }

      // Action type filter
      if (auditActionType !== 'all' && entry.type !== auditActionType) {
        return false;
      }

      // Search filter (summons number or respondent name)
      if (auditSearchQuery) {
        const query = auditSearchQuery.toLowerCase();
        const matchesSummons = entry.summons_number.toLowerCase().includes(query);
        const matchesName = entry.respondent_name.toLowerCase().includes(query);
        const matchesDescription = entry.description?.toLowerCase().includes(query);
        if (!matchesSummons && !matchesName && !matchesDescription) return false;
      }

      return true;
    });
  }, [getAllActivityLogs, auditDateStart, auditDateEnd, auditActionType, auditSearchQuery]);

  /**
   * Clear all audit trail filters
   */
  const clearAuditFilters = useCallback(() => {
    setAuditSearchQuery('');
    setAuditDateStart(null);
    setAuditDateEnd(null);
    setAuditActionType('all');
  }, []);

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

          {/* Week filter indicator */}
          {selectedWeek && (
            <Chip
              icon={<DateRangeIcon sx={{ fontSize: 16 }} />}
              label={`Week: ${selectedWeek.start.format('MMM D')}–${selectedWeek.end.format('MMM D')}`}
              color="primary"
              variant="outlined"
              onDelete={() => { setSelectedWeek(null); setWeekStatusFilter(null); setWeekMode(false); setSelectedDate(null); }}
              sx={{
                fontWeight: 600,
                borderRadius: 2,
                borderWidth: '1.5px',
              }}
            />
          )}

          {/* Search filter indicator */}
          {dashboardSearch && (
            <Chip
              label={`Search: "${dashboardSearch}"`}
              color="default"
              variant="outlined"
              onDelete={() => setDashboardSearch('')}
              sx={{
                fontWeight: 600,
                borderRadius: 2,
                borderWidth: '1.5px',
                maxWidth: 200,
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
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
                  hasEvidenceCount: stats.hasEvidenceCount,
                }}
                onHorizonFilterClick={handleHorizonFilterClick}
                weekMode={weekMode}
                onWeekModeToggle={handleWeekModeToggle}
                selectedWeek={selectedWeek}
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
                {/* Selected Date Header (when filtering by single date, not week) */}
                {selectedDate && !selectedWeek && (
                  <Alert
                    severity="info"
                    sx={{
                      borderRadius: 0,
                      '& .MuiAlert-message': { width: '100%' },
                    }}
                    action={
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="secondary"
                          startIcon={<DescriptionIcon />}
                          onClick={handleGenerateNoticeDay}
                          sx={{
                            height: 32,
                            textTransform: 'none',
                            fontWeight: 600,
                            borderRadius: 2,
                            boxShadow: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Notice of Appearance
                        </Button>
                        <Button
                          color="inherit"
                          size="small"
                          onClick={() => setSelectedDate(null)}
                          sx={{ fontWeight: 600 }}
                        >
                          Show All
                        </Button>
                      </Box>
                    }
                  >
                    <Typography variant="body2">
                      Showing {filteredByDate.length} hearing{filteredByDate.length !== 1 ? 's' : ''} for{' '}
                      <strong>{selectedDate.format('MMMM D, YYYY')}</strong>
                      {selectedDate.isSame(dayjs(), 'day') && ' (Today)'}
                    </Typography>
                  </Alert>
                )}

                {/* Weekly View Banner (when filtering by week) */}
                {selectedWeek && (
                  <Alert
                    severity="info"
                    icon={<DateRangeIcon />}
                    sx={{
                      borderRadius: 0,
                      '& .MuiAlert-message': { width: '100%' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ mr: 'auto' }}>
                        Showing {weeklyFilteredSummonses.length} hearing{weeklyFilteredSummonses.length !== 1 ? 's' : ''} for{' '}
                        <strong>
                          week of {selectedWeek.start.format('MMM D')}–{selectedWeek.end.format('MMM D, YYYY')}
                        </strong>
                      </Typography>
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <Select
                          value={weekStatusFilter || ''}
                          displayEmpty
                          onChange={(e) => setWeekStatusFilter(e.target.value || null)}
                          sx={{ height: 32, fontSize: '0.8rem' }}
                        >
                          <MenuItem value="">All Statuses</MenuItem>
                          <MenuItem value="SCHEDULED">Scheduled</MenuItem>
                          <MenuItem value="DEFAULT">Default</MenuItem>
                          <MenuItem value="HEARING">Hearing Complete</MenuItem>
                          <MenuItem value="DISMISSED">Dismissed</MenuItem>
                          <MenuItem value="PAID">Paid</MenuItem>
                          <MenuItem value="DOCKETED">Docketed</MenuItem>
                        </Select>
                      </FormControl>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<DownloadIcon />}
                        onClick={handleExportWeekCSV}
                        sx={{
                          height: 32,
                          textTransform: 'none',
                          fontWeight: 600,
                          borderRadius: 2,
                          boxShadow: 'none',
                        }}
                      >
                        Export Week
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        color="secondary"
                        startIcon={<DescriptionIcon />}
                        onClick={handleGenerateNoticeWeek}
                        sx={{
                          height: 32,
                          textTransform: 'none',
                          fontWeight: 600,
                          borderRadius: 2,
                          boxShadow: 'none',
                        }}
                      >
                        Notice of Appearance
                      </Button>
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => { setSelectedWeek(null); setWeekStatusFilter(null); setWeekMode(false); setSelectedDate(null); }}
                        sx={{ fontWeight: 600, height: 32 }}
                      >
                        Show All
                      </Button>
                    </Box>
                  </Alert>
                )}

                {/* Summons Table with Attached Filters and Search */}
                <SimpleSummonsTable
                  summonses={selectedWeek ? weeklyFilteredSummonses : filteredByDate}
                  onUpdate={handleSummonsUpdate}
                  activeFilter={activityFilter}
                  onFilterChange={handleFilterChange}
                  searchQuery={dashboardSearch}
                  onSearchChange={setDashboardSearch}
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

      {/* Global Audit Trail Drawer - Professional Ledger */}
      <Drawer
        anchor="right"
        open={auditTrailOpen}
        onClose={() => setAuditTrailOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 560 },
            borderRadius: '16px 0 0 16px',
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header - Fixed */}
          <Box sx={{ p: 3, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 600 }}>
                <HistoryIcon color="primary" />
                Global Audit Trail
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
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              Permanent master ledger of all NYC API changes detected by daily sweep.
            </Typography>

            {/* Stats Bar */}
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Chip
                label={`${getAllActivityLogs.length} Total`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
              {filteredActivityLogs.length !== getAllActivityLogs.length && (
                <Chip
                  label={`${filteredActivityLogs.length} Filtered`}
                  size="small"
                  color="primary"
                  sx={{ fontWeight: 500 }}
                />
              )}
            </Box>
          </Box>

          {/* Filter Toolbar - Fixed */}
          <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider', backgroundColor: alpha(theme.palette.grey[500], 0.02) }}>
            {/* Search */}
            <TextField
              fullWidth
              size="small"
              placeholder="Search summons # or company..."
              value={auditSearchQuery}
              onChange={(e) => setAuditSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />

            {/* Date Range & Action Type */}
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <DatePicker
                  label="From"
                  value={auditDateStart}
                  onChange={setAuditDateStart}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: { flex: 1, minWidth: 130 },
                    },
                  }}
                />
                <DatePicker
                  label="To"
                  value={auditDateEnd}
                  onChange={setAuditDateEnd}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: { flex: 1, minWidth: 130 },
                    },
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={auditActionType}
                    label="Type"
                    onChange={(e) => setAuditActionType(e.target.value)}
                  >
                    <MenuItem value="all">All Types</MenuItem>
                    <MenuItem value="CREATED">Created</MenuItem>
                    <MenuItem value="STATUS_CHANGE">Status</MenuItem>
                    <MenuItem value="RESCHEDULE">Reschedule</MenuItem>
                    <MenuItem value="RESULT_CHANGE">Result</MenuItem>
                    <MenuItem value="AMOUNT_CHANGE">Amount</MenuItem>
                    <MenuItem value="PAYMENT">Payment</MenuItem>
                    <MenuItem value="AMENDMENT">Amendment</MenuItem>
                    <MenuItem value="ARCHIVED">Archived</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </LocalizationProvider>

            {/* Clear Filters Button */}
            {(auditSearchQuery || auditDateStart || auditDateEnd || auditActionType !== 'all') && (
              <Box sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  startIcon={<ClearAllIcon />}
                  onClick={clearAuditFilters}
                  sx={{ textTransform: 'none' }}
                >
                  Clear Filters
                </Button>
              </Box>
            )}
          </Box>

          {/* Scrollable List */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {getAllActivityLogs.length === 0 ? (
              // No data at all in the system
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <HistoryIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
                <Typography color="text.secondary" sx={{ fontWeight: 500, mb: 1 }}>
                  No activity recorded yet
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  Changes will appear here after the daily sweep detects updates from NYC Open Data.
                </Typography>
              </Box>
            ) : filteredActivityLogs.length === 0 ? (
              // Data exists but filters exclude everything
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <FilterListIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
                <Typography color="text.secondary" sx={{ fontWeight: 500, mb: 1 }}>
                  No matching entries
                </Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
                  Try adjusting your filters to see more results.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ClearAllIcon />}
                  onClick={clearAuditFilters}
                >
                  Clear Filters
                </Button>
              </Box>
            ) : (
              // Ledger-style list
              <Box sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                {filteredActivityLogs.map((entry, index) => (
                  <Box
                    key={`${entry.summons_number}-${entry.date}-${index}`}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.5,
                      px: 2,
                      py: 1.5,
                      backgroundColor: index % 2 === 0 ? 'transparent' : alpha(theme.palette.grey[500], 0.03),
                      borderBottom: index < filteredActivityLogs.length - 1 ? 1 : 0,
                      borderColor: 'divider',
                      transition: 'background-color 0.15s ease',
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.04),
                      },
                    }}
                  >
                    {/* Icon */}
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: alpha(theme.palette.primary.main, 0.08),
                        flexShrink: 0,
                        mt: 0.25,
                      }}
                    >
                      {getActivityIcon(entry.type)}
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Header Row: Company Name + Date */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 600,
                            color: 'text.primary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.respondent_name}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          {dayjs(entry.date).format('MM/DD/YY')}
                        </Typography>
                      </Box>

                      {/* Summons Number */}
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                        }}
                      >
                        #{entry.summons_number}
                      </Typography>

                      {/* Description */}
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.primary',
                          mt: 0.5,
                          fontSize: '0.8rem',
                        }}
                      >
                        {entry.description}
                      </Typography>

                      {/* Value Change Badge */}
                      {entry.old_value && entry.new_value && (
                        <Box
                          sx={{
                            mt: 0.75,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            backgroundColor: alpha(theme.palette.grey[500], 0.08),
                            fontSize: '0.7rem',
                            color: 'text.secondary',
                          }}
                        >
                          <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                            {entry.old_value}
                          </span>
                          <SwapHorizIcon sx={{ fontSize: 12 }} />
                          <span style={{ fontWeight: 600, color: theme.palette.text.primary }}>
                            {entry.new_value}
                          </span>
                        </Box>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
};

export default CalendarDashboard;
