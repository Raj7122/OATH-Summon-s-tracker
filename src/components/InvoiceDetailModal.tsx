/**
 * Invoice Detail Modal
 *
 * Shows full invoice details with payment management and linked summonses.
 * Follows SummonsDetailModal pattern (MUI Dialog, 2-column grid).
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Divider,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Alert,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import GridOnIcon from '@mui/icons-material/GridOn';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import { useNavigate } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { getUrl } from 'aws-amplify/storage';
import { generateClient } from 'aws-amplify/api';
import { Invoice, InvoiceSummonsItem, SentToClientAttribution } from '../types/invoiceTracker';
import { getAmountReceived, getInvoiceHorizonColor, parseSentToClient } from '../utils/invoiceTrackerHelpers';
import { horizonColors } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { formatFromKey, formatLabel, InvoiceFormat } from '../utils/invoiceFormat';
import { buildInvoiceDocInputs } from '../utils/invoiceDocInputs';
import { fetchAllInvoiceItems } from '../utils/fetchAllInvoiceItems';
import { generatePDF, generateDOCX, generateXLSX } from '../utils/invoiceGenerator';

dayjs.extend(utc);

const apiClient = generateClient();

interface InvoiceDetailModalProps {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  /** amountPaid is the money the firm actually received (legal fees), not the billed total. */
  onMarkPaid: (invoiceId: string, paymentDate: string, amountPaid: number) => Promise<void>;
  onMarkUnpaid: (invoiceId: string) => Promise<void>;
  onUpdateDeadline: (invoiceId: string, newDeadline: string) => Promise<void>;
  onUpdateNotes: (invoiceId: string, notes: string) => Promise<void>;
  onMarkSentToClient: (invoiceId: string, attr: SentToClientAttribution | null) => Promise<void>;
  onDelete: (invoice: Invoice) => Promise<void>;
}

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const d = dayjs.utc(dateStr);
  return d.isValid() ? d.format('M/DD/YY') : '—';
};

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Local timestamp (date + time) for the sent-to-client stamp.
const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('M/DD/YY h:mm A') : '—';
};

// Icon that matches an invoice file format, so the UI reflects the ACTUAL
// stored/target type (Word / Excel / PDF) instead of always showing PDF.
const formatIcon = (format: InvoiceFormat) => {
  switch (format) {
    case 'docx':
      return <DescriptionIcon fontSize="small" />;
    case 'xlsx':
      return <GridOnIcon fontSize="small" />;
    case 'pdf':
    default:
      return <PictureAsPdfIcon fontSize="small" />;
  }
};

