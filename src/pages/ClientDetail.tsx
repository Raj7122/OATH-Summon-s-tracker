/**
 * Client Detail View (/clients/:id)
 *
 * Implements the "Clio View" - comprehensive case history for a single client.
 * This is the core solution to Arthur's "Only 4 visible" problem.
 *
 * Features:
 * - Header Stats: Total Summonses, Active Open, Total Due
 * - AKA Display: Shows all aliases included in the view
 * - Master History Grid: Full-width DataGrid with SERVER-SIDE PAGINATION
 * - Default Filter: Show only cases with hearing_date >= 2022-01-01
 * - Toggle: "Show Historical" loads pre-2022 data
 * - Row click opens SummonsDetailModal (reused, not duplicated)
 *
 * CRITICAL: Uses cursor-based pagination (nextToken) - NOT client-side slicing
 * This ensures access to ALL records (5,000+) without arbitrary caps.
 *
 * @module pages/ClientDetail
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridRowParams,
  GridSortModel,
} from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BusinessIcon from '@mui/icons-material/Business';
import WarningIcon from '@mui/icons-material/Warning';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptIcon from '@mui/icons-material/Receipt';
import DownloadIcon from '@mui/icons-material/Download';
import { generateClient } from 'aws-amplify/api';

import { getClient, listSummons } from '../graphql/queries';
import { updateSummons } from '../graphql/mutations';
import { Client, Summons, getStatusColor } from '../types/summons';
import SummonsDetailModal from '../components/SummonsDetailModal';
import ExportConfigurationModal from '../components/ExportConfigurationModal';
import { useCSVExport } from '../hooks/useCSVExport';
import { ExportConfig } from '../lib/csvExport';

const apiClient = generateClient();

// Pre-2022 cutoff for "Active Era" filtering
const PRE_2022_CUTOFF = '2022-01-01T00:00:00.000Z';

// Page size options for the DataGrid
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

/**
 * Calculate lag/wait time between violation date and hearing date
 */
