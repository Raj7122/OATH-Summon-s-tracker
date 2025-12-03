/**
 * Client List Page (/clients)
 *
 * Implements the "Practice Management" view similar to Clio.
 * Provides a high-level directory of all clients with:
 * - Searchable list/grid of Client Cards
 * - Active Case Count with critical badge
 * - Total Open Balance
 * - "View History" navigation to Client Detail
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
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  Divider,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import HistoryIcon from '@mui/icons-material/History';
import WarningIcon from '@mui/icons-material/Warning';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import GavelIcon from '@mui/icons-material/Gavel';
import SettingsIcon from '@mui/icons-material/Settings';
import DownloadIcon from '@mui/icons-material/Download';
import { generateClient } from 'aws-amplify/api';

import { listClients, listSummons } from '../graphql/queries';
import { Client, Summons } from '../types/summons';
import ExportConfigurationModal from '../components/ExportConfigurationModal';
import { useCSVExport } from '../hooks/useCSVExport';
import { ExportConfig } from '../lib/csvExport';

const apiClient = generateClient();

// Pre-2022 cutoff for "Active Era" filtering
const PRE_2022_CUTOFF = new Date('2022-01-01T00:00:00.000Z');

interface ClientWithStats extends Client {
  activeCaseCount: number;
  criticalCount: number;
  totalOpenBalance: number;
  totalCases: number;
}

/**
 * Check if a summons is "critical" (hearing within 7 days)
 */
function isCriticalCase(summons: Summons): boolean {
  if (!summons.hearing_date) return false;
  const hearingDate = new Date(summons.hearing_date);
  const now = new Date();
  const daysUntilHearing = Math.floor((hearingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilHearing >= 0 && daysUntilHearing <= 7;
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
      const clientSummonses = summonses.filter((s) => {
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
      const totalOpenBalance = activeCases.reduce((sum, s) => sum + (s.amount_due || 0), 0);

      return {
        ...client,
        totalCases: clientSummonses.length,
        activeCaseCount: activeCases.length,
        criticalCount: criticalCases.length,
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
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Client Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Practice management view - {totals.totalClients} clients, {totals.totalActiveCases} active cases
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => setExportModalOpen(true)}
          >
            Global Export
          </Button>
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => navigate('/manage-clients')}
          >
            Manage Clients
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Summary Stats */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {totals.totalClients}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Clients
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'info.main' }}>
                {totals.totalActiveCases}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active Cases
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'error.main' }}>
                {totals.totalCritical}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Critical (7 days)
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main' }}>
                ${totals.totalOpenBalance.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Open Balance
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Search Bar */}
      <TextField
        fullWidth
        placeholder="Search clients by name, AKA, or contact..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon color="action" />
            </InputAdornment>
          ),
        }}
      />

      {/* Client Cards Grid */}
      <Grid container spacing={2}>
        {sortedClients.map((client) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={client.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderLeft: client.criticalCount > 0 ? 4 : 0,
                borderColor: 'error.main',
                transition: 'box-shadow 0.2s',
                '&:hover': {
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                {/* Client Name */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  <BusinessIcon sx={{ color: 'text.secondary', mt: 0.5 }} />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                      {client.name}
                    </Typography>
                    {client.akas && client.akas.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        AKA: {client.akas.slice(0, 2).join(', ')}
                        {client.akas.length > 2 && ` +${client.akas.length - 2} more`}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* Stats */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* Active Cases Badge */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <GavelIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="body2">Active Cases:</Typography>
                    <Chip
                      label={client.activeCaseCount}
                      size="small"
                      color={client.criticalCount > 0 ? 'error' : client.activeCaseCount > 0 ? 'primary' : 'default'}
                      sx={{ fontWeight: 600 }}
                    />
                    {client.criticalCount > 0 && (
                      <Chip
                        icon={<WarningIcon sx={{ fontSize: 14 }} />}
                        label={`${client.criticalCount} CRITICAL`}
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>

                  {/* Total Open Balance */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AttachMoneyIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="body2">Open Balance:</Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: client.totalOpenBalance > 0 ? 'error.main' : 'success.main',
                      }}
                    >
                      ${client.totalOpenBalance.toLocaleString()}
                    </Typography>
                  </Box>

                  {/* Total Cases */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <HistoryIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Total History: {client.totalCases} cases
                    </Typography>
                  </Box>
                </Box>
              </CardContent>

              <CardActions sx={{ px: 2, pb: 2 }}>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<HistoryIcon />}
                  onClick={() => navigate(`/clients/${client.id}`)}
                >
                  View History
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Empty State */}
      {sortedClients.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <BusinessIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {searchTerm ? 'No clients match your search' : 'No clients found'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {searchTerm ? 'Try a different search term' : 'Add clients via Manage Clients'}
          </Typography>
        </Box>
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
