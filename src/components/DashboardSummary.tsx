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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import AttachFileIcon from '@mui/icons-material/AttachFile';

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
  updatedAt?: string;
  // File attachments
  attachments?: string | unknown[];
}

/**
 * Props for DashboardSummary component
 *
 * @interface DashboardSummaryProps
 * @property {Summons[]} summonses - Array of summons records to analyze
 * @property {string | null} activeFilter - Currently active filter ('critical' | 'approaching' | 'hearing_complete' | 'evidence_pending' | null)
 * @property {Function} onFilterClick - Callback when a deadline card is clicked
 */
interface DashboardSummaryProps {
  summonses: Summons[];
  activeFilter: 'critical' | 'approaching' | 'hearing_complete' | 'evidence_pending' | 'has_evidence' | null;
  onFilterClick: (filter: 'critical' | 'approaching' | 'hearing_complete' | 'evidence_pending' | 'has_evidence') => void;
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
   * Calculate Critical Deadlines (hearings ≤ 7 business days from now)
   *
   * Filters summonses to find those with hearing dates within the next 7 business days.
   * Used to populate the red "Critical Deadlines" card.
   * Updated in TRD v1.8: Changed to business day calculation (excludes weekends).
   *
   * @returns {Summons[]} Array of summonses with imminent hearing dates
   */
  const criticalDeadlines = useMemo(() => {
    const now = new Date();

    return summonses.filter((summons) => {
      if (!summons.hearing_date) return false;
      const hearingDate = new Date(summons.hearing_date);
      if (hearingDate < now) return false; // Skip past dates

      const businessDays = getBusinessDays(now, hearingDate);
      return businessDays <= 7;
    });
  }, [summonses]);

  /**
   * Calculate Approaching Deadlines (hearings in 8-21 business days from now)
   *
   * Filters summonses to find those with hearing dates between 8 and 21 business days from now.
   * Used to populate the yellow "Approaching Deadlines" card.
   * Updated in TRD v1.8: Changed to business day calculation (excludes weekends).
   *
   * @returns {Summons[]} Array of summonses with upcoming hearing dates in the 8-21 business day range
   */
  const approachingDeadlines = useMemo(() => {
    const now = new Date();

    return summonses.filter((summons) => {
      if (!summons.hearing_date) return false;
      const hearingDate = new Date(summons.hearing_date);
      if (hearingDate < now) return false; // Skip past dates

      const businessDays = getBusinessDays(now, hearingDate);
      return businessDays >= 8 && businessDays <= 21;
    });
  }, [summonses]);

  /**
   * Calculate Hearing Complete Count (summonses marked as "Hearing Complete")
   *
   * Filters summonses to find those with internal_status set to "Hearing Complete".
   * Used to populate the green "Hearing Complete" card.
   * TRD v1.8: Client Feedback - Track progress on completed hearings.
   *
   * @returns {Summons[]} Array of summonses marked as hearing complete
   */
  const hearingComplete = useMemo(() => {
    return summonses.filter((summons) => {
      return summons.internal_status === 'Hearing Complete';
    });
  }, [summonses]);

  /**
   * Calculate Evidence Pending Count (evidence requested but not yet received)
   *
   * Filters summonses to find those where evidence_requested is true but evidence_received is false.
   * Used to populate the "Evidence Pending" card (4th card).
   * TRD v1.9: Arthur needs to track evidence fulfillment as a critical workflow metric.
   *
   * @returns {Summons[]} Array of summonses with pending evidence requests
   */
  const evidencePending = useMemo(() => {
    return summonses.filter((summons) => {
      return summons.evidence_requested === true && summons.evidence_received === false;
    });
  }, [summonses]);

