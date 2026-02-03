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
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Extend dayjs with UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// NYC timezone for consistent date display
const NYC_TIMEZONE = 'America/New_York';
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
  Snackbar,
  Tooltip,
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import HistoryIcon from '@mui/icons-material/History';
import ScheduleIcon from '@mui/icons-material/Schedule';
import UpdateIcon from '@mui/icons-material/Update';
import PaymentIcon from '@mui/icons-material/Payment';
import EditIcon from '@mui/icons-material/Edit';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import WarningIcon from '@mui/icons-material/Warning';
import PersonIcon from '@mui/icons-material/Person';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ReceiptIcon from '@mui/icons-material/Receipt';

// Import invoice context
import { useInvoice } from '../contexts/InvoiceContext';
import { SummonsForInvoice } from '../types/invoice';

// Import shared types
import { Summons, getStatusColor, ActivityLogEntry, AttributionData, DepFileDateAttribution, NoteComment, InternalStatusAttribution, Attachment } from '../types/summons';
import FileUploadSection from './FileUploadSection';
import { isNewRecord, isUpdatedRecord } from '../types/summons';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { isInvoiced as isInvoicedLocally, getInvoiceDate as getInvoiceDateLocally } from '../utils/invoiceTracking';

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
    case 'EVIDENCE_UPLOADED':
      return '#9c27b0'; // Purple - evidence file uploaded
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
    case 'EVIDENCE_UPLOADED':
      return <AttachFileIcon sx={{ ...iconSx, color: '#9C27B0' }} />; // Purple
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
    case 'EVIDENCE_UPLOADED':
      return 'Evidence';
    default:
      return type;
  }
}

/**
 * Get text color for new value based on value content
 * Red for Default/Guilty/Docketed, Orange for Adjourned, Green for Dismissed/Paid
 */
