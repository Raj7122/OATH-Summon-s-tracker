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
  CircularProgress,
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
  return dayjs(summons.hearing_date) >= ACTIVE_ERA_CUTOFF;
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
   * Load summonses from GraphQL API
   */
  const loadSummonses = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.graphql({
        query: listSummons,
      });
      
      // Type assertion for GraphQL result
      const data = result as { data: { listSummons: { items: Summons[] } } };
      console.log('Loaded summonses:', data.data.listSummons.items.length);
      setSummonses(data.data.listSummons.items);
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
   * - Critical (🔴): Hearings within 7 days OR Status is "Default/Failure to Appear"
   * - Approaching (🟠): Hearings between 8 and 30 days from today
   * - Future (🟢): Hearings > 30 days away
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
        const hearingDate = dayjs(s.hearing_date);
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
        const hearingDate = dayjs(s.hearing_date);
        const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
        return daysUntil >= 8 && daysUntil <= 30;
      });
    } else if (horizonFilter === 'future') {
      // Future: > 30 days away
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        const hearingDate = dayjs(s.hearing_date);
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
        // Extract just the date portion from the ISO timestamp
        const hearingDateKey = dayjs(s.hearing_date).format('YYYY-MM-DD');
        return hearingDateKey === dateKey;
      });
    }

    return filtered;
  }, [globallyFilteredSummonses, selectedDate, horizonFilter]);

  /**
   * Handle Horizon System chip click (toggle behavior)
   * Filters: critical (🔴), approaching (🟠), future (🟢), new
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
      
      console.log(`✓ Successfully updated ${field}`);
      
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
   * - Critical (🔴): Hearings within 7 days OR Status is "Default/Failure to Appear"
   * - Approaching (🟠): Hearings between 8 and 30 days from today
   * - Future (🟢): Hearings > 30 days away
   */
  const stats = useMemo(() => {
    const now = dayjs().tz(NYC_TIMEZONE);

    // Critical: Future hearings (daysUntil >= 0) that are either:
    // 1. Within 7 days (imminent deadline)
    // 2. Have dangerous status (Default, Judgment, etc.)
    // Past hearings are excluded - no point panicking about what already happened
    const criticalCount = globallyFilteredSummonses.filter((s) => {
      if (!s.hearing_date) return false;
      const hearingDate = dayjs(s.hearing_date);
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
      const hearingDate = dayjs(s.hearing_date);
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
      return daysUntil >= 8 && daysUntil <= 30;
    }).length;

    // Future: > 30 days away
    const futureCount = globallyFilteredSummonses.filter((s) => {
      if (!s.hearing_date) return false;
      const hearingDate = dayjs(s.hearing_date);
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
        return <AddCircleIcon sx={{ color: '#4CAF50' }} />;
      case 'STATUS_CHANGE':
        return <SwapHorizIcon sx={{ color: '#FF9800' }} />;
      case 'RESCHEDULE':
        return <EventIcon sx={{ color: '#2196F3' }} />;
      case 'RESULT_CHANGE':
        return <GavelIcon sx={{ color: '#9C27B0' }} />;
      case 'AMOUNT_CHANGE':
        return <AttachMoneyIcon sx={{ color: '#F44336' }} />;
      case 'PAYMENT':
        return <PaymentIcon sx={{ color: '#4CAF50' }} />;
      case 'AMENDMENT':
        return <EditIcon sx={{ color: '#607D8B' }} />;
      case 'OCR_COMPLETE':
        return <DocumentScannerIcon sx={{ color: '#00BCD4' }} />;
      case 'ARCHIVED':
        return <ArchiveIcon sx={{ color: '#757575' }} />;
      default:
        return <HistoryIcon />;
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

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header Section */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Dashboard
          </Typography>

          {/* Horizon filter chips moved to Command Center for better UX */}

          {/* Active filter indicator */}
          {horizonFilter && (
            <Chip
              label={`Filtered: ${horizonFilter.charAt(0).toUpperCase() + horizonFilter.slice(1)}`}
              color="primary"
              onDelete={() => setHorizonFilter(null)}
              sx={{ fontWeight: 500 }}
            />
          )}

          {/* Date filter indicator */}
          {selectedDate && (
            <Chip
              label={`Date: ${selectedDate.format('MMM D, YYYY')}`}
              color="primary"
              onDelete={() => setSelectedDate(null)}
              sx={{ fontWeight: 500 }}
            />
          )}
        </Box>

        {/* OVERRIDE C: Archive toggle removed - main dashboard is active triage only */}
        {/* Historical data (pre-2022) is accessible via Client View, not here */}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Mobile view toggle */}
          {isMobile && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                variant={mobileView === 'calendar' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setMobileView('calendar')}
                sx={{ minWidth: 40 }}
              >
                <CalendarMonthIcon fontSize="small" />
              </Button>
              <Button
                variant={mobileView === 'grid' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setMobileView('grid')}
                sx={{ minWidth: 40 }}
              >
                <TableChartIcon fontSize="small" />
              </Button>
            </Box>
          )}
          
          {/* Audit Trail button - clear action, not a filter */}
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => setAuditTrailOpen(true)}
            size={isMobile ? 'small' : 'medium'}
          >
            Audit Trail
          </Button>

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
            size={isMobile ? 'small' : 'medium'}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>
      </Box>
      
      {/* Loading Overlay */}
      {loading && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            py: 8,
          }}
        >
          <CircularProgress />
        </Box>
      )}
      
      {/* Main Content - Split View Layout */}
      {!loading && (
        <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          {/* LEFT COLUMN: Calendar Command Center (35%) */}
          {(!isMobile || mobileView === 'calendar') && (
            <Grid item xs={12} md={4} lg={3.5}>
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
            </Grid>
          )}
          
          {/* RIGHT COLUMN: Summons DataGrid (65%) */}
          {(!isMobile || mobileView === 'grid') && (
            <Grid item xs={12} md={8} lg={8.5}>
              <Paper
                elevation={2}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 2,
                  overflow: 'hidden',
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
            </Grid>
          )}
        </Grid>
      )}
      
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

      {/* Audit Trail Drawer - Comprehensive ledger of all NYC API changes */}
      <Drawer
        anchor="right"
        open={auditTrailOpen}
        onClose={() => setAuditTrailOpen(false)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 450 } },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon color="action" />
              Audit Trail
            </Typography>
            <IconButton onClick={() => setAuditTrailOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Complete history of all changes detected by the daily sweep from NYC Open Data.
            This ledger persists beyond the 72-hour UPDATED badge window.
          </Typography>
          <Divider sx={{ mb: 2 }} />

          {getAllActivityLogs.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <HistoryIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
              <Typography color="text.secondary">
                No activity recorded yet.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Changes will appear here after the daily sweep runs.
              </Typography>
            </Box>
          ) : (
            <List dense>
              {getAllActivityLogs.map((entry, index) => (
                <Box key={`${entry.summons_number}-${entry.date}-${index}`}>
                  <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {getActivityIcon(entry.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="subtitle2" component="span">
                            {entry.respondent_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(entry.date).toLocaleDateString()}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2" color="text.secondary" component="span">
                            #{entry.summons_number}
                          </Typography>
                          <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
                            {entry.description}
                          </Typography>
                          {entry.old_value && entry.new_value && (
                            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                              {entry.old_value} → {entry.new_value}
                            </Typography>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                  {index < getAllActivityLogs.length - 1 && <Divider variant="inset" component="li" />}
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
