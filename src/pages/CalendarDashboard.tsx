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

// Amplify GraphQL client
const client = generateClient();

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
  // Special filter for header chip clicks (critical, new, updated)
  const [specialFilter, setSpecialFilter] = useState<'critical' | 'new' | 'updated' | null>(null);
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
   * Filter summonses by selected date and special filter
   *
   * Note: hearing_date is stored as ISO format (e.g., "2025-01-15T00:00:00.000Z")
   * We compare by extracting the date portion only.
   */
  const filteredByDate = useMemo(() => {
    const now = dayjs().tz(NYC_TIMEZONE);
    let filtered = summonses;

    // Apply special filter first (from header chip clicks)
    if (specialFilter === 'critical') {
      filtered = filtered.filter((s) => {
        if (!s.hearing_date) return false;
        const hearingDate = dayjs(s.hearing_date);
        const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
        return daysUntil >= 0 && daysUntil <= 7;
      });
    } else if (specialFilter === 'new') {
      filtered = filtered.filter(isNewRecord);
    } else if (specialFilter === 'updated') {
      filtered = filtered.filter(isUpdatedRecord);
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
  }, [summonses, selectedDate, specialFilter]);

  /**
   * Handle special filter chip click (toggle behavior)
   */
  const handleSpecialFilterClick = useCallback((filter: 'critical' | 'new' | 'updated') => {
    // Toggle: if clicking the same filter, clear it; otherwise set it
    setSpecialFilter((prev) => (prev === filter ? null : filter));
    // Clear date selection when using special filter for better UX
    if (specialFilter !== filter) {
      setSelectedDate(null);
    }
  }, [specialFilter]);
  
  /**
   * Handle date selection from calendar
   */
  const handleDateSelect = useCallback((date: Dayjs | null) => {
    setSelectedDate(date);
    // Clear special filter when selecting a date for cleaner UX
    if (date) {
      setSpecialFilter(null);
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
   * Get summary statistics for the header
   */
  const stats = useMemo(() => {
    const now = dayjs().tz(NYC_TIMEZONE);
    
    const critical = summonses.filter((s) => {
      if (!s.hearing_date) return false;
      const hearingDate = dayjs(s.hearing_date);
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
      return daysUntil >= 0 && daysUntil <= 7;
    }).length;
    
    const newCount = summonses.filter(isNewRecord).length;
    const updatedCount = summonses.filter(isUpdatedRecord).length;
    
    return { critical, newCount, updatedCount, total: summonses.length };
  }, [summonses]);
  
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
          
          {/* Quick Stats Chips - Clickable to filter */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {stats.critical > 0 && (
              <Chip
                label={`${stats.critical} Critical`}
                color="error"
                size="small"
                onClick={() => handleSpecialFilterClick('critical')}
                onDelete={specialFilter === 'critical' ? () => setSpecialFilter(null) : undefined}
                variant={specialFilter === 'critical' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                  ...(specialFilter === 'critical' && {
                    boxShadow: 2,
                  }),
                }}
              />
            )}
            {stats.newCount > 0 && (
              <Chip
                label={`${stats.newCount} New`}
                color="info"
                size="small"
                onClick={() => handleSpecialFilterClick('new')}
                onDelete={specialFilter === 'new' ? () => setSpecialFilter(null) : undefined}
                variant={specialFilter === 'new' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                  ...(specialFilter === 'new' && {
                    boxShadow: 2,
                  }),
                }}
              />
            )}
            {stats.updatedCount > 0 && (
              <Chip
                label={`${stats.updatedCount} Updated`}
                color="warning"
                size="small"
                onClick={() => handleSpecialFilterClick('updated')}
                onDelete={specialFilter === 'updated' ? () => setSpecialFilter(null) : undefined}
                variant={specialFilter === 'updated' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                  ...(specialFilter === 'updated' && {
                    boxShadow: 2,
                  }),
                }}
              />
            )}
          </Box>
          
          {/* Date filter indicator */}
          {selectedDate && (
            <Chip
              label={`Filtered: ${selectedDate.format('MMM D, YYYY')}`}
              color="primary"
              onDelete={() => setSelectedDate(null)}
              sx={{ fontWeight: 500 }}
            />
          )}
        </Box>
        
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
          
          {/* Audit Trail Button - Shows all historical changes from daily sweep */}
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => setAuditTrailOpen(true)}
            size={isMobile ? 'small' : 'medium'}
            sx={{
              borderColor: 'grey.400',
              color: 'text.secondary',
              '&:hover': {
                borderColor: 'grey.600',
                backgroundColor: 'grey.100',
              },
            }}
          >
            {isMobile ? '' : 'Audit Trail'}
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
                summonses={summonses}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
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
