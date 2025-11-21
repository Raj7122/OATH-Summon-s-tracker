import { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { generateClient } from 'aws-amplify/api';
import { listSummons } from '../graphql/queries';
import SummonsTable from '../components/SummonsTable';
import DashboardSummary from '../components/DashboardSummary';

const client = generateClient();

// TODO: Replace with actual Amplify DataStore queries after backend setup
interface Summons {
  id: string;
  clientID: string;
  summons_number: string;
  respondent_name: string;
  hearing_date: string;
  status: string;
  license_plate: string;
  base_fine: number;
  amount_due: number;
  violation_date: string;
  violation_location: string;
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
  dep_id?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

const Dashboard = () => {
  const [summonses, setSummonses] = useState<Summons[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'critical' | 'approaching' | null>(null);

  useEffect(() => {
    loadSummonses();
  }, []);

  const loadSummonses = async () => {
    setLoading(true);
    try {
      const result = await client.graphql({
        query: listSummons,
      });
      console.log('Loaded summonses:', result.data.listSummons.items);
      setSummonses(result.data.listSummons.items as Summons[]);
    } catch (error) {
      console.error('Error loading summonses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadSummonses();
  };

  /**
   * Handle deadline card click - toggle filter on/off
   * @param filter - The filter type ('critical' or 'approaching')
   */
  const handleFilterClick = (filter: 'critical' | 'approaching') => {
    // Toggle: if clicking the same filter, turn it off; otherwise, switch to new filter
    setActiveFilter(activeFilter === filter ? null : filter);
  };

  /**
   * Filter summonses based on active deadline filter
   * TRD v1.8: Updated thresholds based on client feedback
   * @returns Filtered array of summonses
   */
  const getFilteredSummonses = (): Summons[] => {
    if (!activeFilter) return summonses;

    const now = new Date();

    if (activeFilter === 'critical') {
      // Hearings within 7 days (updated from 3 days in TRD v1.8)
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return summonses.filter((summons) => {
        if (!summons.hearing_date) return false;
        const hearingDate = new Date(summons.hearing_date);
        return hearingDate >= now && hearingDate <= sevenDaysFromNow;
      });
    }

    if (activeFilter === 'approaching') {
      // Hearings in 8-21 days (updated from 4-7 days in TRD v1.8)
      const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
      const twentyOneDaysFromNow = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
      return summonses.filter((summons) => {
        if (!summons.hearing_date) return false;
        const hearingDate = new Date(summons.hearing_date);
        return hearingDate >= eightDaysFromNow && hearingDate <= twentyOneDaysFromNow;
      });
    }

    return summonses;
  };

  const filteredSummonses = getFilteredSummonses();

  return (
    <Box>
      {/* Header Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Dashboard</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
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
            {activeFilter && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Showing {filteredSummonses.length} {activeFilter === 'critical' ? 'critical' : 'approaching'} deadline
                  {filteredSummonses.length !== 1 ? 's' : ''}. Click the card again to view all summonses.
                </Typography>
              </Box>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
};

export default Dashboard;
