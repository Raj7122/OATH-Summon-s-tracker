/**
 * Summons Detail Modal Component
 * 
 * Implements the "No-Scroll Rule" by replacing horizontal scrolling DataGrid
 * with a comprehensive modal dialog for viewing/editing summons details.
 * 
 * Layout: Two-column grid inside MUI Dialog
 * - Left Column: Hearing Info, Violation Specs, Location
 * - Right Column: Vehicle Data, Financials, Evidence Checkboxes, Notes
 * 
 * UX Philosophy: Progressive disclosure - Arthur sees minimal columns in the
 * DataGrid, then clicks to get full detail in a modal without losing context.
 * 
 * @module components/SummonsDetailModal
 */

import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Divider,
  Grid,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  TextField,
  Link,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  useTheme,
  useMediaQuery,
  Alert,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import CloseIcon from '@mui/icons-material/Close';
import EventIcon from '@mui/icons-material/Event';
import GavelIcon from '@mui/icons-material/Gavel';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import NotesIcon from '@mui/icons-material/Notes';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VideocamIcon from '@mui/icons-material/Videocam';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import HistoryIcon from '@mui/icons-material/History';
import ScheduleIcon from '@mui/icons-material/Schedule';
import UpdateIcon from '@mui/icons-material/Update';
import PaymentIcon from '@mui/icons-material/Payment';
import EditIcon from '@mui/icons-material/Edit';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import WarningIcon from '@mui/icons-material/Warning';

// Import shared types
import { Summons, getStatusColor, ActivityLogEntry } from '../types/summons';
import { isNewRecord, isUpdatedRecord } from '../types/summons';

/**
 * Props for SummonsDetailModal component
 */
interface SummonsDetailModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** The summons to display (null when closed) */
  summons: Summons | null;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when data is updated (for refreshing parent) */
  onUpdate: (id: string, field: string, value: unknown) => void;
}

// Internal status options per TRD v1.8
const INTERNAL_STATUS_OPTIONS = ['New', 'Reviewing', 'Hearing Complete', 'Summons Paid', 'Archived'];

/**
 * Get background color for activity log entry based on type
 * Color coding per user request: Red for Default/Guilty, Orange for Adjourned, Green for Dismissed
 */
function getActivityColor(type: ActivityLogEntry['type']): string {
  switch (type) {
    case 'CREATED':
      return '#2196f3'; // Blue - new record
    case 'STATUS_CHANGE':
      return '#ff9800'; // Orange - status changes
    case 'RESCHEDULE':
      return '#ff9800'; // Orange - adjournment/reschedule
    case 'RESULT_CHANGE':
      return '#9c27b0'; // Purple - hearing result
    case 'AMOUNT_CHANGE':
      return '#f44336'; // Red - financial changes
    case 'PAYMENT':
      return '#4caf50'; // Green - payment received
    case 'AMENDMENT':
      return '#795548'; // Brown - violation code changed
    case 'OCR_COMPLETE':
      return '#607d8b'; // Blue-gray - document scan
    case 'ARCHIVED':
      return '#757575'; // Gray - archived/closed
    default:
      return '#9e9e9e'; // Gray - unknown
  }
}

/**
 * Get icon for activity log entry based on type
 */
function getActivityIcon(type: ActivityLogEntry['type']): React.ReactNode {
  const iconSx = { fontSize: 14 };
  switch (type) {
    case 'CREATED':
      return <AddCircleIcon sx={iconSx} />;
    case 'STATUS_CHANGE':
      return <WarningIcon sx={iconSx} />;
    case 'RESCHEDULE':
      return <ScheduleIcon sx={iconSx} />;
    case 'RESULT_CHANGE':
      return <GavelIcon sx={iconSx} />;
    case 'AMOUNT_CHANGE':
      return <AttachMoneyIcon sx={iconSx} />;
    case 'PAYMENT':
      return <PaymentIcon sx={iconSx} />;
    case 'AMENDMENT':
      return <EditIcon sx={iconSx} />;
    case 'OCR_COMPLETE':
      return <DocumentScannerIcon sx={iconSx} />;
    case 'ARCHIVED':
      return <HistoryIcon sx={iconSx} />;
    default:
      return <UpdateIcon sx={iconSx} />;
  }
}

