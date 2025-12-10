/**
 * Client Detail View (/clients/:id)
 *
 * Enterprise Data Grid - Comprehensive case history for a single client.
 * Redesigned with professional aesthetics following financial ledger patterns.
 *
 * @module pages/ClientDetail
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with UTC plugin for correct date parsing
dayjs.extend(utc);
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  LinearProgress,
  Breadcrumbs,
  Link,
  alpha,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridRowParams,
  GridSortModel,
} from '@mui/x-data-grid';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GavelIcon from '@mui/icons-material/Gavel';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { generateClient } from 'aws-amplify/api';

import { getClient, listSummons } from '../graphql/queries';
import { updateSummons } from '../graphql/mutations';
import { Client, Summons, isNewRecord, isUpdatedRecord } from '../types/summons';
import SummonsDetailModal from '../components/SummonsDetailModal';
import ExportConfigurationModal from '../components/ExportConfigurationModal';
import { useCSVExport } from '../hooks/useCSVExport';
import { ExportConfig } from '../lib/csvExport';

const apiClient = generateClient();

// Pre-2022 cutoff for "Active Era" filtering
const PRE_2022_CUTOFF = '2022-01-01T00:00:00.000Z';

// Page size options for the DataGrid
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

// IDLING filter keywords - only show idling violations
const IDLING_FILTER_KEYWORDS = ['IDLING', 'IDLE'];

/**
 * Check if a summons is an "Idling" violation
 * Safety guardrail to ensure no non-idling violations leak through
 */
function isIdlingViolation(summons: Summons): boolean {
  const codeDesc = (summons.code_description || '').toUpperCase();
  return IDLING_FILTER_KEYWORDS.some((keyword) => codeDesc.includes(keyword));
}

/**
 * Format change timestamp for tooltip display
 */
function formatChangeDate(dateString: string | undefined): string {
  if (!dateString) return 'Unknown date';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid date';
  }
}

