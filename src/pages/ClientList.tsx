/**
 * Client List Page (/clients)
 *
 * Premium Enterprise UI - Practice Management View
 * Redesigned with professional aesthetics following MUI soft palette principles.
 *
 * @module pages/ClientList
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Grid,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRowParams,
} from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GavelIcon from '@mui/icons-material/Gavel';
import SettingsIcon from '@mui/icons-material/Settings';
import DownloadIcon from '@mui/icons-material/Download';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { generateClient } from 'aws-amplify/api';

import { listClients, listSummons } from '../graphql/queries';
import { Client, Summons, isUpdatedRecord } from '../types/summons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with UTC plugin for correct date parsing
dayjs.extend(utc);
import ExportConfigurationModal from '../components/ExportConfigurationModal';
import { useCSVExport } from '../hooks/useCSVExport';
import { ExportConfig } from '../lib/csvExport';

const apiClient = generateClient();

// Pre-2022 cutoff for "Active Era" filtering
const PRE_2022_CUTOFF = new Date('2022-01-01T00:00:00.000Z');

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

interface ClientWithStats extends Client {
  activeCaseCount: number;
  criticalCount: number;
  totalOpenBalance: number;
  totalCases: number;
  recentlyUpdatedCount: number;
}

/**
 * Check if a summons is "critical"
 * Matches CalendarDashboard.tsx logic exactly:
 * - Hearings within 7 CALENDAR days (not business days)
 * - OR dangerous status (DEFAULT, JUDGMENT, VIOLATION, FAILURE TO APPEAR)
 */
function isCriticalCase(summons: Summons): boolean {
  if (!summons.hearing_date) return false;

  // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
  const hearingDate = dayjs.utc(summons.hearing_date);
  const now = dayjs();
  const daysUntil = hearingDate.diff(now.startOf('day'), 'day');

  // Exclude past hearings
  if (daysUntil < 0) return false;

  // Critical: within 7 calendar days
  const isImminentDeadline = daysUntil <= 7;

  // Dangerous status check (same as CalendarDashboard)
  const status = (summons.status || '').toUpperCase();
  const isDangerStatus =
    status.includes('DEFAULT') ||
    status.includes('JUDGMENT') ||
    status.includes('VIOLATION') ||
    status.includes('FAILURE TO APPEAR');

  return isImminentDeadline || isDangerStatus;
}

/**
 * Check if a summons is in the "Active Era" (2022+)
 */
function isActiveEra(summons: Summons): boolean {
  if (!summons.hearing_date) return true;
  const hearingDate = new Date(summons.hearing_date);
  return hearingDate >= PRE_2022_CUTOFF;
}

/**
 * Check if a summons is "open" (has outstanding balance)
 */
function isOpenCase(summons: Summons): boolean {
  return (summons.amount_due || 0) > 0;
}

