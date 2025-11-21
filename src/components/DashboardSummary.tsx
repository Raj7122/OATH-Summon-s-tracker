/**
 * Dashboard Summary Widgets Component
 *
 * Implements FR-10: Dashboard Summary Widgets from TRD v1.5
 * Provides "Green Light" visualizations for critical deadlines and client activity.
 *
 * Features:
 * - Critical Deadlines Card: Shows hearings ≤ 3 days (red accent)
 * - Approaching Deadlines Card: Shows hearings 4-7 days (yellow accent)
 * - Top 5 Clients Bar Chart: Horizontal chart of most active clients
 *
 * Layout:
 * - Desktop: 30% left (deadline cards) + 70% right (bar chart)
 * - Mobile: Stacked vertically
 *
 * @module components/DashboardSummary
 * @see TRD.md FR-10 for specifications
 */

import { useMemo } from 'react';
import { Box, Card, CardContent, Typography, Grid, useTheme, useMediaQuery, Chip } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventIcon from '@mui/icons-material/Event';

/**
 * Summons data interface
 * Represents a single NYC OATH summons record with all API and OCR fields
 *
 * @interface Summons
 */
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
  updatedAt?: string;
}

/**
 * Props for DashboardSummary component
 *
 * @interface DashboardSummaryProps
 * @property {Summons[]} summonses - Array of summons records to analyze
 * @property {string | null} activeFilter - Currently active filter ('critical' | 'approaching' | null)
 * @property {Function} onFilterClick - Callback when a deadline card is clicked
 */
interface DashboardSummaryProps {
  summonses: Summons[];
  activeFilter: 'critical' | 'approaching' | null;
  onFilterClick: (filter: 'critical' | 'approaching') => void;
}

/**
 * Dashboard Summary Component
 *
 * Renders three summary widgets that provide at-a-glance metrics for case management:
 * 1. Critical Deadlines Card - Hearings within 3 days (red theme)
 * 2. Approaching Deadlines Card - Hearings in 4-7 days (yellow theme)
 * 3. Top Clients Bar Chart - Top 5 clients by active summons count
 *
 * All calculations are performed client-side using useMemo for performance.
 * No additional API calls are made - data is derived from the summonses prop.
 *
 * @param {DashboardSummaryProps} props - Component props
 * @returns {JSX.Element} Rendered dashboard summary section
 *
 * @example
 * ```tsx
 * <DashboardSummary summonses={allSummonses} />
 * ```
 */