const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Core State
  const [client, setClient] = useState<Client | null>(null);
  const [summonses, setSummonses] = useState<Summons[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination State - CRITICAL: Server-side pagination
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [, setHasMore] = useState(true);
  const [allDataLoaded, setAllDataLoaded] = useState(false);

  // Sort State
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'hearing_date', sort: 'desc' },
  ]);

  // Modal State
  const [selectedSummons, setSelectedSummons] = useState<Summons | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Export State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const { progress: exportProgress, isExporting, error: exportError, exportClientSummonses, resetExport } = useCSVExport();

  /**
   * Load client details
   */
  const loadClient = useCallback(async () => {
    if (!id) return;

    try {
      const result = await apiClient.graphql({
        query: getClient,
        variables: { id },
      }) as { data: { getClient: Client } };

      setClient(result.data.getClient);
    } catch (err) {
      console.error('Error loading client:', err);
      setError('Failed to load client details.');
    }
  }, [id]);

  /**
   * Load summonses with SERVER-SIDE PAGINATION
   *
   * CRITICAL: This uses cursor-based pagination (nextToken) to fetch ALL records.
   * It does NOT use data.slice() or any client-side limiting.
   *
   * The function will continue fetching until all matching records are loaded,
   * then applies client-side filtering for historical toggle.
   */
  const loadSummonses = useCallback(async (reset: boolean = false) => {
    if (!id || !client) return;

    if (reset) {
      setSummonses([]);
      setNextToken(null);
      setHasMore(true);
      setAllDataLoaded(false);
    }

    setLoadingMore(true);
    setError(null);

    try {
      // Build name matches for AKA support
      const matchNames: string[] = [client.name.toLowerCase().trim()];
      if (client.akas) {
        client.akas.forEach((aka) => matchNames.push(aka.toLowerCase().trim()));
      }

      // Fetch ALL summonses for this client using pagination
      // We need to load all to support client-side AKA matching
      let allSummonses: Summons[] = reset ? [] : [...summonses];
      let currentToken: string | null = reset ? null : nextToken;
      let fetchCount = 0;
      const MAX_FETCHES = 50; // Safety limit: 50 * 1000 = 50,000 records max

      while (fetchCount < MAX_FETCHES) {
        const result = await apiClient.graphql({
          query: listSummons,
          variables: {
            limit: 1000, // Fetch in large batches for efficiency
            nextToken: currentToken,
            // Note: We can't filter by clientID in the query because we need AKA matching
            // This is handled client-side after fetching
          },
        }) as { data: { listSummons: { items: Summons[]; nextToken: string | null } } };

        const items = result.data.listSummons.items;
        currentToken = result.data.listSummons.nextToken;

        // Filter for this client (clientID match OR respondent_name AKA match)
        // AND must be an IDLING violation
        const clientSummonses = items.filter((s) => {
          // First check: must be an IDLING violation
          if (!isIdlingViolation(s)) return false;

          // Then check: must match this client
          if (s.clientID === id) return true;
          if (s.respondent_name) {
            const respondentNormalized = s.respondent_name.toLowerCase().trim();
            return matchNames.some(
              (name) => respondentNormalized.includes(name) || name.includes(respondentNormalized)
            );
          }
          return false;
        });

        allSummonses = [...allSummonses, ...clientSummonses];
        fetchCount++;

        console.log(`Fetch ${fetchCount}: Got ${items.length} items, ${clientSummonses.length} match client, total: ${allSummonses.length}`);

        if (!currentToken) {
          setHasMore(false);
          setAllDataLoaded(true);
          break;
        }
      }

      setNextToken(currentToken);
      setSummonses(allSummonses);

    } catch (err) {
      console.error('Error loading summonses:', err);
      setError('Failed to load summons history.');
    } finally {
      setLoadingMore(false);
      setLoading(false);
    }
  }, [id, client, nextToken, summonses]);

  // Load client on mount
  useEffect(() => {
    loadClient();
  }, [loadClient]);

  // Load summonses when client is loaded
  useEffect(() => {
    if (client) {
      setLoading(true);
      loadSummonses(true);
    }
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Filter summonses to Active Era (2022+) only
   */
  const filteredSummonses = useMemo(() => {
    return summonses.filter((s) => {
      if (!s.hearing_date) return true; // Include records without hearing date
      return new Date(s.hearing_date) >= new Date(PRE_2022_CUTOFF);
    });
  }, [summonses]);

  /**
   * Calculate header stats
   *
   * Critical logic matches CalendarDashboard.tsx exactly:
   * - Hearings within 7 CALENDAR days (not business days)
   * - OR dangerous status (DEFAULT, JUDGMENT, VIOLATION, FAILURE TO APPEAR)
   */
  const stats = useMemo(() => {
    const activeEraSummonses = summonses.filter((s) => {
      if (!s.hearing_date) return true;
      return new Date(s.hearing_date) >= new Date(PRE_2022_CUTOFF);
    });

    const openCases = activeEraSummonses.filter((s) => (s.amount_due || 0) > 0);
    const now = dayjs();
    const criticalCases = activeEraSummonses.filter((s) => {
      if (!s.hearing_date) return false;
      // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
      const hearingDate = dayjs.utc(s.hearing_date);
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');

      // Exclude past hearings
      if (daysUntil < 0) return false;

      // Critical: within 7 calendar days
      const isImminentDeadline = daysUntil <= 7;

      // Dangerous status check (same as CalendarDashboard)
      const status = (s.status || '').toUpperCase();
      const isDangerStatus =
        status.includes('DEFAULT') ||
        status.includes('JUDGMENT') ||
        status.includes('VIOLATION') ||
        status.includes('FAILURE TO APPEAR');

      return isImminentDeadline || isDangerStatus;
    });

    return {
      totalAllTime: summonses.length,
      totalActive: activeEraSummonses.length,
      openCases: openCases.length,
      criticalCases: criticalCases.length,
      totalDue: openCases.reduce((sum, s) => sum + (s.amount_due || 0), 0),
    };
  }, [summonses]);

  /**
   * Handle summons update from modal
   * Attribution fields (_attr suffix) fail silently until schema is deployed
   */
  const handleSummonsUpdate = useCallback(async (summonsId: string, field: string, value: unknown) => {
    // Check if this is an attribution field (not yet in deployed schema)
    const isAttributionField = field.endsWith('_attr');

    try {
      await apiClient.graphql({
        query: updateSummons,
        variables: {
          input: {
            id: summonsId,
            [field]: value,
          },
        },
      });

      // Update local state
      setSummonses((prev) =>
        prev.map((s) => (s.id === summonsId ? { ...s, [field]: value } : s))
      );
    } catch (err) {
      // Silently fail for attribution fields (schema not deployed yet)
      if (isAttributionField) {
        console.log(`Attribution field ${field} not yet in schema - update skipped`);
        // Still update local state for UI responsiveness
        setSummonses((prev) =>
          prev.map((s) => (s.id === summonsId ? { ...s, [field]: value } : s))
        );
      } else {
        console.error('Error updating summons:', err);
      }
    }
  }, []);

  /**
   * Get MUI color for Status chip based on text value
   *
   * Matches the color scheme in SummonsTable.tsx for consistency:
   * - Red (error): DEFAULT, JUDGMENT, VIOLATION, DOCKETED - urgent action required
   * - Green (success): DISMISS, CLOSED, PAID - completed/resolved
   * - Blue (info): SCHEDULED, HEARING, RESCHEDULED - active case
   * - Gray (default): Unknown status
   */
  const getStatusColor = (status: string): 'error' | 'info' | 'success' | 'default' => {
    const upperStatus = (status || '').toUpperCase();

    // Red: Danger statuses (DOCKETED = red)
    if (upperStatus.includes('DEFAULT') || upperStatus.includes('JUDGMENT') ||
        upperStatus.includes('VIOLATION') || upperStatus.includes('DOCKETED')) {
      return 'error';
    }
    // Green: Resolved statuses (PAID IN FULL = emerald green)
    if (upperStatus.includes('DISMISS') || upperStatus.includes('CLOSED') ||
        upperStatus.includes('PAID') || upperStatus.includes('SETTLED')) {
      return 'success';
    }
    // Blue: Active case statuses
    if (upperStatus.includes('SCHEDULED') || upperStatus.includes('HEARING') ||
        upperStatus.includes('RESCHEDULE') || upperStatus.includes('ADJOURN')) {
      return 'info';
    }
    return 'default';
  };

  /**
   * DataGrid columns - Enterprise Data Grid Style
   */
  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'status',
      headerName: 'Status',
      width: 200,
      renderCell: (params) => {
        const summons = params.row as Summons;
        const isNew = isNewRecord(summons);
        const isUpdated = isUpdatedRecord(summons);

        // Build tooltip content for UPDATED badge
        const changeTooltip = summons.last_change_summary
          ? `${summons.last_change_summary} (${formatChangeDate(summons.last_change_at)})`
          : `Updated: ${formatChangeDate(summons.last_change_at)}`;

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* NEW badge */}
            {isNew && (
              <Chip
                label="NEW"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  bgcolor: 'info.main',
                  color: '#fff',
                }}
              />
            )}

            {/* UPDATED badge with tooltip */}
            {isUpdated && !isNew && (
              <Tooltip title={changeTooltip} arrow placement="top">
                <Chip
                  label="UPD"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    bgcolor: 'warning.main',
                    color: '#fff',
                    cursor: 'help',
                  }}
                />
              </Tooltip>
            )}

            {/* Status Chip - Color-coded to match Dashboard */}
            <Chip
              label={params.value || 'Unknown'}
              color={getStatusColor(params.value)}
              size="small"
              sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
            />
          </Box>
        );
      },
    },
    {
      field: 'summons_number',
      headerName: 'Summons #',
      width: 140,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500, color: 'text.primary' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'violation_date',
      headerName: 'Violation',
      width: 110,
      valueFormatter: (params) => params.value ? dayjs.utc(params.value).format('MM/DD/YY') : '—',
    },
    {
      field: 'hearing_date',
      headerName: 'Hearing',
      width: 120,
      renderCell: (params) => {
        if (!params.value) return <Typography variant="body2" color="text.disabled">—</Typography>;
        const hearingDateUtc = dayjs.utc(params.value);
        const now = dayjs();
        const daysUntil = hearingDateUtc.diff(now.startOf('day'), 'day');
        const isPast = daysUntil < 0;
        const isImminentDeadline = !isPast && daysUntil <= 7;
        const summons = params.row as Summons;
        const status = (summons.status || '').toUpperCase();
        const isDangerStatus =
          status.includes('DEFAULT') ||
          status.includes('JUDGMENT') ||
          status.includes('VIOLATION') ||
          status.includes('FAILURE TO APPEAR');
        const isCritical = !isPast && (isImminentDeadline || isDangerStatus);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ color: isCritical ? 'warning.dark' : 'text.primary' }}>
              {hearingDateUtc.format('MM/DD/YY')}
            </Typography>
            {isCritical && (
              <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
            )}
          </Box>
        );
      },
    },
    {
      field: 'license_plate',
      headerName: 'Plate',
      width: 100,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary">
          {params.row.license_plate_ocr || params.row.license_plate || '—'}
        </Typography>
      ),
    },
    {
      field: 'amount_due',
      headerName: 'Due',
      width: 100,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const amount = params.value || 0;
        return (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              fontFamily: 'monospace',
              color: amount > 0 ? 'text.primary' : 'success.main',
            }}
          >
            ${amount.toLocaleString()}
          </Typography>
        );
      },
    },
    {
      field: 'evidence_reviewed',
      headerName: 'Evidence',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        params.value ? (
          <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 18 }} />
        ) : (
          <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid', borderColor: 'grey.300' }} />
        )
      ),
    },
    {
      field: 'is_invoiced',
      headerName: 'Invoiced',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        params.value ? (
          <ReceiptLongIcon sx={{ color: 'success.main', fontSize: 18 }} />
        ) : (
          <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid', borderColor: 'grey.300' }} />
        )
      ),
    },
  ], []);

  /**
   * Handle row click to open detail modal
   */
  const handleRowClick = useCallback((params: GridRowParams) => {
    setSelectedSummons(params.row as Summons);
    setModalOpen(true);
  }, []);

  /**
   * Determine row class based on critical status
   * Matches CalendarDashboard.tsx logic exactly:
   * - Hearings within 7 CALENDAR days (not business days)
   * - OR dangerous status (DEFAULT, JUDGMENT, VIOLATION, FAILURE TO APPEAR)
   */
  const getRowClassName = useCallback((params: GridRowParams) => {
    const summons = params.row as Summons;
    if (!summons.hearing_date) return '';

    // Use UTC parsing to avoid timezone shift
    const hearingDate = dayjs.utc(summons.hearing_date);
    const now = dayjs();
    const daysUntil = hearingDate.diff(now.startOf('day'), 'day');

    // Skip past dates
    if (daysUntil < 0) return '';

    // Critical: within 7 calendar days
    const isImminentDeadline = daysUntil <= 7;

    // Dangerous status check (same as CalendarDashboard)
    const status = (summons.status || '').toUpperCase();
    const isDangerStatus =
      status.includes('DEFAULT') ||
      status.includes('JUDGMENT') ||
      status.includes('VIOLATION') ||
      status.includes('FAILURE TO APPEAR');

    if (isImminentDeadline || isDangerStatus) {
      return 'critical-row';
    }
    return '';
  }, []);

  /**
   * Handle export with configuration
   */
  const handleExport = useCallback(async (config: ExportConfig) => {
    if (!client) return;
    await exportClientSummonses(client, config);
  }, [client, exportClientSummonses]);

  /**
   * Handle export modal close
   */
  const handleExportModalClose = useCallback(() => {
    setExportModalOpen(false);
    resetExport();
  }, [resetExport]);

  if (loading && !client) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (!client) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="subtitle1" color="text.secondary">
          Client not found
        </Typography>
        <Button onClick={() => navigate('/clients')} sx={{ mt: 2 }} size="small">
          Back to Clients
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pt: 1 }}>
      {/* Breadcrumbs Navigation */}
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        sx={{ mb: 3 }}
      >
        <Link
          component={RouterLink}
          to="/clients"
          underline="hover"
          color="inherit"
          sx={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}
        >
          Clients
        </Link>
        <Typography color="text.primary" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
          {client.name}
        </Typography>
      </Breadcrumbs>

      {/* Client Header Card - Enterprise Style */}
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 2,
          borderColor: 'divider',
        }}
      >
        {/* Top Row: Client Name & Export */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
              {client.name}
            </Typography>
            {client.akas && client.akas.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Also includes: {client.akas.join(', ')}
              </Typography>
            )}
          </Box>
          <Tooltip title="Download CSV export">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />}
              onClick={() => setExportModalOpen(true)}
              disabled={summonses.length === 0}
              sx={{
                borderRadius: 2,
                borderColor: 'divider',
                color: 'text.secondary',
                gap: 0.5,
              }}
            >
              Export
            </Button>
          </Tooltip>
        </Box>

        {/* Metrics Grid - 4 columns */}
        <Grid container spacing={3}>
          <Grid item xs={6} sm={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                }}
              >
                <DescriptionOutlinedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  {stats.totalAllTime}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Records
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
                }}
              >
                <GavelIcon sx={{ color: 'info.main', fontSize: 20 }} />
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                    {stats.openCases}
                  </Typography>
                  {stats.criticalCases > 0 && (
                    <Chip
                      label={stats.criticalCases}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        bgcolor: 'warning.main',
                        color: '#fff',
                      }}
                    />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Active Open
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
                }}
              >
                <ErrorOutlineIcon sx={{ color: 'warning.dark', fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  {stats.criticalCases}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Critical (7d)
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
                }}
              >
                <AccountBalanceWalletOutlinedIcon sx={{ color: 'success.main', fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  ${stats.totalDue.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Due
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Case History Section Divider */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Case History
          </Typography>
          <Chip
            label={`${filteredSummonses.length} records`}
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
          {!allDataLoaded && (
            <Chip
              label="Loading..."
              size="small"
              variant="outlined"
              color="warning"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <Tooltip title="Refresh data">
          <IconButton
            size="small"
            onClick={() => loadSummonses(true)}
            disabled={loadingMore}
            sx={{ color: 'text.secondary' }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Loading indicator */}
      {loadingMore && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}

      {/* Master History DataGrid - Enterprise Style */}
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          borderRadius: 2,
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <DataGrid
          rows={filteredSummonses}
          columns={columns}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          onRowClick={handleRowClick}
          getRowClassName={getRowClassName}
          loading={loading}
          rowCount={filteredSummonses.length}
          disableRowSelectionOnClick
          autoHeight
          sx={{
            border: 0,
            // Header row styling - Financial Ledger look
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'grey.50',
              borderBottom: '1px solid',
              borderColor: 'divider',
              minHeight: '48px !important',
            },
            '& .MuiDataGrid-columnHeader': {
              '&:focus, &:focus-within': { outline: 'none' },
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 600,
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'text.secondary',
            },
            // Row styling with hover
            '& .MuiDataGrid-row': {
              cursor: 'pointer',
              borderBottom: '1px solid',
              borderColor: 'divider',
              minHeight: '52px !important',
              '&:hover': {
                bgcolor: 'grey.50',
              },
            },
            // Critical row styling - soft warning background
            '& .MuiDataGrid-row.critical-row': {
              bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
              '&:hover': {
                bgcolor: (theme) => alpha(theme.palette.warning.main, 0.12),
              },
            },
            // Cell styling
            '& .MuiDataGrid-cell': {
              borderBottom: 'none',
              '&:focus, &:focus-within': { outline: 'none' },
            },
            // Footer styling
            '& .MuiDataGrid-footerContainer': {
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
            },
            // Remove column separator
            '& .MuiDataGrid-columnSeparator': {
              display: 'none',
            },
          }}
          initialState={{
            columns: {
              columnVisibilityModel: {
                evidence_reviewed: true,
                is_invoiced: true,
              },
            },
          }}
          slotProps={{
            pagination: {
              showFirstButton: true,
              showLastButton: true,
            },
          }}
        />
      </Paper>

      {/* Summons Detail Modal (REUSED - not duplicated) */}
      <SummonsDetailModal
        open={modalOpen}
        summons={selectedSummons}
        onClose={() => {
          setModalOpen(false);
          setSelectedSummons(null);
        }}
        onUpdate={handleSummonsUpdate}
      />

      {/* Export Configuration Modal */}
      <ExportConfigurationModal
        open={exportModalOpen}
        onClose={handleExportModalClose}
        onExport={handleExport}
        client={client}
        progress={exportProgress}
        isExporting={isExporting}
        error={exportError}
      />
    </Box>
  );
};

export default ClientDetail;