const ClientList: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [clients, setClients] = useState<Client[]>([]);
  const [summonses, setSummonses] = useState<Summons[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const {
    progress: exportProgress,
    isExporting,
    error: exportError,
    exportAllSummonses,
    resetExport,
  } = useCSVExport();

  /**
   * Load all clients and summonses for aggregation
   * Uses pagination to fetch ALL records (no 100-record limit)
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all clients (paginated)
      let allClients: Client[] = [];
      let clientNextToken: string | null = null;

      do {
        const clientResult = await apiClient.graphql({
          query: listClients,
          variables: {
            limit: 100,
            nextToken: clientNextToken,
          },
        }) as { data: { listClients: { items: Client[]; nextToken: string | null } } };

        allClients = [...allClients, ...clientResult.data.listClients.items];
        clientNextToken = clientResult.data.listClients.nextToken;
      } while (clientNextToken);

      // Fetch all summonses (paginated) - CRITICAL: No artificial cap
      let allSummonses: Summons[] = [];
      let summonsNextToken: string | null = null;

      do {
        const summonsResult = await apiClient.graphql({
          query: listSummons,
          variables: {
            limit: 1000, // Fetch in larger batches for efficiency
            nextToken: summonsNextToken,
          },
        }) as { data: { listSummons: { items: Summons[]; nextToken: string | null } } };

        allSummonses = [...allSummonses, ...summonsResult.data.listSummons.items];
        summonsNextToken = summonsResult.data.listSummons.nextToken;
      } while (summonsNextToken);

      console.log(`Loaded ${allClients.length} clients and ${allSummonses.length} summonses`);
      setClients(allClients);
      setSummonses(allSummonses);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load client data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * Aggregate summons data by client
   * Includes AKA matching: summonses match by clientID OR respondent_name matching AKAs
   */
  const clientsWithStats: ClientWithStats[] = useMemo(() => {
    return clients.map((client) => {
      // Build a set of names to match (primary name + AKAs)
      const matchNames = new Set<string>();
      matchNames.add(client.name.toLowerCase().trim());
      if (client.akas) {
        client.akas.forEach((aka) => matchNames.add(aka.toLowerCase().trim()));
      }

      // Find all summonses for this client (by clientID OR respondent_name match)
      // AND must be an IDLING violation
      const clientSummonses = summonses.filter((s) => {
        // First check: must be an IDLING violation
        if (!isIdlingViolation(s)) return false;

        // Direct clientID match
        if (s.clientID === client.id) return true;

        // AKA match: respondent_name matches client name or any AKA
        if (s.respondent_name) {
          const respondentNormalized = s.respondent_name.toLowerCase().trim();
          // Check exact match or partial match
          for (const name of matchNames) {
            if (respondentNormalized.includes(name) || name.includes(respondentNormalized)) {
              return true;
            }
          }
        }
        return false;
      });

      // Calculate stats (Active Era = 2022+)
      const activeEraSummonses = clientSummonses.filter(isActiveEra);
      const activeCases = activeEraSummonses.filter(isOpenCase);
      const criticalCases = activeEraSummonses.filter(isCriticalCase);
      const recentlyUpdatedCases = clientSummonses.filter(isUpdatedRecord);
      const totalOpenBalance = activeCases.reduce((sum, s) => sum + (s.amount_due || 0), 0);

      return {
        ...client,
        totalCases: clientSummonses.length,
        activeCaseCount: activeCases.length,
        criticalCount: criticalCases.length,
        recentlyUpdatedCount: recentlyUpdatedCases.length,
        totalOpenBalance,
      };
    });
  }, [clients, summonses]);

  /**
   * Filter clients by search term (client-side for <500 clients)
   */
  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clientsWithStats;

    const term = searchTerm.toLowerCase().trim();
    return clientsWithStats.filter((client) => {
      // Search by name
      if (client.name.toLowerCase().includes(term)) return true;

      // Search by AKAs
      if (client.akas?.some((aka) => aka.toLowerCase().includes(term))) return true;

      // Search by contact name
      if (client.contact_name?.toLowerCase().includes(term)) return true;

      return false;
    });
  }, [clientsWithStats, searchTerm]);

  /**
   * Sort clients: critical cases first, then by active case count
   */
  const sortedClients = useMemo(() => {
    return [...filteredClients].sort((a, b) => {
      // Critical cases first
      if (a.criticalCount > 0 && b.criticalCount === 0) return -1;
      if (b.criticalCount > 0 && a.criticalCount === 0) return 1;

      // Then by critical count
      if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;

      // Then by active case count
      if (a.activeCaseCount !== b.activeCaseCount) return b.activeCaseCount - a.activeCaseCount;

      // Finally alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [filteredClients]);

  // Calculate totals for summary
  const totals = useMemo(() => {
    return {
      totalClients: clients.length,
      totalActiveCases: clientsWithStats.reduce((sum, c) => sum + c.activeCaseCount, 0),
      totalCritical: clientsWithStats.reduce((sum, c) => sum + c.criticalCount, 0),
      totalOpenBalance: clientsWithStats.reduce((sum, c) => sum + c.totalOpenBalance, 0),
    };
  }, [clients.length, clientsWithStats]);

  /**
   * DataGrid columns for list view - Premium Enterprise Style
   */
  const listViewColumns: GridColDef[] = useMemo(() => [
    {
      field: 'name',
      headerName: 'Client',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
            {params.value}
          </Typography>
          {params.row.akas && params.row.akas.length > 0 && (
            <Typography variant="caption" color="text.disabled">
              {params.row.akas.slice(0, 2).join(', ')}
              {params.row.akas.length > 2 && ` +${params.row.akas.length - 2}`}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'activeCaseCount',
      headerName: 'Active',
      width: 100,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            label={params.value}
            size="small"
            variant="outlined"
            color={params.row.criticalCount > 0 ? 'warning' : params.value > 0 ? 'info' : 'default'}
            sx={{ height: 22, fontSize: '0.75rem' }}
          />
          {params.row.criticalCount > 0 && (
            <Tooltip title={`${params.row.criticalCount} critical`}>
              <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
            </Tooltip>
          )}
        </Box>
      ),
    },
    {
      field: 'criticalCount',
      headerName: 'Critical',
      width: 90,
      renderCell: (params) => (
        params.value > 0 ? (
          <Chip
            label={params.value}
            size="small"
            variant="outlined"
            color="warning"
            sx={{ height: 22, fontSize: '0.75rem' }}
          />
        ) : (
          <Typography variant="body2" color="text.disabled">—</Typography>
        )
      ),
    },
    {
      field: 'totalOpenBalance',
      headerName: 'Balance',
      width: 110,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: params.value > 0 ? 'text.primary' : 'success.main',
          }}
        >
          ${(params.value || 0).toLocaleString()}
        </Typography>
      ),
    },
    {
      field: 'totalCases',
      headerName: 'History',
      width: 90,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary">
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/clients/${params.row.id}`);
          }}
          sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
        >
          View
        </Button>
      ),
    },
  ], [navigate]);

  /**
   * Handle row click in list view
   */
  const handleRowClick = useCallback((params: GridRowParams) => {
    navigate(`/clients/${params.row.id}`);
  }, [navigate]);

  /**
   * Get row class for critical highlighting in list view
   */
  const getRowClassName = useCallback((params: GridRowParams) => {
    if (params.row.criticalCount > 0) {
      return 'critical-row';
    }
    return '';
  }, []);

  /**
   * Handle Global Export - exports ALL summonses across ALL clients
   */
  const handleGlobalExport = useCallback(async (config: ExportConfig) => {
    await exportAllSummonses(config);
  }, [exportAllSummonses]);

  /**
   * Handle export modal close
   */
  const handleExportModalClose = useCallback(() => {
    if (!isExporting) {
      setExportModalOpen(false);
      resetExport();
    }
  }, [isExporting, resetExport]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary' }}>
          Client Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon sx={{ fontSize: 18 }} />}
            onClick={() => setExportModalOpen(true)}
            sx={{ borderColor: 'divider', color: 'text.secondary' }}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SettingsIcon sx={{ fontSize: 18 }} />}
            onClick={() => navigate('/manage-clients')}
            sx={{ borderColor: 'divider', color: 'text.secondary' }}
          >
            Manage
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Metric Tiles - Distinct Paper components */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
              }}
            >
              <PeopleOutlineIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
                {totals.totalClients}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Total Clients
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
              }}
            >
              <FolderOpenIcon sx={{ color: 'info.main', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
                {totals.totalActiveCases}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Active Cases
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2,
              borderColor: totals.totalCritical > 0 ? 'warning.light' : 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              bgcolor: totals.totalCritical > 0 ? (theme) => alpha(theme.palette.warning.main, 0.04) : 'background.paper',
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.warning.main, 0.12),
              }}
            >
              <ErrorOutlineIcon sx={{ color: 'warning.dark', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600, color: totals.totalCritical > 0 ? 'warning.dark' : 'text.primary', lineHeight: 1.2 }}>
                {totals.totalCritical}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Critical Alerts
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
              }}
            >
              <AccountBalanceWalletIcon sx={{ color: 'success.main', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
                ${totals.totalOpenBalance.toLocaleString()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Open Balance
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Search Bar Section - Compact with integrated toggle */}
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          mb: 3,
          borderRadius: 2,
          borderColor: 'divider',
          display: 'flex',
          gap: 1.5,
          alignItems: 'center',
        }}
      >
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          placeholder="Search clients by name, AKA, or contact..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'grey.50',
              '& fieldset': { borderColor: 'transparent' },
              '&:hover fieldset': { borderColor: 'divider' },
              '&.Mui-focused fieldset': { borderColor: 'primary.main' },
            },
          }}
        />
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, newValue) => newValue && setViewMode(newValue)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              border: '1px solid',
              borderColor: 'divider',
              px: 1.5,
            },
          }}
        >
          <ToggleButton value="card">
            <ViewModuleIcon sx={{ fontSize: 20 }} />
          </ToggleButton>
          <ToggleButton value="list">
            <ViewListIcon sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      {/* Section Title for Cards */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        All Clients ({sortedClients.length})
      </Typography>

      {/* Card View - Premium Enterprise Style */}
      {viewMode === 'card' && (
        <Grid container spacing={3}>
          {sortedClients.map((client) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={client.id}>
              <Paper
                variant="outlined"
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 3,
                  borderColor: client.criticalCount > 0 ? 'warning.light' : 'divider',
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: 2,
                    borderColor: 'primary.main',
                  },
                }}
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                {/* Card Content */}
                <Box sx={{ p: 2.5, flexGrow: 1 }}>
                  {/* Client Name */}
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                    {client.name}
                  </Typography>
                  {client.akas && client.akas.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                      AKA: {client.akas.slice(0, 2).join(', ')}
                      {client.akas.length > 2 && ` +${client.akas.length - 2}`}
                    </Typography>
                  )}
                  {(!client.akas || client.akas.length === 0) && <Box sx={{ mb: 2 }} />}

                  {/* Stats Row */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {/* Active Cases */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <GavelIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                        <Typography variant="body2" color="text.secondary">Active</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip
                          label={client.activeCaseCount}
                          size="small"
                          variant="outlined"
                          color={client.criticalCount > 0 ? 'warning' : client.activeCaseCount > 0 ? 'info' : 'default'}
                          sx={{ height: 22, fontSize: '0.75rem' }}
                        />
                        {client.criticalCount > 0 && (
                          <Tooltip title={`${client.criticalCount} critical case(s) within 7 days`}>
                            <Chip
                              icon={<WarningAmberIcon sx={{ fontSize: 12 }} />}
                              label={client.criticalCount}
                              size="small"
                              variant="outlined"
                              color="warning"
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    </Box>

                    {/* Open Balance */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Balance</Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          color: client.totalOpenBalance > 0 ? 'text.primary' : 'success.main',
                        }}
                      >
                        ${client.totalOpenBalance.toLocaleString()}
                      </Typography>
                    </Box>

                    {/* Total History */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">History</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {client.totalCases} cases
                      </Typography>
                    </Box>

                    {/* Recently Updated Badge */}
                    {client.recentlyUpdatedCount > 0 && (
                      <Chip
                        label={`${client.recentlyUpdatedCount} updated`}
                        size="small"
                        variant="outlined"
                        color="warning"
                        sx={{ alignSelf: 'flex-start', height: 22, fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>
                </Box>

                {/* Card Footer - View Button */}
                <Box sx={{ px: 2.5, pb: 2 }}>
                  <Button
                    size="small"
                    fullWidth
                    endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                    sx={{
                      justifyContent: 'space-between',
                      color: 'text.secondary',
                      bgcolor: 'grey.50',
                      '&:hover': {
                        bgcolor: 'grey.100',
                        color: 'primary.main',
                      },
                    }}
                  >
                    View Details
                  </Button>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* List View */}
      {viewMode === 'list' && (
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
            rows={sortedClients}
            columns={listViewColumns}
            onRowClick={handleRowClick}
            getRowClassName={getRowClassName}
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            disableRowSelectionOnClick
            autoHeight
            sx={{
              border: 0,
              '& .MuiDataGrid-row': {
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
                },
              },
              '& .MuiDataGrid-row.critical-row': {
                backgroundColor: (theme) => alpha(theme.palette.warning.main, 0.08),
                '&:hover': {
                  backgroundColor: (theme) => alpha(theme.palette.warning.main, 0.12),
                },
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'grey.50',
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 600,
                color: 'text.secondary',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              },
              '& .MuiDataGrid-cell': {
                borderColor: 'divider',
              },
            }}
          />
        </Paper>
      )}

      {/* Empty State */}
      {sortedClients.length === 0 && !loading && (
        <Paper
          variant="outlined"
          sx={{
            textAlign: 'center',
            py: 8,
            px: 4,
            borderRadius: 2,
            borderColor: 'divider',
            borderStyle: 'dashed',
          }}
        >
          <PeopleOutlineIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 0.5 }}>
            {searchTerm ? 'No clients match your search' : 'No clients found'}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {searchTerm ? 'Try a different search term' : 'Add clients via Manage Clients'}
          </Typography>
        </Paper>
      )}

      {/* Global Export Modal */}
      <ExportConfigurationModal
        open={exportModalOpen}
        onClose={handleExportModalClose}
        onExport={handleGlobalExport}
        progress={exportProgress}
        isExporting={isExporting}
        error={exportError}
      />
    </Box>
  );
};

export default ClientList;