const DashboardSummary: React.FC<DashboardSummaryProps> = ({ summonses, activeFilter, onFilterClick }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  /**
   * Calculate Critical Deadlines (hearings ≤ 7 days from now)
   *
   * Filters summonses to find those with hearing dates within the next 7 days.
   * Used to populate the red "Critical Deadlines" card.
   * Updated in TRD v1.8 based on client feedback (changed from 3 days to 7 days).
   *
   * @returns {Summons[]} Array of summonses with imminent hearing dates
   */
  const criticalDeadlines = useMemo(() => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return summonses.filter((summons) => {
      if (!summons.hearing_date) return false;
      const hearingDate = new Date(summons.hearing_date);
      return hearingDate >= now && hearingDate <= sevenDaysFromNow;
    });
  }, [summonses]);

  /**
   * Calculate Approaching Deadlines (hearings in 8-21 days from now)
   *
   * Filters summonses to find those with hearing dates between 8 and 21 days from now.
   * Used to populate the yellow "Approaching Deadlines" card.
   * Updated in TRD v1.8 based on client feedback (changed from 4-7 days to 8-21 days).
   *
   * @returns {Summons[]} Array of summonses with upcoming hearing dates in the 8-21 day range
   */
  const approachingDeadlines = useMemo(() => {
    const now = new Date();
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    const twentyOneDaysFromNow = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

    return summonses.filter((summons) => {
      if (!summons.hearing_date) return false;
      const hearingDate = new Date(summons.hearing_date);
      return hearingDate >= eightDaysFromNow && hearingDate <= twentyOneDaysFromNow;
    });
  }, [summonses]);

  /**
   * Calculate Top 5 Clients by Active Summons Count
   *
   * Aggregates summonses by client name (respondent_name), counts the total for each client,
   * sorts by count in descending order, and returns the top 5 clients.
   * Used to populate the horizontal bar chart on the right side of the dashboard.
   *
   * @returns {Object} Object containing labels (client names) and data (summons counts)
   * @returns {string[]} returns.labels - Array of top 5 client names
   * @returns {number[]} returns.data - Array of corresponding summons counts
   */
  const topClients = useMemo(() => {
    const clientCounts = new Map<string, number>();

    summonses.forEach((summons) => {
      const clientName = summons.respondent_name || 'Unknown';
      clientCounts.set(clientName, (clientCounts.get(clientName) || 0) + 1);
    });

    const sortedClients = Array.from(clientCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      labels: sortedClients.map(([name]) => name),
      data: sortedClients.map(([, count]) => count),
    };
  }, [summonses]);

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={3}>
        {/* Left Side: Deadline Cards (30% width on desktop) */}
        <Grid item xs={12} md={4}>
          <Grid container spacing={2}>
            {/* Critical Deadlines Card (Red Accent) - Clickable Quick Filter */}
            <Grid item xs={12}>
              <Card
                onClick={() => onFilterClick('critical')}
                sx={{
                  borderLeft: 6,
                  borderColor: 'error.main',
                  boxShadow: activeFilter === 'critical' ? 6 : 3,
                  backgroundColor: activeFilter === 'critical' ? theme.palette.action.selected : 'background.paper',
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: 8,
                    transform: 'translateY(-2px)',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <WarningAmberIcon sx={{ color: 'error.main', mr: 1, fontSize: 28 }} />
                    <Typography variant="h6" component="div" color="error.main">
                      Critical Deadlines
                    </Typography>
                  </Box>
                  <Typography variant="h3" component="div" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                    {criticalDeadlines.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Hearings within 7 days
                  </Typography>
                  {criticalDeadlines.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      {criticalDeadlines.slice(0, 3).map((summons) => (
                        <Chip
                          key={summons.id}
                          label={`${summons.respondent_name} - ${new Date(summons.hearing_date).toLocaleDateString()}`}
                          size="small"
                          color="error"
                          sx={{ mt: 0.5, mr: 0.5 }}
                        />
                      ))}
                      {criticalDeadlines.length > 3 && (
                        <Typography variant="caption" color="text.secondary">
                          +{criticalDeadlines.length - 3} more
                        </Typography>
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Approaching Deadlines Card (Yellow Accent) - Clickable Quick Filter */}
            <Grid item xs={12}>
              <Card
                onClick={() => onFilterClick('approaching')}
                sx={{
                  borderLeft: 6,
                  borderColor: 'warning.main',
                  boxShadow: activeFilter === 'approaching' ? 6 : 3,
                  backgroundColor: activeFilter === 'approaching' ? theme.palette.action.selected : 'background.paper',
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: 8,
                    transform: 'translateY(-2px)',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <EventIcon sx={{ color: 'warning.main', mr: 1, fontSize: 28 }} />
                    <Typography variant="h6" component="div" color="warning.main">
                      Approaching Deadlines
                    </Typography>
                  </Box>
                  <Typography variant="h3" component="div" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                    {approachingDeadlines.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Hearings in 8-21 days
                  </Typography>
                  {approachingDeadlines.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      {approachingDeadlines.slice(0, 3).map((summons) => (
                        <Chip
                          key={summons.id}
                          label={`${summons.respondent_name} - ${new Date(summons.hearing_date).toLocaleDateString()}`}
                          size="small"
                          color="warning"
                          sx={{ mt: 0.5, mr: 0.5 }}
                        />
                      ))}
                      {approachingDeadlines.length > 3 && (
                        <Typography variant="caption" color="text.secondary">
                          +{approachingDeadlines.length - 3} more
                        </Typography>
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Right Side: Top Clients Bar Chart (70% width on desktop) */}
        <Grid item xs={12} md={8}>
          <Card sx={{ boxShadow: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="h6" component="div" gutterBottom>
                Top 5 Clients by Active Summons
              </Typography>
              {topClients.data.length > 0 ? (
                <Box sx={{ height: isMobile ? 300 : 380, mt: 2 }}>
                  <BarChart
                    layout="horizontal"
                    yAxis={[
                      {
                        scaleType: 'band',
                        data: topClients.labels,
                        categoryGapRatio: 0.3,
                        barGapRatio: 0.1,
                      },
                    ]}
                    series={[
                      {
                        data: topClients.data,
                        label: 'Active Summons',
                        color: theme.palette.primary.main,
                      },
                    ]}
                    height={isMobile ? 300 : 380}
                    margin={{ left: 150, right: 20, top: 20, bottom: 40 }}
                    slotProps={{
                      legend: {
                        position: { vertical: 'bottom', horizontal: 'middle' },
                        padding: 0,
                      },
                    }}
                  />
                </Box>
              ) : (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    No active summons data available
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardSummary;
