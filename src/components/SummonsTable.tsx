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
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { generateClient } from 'aws-amplify/api';

// Extend dayjs with UTC plugin for correct date parsing
dayjs.extend(utc);
import { updateSummons } from '../graphql/mutations';
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
  useTheme,
  useMediaQuery,
  Select,
  MenuItem,
  Tooltip,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AttachFileIcon from '@mui/icons-material/AttachFile';

const client = generateClient();

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
  evidence_received_date?: string;
  // File attachments (AWSJSON array)
  attachments?: Array<{ id: string; key: string; type: string; name: string; size: number; uploadedBy: string; uploadedById: string; uploadedAt: string }>;
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
   * for a specific summons record via GraphQL mutation.
   *
   * @param {string} id - Summons record ID
   * @param {keyof Summons} field - Field name to update
   * @param {boolean} value - New boolean value
   * @returns {Promise<void>}
   *
   * @throws {Error} If GraphQL mutation fails (logged to console)
   */
  const handleCheckboxChange = async (id: string, field: keyof Summons, value: boolean) => {
    try {
      console.log(`Saving ${field} = ${value} for summons ${id}...`);

      // Build the update input dynamically
      const updateInput: any = {
        id: id,
        [field]: value,
      };

      // If checking "evidence_requested" and date isn't set, set it to now
      if (field === 'evidence_requested' && value === true) {
        const summons = summonses.find(s => s.id === id);
        if (summons && !summons.evidence_requested_date) {
          updateInput.evidence_requested_date = new Date().toISOString();
        }
      }

      // Execute GraphQL mutation
      await client.graphql({
        query: updateSummons,
        variables: {
          input: updateInput,
        },
      });

      console.log(`✓ Successfully saved ${field}`);

      // Refresh data to show updated checkbox
      onUpdate();
    } catch (error) {
      console.error('Error updating summons:', error);
      alert(`Failed to save checkbox. Please try again.`);
    }
  };

  /**
   * Handle date picker changes for evidence_requested_date field
   *
   * Updates the evidence_requested_date field for a specific summons record via GraphQL mutation.
   *
   * @param {string} id - Summons record ID
   * @param {keyof Summons} field - Field name to update (typically 'evidence_requested_date')
   * @param {Date | null} date - New date value or null to clear
   * @returns {Promise<void>}
   *
   * @throws {Error} If GraphQL mutation fails (logged to console)
   */
  const handleDateChange = async (id: string, field: keyof Summons, date: Date | null) => {
    try {
      console.log(`Saving ${field} = ${date} for summons ${id}...`);

      // Execute GraphQL mutation
      await client.graphql({
        query: updateSummons,
        variables: {
          input: {
            id: id,
            [field]: date ? date.toISOString() : null,
          },
        },
      });

      console.log(`✓ Successfully saved ${field}`);

      // Refresh data to show updated date
      onUpdate();
    } catch (error) {
      console.error('Error updating summons date:', error);
      alert(`Failed to save date. Please try again.`);
    }
  };

  /**
   * Handle select/dropdown changes for Internal Status field
   *
   * Updates the internal_status field for a specific summons record via GraphQL mutation.
   * TRD v1.8: Client Feedback Updates
   *
   * @param {string} id - Summons record ID
   * @param {string} value - New status value
   * @returns {Promise<void>}
   *
   * @throws {Error} If GraphQL mutation fails (logged to console)
   */
  const handleInternalStatusChange = async (id: string, value: string) => {
    try {
      console.log(`Saving internal_status = ${value} for summons ${id}...`);

      // Execute GraphQL mutation
      await client.graphql({
        query: updateSummons,
        variables: {
          input: {
            id: id,
            internal_status: value,
          },
        },
      });

      console.log(`✓ Successfully saved internal_status`);

      // Refresh data to show updated status
      onUpdate();
    } catch (error) {
      console.error('Error updating internal status:', error);
      alert(`Failed to save internal status. Please try again.`);
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
   * Saves via GraphQL mutation.
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If GraphQL mutation fails (logged to console)
   */
  const handleNotesAutoSave = async () => {
    if (notesDialog.summons) {
      setNotesSaving(true);
      try {
        console.log('Auto-saving notes:', notesDialog.summons.id);

        // Execute GraphQL mutation
        await client.graphql({
          query: updateSummons,
          variables: {
            input: {
              id: notesDialog.summons.id,
              notes: notesValue,
            },
          },
        });

        console.log('✓ Notes auto-saved successfully');
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
      } catch (error) {
        console.error('Error auto-saving notes:', error);
        alert('Failed to save notes. Please try again.');
      } finally {
        setNotesSaving(false);
      }
    }
  };

  /**
   * Manual save notes when "Save" button is clicked in dialog
   *
   * Saves the current notes value and closes the dialog via GraphQL mutation.
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If GraphQL mutation fails (logged to console)
   */
  const handleNotesSave = async () => {
    if (notesDialog.summons) {
      try {
        console.log('Saving notes:', notesDialog.summons.id);

        // Execute GraphQL mutation
        await client.graphql({
          query: updateSummons,
          variables: {
            input: {
              id: notesDialog.summons.id,
              notes: notesValue,
            },
          },
        });

        console.log('✓ Notes saved successfully');
        setNotesDialog({ open: false, summons: null });
        onUpdate();
      } catch (error) {
        console.error('Error updating notes:', error);
        alert('Failed to save notes. Please try again.');
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
   * Check if a summons is "fresh" (updated in last 72 hours)
   *
   * Calculates time difference between now and updatedAt timestamp.
   * Used for row highlighting per the "72-Hour Freshness Rule".
   * TRD v1.9: 72-hour window ensures Arthur sees Friday afternoon updates on Monday morning.
   *
   * @param {Summons} summons - Summons record to check
   * @returns {boolean} True if updated within last 72 hours, false otherwise
   */
  const isFreshSummons = (summons: Summons): boolean => {
    if (!summons.updatedAt) return false;
    const updatedDate = new Date(summons.updatedAt);
    const now = new Date();
    const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);
    return diffHours < 72; // 72 hours = 3 days to cover weekends
  };

  /**
   * Check if a summons is a brand new record (created within last 72 hours)
   *
   * A record is "NEW" if it was discovered/created within the last 72 hours.
   * This indicates the daily sweep found a new summons from the NYC API.
   *
   * Note: We only check createdAt, not updatedAt, because the daily sweep
   * updates last_metadata_sync on every run which changes updatedAt.
   *
   * TRD v1.9: 72-hour window ensures Arthur sees Friday afternoon updates on Monday morning.
   *
   * @param {Summons} summons - Summons record to check
   * @returns {boolean} True if brand new, false otherwise
   */
  const isNewRecord = (summons: Summons): boolean => {
    if (!summons.createdAt) return false;

    const createdDate = new Date(summons.createdAt);
    const now = new Date();

    // Check if created within 72 hours (TRD v1.9: cover weekends)
    const diffHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
    return diffHours < 72;
  };

  /**
   * Check if a summons was recently updated BY THE DAILY SWEEP (not manual user edits)
   *
   * Uses last_change_at which is only set when NYC API changes are detected
   * (status change, reschedule, amount change, etc.)
   *
   * Must not be a new record (new records get NEW badge, not UPDATED).
   *
   * TRD v1.9: 72-hour window ensures Arthur sees Friday afternoon updates on Monday morning.
   *
   * @param {Summons} summons - Summons record to check
   * @returns {boolean} True if recently updated, false otherwise
   */
  const isUpdatedRecord = (summons: Summons): boolean => {
    // Use last_change_at which is only set by the daily sweep when API changes are detected
    if (!summons.last_change_at) return false;

    // Must not be a new record (new records get NEW badge, not UPDATED)
    if (isNewRecord(summons)) return false;

    const lastChangeDate = new Date(summons.last_change_at);
    const now = new Date();

    // Check if daily sweep detected changes within last 72 hours (TRD v1.9: cover weekends)
    const diffHours = (now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60);
    return diffHours < 72;
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
    // Red: Danger statuses (DOCKETED = red)
    if (statusUpper.includes('DEFAULT') || statusUpper.includes('JUDGMENT') || statusUpper.includes('VIOLATION') || statusUpper.includes('DOCKETED')) return 'error';
    // Green: Resolved statuses (PAID IN FULL = emerald green)
    if (statusUpper.includes('DISMISS') || statusUpper.includes('CLOSED') || statusUpper.includes('PAID')) return 'success';
    // Blue: Active case statuses
    if (statusUpper.includes('SCHEDULED') || statusUpper.includes('HEARING') || statusUpper.includes('RESCHEDULED')) return 'info';
    return 'default';
  };

  /**
   * Format change timestamp for tooltip display
   *
   * Formats the last_change_at ISO timestamp into a readable date/time string.
   * Used in the UPDATED badge tooltip to show when the change occurred.
   *
   * @param {string | undefined} dateString - ISO date string from last_change_at
   * @returns {string} Formatted date string (e.g., "11/22/2024 3:45 PM")
   */
  const formatChangeDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  /**
   * Render Status column with Activity Badge + color-coded Chip
   *
   * UX Improvement #1: Visual signaling per "Don't Make Me Think" principle.
   * UX Improvement #8: Activity Badge - Shows [🆕 NEW] (Blue) or [⚠️ UPDATED] (Orange) if fresh.
   * Change Tracking: UPDATED badge shows MUI Tooltip with exact changes (last_change_summary) and timestamp.
   *
   * @param {GridRenderCellParams} params - MUI DataGrid cell parameters
   * @returns {JSX.Element} Box with optional badge + Chip component
   */
  const renderStatusCell = (params: GridRenderCellParams) => {
    const status = params.value || 'Unknown';
    const summons = params.row as Summons;
    const isNew = isNewRecord(summons);
    const isUpdated = isUpdatedRecord(summons);

    // Check if summons has attachments
    // AWSJSON fields may be stored as JSON strings, so parse before checking length
    let parsedAttachments: Array<unknown> = [];
    if (summons.attachments) {
      if (typeof summons.attachments === 'string') {
        try {
          parsedAttachments = JSON.parse(summons.attachments);
        } catch {
          parsedAttachments = [];
        }
      } else if (Array.isArray(summons.attachments)) {
        parsedAttachments = summons.attachments;
      }
    }
    const hasAttachments = parsedAttachments.length > 0;
    const attachmentCount = parsedAttachments.length;

    // Build tooltip content for UPDATED badge
    const changeTooltip = summons.last_change_summary
      ? `Change Detected: ${summons.last_change_summary} (${formatChangeDate(summons.last_change_at)})`
      : 'Record was recently updated';

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Attachment Indicator */}
        {hasAttachments && (
          <Tooltip title={`${attachmentCount} file${attachmentCount > 1 ? 's' : ''} attached`} arrow placement="top">
            <AttachFileIcon
              sx={{
                fontSize: 16,
                color: 'text.secondary',
                transform: 'rotate(45deg)',
              }}
            />
          </Tooltip>
        )}

        {/* Activity Badge - NEW */}
        {isNew && (
          <Chip
            label="NEW"
            icon={<FiberNewIcon />}
            color="info"
            size="small"
            sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
          />
        )}

        {/* Activity Badge - UPDATED with MUI Tooltip */}
        {isUpdated && !isNew && (
          <Tooltip title={changeTooltip} arrow placement="top">
            <Chip
              label="UPDATED"
              color="warning"
              size="small"
              sx={{
                fontWeight: 'bold',
                fontSize: '0.7rem',
                cursor: 'help',
              }}
            />
          </Tooltip>
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

  // Define columns - "Actionable 7" visible by default (UX Improvement #3)
  const columns: GridColDef[] = [
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
      width: 150,
      valueFormatter: (params: { value: string | null }) => {
        if (!params.value) return '';
        // Use dayjs.utc() to parse date-only fields correctly without timezone shift
        const parsed = dayjs.utc(params.value);
        return parsed.isValid() ? parsed.format('MMMM D, YYYY') : '';
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 280,
      minWidth: 280,
      renderCell: renderStatusCell,
    },
    {
      field: 'code_description',
      headerName: 'Violation Type',
      width: 200,
      renderCell: (params: GridRenderCellParams) => {
        const codeDesc = params.value || 'Unknown';
        // Truncate if too long for better UX
        const displayText = codeDesc.length > 30 ? `${codeDesc.substring(0, 27)}...` : codeDesc;
        return (
          <Tooltip title={codeDesc} placement="top">
            <Chip
              label={displayText}
              size="small"
              color="default"
              sx={{ maxWidth: '100%', fontSize: '0.75rem' }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: 'amount_due',
      headerName: 'Amount Due',
      width: 120,
      valueFormatter: (params: { value: number | null }) => {
        if (params.value == null) return '';
        return `$${params.value.toFixed(2)}`;
      },
    },
    {
      field: 'lag_days',
      headerName: 'Lag (Days)',
      width: 110,
      renderCell: renderLagDaysCell,
    },
    // TRD v1.8: Client Feedback Updates - New columns for manual workflow tracking
    {
      field: 'internal_status',
      headerName: 'Internal Status',
      width: 170,
      renderCell: (params: GridRenderCellParams) => {
        const internalStatusOptions = ['New', 'Reviewing', 'Hearing Complete', 'Summons Paid', 'Archived'];
        return (
          <Select
            value={params.value || 'New'}
            onChange={(e) => handleInternalStatusChange(params.row.id, e.target.value)}
            size="small"
            fullWidth
            sx={{ fontSize: '0.875rem' }}
          >
            {internalStatusOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        );
      },
    },
    {
      field: 'offense_level',
      headerName: 'Offense Level',
      width: 130,
    },
    // Evidence checkboxes
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
    // Secondary columns - Hidden by default (Progressive Disclosure)
    { field: 'license_plate_ocr', headerName: 'License Plate', width: 120 },
    {
      field: 'violation_date',
      headerName: 'Violation Date',
      width: 140,
      valueFormatter: (params: { value: string | null }) => {
        if (!params.value) return '';
        // Use dayjs.utc() to parse date-only fields correctly without timezone shift
        const parsed = dayjs.utc(params.value);
        return parsed.isValid() ? parsed.format('MMMM D, YYYY') : '';
      },
    },
    {
      field: 'video_created_date',
      headerName: 'Video Created',
      width: 140,
      valueFormatter: (params: { value: string | null }) => {
        if (!params.value) return '';
        // Use dayjs.utc() to parse date-only fields correctly without timezone shift
        const parsed = dayjs.utc(params.value);
        return parsed.isValid() ? parsed.format('MMMM D, YYYY') : '';
      },
    },
    {
      field: 'base_fine',
      headerName: 'Base Fine',
      width: 100,
      valueFormatter: (params: { value: number | null }) => {
        if (params.value == null) return '';
        return `$${params.value.toFixed(2)}`;
      },
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
    { field: 'id_number', headerName: 'ID Number', width: 120 },
    { field: 'vehicle_type_ocr', headerName: 'Vehicle Type', width: 120 },
    { field: 'prior_offense_status', headerName: 'Prior Offense', width: 120 },
    { field: 'idling_duration_ocr', headerName: 'Idling Duration', width: 130 },
    // Timestamp columns for sorting and activity detection
    {
      field: 'updatedAt',
      headerName: 'Last Updated',
      width: 150,
      valueFormatter: (params: { value: string | null }) => (params.value ? new Date(params.value).toLocaleString() : ''),
    },
    {
      field: 'createdAt',
      headerName: 'Created At',
      width: 150,
      valueFormatter: (params: { value: string | null }) => (params.value ? new Date(params.value).toLocaleString() : ''),
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
            paginationModel: { pageSize: 50 },
          },
          sorting: {
            sortModel: [{ field: 'hearing_date', sort: 'desc' }],
          },
          columns: {
            columnVisibilityModel: {
              // Hide secondary columns by default (Progressive Disclosure)
              license_plate_ocr: false,
              violation_date: false,
              video_created_date: false,
              base_fine: false,
              summons_pdf_link: false,
              video_link: false,
              evidence_requested: false,
              evidence_requested_date: false,
              evidence_received: false,
              critical_flags_ocr: false,
              id_number: false,
              vehicle_type_ocr: false,
              prior_offense_status: false,
              idling_duration_ocr: false,
              updatedAt: false,
              createdAt: false,
              // Hide evidence checkboxes on mobile
              ...(isMobile ? { evidence_reviewed: false, added_to_calendar: false } : {}),
            },
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
            backgroundColor: '#FFFDE7', // Pale "Attention Yellow" for 72-hour freshness (TRD v1.9)
          },
          // Enhanced horizontal scrollbar visibility (works in Chrome, Safari, Edge, Firefox)
          '& .MuiDataGrid-virtualScroller': {
            overflowX: 'auto',
            // Firefox scrollbar styling
            scrollbarWidth: 'auto',
            scrollbarColor: '#888 #f1f1f1',
            // Webkit (Chrome, Safari, Edge) scrollbar styling
            '&::-webkit-scrollbar': {
              height: '12px',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: '#f1f1f1',
              borderRadius: '6px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#888',
              borderRadius: '6px',
              border: '2px solid #f1f1f1',
              '&:hover': {
                backgroundColor: '#555',
              },
            },
          },
        }}
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
                size="medium"
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
                size="medium"
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
                size="medium"
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
                size="medium"
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