/**
 * Format activity type for display
 */
function formatActivityType(type: ActivityLogEntry['type']): string {
  switch (type) {
    case 'CREATED':
      return 'Created';
    case 'STATUS_CHANGE':
      return 'Status';
    case 'RESCHEDULE':
      return 'Rescheduled';
    case 'RESULT_CHANGE':
      return 'Result';
    case 'AMOUNT_CHANGE':
      return 'Amount';
    case 'PAYMENT':
      return 'Payment';
    case 'AMENDMENT':
      return 'Amendment';
    case 'OCR_COMPLETE':
      return 'Scanned';
    case 'ARCHIVED':
      return 'Archived';
    default:
      return type;
  }
}

/**
 * Get text color for new value based on value content
 * Red for Default/Guilty, Orange for Adjourned, Green for Dismissed
 */
function getActivityTextColor(_type: ActivityLogEntry['type'], value: string | null): string {
  if (!value) return 'text.primary';

  const upperValue = value.toUpperCase();

  // Check for specific result keywords
  if (upperValue.includes('DEFAULT') || upperValue.includes('GUILTY') || upperValue.includes('JUDGMENT')) {
    return '#d32f2f'; // Red
  }
  if (upperValue.includes('ADJOURN') || upperValue.includes('RESCHEDUL')) {
    return '#ed6c02'; // Orange
  }
  if (upperValue.includes('DISMISS') || upperValue.includes('CLOSED') || upperValue.includes('PAID')) {
    return '#2e7d32'; // Green
  }

  return 'text.primary';
}

/**
 * Section Header component for consistent styling
 */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, mt: 2 }}>
    {icon}
    <Typography variant="subtitle1" sx={{ ml: 1, fontWeight: 600 }}>
      {title}
    </Typography>
  </Box>
);

/**
 * Info Row component for displaying label-value pairs
 */
const InfoRow: React.FC<{ label: string; value: React.ReactNode; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{
        fontWeight: highlight ? 600 : 400,
        color: highlight ? 'primary.main' : 'text.primary',
        textAlign: 'right',
        maxWidth: '60%',
      }}
    >
      {value || '—'}
    </Typography>
  </Box>
);

/**
 * Summons Detail Modal Component
 * 
 * A comprehensive two-column dialog for viewing and editing summons details.
 * Replaces the expandable row pattern for a cleaner, more focused experience.
 */