function getActivityTextColor(_type: ActivityLogEntry['type'], value: string | null): string {
  if (!value) return 'text.primary';

  const upperValue = value.toUpperCase();

  // Check for specific result keywords
  // Red: Danger statuses (DOCKETED = red)
  if (upperValue.includes('DEFAULT') || upperValue.includes('GUILTY') || upperValue.includes('JUDGMENT') || upperValue.includes('DOCKETED')) {
    return '#d32f2f'; // Red
  }
  if (upperValue.includes('ADJOURN') || upperValue.includes('RESCHEDUL')) {
    return '#ed6c02'; // Orange
  }
  // Green: Resolved statuses (PAID IN FULL = emerald green)
  if (upperValue.includes('DISMISS') || upperValue.includes('CLOSED') || upperValue.includes('PAID')) {
    return '#2e7d32'; // Green (Emerald)
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
  const { userInfo } = useAuth();
  const { addToCart, removeFromCart, isInCart } = useInvoice();

  // Get current user info (with fallback for safety)
  const currentUser = {
    id: userInfo?.userId || 'unknown',
    name: userInfo?.displayName || 'Unknown User',
  };

  // Local state for editable fields
  const [newComment, setNewComment] = useState('');  // For new comment input
  const [comments, setComments] = useState<NoteComment[]>([]);  // Threaded comments
  const [internalStatus, setInternalStatus] = useState('New');
  const [internalStatusAttr, setInternalStatusAttr] = useState<InternalStatusAttribution>({});

  // Local state for checkboxes with attribution (for immediate UI feedback)
  const [evidenceReviewedAttr, setEvidenceReviewedAttr] = useState<AttributionData>({ completed: false });
  const [addedToCalendarAttr, setAddedToCalendarAttr] = useState<AttributionData>({ completed: false });
  const [evidenceRequestedAttr, setEvidenceRequestedAttr] = useState<AttributionData>({ completed: false });
  const [evidenceReceivedAttr, setEvidenceReceivedAttr] = useState<AttributionData>({ completed: false });
  const [evidenceRequestedDate, setEvidenceRequestedDate] = useState<string | null>(null);
  const [evidenceReceivedDate, setEvidenceReceivedDate] = useState<string | null>(null);

  // File attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // DEP File Date with attribution
  const [depFileDateAttr, setDepFileDateAttr] = useState<DepFileDateAttribution>({});

  // Snackbar for copy feedback
  const [copySnackbar, setCopySnackbar] = useState(false);

  // Helper to get attribution from summons or create default from legacy boolean
  const getAttrFromSummons = (
    attrField: AttributionData | undefined,
    legacyField: boolean
  ): AttributionData => {
    if (attrField) return attrField;
    return { completed: legacyField };
  };

  // Initialize local state when summons changes
  useEffect(() => {
    if (summons) {
      // Load threaded comments (parse if JSON string, or use as array)
      let loadedComments: NoteComment[] = [];
      if (summons.notes_comments) {
        if (typeof summons.notes_comments === 'string') {
          try {
            loadedComments = JSON.parse(summons.notes_comments);
          } catch {
            loadedComments = [];
          }
        } else if (Array.isArray(summons.notes_comments)) {
          loadedComments = summons.notes_comments;
        }
      }
      setComments(loadedComments);
      setNewComment('');

      // Internal status with attribution
      setInternalStatus(summons.internal_status || 'New');
      setInternalStatusAttr(summons.internal_status_attr || {});

      // Sync checkbox states with attribution
      setEvidenceReviewedAttr(getAttrFromSummons(summons.evidence_reviewed_attr, summons.evidence_reviewed || false));
      setAddedToCalendarAttr(getAttrFromSummons(summons.added_to_calendar_attr, summons.added_to_calendar || false));
      setEvidenceRequestedAttr(getAttrFromSummons(summons.evidence_requested_attr, summons.evidence_requested || false));
      setEvidenceReceivedAttr(getAttrFromSummons(summons.evidence_received_attr, summons.evidence_received || false));
      setEvidenceRequestedDate(summons.evidence_requested_date || null);
      setEvidenceReceivedDate(summons.evidence_received_date || null);
      // DEP File Date
      setDepFileDateAttr(summons.dep_file_date_attr || {});
      // Load attachments (parse if JSON string, or use as array)
      let loadedAttachments: Attachment[] = [];
      if (summons.attachments) {
        if (typeof summons.attachments === 'string') {
          try {
            loadedAttachments = JSON.parse(summons.attachments);
          } catch {
            loadedAttachments = [];
          }
        } else if (Array.isArray(summons.attachments)) {
          loadedAttachments = summons.attachments;
        }
      }
      setAttachments(loadedAttachments);
    }
  }, [summons]);
  
  if (!summons) return null;

  // Check if this summons is in the invoice cart
  const inCart = isInCart(summons.id);

  /**
   * Toggle summons in/out of invoice cart
   */
  const handleCartToggle = () => {
    if (inCart) {
      removeFromCart(summons.id);
    } else {
      // Map Summons to SummonsForInvoice
      const summonsForInvoice: SummonsForInvoice = {
        id: summons.id,
        summons_number: summons.summons_number,
        respondent_name: summons.respondent_name,
        clientID: summons.clientID,
        violation_date: summons.violation_date,
        hearing_date: summons.hearing_date,
        hearing_result: summons.hearing_result || null,
        status: summons.status,
        amount_due: summons.amount_due,
      };
      addToCart(summonsForInvoice);
    }
  };
  
  /**
   * Handle checkbox changes for evidence tracking with attribution
   * Updates local state immediately for responsive UI, then persists to backend
   */
  const handleCheckboxChange = (field: string, checked: boolean) => {
    const now = dayjs().toISOString();
    const newAttr: AttributionData = {
      completed: checked,
      by: checked ? currentUser.name : undefined,
      userId: checked ? currentUser.id : undefined,
      date: checked ? now : undefined,
    };

    // Update local state immediately for responsive UI
    switch (field) {
      case 'evidence_reviewed':
        setEvidenceReviewedAttr(newAttr);
        break;
      case 'added_to_calendar':
        setAddedToCalendarAttr(newAttr);
        break;
      case 'evidence_requested':
        setEvidenceRequestedAttr(newAttr);
        // Auto-set evidence_requested_date when checking
        if (checked && !evidenceRequestedDate) {
          setEvidenceRequestedDate(now);
          onUpdate(summons.id, 'evidence_requested_date', now);
        }
        break;
      case 'evidence_received':
        setEvidenceReceivedAttr(newAttr);
        // Auto-set evidence_received_date when checking
        if (checked && !evidenceReceivedDate) {
          setEvidenceReceivedDate(now);
          onUpdate(summons.id, 'evidence_received_date', now);
        }
        break;
    }

    // Persist both legacy boolean and new attribution to backend
    onUpdate(summons.id, field, checked);
    onUpdate(summons.id, `${field}_attr`, newAttr);
  };

  /**
   * Handle DEP File Date change with attribution
   */
  const handleDepFileDateChange = (date: dayjs.Dayjs | null) => {
    const now = dayjs().toISOString();
    const newAttr: DepFileDateAttribution = {
      value: date?.toISOString() || undefined,
      by: currentUser.name,
      userId: currentUser.id,
      date: now,
    };
    setDepFileDateAttr(newAttr);
    onUpdate(summons.id, 'dep_file_date_attr', newAttr);
  };

  /**
   * Handle adding a new comment
   */
  const handleAddComment = () => {
    if (!newComment.trim()) return;

    const now = dayjs().toISOString();
    const comment: NoteComment = {
      id: uuidv4(),
      text: newComment.trim(),
      by: currentUser.name,
      userId: currentUser.id,
      date: now,
    };

    const updatedComments = [...comments, comment];
    setComments(updatedComments);
    setNewComment('');

    // Persist to backend
    onUpdate(summons.id, 'notes_comments', updatedComments);
  };

  /**
   * Handle deleting a comment (only own comments can be deleted)
   */
  const handleDeleteComment = (commentId: string) => {
    const updatedComments = comments.filter(c => c.id !== commentId);
    setComments(updatedComments);
    onUpdate(summons.id, 'notes_comments', updatedComments);
  };

  /**
   * Calculate delay days between violation date and DEP file date
   * Returns positive number if DEP file was created after violation
   */
  const calculateDelayDays = (): number | null => {
    if (!depFileDateAttr.value || !summons.violation_date) return null;

    const violationDate = dayjs(summons.violation_date);
    const depFileDate = dayjs(depFileDateAttr.value);

    return depFileDate.diff(violationDate, 'day');
  };

  /**
   * Format relative time for attribution (e.g., "Just now", "2 hours ago", "Dec 9")
   */
  const formatAttributionTime = (dateStr: string | undefined): string => {
    if (!dateStr) return '';

    const date = dayjs(dateStr);
    const now = dayjs();
    const diffMinutes = now.diff(date, 'minute');
    const diffHours = now.diff(date, 'hour');
    const diffDays = now.diff(date, 'day');

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return date.format('ddd h:mm A');
    return date.format('MMM D, h:mm A');
  };
  
  /**
   * Handle internal status change with attribution
   */
  const handleInternalStatusChange = (value: string) => {
    const now = dayjs().toISOString();
    const newAttr: InternalStatusAttribution = {
      value,
      by: currentUser.name,
      userId: currentUser.id,
      date: now,
    };

    setInternalStatus(value);
    setInternalStatusAttr(newAttr);

    // Persist both legacy field and attribution
    onUpdate(summons.id, 'internal_status', value);
    onUpdate(summons.id, 'internal_status_attr', newAttr);
  };
  
  /**
   * Handle evidence requested date change
   */
  const handleDateChange = (date: dayjs.Dayjs | null) => {
    const dateValue = date?.toISOString() || null;
    setEvidenceRequestedDate(dateValue);
    onUpdate(summons.id, 'evidence_requested_date', dateValue);
  };

  /**
   * Handle evidence received date change
   */
  const handleReceivedDateChange = (date: dayjs.Dayjs | null) => {
    const dateValue = date?.toISOString() || null;
    setEvidenceReceivedDate(dateValue);
    onUpdate(summons.id, 'evidence_received_date', dateValue);
  };

  /**
   * Handle attachments change (upload/delete)
   * AWSJSON fields require JSON string, not raw array
   */
  const handleAttachmentsChange = (newAttachments: Attachment[]) => {
    setAttachments(newAttachments);
    // Serialize to JSON string for AWSJSON field type
    onUpdate(summons.id, 'attachments', JSON.stringify(newAttachments));
  };

  /**
   * Handle evidence file upload for audit trail logging
   * Creates an EVIDENCE_UPLOADED activity log entry when a file is uploaded
   */
  const handleEvidenceUploaded = (attachment: Attachment) => {
    // Get attachment type label for the log entry
    const typeLabels: Record<string, string> = {
      'summons_pdf': 'Summons PDF',
      'client_statement': 'Client Statement',
      'evidence_package': 'Evidence Package',
    };
    const typeLabel = typeLabels[attachment.type] || attachment.type;

    // Create activity log entry
    const activityEntry: ActivityLogEntry = {
      date: new Date().toISOString(),
      type: 'EVIDENCE_UPLOADED',
      description: `${currentUser.name} uploaded: ${attachment.name}`,
      old_value: null,
      new_value: `${typeLabel}: ${attachment.name}`,
    };

    // Get existing activity log (parse if JSON string)
    let existingLog: ActivityLogEntry[] = [];
    if (summons.activity_log) {
      if (typeof summons.activity_log === 'string') {
        try {
          existingLog = JSON.parse(summons.activity_log);
        } catch {
          existingLog = [];
        }
      } else if (Array.isArray(summons.activity_log)) {
        existingLog = summons.activity_log;
      }
    }

    // Append the new entry and save
    const updatedLog = [...existingLog, activityEntry];
    onUpdate(summons.id, 'activity_log', JSON.stringify(updatedLog));
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
            {/* Check both DB value and localStorage fallback for invoiced status */}
            {(summons.is_invoiced || isInvoicedLocally(summons.id)) && (
              <Tooltip title={`Invoiced on ${dayjs(summons.invoice_date || getInvoiceDateLocally(summons.id)).format('MMM D, YYYY h:mm A')}`}>
                <Chip
                  label="INVOICED"
                  icon={<ReceiptIcon />}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
                />
              </Tooltip>
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
                  value={dayjs.utc(summons.hearing_date).format('MMMM D, YYYY')}
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
                  value={dayjs.utc(summons.violation_date).format('MMMM D, YYYY')}
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
                {/* Check both DB value and localStorage fallback for invoiced status */}
                {(summons.is_invoiced || isInvoicedLocally(summons.id)) && (
                  <InfoRow
                    label="Invoiced"
                    value={
                      <Chip
                        label={dayjs(summons.invoice_date || getInvoiceDateLocally(summons.id)).format('MMM D, YYYY')}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    }
                  />
                )}
              </CardContent>
            </Card>

            {/* Evidence Tracking with Attribution */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<FactCheckIcon sx={{ color: 'warning.main' }} />}
                  title="Evidence Tracking"
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {/* Evidence Requested */}
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={evidenceRequestedAttr.completed}
                          onChange={(e) => handleCheckboxChange('evidence_requested', e.target.checked)}
                        />
                      }
                      label="Evidence Requested"
                      sx={{ mb: 0 }}
                    />
                    {evidenceRequestedAttr.completed && evidenceRequestedAttr.by && (
                      <Box sx={{ display: 'flex', alignItems: 'center', ml: 4, mt: -0.5, mb: 0.5 }}>
                        <PersonIcon sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }} />
                        <Typography variant="caption" color="text.secondary">
                          {evidenceRequestedAttr.by} • {formatAttributionTime(evidenceRequestedAttr.date)}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Evidence Requested Date Picker */}
                  {evidenceRequestedAttr.completed && (
                    <Box sx={{ ml: 4, mb: 1 }}>
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
                    </Box>
                  )}

                  {/* Evidence Received */}
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={evidenceReceivedAttr.completed}
                          onChange={(e) => handleCheckboxChange('evidence_received', e.target.checked)}
                        />
                      }
                      label="Evidence Received"
                      sx={{ mb: 0 }}
                    />
                    {evidenceReceivedAttr.completed && evidenceReceivedAttr.by && (
                      <Box sx={{ display: 'flex', alignItems: 'center', ml: 4, mt: -0.5, mb: 0.5 }}>
                        <PersonIcon sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }} />
                        <Typography variant="caption" color="text.secondary">
                          {evidenceReceivedAttr.by} • {formatAttributionTime(evidenceReceivedAttr.date)}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Evidence Received Date Picker */}
                  {evidenceReceivedAttr.completed && (
                    <Box sx={{ ml: 4, mb: 1 }}>
                      <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DatePicker
                          label="Received Date"
                          value={evidenceReceivedDate ? dayjs(evidenceReceivedDate) : null}
                          onChange={handleReceivedDateChange}
                          slotProps={{
                            textField: { size: 'small', fullWidth: true },
                          }}
                        />
                      </LocalizationProvider>
                    </Box>
                  )}

                  {/* Evidence Reviewed */}
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={evidenceReviewedAttr.completed}
                          onChange={(e) => handleCheckboxChange('evidence_reviewed', e.target.checked)}
                        />
                      }
                      label="Evidence Reviewed"
                      sx={{ mb: 0 }}
                    />
                    {evidenceReviewedAttr.completed && evidenceReviewedAttr.by && (
                      <Box sx={{ display: 'flex', alignItems: 'center', ml: 4, mt: -0.5, mb: 0.5 }}>
                        <PersonIcon sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }} />
                        <Typography variant="caption" color="text.secondary">
                          {evidenceReviewedAttr.by} • {formatAttributionTime(evidenceReviewedAttr.date)}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Added to Calendar */}
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={addedToCalendarAttr.completed}
                          onChange={(e) => handleCheckboxChange('added_to_calendar', e.target.checked)}
                        />
                      }
                      label="Added to Calendar"
                      sx={{ mb: 0 }}
                    />
                    {addedToCalendarAttr.completed && addedToCalendarAttr.by && (
                      <Box sx={{ display: 'flex', alignItems: 'center', ml: 4, mt: -0.5, mb: 0.5 }}>
                        <PersonIcon sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }} />
                        <Typography variant="caption" color="text.secondary">
                          {addedToCalendarAttr.by} • {formatAttributionTime(addedToCalendarAttr.date)}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>

                {/* DEP File Creation Date */}
                <Divider sx={{ my: 2 }} />
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <CalendarMonthIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="subtitle2" color="text.secondary">
                      DEP File Creation Date
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                      <DatePicker
                        value={depFileDateAttr.value ? dayjs(depFileDateAttr.value) : null}
                        onChange={handleDepFileDateChange}
                        slotProps={{
                          textField: {
                            size: 'small',
                            sx: { width: 180 },
                            placeholder: 'Select date'
                          },
                        }}
                      />
                    </LocalizationProvider>
                    {/* Delay Days Indicator */}
                    {(() => {
                      const delayDays = calculateDelayDays();
                      if (delayDays === null) return null;

                      const isWarning = delayDays > 30;
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {isWarning && <WarningIcon sx={{ fontSize: 18, color: 'warning.main' }} />}
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              color: isWarning ? 'warning.main' : 'text.secondary',
                            }}
                          >
                            (+{delayDays} Days{delayDays > 30 ? ' Delay' : ''})
                          </Typography>
                        </Box>
                      );
                    })()}
                  </Box>
                  {/* DEP File Date Attribution */}
                  {depFileDateAttr.by && (
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                      <PersonIcon sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }} />
                      <Typography variant="caption" color="text.secondary">
                        Updated by {depFileDateAttr.by} • {formatAttributionTime(depFileDateAttr.date)}
                      </Typography>
                    </Box>
                  )}
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
                  <Tooltip title="Copies summons # to clipboard, then opens NYC video search. Just paste and search!">
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<VideocamIcon />}
                      endIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                      onClick={async () => {
                        // Copy summons number to clipboard
                        try {
                          await navigator.clipboard.writeText(summons.summons_number);
                          setCopySnackbar(true);
                        } catch (err) {
                          console.error('Failed to copy:', err);
                        }
                        // Open the search page
                        window.open('https://nycidling.azurewebsites.net/idlingevidence', '_blank');
                      }}
                    >
                      Video Evidence
                    </Button>
                  </Tooltip>
                </Box>

                {/* Uploaded Evidence Files */}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Uploaded Evidence Files
                </Typography>
                <FileUploadSection
                  summonsId={summons.id}
                  attachments={attachments}
                  onAttachmentsChange={handleAttachmentsChange}
                  onEvidenceUploaded={handleEvidenceUploaded}
                />
              </CardContent>
            </Card>
            
            {/* Internal Status & Notes */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <SectionHeader
                  icon={<NotesIcon sx={{ color: 'text.secondary' }} />}
                  title="Internal Notes"
                />

                {/* Internal Status Dropdown with Attribution */}
                <FormControl fullWidth size="small" sx={{ mb: 1 }}>
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
                {/* Internal Status Attribution */}
                {internalStatusAttr.by && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PersonIcon sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">
                      Changed by {internalStatusAttr.by} • {formatAttributionTime(internalStatusAttr.date)}
                    </Typography>
                  </Box>
                )}

                <Divider sx={{ my: 2 }} />

                {/* Threaded Comments */}
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Comments ({comments.length})
                </Typography>

                {/* Comments List */}
                <Box sx={{ maxHeight: 300, overflowY: 'auto', mb: 2 }}>
                  {comments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 2 }}>
                      No comments yet. Add the first comment below.
                    </Typography>
                  ) : (
                    comments
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((comment) => (
                        <Box
                          key={comment.id}
                          sx={{
                            p: 1.5,
                            mb: 1,
                            bgcolor: comment.userId === currentUser.id ? 'primary.50' : 'grey.50',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: comment.userId === currentUser.id ? 'primary.200' : 'grey.200',
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <PersonIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                              <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                {comment.by}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                • {formatAttributionTime(comment.date)}
                              </Typography>
                            </Box>
                            {/* Delete button - only for own comments */}
                            {comment.userId === currentUser.id && (
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteComment(comment.id)}
                                sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                              >
                                <CloseIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            )}
                          </Box>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {comment.text}
                          </Typography>
                        </Box>
                      ))
                  )}
                </Box>

                {/* Add New Comment */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    variant="outlined"
                    size="small"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleAddComment();
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleAddComment}
                    disabled={!newComment.trim()}
                    sx={{ alignSelf: 'flex-end' }}
                  >
                    Add
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Press Cmd+Enter (Mac) or Ctrl+Enter (Windows) to submit
                </Typography>
              </CardContent>
            </Card>

            {/* Case History Timeline */}
            <Card variant="outlined">
              <CardContent>
                <SectionHeader
                  icon={<HistoryIcon sx={{ color: 'primary.main' }} />}
                  title="Case History"
                />

                {/* Activity Log Timeline - Only show entries older than 1 week (168 hours) */}
                {(() => {
                  // Filter activity log to only show entries older than 1 week (168 hours)
                  // This ensures the UPDATED chip expires before showing in history
                  const now = new Date();
                  const oneWeekAgo = new Date(now.getTime() - 168 * 60 * 60 * 1000);

                  // Parse activity_log if it's a JSON string, otherwise use as array
                  let activityLog: ActivityLogEntry[] = [];
                  if (summons.activity_log) {
                    if (typeof summons.activity_log === 'string') {
                      try {
                        activityLog = JSON.parse(summons.activity_log);
                      } catch {
                        activityLog = [];
                      }
                    } else if (Array.isArray(summons.activity_log)) {
                      activityLog = summons.activity_log;
                    }
                  }

                  const filteredLog = activityLog
                    // Only show entries older than 1 week (168 hours)
                    .filter((entry) => new Date(entry.date) < oneWeekAgo)
                    // Filter out duplicate entries (same date, type, and description)
                    .filter((entry, index, self) =>
                      index === self.findIndex((e) =>
                        e.date === entry.date &&
                        e.type === entry.type &&
                        e.description === entry.description
                      )
                    )
                    // Only show meaningful change types (not CREATED unless it's the only entry)
                    .filter((entry) =>
                      entry.type !== 'CREATED' ||
                      entry.old_value ||
                      entry.new_value
                    )
                    // Sort newest first
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (filteredLog.length === 0) {
                    return (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        No historical changes to display. Recent changes (within 1 week) are shown via the UPDATED badge.
                      </Typography>
                    );
                  }

                  return (
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
                      {filteredLog.map((entry: ActivityLogEntry, idx: number) => (
                        <Box
                          key={idx}
                          sx={{
                            position: 'relative',
                            pb: idx === filteredLog.length - 1 ? 0 : 2,
                            mb: idx === filteredLog.length - 1 ? 0 : 1,
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
                                {dayjs.utc(entry.date).tz(NYC_TIMEZONE).format('MMM D, YYYY h:mm A')}
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
                  );
                })()}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Tooltip
          title={summons.last_change_summary || 'No change details recorded'}
          arrow
          placement="top"
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mr: 'auto', cursor: summons.last_change_at ? 'help' : 'default' }}
          >
            {summons.last_change_at
              ? `Last Changed: ${dayjs.utc(summons.last_change_at).tz(NYC_TIMEZONE).format('MMM D, YYYY h:mm A')}`
              : `Created: ${summons.createdAt ? dayjs.utc(summons.createdAt).tz(NYC_TIMEZONE).format('MMM D, YYYY h:mm A') : 'Unknown'}`
            }
          </Typography>
        </Tooltip>
        <Button
          onClick={handleCartToggle}
          variant={inCart ? 'contained' : 'outlined'}
          color={inCart ? 'success' : 'primary'}
          startIcon={inCart ? <ShoppingCartIcon /> : <AddShoppingCartIcon />}
          sx={{ mr: 1 }}
        >
          {inCart ? 'In Invoice Cart' : 'Add to Invoice'}
        </Button>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>

      {/* Copy confirmation snackbar */}
      <Snackbar
        open={copySnackbar}
        autoHideDuration={3000}
        onClose={() => setCopySnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setCopySnackbar(false)}
          severity="success"
          sx={{ width: '100%' }}
        >
          Summons # {summons?.summons_number} copied! Paste it in the search box.
        </Alert>
      </Snackbar>
    </Dialog>
  );
};

export default SummonsDetailModal;

