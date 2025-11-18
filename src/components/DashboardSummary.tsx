import { useMemo } from 'react';
import { Box, Card, CardContent, Typography, Grid, useTheme, useMediaQuery, Chip } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventIcon from '@mui/icons-material/Event';

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
  updatedAt?: string;
}

interface DashboardSummaryProps {
  summonses: Summons[];
}

const DashboardSummary: React.FC<DashboardSummaryProps> = ({ summonses }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Calculate Critical Deadlines (≤ 3 days)
  const criticalDeadlines = useMemo(() => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    return summonses.filter((summons) => {
      if (!summons.hearing_date) return false;
      const hearingDate = new Date(summons.hearing_date);
      return hearingDate >= now && hearingDate <= threeDaysFromNow;
    });
  }, [summonses]);

  // Calculate Approaching Deadlines (4-7 days)
  const approachingDeadlines = useMemo(() => {
    const now = new Date();
    const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return summonses.filter((summons) => {
      if (!summons.hearing_date) return false;
      const hearingDate = new Date(summons.hearing_date);
      return hearingDate >= fourDaysFromNow && hearingDate <= sevenDaysFromNow;
    });
  }, [summonses]);

  // Calculate Top 5 Clients by active summons count
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
            {/* Critical Deadlines Card (Red Accent) */}
            <Grid item xs={12}>
              <Card
                sx={{
                  borderLeft: 6,
                  borderColor: 'error.main',
                  boxShadow: 3,
                  '&:hover': { boxShadow: 6 },
                  transition: 'box-shadow 0.3s',
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
                    Hearings within 3 days
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

            {/* Approaching Deadlines Card (Yellow Accent) */}
            <Grid item xs={12}>
              <Card
                sx={{
                  borderLeft: 6,
                  borderColor: 'warning.main',
                  boxShadow: 3,
                  '&:hover': { boxShadow: 6 },
                  transition: 'box-shadow 0.3s',
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
                    Hearings in 4-7 days
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