const SummonsDetailModal: React.FC<SummonsDetailModalProps> = ({
  open,
  summons,
  onClose,
  onUpdate,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Local state for editable fields
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [internalStatus, setInternalStatus] = useState('New');

  // Local state for checkboxes (for immediate UI feedback)
  const [evidenceReviewed, setEvidenceReviewed] = useState(false);
  const [addedToCalendar, setAddedToCalendar] = useState(false);
  const [evidenceRequested, setEvidenceRequested] = useState(false);
  const [evidenceReceived, setEvidenceReceived] = useState(false);
  const [evidenceRequestedDate, setEvidenceRequestedDate] = useState<string | null>(null);

  // Initialize local state when summons changes
  useEffect(() => {
    if (summons) {
      setNotes(summons.notes || '');
      setInternalStatus(summons.internal_status || 'New');
      setNotesSaved(false);
      // Sync checkbox states
      setEvidenceReviewed(summons.evidence_reviewed || false);
      setAddedToCalendar(summons.added_to_calendar || false);
      setEvidenceRequested(summons.evidence_requested || false);
      setEvidenceReceived(summons.evidence_received || false);
      setEvidenceRequestedDate(summons.evidence_requested_date || null);
    }
  }, [summons]);
  
  // Auto-save notes with debounce
  useEffect(() => {
    if (!summons || notes === (summons.notes || '')) return;
    
    const timer = setTimeout(() => {
      onUpdate(summons.id, 'notes', notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [notes, summons, onUpdate]);
  
  if (!summons) return null;
  
  /**
   * Handle checkbox changes for evidence tracking
   * Updates local state immediately for responsive UI, then persists to backend
   */
  const handleCheckboxChange = (field: string, checked: boolean) => {
    // Update local state immediately for responsive UI
    switch (field) {
      case 'evidence_reviewed':
        setEvidenceReviewed(checked);
        break;
      case 'added_to_calendar':
        setAddedToCalendar(checked);
        break;
      case 'evidence_requested':
        setEvidenceRequested(checked);
        // Auto-set evidence_requested_date when checking
        if (checked && !evidenceRequestedDate) {
          const now = dayjs().toISOString();
          setEvidenceRequestedDate(now);
          onUpdate(summons.id, 'evidence_requested_date', now);
        }
        break;
      case 'evidence_received':
        setEvidenceReceived(checked);
        break;
    }

    // Persist to backend
    onUpdate(summons.id, field, checked);
  };
  
  /**
   * Handle internal status change
   */
  const handleInternalStatusChange = (value: string) => {
    setInternalStatus(value);
    onUpdate(summons.id, 'internal_status', value);
  };
  
  /**
   * Handle evidence requested date change
   */
  const handleDateChange = (date: dayjs.Dayjs | null) => {
    const dateValue = date?.toISOString() || null;
    setEvidenceRequestedDate(dateValue);
    onUpdate(summons.id, 'evidence_requested_date', dateValue);
  };
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2,
          maxHeight: isMobile ? '100%' : '90vh',
        },
      }}
    >
      {/* Dialog Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pb: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="h6" component="span">
              Summons #{summons.summons_number}
            </Typography>
            {isNewRecord(summons) && (
              <Chip
                label="NEW"
                icon={<FiberNewIcon />}
                color="info"
                size="small"
                sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
              />
            )}
            {isUpdatedRecord(summons) && !isNewRecord(summons) && (
              <Chip
                label="UPDATED"
                color="warning"
                size="small"
                sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
              />
            )}
          </Box>
          <Typography variant="subtitle1" color="text.secondary">
            {summons.respondent_name}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={summons.status}
            color={getStatusColor(summons.status)}
            sx={{ fontWeight: 'bold' }}
          />
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        {/* Critical Flags Alert */}
        {summons.critical_flags_ocr && summons.critical_flags_ocr.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <strong>Critical Flags:</strong>
              {summons.critical_flags_ocr.map((flag, idx) => (
                <Chip key={idx} label={flag} size="small" color="warning" />
              ))}
            </Box>
          </Alert>
        )}
        
        {/* Two-Column Layout */}
        <Grid container spacing={3}>
          {/* LEFT COLUMN: Hearing Info, Violation Specs, Location */}
          <Grid item xs={12} md={6}>
            {/* Hearing Information */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<EventIcon sx={{ color: 'primary.main' }} />}
                  title="Hearing Information"
                />
                <InfoRow
                  label="Hearing Date"
                  value={dayjs(summons.hearing_date).format('MMMM D, YYYY')}
                  highlight
                />
                <InfoRow label="Hearing Time" value={summons.hearing_time} />
                <InfoRow
                  label="Hearing Result"
                  value={
                    summons.hearing_result ? (
                      <Chip
                        label={summons.hearing_result}
                        size="small"
                        color={summons.hearing_result.toLowerCase().includes('dismiss') ? 'success' : 'default'}
                      />
                    ) : (
                      'Pending'
                    )
                  }
                />
                <InfoRow label="Status" value={summons.status} />
                <InfoRow label="Lag Days" value={summons.lag_days} />
              </CardContent>
            </Card>
            
            {/* Violation Specifications */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<GavelIcon sx={{ color: 'error.main' }} />}
                  title="Violation Specifications"
                />
                <InfoRow label="Violation Type" value={summons.code_description} highlight />
                <InfoRow
                  label="Violation Date"
                  value={dayjs(summons.violation_date).format('MMMM D, YYYY')}
                />
                <InfoRow label="Violation Time" value={summons.violation_time} />
                <InfoRow label="Offense Level" value={summons.offense_level} />
                <InfoRow label="Prior Offense Status" value={summons.prior_offense_status} />
                {summons.idling_duration_ocr && (
                  <InfoRow label="Idling Duration" value={summons.idling_duration_ocr} />
                )}
              </CardContent>
            </Card>
            
            {/* Location */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<LocationOnIcon sx={{ color: 'info.main' }} />}
                  title="Location"
                />
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {summons.violation_location || 'Location not specified'}
                </Typography>
              </CardContent>
            </Card>
            
            {/* Violation Narrative */}
            {summons.violation_narrative && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Violation Narrative (OCR)
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      backgroundColor: 'grey.50',
                      p: 1.5,
                      borderRadius: 1,
                      fontStyle: 'italic',
                    }}
                  >
                    {summons.violation_narrative}
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Grid>
          
          {/* RIGHT COLUMN: Vehicle Data, Financials, Evidence, Notes */}
          <Grid item xs={12} md={6}>
            {/* Vehicle Data */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<DirectionsCarIcon sx={{ color: 'secondary.main' }} />}
                  title="Vehicle Data"
                />
                <InfoRow label="License Plate" value={summons.license_plate_ocr || summons.license_plate} highlight />
                <InfoRow label="Vehicle Type" value={summons.vehicle_type_ocr} />
                <InfoRow label="ID Number" value={summons.id_number || summons.dep_id} />
                <InfoRow label="Agency ID" value={summons.agency_id_number} />
                <InfoRow label="Name on Summons" value={summons.name_on_summons_ocr} />
              </CardContent>
            </Card>
            
            {/* Financial Information */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<AttachMoneyIcon sx={{ color: 'success.main' }} />}
                  title="Financial Information"
                />
                <InfoRow label="Base Fine" value={`$${summons.base_fine?.toFixed(2) || '0.00'}`} />
                <InfoRow
                  label="Amount Due"
                  value={`$${summons.amount_due?.toFixed(2) || '0.00'}`}
                  highlight
                />
                {(summons.paid_amount ?? 0) > 0 && (
                  <InfoRow
                    label="Paid Amount"
                    value={
                      <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                        ${summons.paid_amount?.toFixed(2)}
                      </Typography>
                    }
                  />
                )}
                {(summons.penalty_imposed ?? 0) > 0 && (
                  <InfoRow label="Penalty Imposed" value={`$${summons.penalty_imposed?.toFixed(2)}`} />
                )}
              </CardContent>
            </Card>
            
            {/* Evidence Tracking */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<FactCheckIcon sx={{ color: 'warning.main' }} />}
                  title="Evidence Tracking"
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={evidenceReviewed}
                        onChange={(e) => handleCheckboxChange('evidence_reviewed', e.target.checked)}
                      />
                    }
                    label="Evidence Reviewed"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={addedToCalendar}
                        onChange={(e) => handleCheckboxChange('added_to_calendar', e.target.checked)}
                      />
                    }
                    label="Added to Calendar"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={evidenceRequested}
                        onChange={(e) => handleCheckboxChange('evidence_requested', e.target.checked)}
                      />
                    }
                    label="Evidence Requested"
                  />

                  {/* Evidence Requested Date Picker */}
                  {evidenceRequested && (
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                      <DatePicker
                        label="Request Date"
                        value={evidenceRequestedDate ? dayjs(evidenceRequestedDate) : null}
                        onChange={handleDateChange}
                        slotProps={{
                          textField: { size: 'small', fullWidth: true },
                        }}
                      />
                    </LocalizationProvider>
                  )}

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={evidenceReceived}
                        onChange={(e) => handleCheckboxChange('evidence_received', e.target.checked)}
                      />
                    }
                    label="Evidence Received"
                  />
                </Box>
                
                {/* Documents */}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Documents
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<PictureAsPdfIcon />}
                    component={Link}
                    href={summons.summons_pdf_link}
                    target="_blank"
                  >
                    Summons PDF
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<VideocamIcon />}
                    component={Link}
                    href={summons.video_link}
                    target="_blank"
                  >
                    Video Evidence
                  </Button>
                </Box>
              </CardContent>
            </Card>
            
            {/* Internal Status & Notes */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<NotesIcon sx={{ color: 'text.secondary' }} />}
                  title="Internal Notes"
                />

                {/* Internal Status Dropdown */}
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Internal Status</InputLabel>
                  <Select
                    value={internalStatus}
                    label="Internal Status"
                    onChange={(e) => handleInternalStatusChange(e.target.value)}
                  >
                    {INTERNAL_STATUS_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Notes TextField with Auto-Save */}
                <Box sx={{ position: 'relative' }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add internal notes about this summons... (auto-saves after 1 second)"
                    variant="outlined"
                    size="small"
                  />
                  {notesSaved && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        backgroundColor: 'success.light',
                        color: 'success.contrastText',
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: '0.75rem',
                      }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 14 }} />
                      Saved
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>

            {/* Case History Timeline */}
            <Card variant="outlined">
              <CardContent>
                <SectionHeader
                  icon={<HistoryIcon sx={{ color: 'primary.main' }} />}
                  title="Case History"
                />

                {/* Activity Log Timeline */}
                {summons.activity_log && summons.activity_log.length > 0 ? (
                  <Box sx={{ position: 'relative', pl: 3 }}>
                    {/* Vertical line */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 10,
                        top: 8,
                        bottom: 8,
                        width: 2,
                        bgcolor: 'divider',
                        borderRadius: 1,
                      }}
                    />

                    {/* Timeline entries - newest first */}
                    {[...summons.activity_log]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((entry: ActivityLogEntry, idx: number) => (
                        <Box
                          key={idx}
                          sx={{
                            position: 'relative',
                            pb: idx === summons.activity_log!.length - 1 ? 0 : 2,
                            mb: idx === summons.activity_log!.length - 1 ? 0 : 1,
                          }}
                        >
                          {/* Timeline dot with icon */}
                          <Box
                            sx={{
                              position: 'absolute',
                              left: -26,
                              top: 0,
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              bgcolor: getActivityColor(entry.type),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              zIndex: 1,
                            }}
                          >
                            {getActivityIcon(entry.type)}
                          </Box>

                          {/* Content */}
                          <Box sx={{ ml: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                              <Typography variant="caption" color="text.secondary">
                                {dayjs(entry.date).format('MMM D, YYYY h:mm A')}
                              </Typography>
                              <Chip
                                label={formatActivityType(entry.type)}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.65rem',
                                  bgcolor: getActivityColor(entry.type),
                                  color: 'white',
                                }}
                              />
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {entry.description}
                            </Typography>
                            {/* Show old/new values for changes */}
                            {entry.old_value && entry.new_value && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    textDecoration: 'line-through',
                                    color: 'text.disabled',
                                    bgcolor: 'grey.100',
                                    px: 0.75,
                                    py: 0.25,
                                    borderRadius: 0.5,
                                  }}
                                >
                                  {entry.old_value}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">→</Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 600,
                                    color: getActivityTextColor(entry.type, entry.new_value),
                                    bgcolor: 'grey.100',
                                    px: 0.75,
                                    py: 0.25,
                                    borderRadius: 0.5,
                                  }}
                                >
                                  {entry.new_value}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </Box>
                      ))}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      textAlign: 'center',
                      py: 3,
                      color: 'text.secondary',
                    }}
                  >
                    <HistoryIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
                    <Typography variant="body2">
                      No activity history available yet.
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      Changes will appear here after the next daily sweep.
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
          Last Updated: {summons.updatedAt ? dayjs(summons.updatedAt).format('MMM D, YYYY h:mm A') : 'Unknown'}
        </Typography>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SummonsDetailModal;