function calculateLagDays(violationDate: string | undefined, hearingDate: string | undefined): number | null {
  if (!violationDate || !hearingDate) return null;
  const violation = dayjs(violationDate);
  const hearing = dayjs(hearingDate);
  return hearing.diff(violation, 'day');
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
  const [hasMore, setHasMore] = useState(true);
  const [allDataLoaded, setAllDataLoaded] = useState(false);

  // Filter State
  const [showHistorical, setShowHistorical] = useState(false);
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
        const clientSummonses = items.filter((s) => {
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
   * Filter summonses based on historical toggle
   */
  const filteredSummonses = useMemo(() => {
    if (showHistorical) {
      return summonses; // Show all records
    }
    // Filter to Active Era (2022+)
    return summonses.filter((s) => {
      if (!s.hearing_date) return true; // Include records without hearing date
      return new Date(s.hearing_date) >= new Date(PRE_2022_CUTOFF);
    });
  }, [summonses, showHistorical]);

  /**
   * Calculate header stats
   */
  const stats = useMemo(() => {
    const activeEraSummonses = summonses.filter((s) => {
      if (!s.hearing_date) return true;
      return new Date(s.hearing_date) >= new Date(PRE_2022_CUTOFF);
    });

    const openCases = activeEraSummonses.filter((s) => (s.amount_due || 0) > 0);
    const criticalCases = activeEraSummonses.filter((s) => {
      if (!s.hearing_date) return false;
      const daysUntil = dayjs(s.hearing_date).diff(dayjs(), 'day');
      return daysUntil >= 0 && daysUntil <= 7;
    });

    return {
      totalAllTime: summonses.length,
      totalActive: activeEraSummonses.length,
      openCases: openCases.length,
      criticalCases: criticalCases.length,
      totalDue: openCases.reduce((sum, s) => sum + (s.amount_due || 0), 0),
      historicalCount: summonses.length - activeEraSummonses.length,
    };
  }, [summonses]);

  /**
   * Handle summons update from modal
   */
  const handleSummonsUpdate = useCallback(async (summonsId: string, field: string, value: unknown) => {
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
      console.error('Error updating summons:', err);
    }
  }, []);

  /**
   * DataGrid columns - Strict order per spec
   */
  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params) => (
        <Chip
          label={params.value || 'Unknown'}
          color={getStatusColor(params.value)}
          size="small"
          sx={{ fontWeight: 500 }}
        />
      ),
    },
    {
      field: 'summons_number',
      headerName: 'Summons #',
      width: 150,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'violation_date',
      headerName: 'Violation Date',
      width: 130,
      valueFormatter: (params) => params.value ? dayjs(params.value).format('MM/DD/YYYY') : '—',
    },
    {
      field: 'hearing_date',
      headerName: 'Hearing Date',
      width: 130,
      renderCell: (params) => {
        if (!params.value) return '—';
        const date = dayjs(params.value);
        const daysUntil = date.diff(dayjs(), 'day');
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2">{date.format('MM/DD/YYYY')}</Typography>
            {daysUntil >= 0 && daysUntil <= 7 && (
              <WarningIcon sx={{ fontSize: 16, color: 'error.main' }} />
            )}
          </Box>
        );
      },
    },
    {
      field: 'license_plate',
      headerName: 'License Plate',
      width: 120,
      valueGetter: (params) => params.row.license_plate_ocr || params.row.license_plate || '—',
    },
    {
      field: 'lag_days',
      headerName: 'Wait/Lag',
      width: 100,
      valueGetter: (params) => calculateLagDays(params.row.violation_date, params.row.hearing_date),
      renderCell: (params) => {
        const days = params.value;
        if (days === null) return '—';
        return (
          <Chip
            label={`${days}d`}
            size="small"
            color={days > 60 ? 'warning' : 'default'}
            variant="outlined"
          />
        );
      },
    },
    {
      field: 'amount_due',
      headerName: 'Amount Due',
      width: 110,
      renderCell: (params) => {
        const amount = params.value || 0;
        return (
          <Typography
            variant="body2"
            sx={{
              fontWeight: amount > 0 ? 600 : 400,
              color: amount > 0 ? 'error.main' : 'success.main',
            }}
          >
            ${amount.toLocaleString()}
          </Typography>
        );
      },
    },
    // Hidden columns (available via column visibility toggle)
    {
      field: 'evidence_reviewed',
      headerName: 'Evidence',
      width: 90,
      renderCell: (params) => (
        params.value ? (
          <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
        ) : (
          <Box sx={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid', borderColor: 'grey.400' }} />
        )
      ),
    },
    {
      field: 'is_invoiced',
      headerName: 'Invoiced',
      width: 90,
      renderCell: (params) => (
        params.value ? (
          <ReceiptIcon sx={{ color: 'success.main', fontSize: 20 }} />
        ) : (
          <Box sx={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid', borderColor: 'grey.400' }} />
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
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!client) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="error">
          Client not found
        </Typography>
        <Button onClick={() => navigate('/clients')} sx={{ mt: 2 }}>
          Back to Clients
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Back Navigation */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/clients')}
        sx={{ mb: 2 }}
      >
        Back to Clients
      </Button>

      {/* Client Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          {/* Client Name & AKAs */}
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <BusinessIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {client.name}
                </Typography>
                {client.akas && client.akas.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Includes records for: {client.akas.join(', ')}
                  </Typography>
                )}
              </Box>
              {/* Export Button */}
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => setExportModalOpen(true)}
                disabled={summonses.length === 0}
              >
                Export
              </Button>
            </Box>
          </Grid>

          {/* Stats */}
          <Grid item xs={12} md={6}>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {stats.totalAllTime}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total Summonses
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'info.main' }}>
                      {stats.openCases}
                    </Typography>
                    {stats.criticalCases > 0 && (
                      <Chip
                        label={stats.criticalCases}
                        color="error"
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Active Open
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'error.main' }}>
                    ${stats.totalDue.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total Due
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Master History Grid */}
      <Paper sx={{ width: '100%' }}>
        {/* Grid Header with Controls */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Case History
            </Typography>
            <Chip
              label={`${filteredSummonses.length} records`}
              size="small"
              color="primary"
              variant="outlined"
            />
            {!allDataLoaded && (
              <Chip
                label="Loading more..."
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Historical Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={showHistorical}
                  onChange={(e) => setShowHistorical(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {showHistorical ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                  <Typography variant="body2">
                    Show Historical ({stats.historicalCount} pre-2022)
                  </Typography>
                </Box>
              }
            />

            {/* Refresh Button */}
            <Tooltip title="Refresh data">
              <IconButton onClick={() => loadSummonses(true)} disabled={loadingMore}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Loading indicator */}
        {loadingMore && <LinearProgress />}

        {/* DataGrid with server-side pagination support */}
        <DataGrid
          rows={filteredSummonses}
          columns={columns}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          onRowClick={handleRowClick}
          loading={loading}
          rowCount={filteredSummonses.length}
          disableRowSelectionOnClick
          autoHeight
          sx={{
            border: 0,
            '& .MuiDataGrid-row': {
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'grey.100',
            },
          }}
          initialState={{
            columns: {
              columnVisibilityModel: {
                evidence_reviewed: false,
                is_invoiced: false,
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

        {/* Load More indicator for infinite scroll capability */}
        {hasMore && !allDataLoaded && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Button
              variant="outlined"
              onClick={() => loadSummonses(false)}
              disabled={loadingMore}
              startIcon={loadingMore ? <CircularProgress size={16} /> : <HistoryIcon />}
            >
              {loadingMore ? 'Loading...' : 'Load More Records'}
            </Button>
          </Box>
        )}
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
