/**
 * Invoice Detail Modal
 *
 * Shows full invoice details with payment management and linked summonses.
 * Follows SummonsDetailModal pattern (MUI Dialog, 2-column grid).
 */

import { useState } from 'react';
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
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CircularProgress from '@mui/material/CircularProgress';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { getUrl } from 'aws-amplify/storage';
import { Invoice } from '../types/invoiceTracker';
import { getInvoiceHorizonColor } from '../utils/invoiceTrackerHelpers';
import { horizonColors } from '../theme';

dayjs.extend(utc);

interface InvoiceDetailModalProps {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onMarkPaid: (invoiceId: string, paymentDate: string) => Promise<void>;
  onMarkUnpaid: (invoiceId: string) => Promise<void>;
  onUpdateDeadline: (invoiceId: string, newDeadline: string) => Promise<void>;
  onUpdateNotes: (invoiceId: string, notes: string) => Promise<void>;
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

const InvoiceDetailModal = ({
  open,
  invoice,
  onClose,
  onMarkPaid,
  onMarkUnpaid,
  onUpdateDeadline,
  onUpdateNotes,
  onDelete,
}: InvoiceDetailModalProps) => {
  const [paymentDate, setPaymentDate] = useState<dayjs.Dayjs | null>(dayjs());
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  if (!invoice) return null;

  const horizonColor = getInvoiceHorizonColor(invoice);

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

  const handleMarkPaid = async () => {
    const dateStr = paymentDate ? paymentDate.toISOString() : new Date().toISOString();
    await onMarkPaid(invoice.id, dateStr);
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

  const summonsItems = invoice.items?.items || [];

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
          {invoice.pdf_s3_key && (
            <Tooltip title="View saved invoice file">
              <IconButton
                onClick={handleViewInvoice}
                size="small"
                color="primary"
                disabled={loadingPdf}
              >
                {loadingPdf ? <CircularProgress size={18} /> : <PictureAsPdfIcon />}
              </IconButton>
            </Tooltip>
          )}
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
                Paid on {formatDate(invoice.payment_date)}
              </Typography>
            ) : (
              <Typography variant="body1" color="text.secondary">Unpaid</Typography>
            )}
          </Box>
        </Box>

        {/* Financial Summary */}
        <Box sx={{ display: 'flex', gap: 4, mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
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
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Summonses on this invoice */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Summonses ({summonsItems.length})
        </Typography>
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
            No linked summonses found.
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Payment Date"
                value={paymentDate}
                onChange={setPaymentDate}
                slotProps={{ textField: { size: 'small', sx: { width: 180 } } }}
              />
            </LocalizationProvider>
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
