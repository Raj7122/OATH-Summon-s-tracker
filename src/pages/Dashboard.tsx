import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListOffIcon from '@mui/icons-material/FilterListOff';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import UpdateIcon from '@mui/icons-material/Update';
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
import { listSummons } from '../graphql/queries';
import SummonsTable from '../components/SummonsTable';
import DashboardSummary from '../components/DashboardSummary';

const client = generateClient();

// Activity Log Entry for Summons Lifecycle Audit
interface ActivityLogEntry {
  date: string;
  type: 'CREATED' | 'STATUS_CHANGE' | 'RESCHEDULE' | 'RESULT_CHANGE' | 'AMOUNT_CHANGE' | 'PAYMENT' | 'AMENDMENT' | 'OCR_COMPLETE' | 'ARCHIVED';
  description: string;
  old_value: string | null;
  new_value: string | null;
}

// TODO: Replace with actual Amplify DataStore queries after backend setup
interface Summons {
  id: string;
  clientID: string;
  summons_number: string;
  respondent_name: string;
  hearing_date: string;
  hearing_time?: string;
  hearing_result?: string;
  status: string;
  license_plate: string;
  base_fine: number;
  amount_due: number;
  paid_amount?: number;
  penalty_imposed?: number;
  violation_date: string;
  violation_time?: string;
  violation_location: string;
  code_description?: string;
  summons_pdf_link: string;
  video_link: string;
  video_created_date?: string;
  lag_days?: number;
  notes?: string;
  added_to_calendar: boolean;
  evidence_reviewed: boolean;
  evidence_requested: boolean;
  evidence_requested_date?: string;
  evidence_received: boolean;
  license_plate_ocr?: string;
  id_number?: string;
  vehicle_type_ocr?: string;
  prior_offense_status?: string;
  violation_narrative?: string;
  idling_duration_ocr?: string;
  critical_flags_ocr?: string[];
  name_on_summons_ocr?: string;
  // TRD v1.8: Client Feedback Updates
  internal_status?: string;
  offense_level?: string;
  agency_id_number?: string;
  // Change Tracking (for UPDATED badge transparency)
  last_change_summary?: string;
  last_change_at?: string;
  // Activity Log (Summons Lifecycle Audit)
  activity_log?: ActivityLogEntry[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Calculate the number of business days (weekdays) between two dates
 *
 * TRD v1.8: Business Day Logic - Excludes weekends (Saturday and Sunday)
 * Used for deadline calculations to match firm's business operations.
 *
 * @param {Date} startDate - The starting date (typically today)
 * @param {Date} endDate - The ending date (typically hearing date)
 * @returns {number} Number of business days between the two dates
 */
function getBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  // Normalize time to avoid time zone issues
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Count if it's a weekday (1 = Monday, 5 = Friday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// Activity badge filter type
type ActivityFilter = 'updated' | 'new' | null;

/**
 * Check if a summons is a new record (created within last 72 hours)
 * Logic mirrors SummonsTable.isNewRecord
 */
function isNewRecord(summons: Summons): boolean {
  if (!summons.createdAt || !summons.updatedAt) return false;

  const createdDate = new Date(summons.createdAt);
  const updatedDate = new Date(summons.updatedAt);
  const now = new Date();
  const hoursSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

  // Brand new: created within last 72 hours AND createdAt matches updatedAt (never updated)
  const createdTimeStr = createdDate.toISOString().slice(0, 16);
  const updatedTimeStr = updatedDate.toISOString().slice(0, 16);
  return hoursSinceCreation <= 72 && createdTimeStr === updatedTimeStr;
}

/**
 * Check if a summons was recently updated BY THE DAILY SWEEP (not manual user edits)
 * Uses last_change_at which is only set when NYC API changes are detected.
 */
function isUpdatedRecord(summons: Summons): boolean {
  // Use last_change_at which is only set by the daily sweep when API changes are detected
  if (!summons.last_change_at) return false;

  // Must not be a new record (new records get NEW badge, not UPDATED)
  if (isNewRecord(summons)) return false;

  const lastChangeDate = new Date(summons.last_change_at);
  const now = new Date();
  const hoursSinceChange = (now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60);

  // Show UPDATED badge if daily sweep detected changes within last 72 hours
  return hoursSinceChange <= 72;
}

/**
 * Get icon for activity log entry type
 */
function getActivityIcon(type: ActivityLogEntry['type']) {
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
}

const Dashboard = () => {
  const [summonses, setSummonses] = useState<Summons[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'critical' | 'approaching' | 'hearing_complete' | 'evidence_pending' | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>(null);
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);

  useEffect(() => {
    loadSummonses();
  }, []);

  /**
   * Get all activity log entries across all summonses, sorted by date (most recent first)
   * This provides a comprehensive audit trail of all NYC API changes detected by daily sweep
   */
  const getAllActivityLogs = (): Array<ActivityLogEntry & { summons_number: string; respondent_name: string }> => {
    const allLogs: Array<ActivityLogEntry & { summons_number: string; respondent_name: string }> = [];

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
  };

  /**
   * Load summonses from GraphQL API with pagination
   * CRITICAL: Must paginate to get ALL records, not just the default limit
   */
  const loadSummonses = async () => {
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
      // Log detailed error information for debugging
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      // Log the full error object
      console.error('Full error object:', JSON.stringify(error, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadSummonses();
  };

  /**
   * Handle deadline card click - toggle filter on/off
   * @param filter - The filter type ('critical' | 'approaching' | 'hearing_complete' | 'evidence_pending')
   */
  const handleFilterClick = (filter: 'critical' | 'approaching' | 'hearing_complete' | 'evidence_pending') => {
    // Toggle: if clicking the same filter, turn it off; otherwise, switch to new filter
    const newFilter = activeFilter === filter ? null : filter;
    console.log('Filter clicked:', filter, 'Current:', activeFilter, 'New:', newFilter);
    setActiveFilter(newFilter);
    // Clear activity filter when using card filters
    if (newFilter) setActivityFilter(null);
  };

  /**
   * Handle activity badge filter (UPDATED/NEW) toggle
   * @param _event - React mouse event (unused)
   * @param newFilter - The new activity filter value
   */
  const handleActivityFilterChange = (
    _event: React.MouseEvent<HTMLElement>,
    newFilter: ActivityFilter
  ) => {
    setActivityFilter(newFilter);
    // Clear card filters when using activity filter
    if (newFilter) setActiveFilter(null);
  };

  /**
   * Filter summonses based on active deadline filter or activity filter
   * TRD v1.8: Updated to use business day logic and added hearing_complete filter
   * @returns Filtered array of summonses
   */
  const getFilteredSummonses = (): Summons[] => {
    // First check activity filter (UPDATED/NEW)
    if (activityFilter) {
      console.log('Activity filter:', activityFilter, 'Total summonses:', summonses.length);

      if (activityFilter === 'new') {
        const filtered = summonses.filter(isNewRecord);
        console.log('NEW filter returned:', filtered.length, 'summonses');
        return filtered;
      }

      if (activityFilter === 'updated') {
        const filtered = summonses.filter(isUpdatedRecord);
        console.log('UPDATED filter returned:', filtered.length, 'summonses');
        return filtered;
      }
    }

    if (!activeFilter) {
      console.log('No active filter, showing all summonses:', summonses.length);
      return summonses;
    }

    const now = new Date();
    console.log('Active filter:', activeFilter, 'Total summonses:', summonses.length);

    if (activeFilter === 'critical') {
      // Hearings within 7 business days (TRD v1.8: business day logic)
      const filtered = summonses.filter((summons) => {
        if (!summons.hearing_date) return false;
        const hearingDate = new Date(summons.hearing_date);
        if (hearingDate < now) return false; // Skip past dates

        const businessDays = getBusinessDays(now, hearingDate);
        return businessDays <= 7;
      });
      console.log('Critical filter returned:', filtered.length, 'summonses');
      return filtered;
    }

    if (activeFilter === 'approaching') {
      // Hearings in 8-21 business days (TRD v1.8: business day logic)
      const filtered = summonses.filter((summons) => {
        if (!summons.hearing_date) return false;
        const hearingDate = new Date(summons.hearing_date);
        if (hearingDate < now) return false; // Skip past dates

        const businessDays = getBusinessDays(now, hearingDate);
        return businessDays >= 8 && businessDays <= 21;
      });
      console.log('Approaching filter returned:', filtered.length, 'summonses');
      return filtered;
    }

    if (activeFilter === 'hearing_complete') {
      // Summonses marked as "Hearing Complete" (TRD v1.8: Client Feedback)
      const filtered = summonses.filter((summons) => {
        return summons.internal_status === 'Hearing Complete';
      });
      console.log('Hearing Complete filter returned:', filtered.length, 'summonses');
      return filtered;
    }

    if (activeFilter === 'evidence_pending') {
      // Evidence requested but not yet received (TRD v1.9: Evidence tracking)
      const filtered = summonses.filter((summons) => {
        return summons.evidence_requested === true && summons.evidence_received === false;
      });
      console.log('Evidence Pending filter returned:', filtered.length, 'summonses');
      return filtered;
    }

    console.log('No matching filter, returning all summonses');
    return summonses;
  };

  const filteredSummonses = getFilteredSummonses();

  return (
    <Box>
      {/* Header Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h4">Dashboard</Typography>
          {activeFilter && (
            <Chip
              label={`Filter: ${
                activeFilter === 'critical' ? 'Critical Deadlines' :
                activeFilter === 'approaching' ? 'Approaching Deadlines' :
                activeFilter === 'hearing_complete' ? 'Hearing Complete' :
                'Evidence Pending'
              }`}
              color="primary"
              onDelete={() => setActiveFilter(null)}
              sx={{ fontWeight: 'bold' }}
            />
          )}
          {activityFilter && (
            <Chip
              label={`Filter: ${activityFilter === 'new' ? 'NEW Records' : 'UPDATED Records'}`}
              color={activityFilter === 'new' ? 'info' : 'warning'}
              onDelete={() => setActivityFilter(null)}
              sx={{ fontWeight: 'bold' }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Activity Badge Filters (UPDATED/NEW) */}
          <ToggleButtonGroup
            value={activityFilter}
            exclusive
            onChange={handleActivityFilterChange}
            size="small"
            aria-label="activity filter"
          >
            <ToggleButton
              value="updated"
              aria-label="show updated records"
              sx={{
                '&.Mui-selected': {
                  backgroundColor: 'warning.main',
                  color: 'warning.contrastText',
                  '&:hover': { backgroundColor: 'warning.dark' },
                },
              }}
            >
              <UpdateIcon sx={{ mr: 0.5, fontSize: 18 }} />
              UPDATED
            </ToggleButton>
            <ToggleButton
              value="new"
              aria-label="show new records"
              sx={{
                '&.Mui-selected': {
                  backgroundColor: 'info.main',
                  color: 'info.contrastText',
                  '&:hover': { backgroundColor: 'info.dark' },
                },
              }}
            >
              <FiberNewIcon sx={{ mr: 0.5, fontSize: 18 }} />
              NEW
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Audit Trail Button - Shows all historical changes from daily sweep */}
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => setAuditTrailOpen(true)}
            size="small"
            sx={{
              borderColor: 'grey.400',
              color: 'text.secondary',
              '&:hover': {
                borderColor: 'grey.600',
                backgroundColor: 'grey.100',
              },
            }}
          >
            Audit Trail
          </Button>

          {(activeFilter || activityFilter) && (
            <Button
              variant="outlined"
              startIcon={<FilterListOffIcon />}
              onClick={() => {
                setActiveFilter(null);
                setActivityFilter(null);
              }}
              color="secondary"
              size="small"
            >
              Clear Filter
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Summary Widgets Section - FR-10 with Interactive Quick Filters */}
          <DashboardSummary
            summonses={summonses}
            activeFilter={activeFilter}
            onFilterClick={handleFilterClick}
          />

          {/* DataGrid Section - Shows filtered results when a deadline card is clicked */}
          <Paper sx={{ p: 2 }}>
            <SummonsTable summonses={filteredSummonses} onUpdate={loadSummonses} />
            {(activeFilter || activityFilter) && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Showing {filteredSummonses.length}{' '}
                  {activeFilter === 'critical' ? 'critical deadline' :
                   activeFilter === 'approaching' ? 'approaching deadline' :
                   activeFilter === 'hearing_complete' ? 'hearing complete' :
                   activeFilter === 'evidence_pending' ? 'evidence pending' :
                   activityFilter === 'new' ? 'new' :
                   activityFilter === 'updated' ? 'recently updated' : ''}
                  {' '}record{filteredSummonses.length !== 1 ? 's' : ''}.
                  {activeFilter ? ' Click the card again to view all summonses.' : ' Click the button again to view all summonses.'}
                </Typography>
              </Box>
            )}
          </Paper>
        </>
      )}

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

          {getAllActivityLogs().length === 0 ? (
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
              {getAllActivityLogs().map((entry, index) => (
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
                  {index < getAllActivityLogs().length - 1 && <Divider variant="inset" component="li" />}
                </Box>
              ))}
            </List>
          )}
        </Box>
      </Drawer>
    </Box>
  );
};

export default Dashboard;