  /**
   * Calculate Summonses with Evidence (file attachments)
   *
   * Filters summonses that have at least one file attachment uploaded.
   * Sorted by hearing date (soonest first) to prioritize upcoming hearings.
   * Used to populate the "Has Evidence" card.
   *
   * @returns {Summons[]} Array of summonses with file attachments, sorted by hearing date
   */
  const hasEvidence = useMemo(() => {
    const filtered = summonses.filter((summons) => {
      if (!summons.attachments) return false;
      let parsed: unknown[] = [];
      if (typeof summons.attachments === 'string') {
        try {
          parsed = JSON.parse(summons.attachments);
        } catch {
          return false;
        }
      } else if (Array.isArray(summons.attachments)) {
        parsed = summons.attachments;
      }
      return parsed.length > 0;
    });
    // Sort by hearing date (soonest first)
    filtered.sort((a, b) => {
      if (!a.hearing_date) return 1;
      if (!b.hearing_date) return -1;
      return new Date(a.hearing_date).getTime() - new Date(b.hearing_date).getTime();
    });
    return filtered;
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
        {/* Critical Deadlines Card (Red Accent) - Clickable Quick Filter */}
        <Grid item xs={12} sm={6} md={3}>
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
                    Hearings within 7 business days
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
        <Grid item xs={12} sm={6} md={3}>
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
                    Hearings in 8-21 business days
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

        {/* Evidence Pending Card (Blue/Info Accent) - Clickable Quick Filter */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            onClick={() => onFilterClick('evidence_pending')}
            sx={{
              borderLeft: 6,
              borderColor: 'info.main',
              boxShadow: activeFilter === 'evidence_pending' ? 6 : 3,
              backgroundColor: activeFilter === 'evidence_pending' ? theme.palette.action.selected : 'background.paper',
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
                <HourglassEmptyIcon sx={{ color: 'info.main', mr: 1, fontSize: 28 }} />
                <Typography variant="h6" component="div" color="info.main">
                  Evidence Pending
                </Typography>
              </Box>
              <Typography variant="h3" component="div" sx={{ fontWeight: 'bold', color: 'info.main' }}>
                {evidencePending.length}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Requested but not yet received
              </Typography>
              {evidencePending.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  {evidencePending.slice(0, 3).map((summons) => (
                    <Chip
                      key={summons.id}
                      label={`${summons.respondent_name} - ${summons.summons_number}`}
                      size="small"
                      color="info"
                      sx={{ mt: 0.5, mr: 0.5 }}
                    />
                  ))}
                  {evidencePending.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      +{evidencePending.length - 3} more
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Hearing Complete Card (Green Accent) - Clickable Quick Filter */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            onClick={() => onFilterClick('hearing_complete')}
            sx={{
              borderLeft: 6,
              borderColor: 'success.main',
              boxShadow: activeFilter === 'hearing_complete' ? 6 : 3,
              backgroundColor: activeFilter === 'hearing_complete' ? theme.palette.action.selected : 'background.paper',
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
                <CheckCircleIcon sx={{ color: 'success.main', mr: 1, fontSize: 28 }} />
                <Typography variant="h6" component="div" color="success.main">
                  Hearing Complete
                </Typography>
              </Box>
              <Typography variant="h3" component="div" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                {hearingComplete.length}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Completed hearings tracked
              </Typography>
              {hearingComplete.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  {hearingComplete.slice(0, 3).map((summons) => (
                    <Chip
                      key={summons.id}
                      label={`${summons.respondent_name} - ${summons.summons_number}`}
                      size="small"
                      color="success"
                      sx={{ mt: 0.5, mr: 0.5 }}
                    />
                  ))}
                  {hearingComplete.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      +{hearingComplete.length - 3} more
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Has Evidence Card (Purple Accent) - Clickable Quick Filter */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            onClick={() => onFilterClick('has_evidence')}
            sx={{
              borderLeft: 6,
              borderColor: 'secondary.main',
              boxShadow: activeFilter === 'has_evidence' ? 6 : 3,
              backgroundColor: activeFilter === 'has_evidence' ? theme.palette.action.selected : 'background.paper',
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
                <AttachFileIcon sx={{ color: 'secondary.main', mr: 1, fontSize: 28, transform: 'rotate(45deg)' }} />
                <Typography variant="h6" component="div" color="secondary.main">
                  Has Evidence
                </Typography>
              </Box>
              <Typography variant="h3" component="div" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                {hasEvidence.length}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Summonses with file attachments
              </Typography>
              {hasEvidence.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  {hasEvidence.slice(0, 3).map((summons) => (
                    <Chip
                      key={summons.id}
                      label={`${summons.respondent_name} - ${summons.hearing_date ? new Date(summons.hearing_date).toLocaleDateString() : 'No date'}`}
                      size="small"
                      color="secondary"
                      sx={{ mt: 0.5, mr: 0.5 }}
                    />
                  ))}
                  {hasEvidence.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      +{hasEvidence.length - 3} more
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Bottom Row: Top Clients Bar Chart (Full width, compact) */}
        <Grid item xs={12}>
          <Card sx={{ boxShadow: 3 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle1" component="div" gutterBottom sx={{ fontWeight: 600 }}>
                Top 5 Clients by Active Summons
              </Typography>
              {topClients.data.length > 0 ? (
                <Box sx={{ height: isMobile ? 180 : 210 }}>
                  <BarChart
                    layout="horizontal"
                    yAxis={[
                      {
                        scaleType: 'band',
                        data: topClients.labels,
                      },
                    ]}
                    series={[
                      {
                        data: topClients.data,
                        label: 'Active Summons',
                        color: theme.palette.primary.main,
                      },
                    ]}
                    height={isMobile ? 180 : 210}
                    margin={{ left: 140, right: 20, top: 10, bottom: 50 }}
                    slotProps={{
                      legend: {
                        position: { vertical: 'bottom', horizontal: 'middle' },
                        padding: 0,
                        itemMarkHeight: 8,
                        itemMarkWidth: 8,
                        labelStyle: { fontSize: 11 },
                      },
                    }}
                  />
                </Box>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
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
