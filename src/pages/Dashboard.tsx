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
  createdAt?: string;
  updatedAt?: string;
}

const Dashboard = () => {
  const [summonses, setSummonses] = useState<Summons[]>([]);
  const [loading, setLoading] = useState(true);

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
          {/* Summary Widgets Section - FR-10 */}
          <DashboardSummary summonses={summonses} />

          {/* DataGrid Section */}
          <Paper sx={{ p: 2 }}>
            <SummonsTable summonses={summonses} onUpdate={loadSummonses} />
          </Paper>
        </>
      )}
    </Box>
  );
};

export default Dashboard;
