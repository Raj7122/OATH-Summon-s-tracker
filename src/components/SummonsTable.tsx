import { useState, useEffect } from 'react';
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridToolbar,
  GridRowParams,
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
  Typography,
  Drawer,
  Switch,
  FormControlLabel,
  Collapse,
  IconButton,
  useTheme,
  useMediaQuery,
  Badge,
  Snackbar,
  Alert,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

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
  updatedAt?: string; // For "new" indicator
}

interface SummonsTableProps {
  summonses: Summons[];
  onUpdate: () => void;
}

const SummonsTable: React.FC<SummonsTableProps> = ({ summonses, onUpdate }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [notesDialog, setNotesDialog] = useState<{ open: boolean; summons: Summons | null }>({
    open: false,
    summons: null,
  });
  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Mobile drawer for evidence tracking
  const [mobileDrawer, setMobileDrawer] = useState<{ open: boolean; summons: Summons | null }>({
    open: false,
    summons: null,
  });

  // Expanded rows for master-detail
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Auto-save notes with debounce
  useEffect(() => {
    if (notesValue && notesDialog.summons && notesValue !== notesDialog.summons.notes) {
      const timer = setTimeout(() => {
        handleNotesAutoSave();
      }, 1000); // Auto-save after 1 second of no typing
      return () => clearTimeout(timer);
    }
  }, [notesValue]);

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
    setNotesSaved(false);
  };

  const handleNotesAutoSave = async () => {
    if (notesDialog.summons) {
      setNotesSaving(true);
      try {
        // TODO: Update via Amplify DataStore
        console.log('Auto-saving notes:', notesDialog.summons.id, notesValue);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
      } catch (error) {
        console.error('Error auto-saving notes:', error);
      } finally {
        setNotesSaving(false);
      }
    }
  };

  const handleNotesSave = async () => {
    if (notesDialog.summons) {
      try {
        // TODO: Update via Amplify DataStore
        console.log('Saving notes:', notesDialog.summons.id, notesValue);
        setNotesDialog({ open: false, summons: null });
        onUpdate();
      } catch (error) {
        console.error('Error updating notes:', error);
      }
    }
  };

  const handleMobileDrawerOpen = (summons: Summons) => {
    setMobileDrawer({ open: true, summons });
  };

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Check if a summons is "new" (updated in last 24 hours)
  const isNewSummons = (summons: Summons): boolean => {
    if (!summons.updatedAt) return false;
    const updatedDate = new Date(summons.updatedAt);
    const now = new Date();
    const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);
    return diffHours < 24;
  };

  // Get color for Status chip
  const getStatusColor = (status: string): 'error' | 'info' | 'success' | 'default' => {
    const statusUpper = status?.toUpperCase() || '';
    if (statusUpper.includes('DEFAULT') || statusUpper.includes('JUDGMENT')) return 'error';
    if (statusUpper.includes('DISMISS') || statusUpper.includes('CLOSED')) return 'success';
    if (statusUpper.includes('SCHEDULED') || statusUpper.includes('HEARING')) return 'info';
    return 'default';
  };

  // Render Status with color-coded Chip (UX Improvement #1)
  const renderStatusCell = (params: GridRenderCellParams) => {
    const status = params.value || 'Unknown';
    return (
      <Chip
        label={status}
        color={getStatusColor(status)}
        size="small"
        sx={{ fontWeight: 'bold' }}
      />
    );
  };

  // Render Lag Days with conditional formatting (UX Improvement #2)
  const renderLagDaysCell = (params: GridRenderCellParams) => {
    const lagDays = params.value;
    if (lagDays === null || lagDays === undefined) return '—';

    const isOverThreshold = lagDays > 60; // Legal timeliness threshold

    return (
      <Typography
        sx={{
          color: isOverThreshold ? 'error.main' : 'text.primary',
          fontWeight: isOverThreshold ? 'bold' : 'normal',
          fontSize: isOverThreshold ? '1.1rem' : 'inherit',
        }}
      >
        {lagDays}
      </Typography>
    );
  };

  // Render "New" badge for recently updated rows (UX Improvement #6)
  const renderClientCell = (params: GridRenderCellParams) => {
    const isNew = isNewSummons(params.row);

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isNew && (
          <Badge
            badgeContent={<FiberNewIcon sx={{ fontSize: 16 }} />}
            color="error"
          />
        )}
        <Box
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          onClick={() => isMobile ? handleMobileDrawerOpen(params.row) : handleNotesOpen(params.row)}
        >
          {params.value}
        </Box>
      </Box>
    );
  };

  // Master-Detail: Expandable row button
  const renderExpandButton = (params: GridRenderCellParams) => {
    const isExpanded = expandedRows.has(params.row.id);
    return (
      <IconButton
        size="small"
        onClick={() => toggleRowExpansion(params.row.id)}
        aria-label="expand row"
      >
        {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
      </IconButton>
    );
  };

  // Define columns - "Actionable 7" visible by default (UX Improvement #3)
  const columns: GridColDef[] = [
    {
      field: 'expand',
      headerName: '',
      width: 50,
      sortable: false,
      filterable: false,
      renderCell: renderExpandButton,
    },
    {
      field: 'respondent_name',
      headerName: 'Client',
      width: 200,
      renderCell: renderClientCell,
    },
    { field: 'summons_number', headerName: 'Summons #', width: 130 },
    {
      field: 'hearing_date',
      headerName: 'Hearing Date',
      width: 130,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleDateString() : ''),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 180,
      renderCell: renderStatusCell,
    },
    {
      field: 'amount_due',
      headerName: 'Amount Due',
      width: 120,
      valueFormatter: (value: number) => (value ? `$${value.toFixed(2)}` : ''),
    },
    {
      field: 'lag_days',
      headerName: 'Lag (Days)',
      width: 110,
      renderCell: renderLagDaysCell,
    },
    // Evidence checkboxes - Hidden on mobile (UX Improvement #4)
    {
      field: 'evidence_reviewed',
      headerName: 'Reviewed',
      width: 90,
      hide: isMobile,
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
      field: 'added_to_calendar',
      headerName: 'Calendar',
      width: 90,
      hide: isMobile,
      renderCell: (params: GridRenderCellParams) => (
        <Checkbox
          checked={params.value}
          onChange={(e) =>
            handleCheckboxChange(params.row.id, 'added_to_calendar', e.target.checked)
          }
        />
      ),
    },
    // Secondary columns - Hidden by default (Progressive Disclosure)
    { field: 'license_plate', headerName: 'License Plate', width: 120, hide: true },
    { field: 'license_plate_ocr', headerName: 'LP (OCR)', width: 100, hide: true },
    {
      field: 'violation_date',
      headerName: 'Violation Date',
      width: 120,
      hide: true,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleDateString() : ''),
    },
    {
      field: 'video_created_date',
      headerName: 'Video Created',
      width: 120,
      hide: true,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleDateString() : ''),
    },
    {
      field: 'base_fine',
      headerName: 'Base Fine',
      width: 100,
      hide: true,
      valueFormatter: (value: number) => (value ? `$${value.toFixed(2)}` : ''),
    },
    {
      field: 'summons_pdf_link',
      headerName: 'PDF',
      width: 80,
      hide: true,
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
      hide: true,
      renderCell: (params: GridRenderCellParams) => (
        <Link href={params.value} target="_blank" rel="noopener">
          View
        </Link>
      ),
    },
    {
      field: 'evidence_requested',
      headerName: 'Requested',
      width: 100,
      hide: true,
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
      hide: true,
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
      hide: true,
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
      field: 'critical_flags_ocr',
      headerName: 'Flags',
      width: 150,
      hide: true,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {params.value?.map((flag: string, index: number) => (
            <Chip key={index} label={flag} size="small" color="warning" />
          ))}
        </Box>
      ),
    },
    { field: 'dep_id', headerName: 'DEP ID', width: 100, hide: true },
    { field: 'vehicle_type_ocr', headerName: 'Vehicle Type', width: 120, hide: true },
    { field: 'prior_offense_status', headerName: 'Prior Offense', width: 120, hide: true },
    { field: 'idling_duration_ocr', headerName: 'Idling Duration', width: 130, hide: true },
    { field: 'name_on_summons_ocr', headerName: 'Name (OCR)', width: 150, hide: true },
  ];

  // Master-Detail: Expandable row details (UX Improvement #3)
  const renderDetailPanel = (params: GridRowParams) => {
    const summons = params.row as Summons;
    const isExpanded = expandedRows.has(summons.id);

    if (!isExpanded) return null;

    return (
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box sx={{ p: 3, bgcolor: 'grey.50', borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom>
            Additional Details
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
            {/* Violation Information */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Violation Info</Typography>
              <Typography variant="body2">Date: {summons.violation_date ? new Date(summons.violation_date).toLocaleDateString() : 'N/A'}</Typography>
              <Typography variant="body2">Location: {summons.violation_location || 'N/A'}</Typography>
              <Typography variant="body2">Duration: {summons.idling_duration_ocr || 'N/A'}</Typography>
            </Box>

            {/* Vehicle/License Info */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Vehicle Info</Typography>
              <Typography variant="body2">License: {summons.license_plate || 'N/A'}</Typography>
              <Typography variant="body2">LP (OCR): {summons.license_plate_ocr || 'N/A'}</Typography>
              <Typography variant="body2">Vehicle Type: {summons.vehicle_type_ocr || 'N/A'}</Typography>
              <Typography variant="body2">DEP ID: {summons.dep_id || 'N/A'}</Typography>
            </Box>

            {/* Financial Info */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Financial Info</Typography>
              <Typography variant="body2">Base Fine: ${summons.base_fine?.toFixed(2) || '0.00'}</Typography>
              <Typography variant="body2">Amount Due: ${summons.amount_due?.toFixed(2) || '0.00'}</Typography>
            </Box>

            {/* Documents */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Documents</Typography>
              <Link href={summons.summons_pdf_link} target="_blank" rel="noopener" sx={{ display: 'block', mb: 1 }}>
                View Summons PDF
              </Link>
              <Link href={summons.video_link} target="_blank" rel="noopener" sx={{ display: 'block' }}>
                View Video Evidence
              </Link>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Video Created: {summons.video_created_date ? new Date(summons.video_created_date).toLocaleDateString() : 'N/A'}
              </Typography>
            </Box>
          </Box>

          {/* OCR Narrative */}
          {summons.violation_narrative && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">Violation Narrative (OCR)</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {summons.violation_narrative}
              </Typography>
            </Box>
          )}

          {/* Critical Flags */}
          {summons.critical_flags_ocr && summons.critical_flags_ocr.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Critical Flags</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {summons.critical_flags_ocr.map((flag, index) => (
                  <Chip key={index} label={flag} color="warning" size="small" />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    );
  };

  return (
    <>
      <DataGrid
        rows={summonses}
        columns={columns}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: {
            paginationModel: { pageSize: 50 },
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
          row: {
            style: (params: GridRowParams) => ({
              backgroundColor: isNewSummons(params.row) ? 'rgba(255, 152, 0, 0.08)' : undefined,
            }),
          },
        }}
        getRowHeight={() => 'auto'}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          '& .MuiDataGrid-cell': {
            padding: '12px 8px',
          },
          '& .MuiDataGrid-row:hover': {
            cursor: 'pointer',
          },
        }}
        getDetailPanelContent={renderDetailPanel}
        getDetailPanelHeight={() => 'auto'}
      />

      {/* Notes Dialog with Auto-Save (UX Improvement #7) */}
      <Dialog
        open={notesDialog.open}
        onClose={() => setNotesDialog({ open: false, summons: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Notes for Summons #{notesDialog.summons?.summons_number}</span>
            {notesSaved && (
              <Chip
                icon={<CheckCircleIcon />}
                label="Saved"
                color="success"
                size="small"
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={8}
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            placeholder="Add internal notes about this summons... (auto-saves after 1 second)"
            sx={{ mt: 2 }}
            disabled={notesSaving}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotesDialog({ open: false, summons: null })}>
            Close
          </Button>
          <Button onClick={handleNotesSave} variant="contained">
            Save & Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mobile Bottom Sheet for Evidence Tracking (UX Improvement #4 - Fitts's Law) */}
      <Drawer
        anchor="bottom"
        open={mobileDrawer.open}
        onClose={() => setMobileDrawer({ open: false, summons: null })}
        PaperProps={{
          sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 3 },
        }}
      >
        <Typography variant="h6" gutterBottom>
          {mobileDrawer.summons?.respondent_name}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Summons #{mobileDrawer.summons?.summons_number}
        </Typography>

        <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={mobileDrawer.summons?.evidence_reviewed || false}
                onChange={(e) =>
                  mobileDrawer.summons &&
                  handleCheckboxChange(mobileDrawer.summons.id, 'evidence_reviewed', e.target.checked)
                }
                size="large"
              />
            }
            label="Evidence Reviewed"
          />
          <FormControlLabel
            control={
              <Switch
                checked={mobileDrawer.summons?.added_to_calendar || false}
                onChange={(e) =>
                  mobileDrawer.summons &&
                  handleCheckboxChange(mobileDrawer.summons.id, 'added_to_calendar', e.target.checked)
                }
                size="large"
              />
            }
            label="Added to Calendar"
          />
          <FormControlLabel
            control={
              <Switch
                checked={mobileDrawer.summons?.evidence_requested || false}
                onChange={(e) =>
                  mobileDrawer.summons &&
                  handleCheckboxChange(mobileDrawer.summons.id, 'evidence_requested', e.target.checked)
                }
                size="large"
              />
            }
            label="Evidence Requested"
          />
          <FormControlLabel
            control={
              <Switch
                checked={mobileDrawer.summons?.evidence_received || false}
                onChange={(e) =>
                  mobileDrawer.summons &&
                  handleCheckboxChange(mobileDrawer.summons.id, 'evidence_received', e.target.checked)
                }
                size="large"
              />
            }
            label="Evidence Received"
          />
        </Box>

        <Button
          fullWidth
          variant="contained"
          onClick={() => setMobileDrawer({ open: false, summons: null })}
          sx={{ mt: 3 }}
        >
          Done
        </Button>
      </Drawer>
    </>
  );
};

export default SummonsTable;