const InvoiceDetailModal = ({
  open,
  invoice,
  onClose,
  onMarkPaid,
  onMarkUnpaid,
  onUpdateDeadline,
  onUpdateNotes,
  onMarkSentToClient,
  onDelete,
}: InvoiceDetailModalProps) => {
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const [paymentDate, setPaymentDate] = useState<dayjs.Dayjs | null>(dayjs());
  // Held as a raw string so the field can be cleared and typed through ("1" -> "1." -> "1.5");
  // parsed only on submit.
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  // "Get invoice file" menu (view original / regenerate in another format).
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null);
  // Which format is currently being regenerated on demand (null = idle).
  const [regenerating, setRegenerating] = useState<InvoiceFormat | null>(null);
  // Complete join rows for this invoice, paged off the byInvoice GSI (see the effect below).
  const [summonsItems, setSummonsItems] = useState<InvoiceSummonsItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // Re-prime the payment inputs whenever a different invoice is opened. This modal
  // instance is long-lived (the parent keeps it mounted and swaps the `invoice` prop),
  // so without this the previous invoice's payment date and amount leak into the next.
  // Amount defaults to the legal fees — the firm collects those; the fines on the
  // invoice are paid by the client directly to the court.
  useEffect(() => {
    if (open && invoice) {
      setAmountPaidInput(invoice.total_legal_fees.toFixed(2));
      setPaymentDate(dayjs());
    }
  }, [open, invoice?.id, invoice?.total_legal_fees]);

  // Load the invoice's real line items. We can't use invoice.items.items — the
  // parent's list/get query reads that through the hasMany connection, whose
  // resolver caps it at 100 rows, so a 214-item invoice rendered 100 here and
  // regenerated 100-row documents. Page the byInvoice GSI instead.
  useEffect(() => {
    if (!open || !invoice?.id) {
      setSummonsItems([]);
      setItemsError(null);
      return;
    }
    let cancelled = false;
    const loadItems = async () => {
      setLoadingItems(true);
      setItemsError(null);
      try {
        const rows = await fetchAllInvoiceItems(apiClient, invoice.id);
        if (!cancelled) setSummonsItems(rows);
      } catch (err) {
        console.error('Failed to load invoice line items:', err);
        // Surface it rather than rendering an empty/partial list as if it were
        // the whole invoice — the regenerate actions read the same rows.
        if (!cancelled) {
          setSummonsItems([]);
          setItemsError('Could not load the line items for this invoice.');
        }
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    };
    loadItems();
    return () => {
      cancelled = true;
    };
  }, [open, invoice?.id]);

  // Navigate to the InvoiceBuilder page in edit mode. Closing the modal first
  // prevents a flash of a stale invoice detail on return.
  const handleEditInvoice = () => {
    if (!invoice) return;
    onClose();
    navigate(`/invoice-builder?editInvoiceId=${invoice.id}`);
  };

  if (!invoice) return null;

  const horizonColor = getInvoiceHorizonColor(invoice);
  const sentToClient = parseSentToClient(invoice.sent_to_client_attr);

  const statusChipProps = (() => {
    switch (horizonColor) {
      case 'overdue':
        return { label: 'OVERDUE', sx: { bgcolor: horizonColors.critical, color: '#fff' } };
      case 'dueSoon':
        return { label: 'DUE SOON', sx: { bgcolor: horizonColors.approaching, color: '#fff' } };
      case 'paid':
        return { label: 'PAID', sx: { bgcolor: horizonColors.future, color: '#fff' } };
      default:
        return { label: 'UNPAID', variant: 'outlined' as const, sx: {} };
    }
  })();

  const handleViewInvoice = async () => {
    if (!invoice?.pdf_s3_key) return;
    setLoadingPdf(true);
    try {
      const urlResult = await getUrl({
        key: invoice.pdf_s3_key,
        options: { expiresIn: 3600 },
      });
      window.open(urlResult.url.toString(), '_blank');
    } catch (error) {
      console.error('Error getting invoice file URL:', error);
    } finally {
      setLoadingPdf(false);
    }
  };

  // Regenerate the invoice in an arbitrary format from its saved data, so the
  // Tracker isn't locked to whatever format it was first saved as. PDF opens in
  // a new tab (blank tab opened synchronously to survive popup blockers, since
  // the object URL is only ready after an await); Word/Excel download via the
  // generator's own saveAs. Fees/fines come out exactly as saved (see
  // buildInvoiceDocInputs); display-only columns reflect the latest case data.
  const handleGetAs = async (format: InvoiceFormat) => {
    if (!invoice) return;
    // Refuse to regenerate from an incomplete line-item list — producing a document
    // that silently omits violations is the bug this whole change exists to stop.
    if (loadingItems || itemsError || summonsItems.length === 0) {
      console.error('Refusing to regenerate invoice: line items are not fully loaded.');
      setFileMenuAnchor(null);
      return;
    }
    setFileMenuAnchor(null);
    const pdfTab = format === 'pdf' ? window.open('', '_blank') : null;
    setRegenerating(format);
    try {
      // Pass the rows we already paged in; buildInvoiceDocInputs would otherwise
      // fetch them again.
      const { items, recipient, options, extras } = await buildInvoiceDocInputs(
        invoice,
        apiClient,
        summonsItems,
      );
      if (format === 'docx') {
        await generateDOCX(items, recipient, options, extras, true);
      } else if (format === 'xlsx') {
        await generateXLSX(items, recipient, options, extras, true);
      } else {
        const { blob } = await generatePDF(items, recipient, options, extras, false);
        const url = URL.createObjectURL(blob);
        if (pdfTab) pdfTab.location.href = url;
        else window.open(url, '_blank');
        // Revoke after the tab has had time to load the document.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      console.error(`Error regenerating invoice as ${format}:`, error);
      if (pdfTab) pdfTab.close();
    } finally {
      setRegenerating(null);
    }
  };

  const handleMarkPaid = async () => {
    const dateStr = paymentDate ? paymentDate.toISOString() : new Date().toISOString();
    // Blank or unusable input falls back to the legal-fees default rather than
    // blocking the user — same amount the quick "Mark Paid" button in the list uses.
    const parsed = parseFloat(amountPaidInput);
    const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : invoice.total_legal_fees;
    await onMarkPaid(invoice.id, dateStr, amount);
  };

  // Toggle the "sent to client" stamp. Marks sent with the current user + time,
  // or clears it when already sent (undo).
  const handleToggleSentToClient = async () => {
    if (sentToClient) {
      await onMarkSentToClient(invoice.id, null);
    } else {
      await onMarkSentToClient(invoice.id, {
        sent: true,
        by: userInfo?.displayName || 'Unknown User',
        userId: userInfo?.userId,
        date: dayjs().toISOString(),
      });
    }
  };

  const handleSaveNotes = async () => {
    await onUpdateNotes(invoice.id, notesValue);
    setEditingNotes(false);
  };

  const handleDelete = async () => {
    if (!invoice) return;
    setDeleting(true);
    try {
      await onDelete(invoice);
      setDeleteConfirmOpen(false);
    } catch {
      // Error handled by parent
    } finally {
      setDeleting(false);
    }
  };

  const startEditingNotes = () => {
    setNotesValue(invoice.notes || '');
    setEditingNotes(true);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {invoice.invoice_number}
          </Typography>
          <Chip size="small" {...statusChipProps} sx={{ ...statusChipProps.sx, fontWeight: 600 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Get invoice file (view or download as PDF, Word, or Excel)">
            <IconButton
              aria-label="Get invoice file"
              onClick={(e) => setFileMenuAnchor(e.currentTarget)}
              size="small"
              color="primary"
              disabled={loadingPdf || regenerating !== null}
            >
              {loadingPdf || regenerating !== null ? <CircularProgress size={18} /> : <FileDownloadIcon />}
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={fileMenuAnchor}
            open={Boolean(fileMenuAnchor)}
            onClose={() => setFileMenuAnchor(null)}
          >
            {invoice.pdf_s3_key && (
              <MenuItem
                onClick={() => {
                  setFileMenuAnchor(null);
                  handleViewInvoice();
                }}
              >
                <ListItemIcon>{formatIcon(formatFromKey(invoice.pdf_s3_key))}</ListItemIcon>
                <ListItemText>
                  Open saved file ({formatLabel(formatFromKey(invoice.pdf_s3_key))})
                </ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={() => handleGetAs('pdf')}>
              <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Open as PDF</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleGetAs('docx')}>
              <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Download as Word</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleGetAs('xlsx')}>
              <ListItemIcon><GridOnIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Download as Excel</ListItemText>
            </MenuItem>
          </Menu>
          <Tooltip title="Edit invoice (recipient, line items, fees)">
            <IconButton onClick={handleEditInvoice} size="small" color="primary">
              <EditIcon />
            </IconButton>
          </Tooltip>
          <IconButton
            onClick={() => setDeleteConfirmOpen(true)}
            size="small"
            color="error"
            sx={{ '&:hover': { bgcolor: 'error.light', color: '#fff' } }}
          >
            <DeleteOutlineIcon />
          </IconButton>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Invoice Metadata */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Invoice Date</Typography>
            <Typography variant="body1">{formatDate(invoice.invoice_date)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Alert Deadline</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body1">{formatDate(invoice.alert_deadline)}</Typography>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  value={dayjs.utc(invoice.alert_deadline)}
                  onChange={(newValue) => {
                    if (newValue) onUpdateDeadline(invoice.id, newValue.toISOString());
                  }}
                  slotProps={{
                    textField: { size: 'small', sx: { width: 150 } },
                  }}
                />
              </LocalizationProvider>
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Recipient</Typography>
            <Typography variant="body1">{invoice.recipient_company}</Typography>
            {invoice.recipient_attention && (
              <Typography variant="body2" color="text.secondary">
                Attn: {invoice.recipient_attention}
              </Typography>
            )}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Payment Status</Typography>
            {invoice.payment_status === 'paid' ? (
              <Typography variant="body1" sx={{ color: horizonColors.future }}>
                {formatCurrency(getAmountReceived(invoice))} paid on {formatDate(invoice.payment_date)}
              </Typography>
            ) : (
              <Typography variant="body1" color="text.secondary">Unpaid</Typography>
            )}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Sent to Client</Typography>
            {sentToClient ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: horizonColors.future }}>
                  <MarkEmailReadIcon fontSize="small" />
                  <Typography variant="body1">
                    Sent {formatDateTime(sentToClient.date)}
                    {sentToClient.by ? ` by ${sentToClient.by}` : ''}
                  </Typography>
                </Box>
                <Button size="small" onClick={handleToggleSentToClient}>Undo</Button>
              </Box>
            ) : (
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<MarkEmailReadIcon />}
                  onClick={handleToggleSentToClient}
                >
                  Mark Sent to Client
                </Button>
              </Box>
            )}
          </Box>
        </Box>

        {/* Financial Summary. Total is what was BILLED; the Paid tile (paid invoices only)
            is what the firm actually RECEIVED — legal fees, since fines go to the court. */}
        <Box sx={{ display: 'flex', gap: 4, mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Legal Fees</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{formatCurrency(invoice.total_legal_fees)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Fines Due</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{formatCurrency(invoice.total_fines_due)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
              {formatCurrency(invoice.total_legal_fees + invoice.total_fines_due)}
            </Typography>
          </Box>
          {invoice.payment_status === 'paid' && (
            <Box>
              <Typography variant="caption" color="text.secondary">Paid</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: horizonColors.future }}>
                {formatCurrency(getAmountReceived(invoice))}
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Summonses on this invoice */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          Summonses ({loadingItems ? '…' : summonsItems.length})
          {loadingItems && <CircularProgress size={14} />}
        </Typography>
        {itemsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {itemsError}
          </Alert>
        )}
        {summonsItems.length > 0 ? (
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Summons #</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Legal Fee</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Amount Due</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summonsItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell sx={{ color: 'primary.main', fontWeight: 500 }}>
                      {item.summons_number}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(item.legal_fee)}</TableCell>
                    <TableCell align="right">{formatCurrency(item.amount_due)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {loadingItems ? 'Loading summonses…' : itemsError ? '' : 'No linked summonses found.'}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Notes */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Notes</Typography>
        {editingNotes ? (
          <Box>
            <TextField
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              multiline
              rows={3}
              fullWidth
              size="small"
              autoFocus
            />
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button size="small" variant="contained" onClick={handleSaveNotes}>Save</Button>
              <Button size="small" onClick={() => setEditingNotes(false)}>Cancel</Button>
            </Box>
          </Box>
        ) : (
          <Box
            onClick={startEditingNotes}
            sx={{ cursor: 'pointer', p: 1, borderRadius: 1, '&:hover': { bgcolor: 'grey.50' }, minHeight: 40 }}
          >
            <Typography variant="body2" color={invoice.notes ? 'text.primary' : 'text.secondary'}>
              {invoice.notes || 'Click to add notes...'}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {invoice.payment_status === 'unpaid' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', flexWrap: 'wrap' }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Payment Date"
                value={paymentDate}
                onChange={setPaymentDate}
                slotProps={{ textField: { size: 'small', sx: { width: 180 } } }}
              />
            </LocalizationProvider>
            <TextField
              label="Amount Paid"
              type="number"
              size="small"
              value={amountPaidInput}
              onChange={(e) => setAmountPaidInput(e.target.value)}
              inputProps={{ min: 0, step: 25, style: { textAlign: 'right' } }}
              helperText="Legal fees only"
              sx={{ width: 160 }}
            />
            <Button variant="contained" color="success" onClick={handleMarkPaid}>
              Mark as Paid
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose}>Close</Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
            <Button
              variant="outlined"
              color="warning"
              onClick={() => onMarkUnpaid(invoice.id)}
            >
              Mark as Unpaid
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose}>Close</Button>
          </Box>
        )}
      </DialogActions>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Invoice</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete invoice <strong>{invoice.invoice_number}</strong>?
            This will permanently remove the invoice and all its linked summons records. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default InvoiceDetailModal;
