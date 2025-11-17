import { useState } from 'react';
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridToolbar,
} from '@mui/x-data-grid';
import {
  Checkbox,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Chip,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

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
}

interface SummonsTableProps {
  summonses: Summons[];
  onUpdate: () => void;
}

const SummonsTable: React.FC<SummonsTableProps> = ({ summonses, onUpdate }) => {
  const [notesDialog, setNotesDialog] = useState<{ open: boolean; summons: Summons | null }>({
    open: false,
    summons: null,
  });
  const [notesValue, setNotesValue] = useState('');

  const handleCheckboxChange = async (id: string, field: keyof Summons, value: boolean) => {
    try {
      // TODO: Update via Amplify DataStore
      // await DataStore.save(Summons.copyOf(summons, updated => {
      //   updated[field] = value;
      // }));
      console.log('Updating summons:', id, field, value);
      onUpdate();
    } catch (error) {
      console.error('Error updating summons:', error);
    }
  };

  const handleDateChange = async (id: string, field: keyof Summons, date: Date | null) => {
    try {
      // TODO: Update via Amplify DataStore
      console.log('Updating summons date:', id, field, date);
      onUpdate();
    } catch (error) {
      console.error('Error updating summons date:', error);
    }
  };

  const handleNotesOpen = (summons: Summons) => {
    setNotesValue(summons.notes || '');
    setNotesDialog({ open: true, summons });
  };

  const handleNotesSave = async () => {
    if (notesDialog.summons) {
      try {
        // TODO: Update via Amplify DataStore
        console.log('Updating notes:', notesDialog.summons.id, notesValue);
        setNotesDialog({ open: false, summons: null });
        onUpdate();
      } catch (error) {
        console.error('Error updating notes:', error);
      }
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'respondent_name',
      headerName: 'Client',
      width: 200,
      renderCell: (params) => (
        <Box
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          onClick={() => handleNotesOpen(params.row)}
        >
          {params.value}
        </Box>
      ),
    },
    { field: 'summons_number', headerName: 'Summons #', width: 130 },
    {
      field: 'hearing_date',
      headerName: 'Hearing Date',
      width: 120,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleDateString() : ''),
    },
    { field: 'status', headerName: 'Status', width: 120 },
    { field: 'license_plate', headerName: 'License Plate', width: 120 },
    { field: 'license_plate_ocr', headerName: 'LP (OCR)', width: 100 },
    {
      field: 'violation_date',
      headerName: 'Violation Date',
      width: 120,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleDateString() : ''),
    },
    {
      field: 'video_created_date',
      headerName: 'Video Created',
      width: 120,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleDateString() : ''),
    },
    { field: 'lag_days', headerName: 'Lag (Days)', width: 90 },
    {
      field: 'base_fine',
      headerName: 'Base Fine',
      width: 100,
      valueFormatter: (value: number) => (value ? `$${value.toFixed(2)}` : ''),
    },
    {
      field: 'amount_due',
      headerName: 'Amount Due',
      width: 110,
      valueFormatter: (value: number) => (value ? `$${value.toFixed(2)}` : ''),
    },
    {
      field: 'summons_pdf_link',
      headerName: 'PDF',
      width: 80,
      renderCell: (params: GridRenderCellParams) => (
        <Link href={params.value} target="_blank" rel="noopener">
          View
        </Link>
      ),
    },
    {
      field: 'video_link',
      headerName: 'Video',
      width: 80,
      renderCell: (params: GridRenderCellParams) => (
        <Link href={params.value} target="_blank" rel="noopener">
          View
        </Link>
      ),
    },
    {
      field: 'evidence_reviewed',
      headerName: 'Reviewed',
      width: 90,
      renderCell: (params: GridRenderCellParams) => (
        <Checkbox
          checked={params.value}
          onChange={(e) =>
            handleCheckboxChange(params.row.id, 'evidence_reviewed', e.target.checked)
          }
        />
      ),
    },
    {
      field: 'evidence_requested',
      headerName: 'Requested',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Checkbox
          checked={params.value}
          onChange={(e) =>
            handleCheckboxChange(params.row.id, 'evidence_requested', e.target.checked)
          }
        />
      ),
    },
    {
      field: 'evidence_requested_date',
      headerName: 'Request Date',
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            value={params.value ? new Date(params.value) : null}
            onChange={(date) => handleDateChange(params.row.id, 'evidence_requested_date', date)}
            slotProps={{
              textField: { size: 'small', fullWidth: true },
            }}
          />
        </LocalizationProvider>
      ),
    },
    {
      field: 'evidence_received',
      headerName: 'Received',
      width: 90,
      renderCell: (params: GridRenderCellParams) => (
        <Checkbox
          checked={params.value}
          onChange={(e) =>
            handleCheckboxChange(params.row.id, 'evidence_received', e.target.checked)
          }
        />
      ),
    },
    {
      field: 'added_to_calendar',
      headerName: 'Calendar',
      width: 90,
      renderCell: (params: GridRenderCellParams) => (
        <Checkbox
          checked={params.value}
          onChange={(e) =>
            handleCheckboxChange(params.row.id, 'added_to_calendar', e.target.checked)
          }
        />
      ),
    },
    {
      field: 'critical_flags_ocr',
      headerName: 'Flags',
      width: 150,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {params.value?.map((flag: string, index: number) => (
            <Chip key={index} label={flag} size="small" color="warning" />
          ))}
        </Box>
      ),
    },
  ];

  return (
    <>
      <DataGrid
        rows={summonses}
        columns={columns}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: {
            paginationModel: { pageSize: 25 },
          },
        }}
        slots={{ toolbar: GridToolbar }}
        slotProps={{
          toolbar: {
            showQuickFilter: true,
            csvOptions: {
              fileName: `oath-summonses-${new Date().toISOString().split('T')[0]}`,
            },
          },
        }}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          '& .MuiDataGrid-cell': {
            padding: '8px',
          },
        }}
      />

      {/* Notes Dialog */}
      <Dialog
        open={notesDialog.open}
        onClose={() => setNotesDialog({ open: false, summons: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Notes for Summons #{notesDialog.summons?.summons_number}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={8}
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            placeholder="Add internal notes about this summons..."
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotesDialog({ open: false, summons: null })}>
            Cancel
          </Button>
          <Button onClick={handleNotesSave} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SummonsTable;
