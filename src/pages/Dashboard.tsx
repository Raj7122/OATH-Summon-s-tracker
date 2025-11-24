import { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, CircularProgress, Chip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListOffIcon from '@mui/icons-material/FilterListOff';
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
  // Change Tracking (for UPDATED badge transparency)
  last_change_summary?: string;
  last_change_at?: string;
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

const Dashboard = () => {
  const [summonses, setSummonses] = useState<Summons[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'critical' | 'approaching' | 'hearing_complete' | 'evidence_pending' | null>(null);

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
  };

  /**
   * Filter summonses based on active deadline filter
   * TRD v1.8: Updated to use business day logic and added hearing_complete filter
   * @returns Filtered array of summonses
   */
  const getFilteredSummonses = (): Summons[] => {
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {activeFilter && (
            <Button
              variant="outlined"
              startIcon={<FilterListOffIcon />}
              onClick={() => setActiveFilter(null)}
              color="secondary"
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
            {activeFilter && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Showing {filteredSummonses.length}{' '}
                  {activeFilter === 'critical' ? 'critical deadline' :
                   activeFilter === 'approaching' ? 'approaching deadline' :
                   activeFilter === 'hearing_complete' ? 'hearing complete' :
                   'evidence pending'}
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
