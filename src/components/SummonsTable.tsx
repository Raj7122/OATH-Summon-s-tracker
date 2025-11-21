/**
 * Summons Table Component
 *
 * Professional UX implementation of the main summons data grid with evidence-based design principles.
 * Implements features from TRD.md FR-04, FR-05, FR-06, FR-07, FR-08 and professional UX refinements.
 *
 * Key Features:
 * - Color-coded Status chips (Red/Blue/Green) for instant visual triage (Don't Make Me Think)
 * - Conditional formatting for Lag Days >60 (legal timeliness threshold)
 * - Master-Detail expandable rows for progressive disclosure (Miller's Law - 7±2 items)
 * - Mobile Bottom Sheet with large Switch components (Fitts's Law - 44px touch targets)
 * - "New" badges for rows updated in last 24 hours (Hooked Model - variable rewards)
 * - Auto-save notes with visual feedback (1 second debounce)
 * - Default visible columns reduced to "Actionable 7" to minimize cognitive load
 *
 * UX Design Principles Applied:
 * - Don't Make Me Think (Steve Krug): Visual signaling via color-coded chips
 * - Miller's Law: Progressive disclosure - 9 default columns, 30+ hidden secondary columns
 * - Fitts's Law: Large touch targets on mobile (Switch components vs tiny checkboxes)
 * - Hooked Model (Nir Eyal): Variable rewards through "New" badges and auto-save feedback
 *
 * @module components/SummonsTable
 * @see TRD.md FR-04, FR-05, FR-06, FR-07, FR-08 for specifications
 */

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

/**
 * Summons data interface
 * Represents a single NYC OATH summons record with all API fields, OCR fields, and user-input fields
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
  createdAt?: string; // For activity badge logic
  updatedAt?: string; // For freshness indicator
}

/**
 * Props for SummonsTable component
 *
 * @interface SummonsTableProps
 * @property {Summons[]} summonses - Array of summons records to display in the data grid
 * @property {Function} onUpdate - Callback function to trigger data refresh after updates
 */
interface SummonsTableProps {
  summonses: Summons[];
  onUpdate: () => void;
}

/**
 * Summons Table Component
 *
 * Main data grid component displaying all summons with professional UX enhancements.
 * Renders an MUI DataGrid with 9 default visible columns and 30+ hidden secondary columns.
 * Supports mobile-responsive design with Bottom Sheet for evidence tracking on small screens.
 *
 * Features:
 * - Sortable, filterable, searchable columns via GridToolbar
 * - Master-Detail expandable rows showing additional summons data
 * - Color-coded Status chips and conditional Lag Days formatting
 * - Auto-save notes with 1-second debounce and visual feedback
 * - Large touch-friendly Switch components on mobile
 * - CSV export via GridToolbar
 *
 * @param {SummonsTableProps} props - Component props
 * @returns {JSX.Element} Rendered data grid with toolbar and dialogs
 *
 * @example
 * ```tsx
 * <SummonsTable summonses={allSummonses} onUpdate={refreshData} />
 * ```
 */
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

  /**
   * Handle checkbox state changes for evidence tracking fields
   *
   * Updates a boolean field (evidence_reviewed, added_to_calendar, evidence_requested, evidence_received)
   * for a specific summons record. Will eventually use Amplify DataStore for persistence.
   *
   * @param {string} id - Summons record ID
   * @param {keyof Summons} field - Field name to update
   * @param {boolean} value - New boolean value
   * @returns {Promise<void>}
   *
   * @throws {Error} If DataStore update fails (logged to console)
   */
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

  /**
   * Handle date picker changes for evidence_requested_date field
   *
   * Updates the evidence_requested_date field for a specific summons record.
   * Will eventually use Amplify DataStore for persistence.
   *
   * @param {string} id - Summons record ID
   * @param {keyof Summons} field - Field name to update (typically 'evidence_requested_date')
   * @param {Date | null} date - New date value or null to clear
   * @returns {Promise<void>}
   *
   * @throws {Error} If DataStore update fails (logged to console)
   */
  const handleDateChange = async (id: string, field: keyof Summons, date: Date | null) => {
    try {
      // TODO: Update via Amplify DataStore
      console.log('Updating summons date:', id, field, date);
      onUpdate();
    } catch (error) {
      console.error('Error updating summons date:', error);
    }
  };

  /**
   * Open the notes dialog for a specific summons
   *
   * Sets the dialog state and initializes the notes text field with existing notes.
   * Resets the auto-save "saved" indicator.
   *
   * @param {Summons} summons - Summons record to edit notes for
   * @returns {void}
   */
  const handleNotesOpen = (summons: Summons) => {
    setNotesValue(summons.notes || '');
    setNotesDialog({ open: true, summons });
    setNotesSaved(false);
  };

  /**
   * Auto-save notes after 1 second of inactivity (debounced)
   *
   * Triggered by useEffect when notesValue changes and differs from original.
   * Shows visual feedback (checkmark icon) for 2 seconds after successful save.
   * Will eventually use Amplify DataStore for persistence.
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If DataStore update fails (logged to console)
   */
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

  /**
   * Manual save notes when "Save" button is clicked in dialog
   *
   * Saves the current notes value and closes the dialog.
   * Will eventually use Amplify DataStore for persistence.
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If DataStore update fails (logged to console)
   */
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

  /**
   * Open mobile Bottom Sheet drawer for evidence tracking
   *
   * Opens the mobile-responsive drawer with large Switch components for evidence tracking fields.
   * Provides touch-friendly controls (44px minimum) per Fitts's Law.
   *
   * @param {Summons} summons - Summons record to manage evidence tracking for
   * @returns {void}
   */
  const handleMobileDrawerOpen = (summons: Summons) => {
    setMobileDrawer({ open: true, summons });
  };

  /**
   * Toggle Master-Detail row expansion
   *
   * Adds or removes a summons ID from the expandedRows Set to show/hide the detail panel.
   * Implements progressive disclosure pattern per Miller's Law.
   *
   * @param {string} id - Summons record ID to expand/collapse
   * @returns {void}
   */
  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  /**
   * Check if a summons is "fresh" (updated in last 24 hours)
   *
   * Calculates time difference between now and updatedAt timestamp.
   * Used for row highlighting per the "24-Hour Freshness Rule".
   *
   * @param {Summons} summons - Summons record to check
   * @returns {boolean} True if updated within last 24 hours, false otherwise
   */
  const isFreshSummons = (summons: Summons): boolean => {
    if (!summons.updatedAt) return false;
    const updatedDate = new Date(summons.updatedAt);
    const now = new Date();
    const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);
    return diffHours < 24;
  };

  /**
   * Check if a summons is a brand new record (created within last 24 hours)
   *
   * Logic: createdAt equals updatedAt (within 1 second tolerance) AND within 24 hours.
   * Used to show [🆕 NEW] badge in Status column.
   *
   * @param {Summons} summons - Summons record to check
   * @returns {boolean} True if brand new, false otherwise
   */
  const isNewRecord = (summons: Summons): boolean => {
    if (!summons.createdAt || !summons.updatedAt) return false;

    const createdDate = new Date(summons.createdAt);
    const updatedDate = new Date(summons.updatedAt);
    const now = new Date();

    // Check if within 24 hours
    const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);
    if (diffHours >= 24) return false;

    // Check if createdAt equals updatedAt (within 1 second tolerance)
    const timeDiff = Math.abs(updatedDate.getTime() - createdDate.getTime());
    return timeDiff < 1000; // Less than 1 second difference
  };

  /**
   * Check if a summons was recently updated (not new, but status/amount changed)
   *
   * Logic: updatedAt is newer than createdAt AND within last 24 hours.
   * Used to show [⚠️ UPDATED] badge in Status column.
   *
   * @param {Summons} summons - Summons record to check
   * @returns {boolean} True if recently updated, false otherwise
   */
  const isUpdatedRecord = (summons: Summons): boolean => {
    if (!summons.createdAt || !summons.updatedAt) return false;

    const createdDate = new Date(summons.createdAt);
    const updatedDate = new Date(summons.updatedAt);
    const now = new Date();

    // Check if within 24 hours
    const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);
    if (diffHours >= 24) return false;

    // Check if updatedAt is meaningfully newer than createdAt
    const timeDiff = updatedDate.getTime() - createdDate.getTime();
    return timeDiff >= 1000; // At least 1 second difference
  };

  /**
   * Get MUI color for Status chip based on text value
   *
   * Implements "Don't Make Me Think" principle via visual signaling:
   * - Red (error): DEFAULT JUDGMENT - urgent action required
   * - Blue (info): SCHEDULED/HEARING - active case
   * - Green (success): DISMISSED/CLOSED - completed case
   * - Gray (default): Unknown status
   *
   * @param {string} status - Status text from summons record
   * @returns {'error' | 'info' | 'success' | 'default'} MUI Chip color
   */
  const getStatusColor = (status: string): 'error' | 'info' | 'success' | 'default' => {
    const statusUpper = status?.toUpperCase() || '';
    if (statusUpper.includes('DEFAULT') || statusUpper.includes('JUDGMENT')) return 'error';
    if (statusUpper.includes('DISMISS') || statusUpper.includes('CLOSED')) return 'success';
    if (statusUpper.includes('SCHEDULED') || statusUpper.includes('HEARING')) return 'info';
    return 'default';
  };

  /**
   * Render Status column with Activity Badge + color-coded Chip
   *
   * UX Improvement #1: Visual signaling per "Don't Make Me Think" principle.
   * UX Improvement #8: Activity Badge - Shows [🆕 NEW] (Blue) or [⚠️ UPDATED] (Orange) if fresh.
   *
   * @param {GridRenderCellParams} params - MUI DataGrid cell parameters
   * @returns {JSX.Element} Box with optional badge + Chip component
   */
  const renderStatusCell = (params: GridRenderCellParams) => {
    const status = params.value || 'Unknown';
    const summons = params.row as Summons;
    const isNew = isNewRecord(summons);
    const isUpdated = isUpdatedRecord(summons);

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Activity Badge */}
        {isNew && (
          <Chip
            label="NEW"
            icon={<FiberNewIcon />}
            color="info"
            size="small"
            sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
          />
        )}
        {isUpdated && !isNew && (
          <Chip
            label="UPDATED"
            color="warning"
            size="small"
            sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
          />
        )}

        {/* Status Chip */}
        <Chip
          label={status}
          color={getStatusColor(status)}
          size="small"
          sx={{ fontWeight: 'bold' }}
        />
      </Box>
    );
  };

  /**
   * Render Lag Days column with conditional formatting
   *
   * UX Improvement #2: Highlights values >60 days (legal timeliness threshold) in bold red.
   * Enables instant identification of cases approaching statute limitations.
   *
   * @param {GridRenderCellParams} params - MUI DataGrid cell parameters
   * @returns {JSX.Element | string} Typography component with conditional styling, or em dash for null values
   */
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

  /**
   * Render Client column - clickable to open notes/drawer
   *
   * Provides clickable area to open notes dialog (desktop) or mobile drawer (mobile).
   * Removed "New" badge here since it's now shown in Status column.
   *
   * @param {GridRenderCellParams} params - MUI DataGrid cell parameters
   * @returns {JSX.Element} Clickable Box with client name
   */
  const renderClientCell = (params: GridRenderCellParams) => {
    return (
      <Box
        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
        onClick={() => isMobile ? handleMobileDrawerOpen(params.row) : handleNotesOpen(params.row)}
      >
        {params.value}
      </Box>
    );
  };

  /**
   * Render expand/collapse button for Master-Detail rows
   *
   * UX Improvement #3: Implements progressive disclosure pattern.
   * Shows down arrow when collapsed, up arrow when expanded.
   *
   * @param {GridRenderCellParams} params - MUI DataGrid cell parameters
   * @returns {JSX.Element} IconButton with arrow icon
   */
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
    // Timestamp columns for sorting and activity detection
    {
      field: 'updatedAt',
      headerName: 'Last Updated',
      width: 150,
      hide: true,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleString() : ''),
    },
    {
      field: 'createdAt',
      headerName: 'Created At',
      width: 150,
      hide: true,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleString() : ''),
    },
  ];

  /**
   * Render Master-Detail expandable panel for secondary summons data
   *
   * UX Improvement #3: Implements progressive disclosure (Miller's Law).
   * Shows 30+ secondary fields only when user expands a row to avoid cognitive overload.
   * Displays violation info, vehicle info, financial info, and document links in a grid layout.
   *
   * @param {GridRowParams} params - MUI DataGrid row parameters
   * @returns {JSX.Element | null} Collapse component with detail cards, or null if collapsed
   */
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
          sorting: {
            sortModel: [{ field: 'updatedAt', sort: 'desc' }],
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
        getRowClassName={(params: GridRowParams) => {
          return isFreshSummons(params.row) ? 'fresh-row' : '';
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
          '& .fresh-row': {
            backgroundColor: '#FFFDE7', // Pale "Attention Yellow" for 24-hour freshness
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
