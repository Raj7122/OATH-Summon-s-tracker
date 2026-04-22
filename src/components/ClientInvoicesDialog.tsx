/**
 * Client Invoices Dialog
 *
 * Full-screen (on mobile) / large (on desktop) dialog shown from the
 * "Invoices" metric tile on the Client Detail page. Lists every invoice
 * that references this client via Invoice.clientID.
 *
 * Row click opens the existing InvoiceDetailModal, which gives full parity
 * with the Invoice Tracker page (mark paid/unpaid, edit, delete, view PDF).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Collapse,
  CircularProgress,
  Snackbar,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { generateClient } from 'aws-amplify/api';
import { getUrl } from 'aws-amplify/storage';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { invoicesByClientBasic, invoiceSummonsForInvoice, updateInvoiceRecord, deleteInvoiceRecord, deleteInvoiceSummonsRecord } from '../graphql/customQueries';
import { Invoice, InvoiceSummonsItem } from '../types/invoiceTracker';
import { getInvoiceHorizonColor } from '../utils/invoiceTrackerHelpers';
import { horizonColors } from '../theme';
import InvoiceDetailModal from './InvoiceDetailModal';

dayjs.extend(utc);

const apiClient = generateClient();

type FilterTab = 'all' | 'unpaid' | 'overdue' | 'paid';

interface ClientInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
  clientID: string;
  clientName: string;
  onCountChange?: (count: number) => void;
  /**
   * Fired after any invoice mutation (mark paid/unpaid, delete) so the
   * parent page can refresh its own derived state — e.g. the Paid column
   * on ClientDetail. Firing on every mutation (not just create/delete)
   * keeps the parent in sync without a navigation round-trip.
   */
  onInvoicesChanged?: () => void;
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

const getStatusChip = (invoice: Invoice) => {
  const color = getInvoiceHorizonColor(invoice);
  switch (color) {
    case 'overdue':
      return <Chip label="OVERDUE" size="small" sx={{ bgcolor: horizonColors.critical, color: '#fff', fontWeight: 600 }} />;
    case 'dueSoon':
      return <Chip label="DUE SOON" size="small" sx={{ bgcolor: horizonColors.approaching, color: '#fff', fontWeight: 600 }} />;
    case 'paid':
      return <Chip label="PAID" size="small" sx={{ bgcolor: horizonColors.future, color: '#fff', fontWeight: 600 }} />;
    default:
      return <Chip label="UNPAID" size="small" variant="outlined" />;
  }
};

interface InvoiceRowProps {
  invoice: Invoice;
  onOpen: (invoice: Invoice) => void;
  onViewPdfError: (message: string) => void;
}

const InvoiceRow = ({ invoice, onOpen, onViewPdfError }: InvoiceRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const summonsItems = invoice.items?.items || [];

  const handleViewPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!invoice.pdf_s3_key) return;
    setLoadingPdf(true);
    try {
      const url = await getUrl({ key: invoice.pdf_s3_key, options: { expiresIn: 3600 } });
      window.open(url.url.toString(), '_blank');
    } catch (err) {
      console.error('Error fetching PDF URL:', err);
      onViewPdfError('Could not open invoice file.');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer', '& > td': { borderBottom: 'unset' } }} onClick={() => onOpen(invoice)}>
        <TableCell sx={{ width: 40 }} onClick={handleToggleExpand}>
          <IconButton size="small">
            {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell align="center">{getStatusChip(invoice)}</TableCell>
        <TableCell sx={{ fontWeight: 500, color: 'primary.main' }}>{invoice.invoice_number}</TableCell>
        <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
        <TableCell>
          <Tooltip title={invoice.recipient_attention || ''}>
            <span>{invoice.recipient_company}</span>
          </Tooltip>
        </TableCell>
        <TableCell>{formatDate(invoice.alert_deadline)}</TableCell>
        <TableCell align="center">{invoice.item_count}</TableCell>
        <TableCell align="right">{formatCurrency(invoice.total_legal_fees)}</TableCell>
        <TableCell align="right">{formatCurrency(invoice.total_fines_due)}</TableCell>
        <TableCell align="center">
          {invoice.pdf_s3_key ? (
            <Tooltip title="View saved invoice file">
              <span>
                <IconButton size="small" color="primary" onClick={handleViewPdf} disabled={loadingPdf}>
                  {loadingPdf ? <CircularProgress size={16} /> : <PictureAsPdfIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Typography variant="caption" color="text.disabled">—</Typography>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={10} sx={{ py: 0, borderBottom: expanded ? '1px solid' : 'none', borderColor: 'divider' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 1, bgcolor: 'grey.50' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Summonses on this invoice ({summonsItems.length})
              </Typography>
              {summonsItems.length > 0 ? (
                <Table size="small" sx={{ mt: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.100' }}>Summons #</TableCell>
                      <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.100' }} align="right">Legal Fee</TableCell>
                      <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.100' }} align="right">Amount Due</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summonsItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell sx={{ color: 'primary.main', fontWeight: 500, fontFamily: 'monospace' }}>
                          {item.summons_number}
                        </TableCell>
                        <TableCell align="right">{formatCurrency(item.legal_fee)}</TableCell>
                        <TableCell align="right">{formatCurrency(item.amount_due)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No linked summonses on this invoice.
                </Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const ClientInvoicesDialog = ({ open, onClose, clientID, clientName, onCountChange, onInvoicesChanged }: ClientInvoicesDialogProps) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchInvoices = useCallback(async () => {
    if (!clientID) return;
    setLoading(true);
    setError(null);

    // Amplify v6 throws on GraphQL errors but still attaches partial data to
    // the thrown object. Normalize both paths so we use whatever data came
    // back and still surface the error message.
    type InvoicesByClientResponse = {
      data?: { invoicesByClientID?: { items?: Invoice[]; nextToken?: string | null } };
      errors?: Array<{ message?: string; errorType?: string }>;
    };
    type InvoiceSummonsResponse = {
      data?: { invoiceSummonsByInvoiceIDAndSummonsID?: { items?: InvoiceSummonsItem[]; nextToken?: string | null } };
      errors?: Array<{ message?: string }>;
    };

    const all: Invoice[] = [];
    let nextToken: string | null = null;
    let fetchCount = 0;
    let firstError: string | null = null;

    try {
      // Step 1: fetch the list of invoices for this client (no nested items).
      while (fetchCount < 20) {
        let response: InvoicesByClientResponse;
        try {
          response = (await apiClient.graphql({
            query: invoicesByClientBasic,
            variables: { clientID, limit: 1000, nextToken },
          })) as InvoicesByClientResponse;
        } catch (thrown) {
          response = thrown as InvoicesByClientResponse;
        }

        if (response?.errors?.length) {
          console.error('[ClientInvoicesDialog] GraphQL errors listing invoices:', response.errors);
          if (!firstError) firstError = response.errors[0]?.message || 'Unknown GraphQL error';
        }

        const page = response?.data?.invoicesByClientID;
        if (!page) break;
        all.push(...(page.items || []));
        nextToken = page.nextToken || null;
        fetchCount++;
        if (!nextToken) break;
      }

      // Step 2: hydrate each invoice's linked summonses in parallel. If any of
      // these fail, we still show the invoice row — just without the expanded
      // summons list.
      await Promise.all(all.map(async (inv) => {
        try {
          const itemsResp = (await apiClient.graphql({
            query: invoiceSummonsForInvoice,
            variables: { invoiceID: inv.id, limit: 1000 },
          })) as InvoiceSummonsResponse;
          const items = itemsResp?.data?.invoiceSummonsByInvoiceIDAndSummonsID?.items || [];
          inv.items = { items };
        } catch (err) {
          console.warn(`[ClientInvoicesDialog] Could not load summons for invoice ${inv.id}:`, err);
          inv.items = { items: [] };
        }
      }));

      all.sort((a, b) => dayjs.utc(b.invoice_date).valueOf() - dayjs.utc(a.invoice_date).valueOf());
      setInvoices(all);
      onCountChange?.(all.length);

      if (all.length === 0 && firstError) {
        setError(`Failed to load invoices: ${firstError}`);
      }
    } catch (err) {
      console.error('[ClientInvoicesDialog] Unexpected error fetching invoices:', err);
      setError('Failed to load invoices for this client.');
    } finally {
      setLoading(false);
    }
  }, [clientID, onCountChange]);

  useEffect(() => {
    if (open) fetchInvoices();
  }, [open, fetchInvoices]);

  const filteredInvoices = useMemo(() => {
    if (filterTab === 'all') return invoices;
    if (filterTab === 'unpaid') return invoices.filter((inv) => inv.payment_status === 'unpaid');
    if (filterTab === 'overdue') return invoices.filter((inv) => getInvoiceHorizonColor(inv) === 'overdue');
    if (filterTab === 'paid') return invoices.filter((inv) => inv.payment_status === 'paid');
    return invoices;
  }, [invoices, filterTab]);

  const handleOpenDetail = useCallback((invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedInvoice(null);
  }, []);

  // InvoiceDetailModal callbacks — persist the change and refresh the list so
  // the client dialog reflects the new state immediately. Also notify the
  // parent page (ClientDetail) so its derived state (Paid column, invoice
  // count tile) refreshes without requiring navigation.
  const handleMarkPaid = useCallback(async (invoiceId: string, paymentDate: string) => {
    try {
      await apiClient.graphql({
        query: updateInvoiceRecord,
        variables: { input: { id: invoiceId, payment_status: 'paid', payment_date: paymentDate } },
      });
      setSnackbar({ open: true, message: 'Invoice marked as paid', severity: 'success' });
      await fetchInvoices();
      onInvoicesChanged?.();
      handleCloseDetail();
    } catch (err) {
      console.error('Error marking invoice paid:', err);
      setSnackbar({ open: true, message: 'Failed to update invoice', severity: 'error' });
    }
  }, [fetchInvoices, handleCloseDetail, onInvoicesChanged]);

  const handleMarkUnpaid = useCallback(async (invoiceId: string) => {
    try {
      await apiClient.graphql({
        query: updateInvoiceRecord,
        variables: { input: { id: invoiceId, payment_status: 'unpaid', payment_date: null } },
      });
      setSnackbar({ open: true, message: 'Invoice marked as unpaid', severity: 'success' });
      await fetchInvoices();
      onInvoicesChanged?.();
      handleCloseDetail();
    } catch (err) {
      console.error('Error marking invoice unpaid:', err);
      setSnackbar({ open: true, message: 'Failed to update invoice', severity: 'error' });
    }
  }, [fetchInvoices, handleCloseDetail, onInvoicesChanged]);

  const handleUpdateDeadline = useCallback(async (invoiceId: string, newDeadline: string) => {
    try {
      await apiClient.graphql({
        query: updateInvoiceRecord,
        variables: { input: { id: invoiceId, alert_deadline: newDeadline } },
      });
      await fetchInvoices();
    } catch (err) {
      console.error('Error updating deadline:', err);
      setSnackbar({ open: true, message: 'Failed to update deadline', severity: 'error' });
    }
  }, [fetchInvoices]);

  const handleUpdateNotes = useCallback(async (invoiceId: string, notes: string) => {
    try {
      await apiClient.graphql({
        query: updateInvoiceRecord,
        variables: { input: { id: invoiceId, notes } },
      });
      await fetchInvoices();
    } catch (err) {
      console.error('Error updating notes:', err);
      setSnackbar({ open: true, message: 'Failed to update notes', severity: 'error' });
    }
  }, [fetchInvoices]);

  const handleDelete = useCallback(async (invoice: Invoice) => {
    try {
      const items = invoice.items?.items || [];
      if (items.length > 0) {
        await Promise.all(items.map((item) =>
          apiClient.graphql({
            query: deleteInvoiceSummonsRecord,
            variables: { input: { id: item.id } },
          })
        ));
      }
      await apiClient.graphql({
        query: deleteInvoiceRecord,
        variables: { input: { id: invoice.id } },
      });
      setSnackbar({ open: true, message: 'Invoice deleted', severity: 'success' });
      await fetchInvoices();
      onInvoicesChanged?.();
      handleCloseDetail();
    } catch (err) {
      console.error('Error deleting invoice:', err);
      setSnackbar({ open: true, message: 'Failed to delete invoice', severity: 'error' });
    }
  }, [fetchInvoices, handleCloseDetail, onInvoicesChanged]);

  const unpaidCount = useMemo(() => invoices.filter((inv) => inv.payment_status === 'unpaid').length, [invoices]);
  const overdueCount = useMemo(() => invoices.filter((inv) => getInvoiceHorizonColor(inv) === 'overdue').length, [invoices]);
  const paidCount = useMemo(() => invoices.filter((inv) => inv.payment_status === 'paid').length, [invoices]);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Invoices for {clientName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {invoices.length} invoice{invoices.length === 1 ? '' : 's'} on file
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Tabs
            value={filterTab}
            onChange={(_, newValue) => setFilterTab(newValue)}
            sx={{ mb: 2, minHeight: 36 }}
          >
            <Tab label={`All (${invoices.length})`} value="all" sx={{ minHeight: 36, py: 0 }} />
            <Tab label={`Unpaid (${unpaidCount})`} value="unpaid" sx={{ minHeight: 36, py: 0 }} />
            <Tab label={`Overdue (${overdueCount})`} value="overdue" sx={{ minHeight: 36, py: 0 }} />
            <Tab label={`Paid (${paidCount})`} value="paid" sx={{ minHeight: 36, py: 0 }} />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : filteredInvoices.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {invoices.length === 0
                  ? 'No invoices for this client yet.'
                  : 'No invoices match the current filter.'}
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ width: 40 }} />
                    <TableCell sx={{ fontWeight: 600 }} align="center">Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Invoice #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Recipient</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Deadline</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Items</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Legal Fees</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Fines Due</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">PDF</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      onOpen={handleOpenDetail}
                      onViewPdfError={(msg) => setSnackbar({ open: true, message: msg, severity: 'error' })}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      <InvoiceDetailModal
        open={detailOpen}
        invoice={selectedInvoice}
        onClose={handleCloseDetail}
        onMarkPaid={handleMarkPaid}
        onMarkUnpaid={handleMarkUnpaid}
        onUpdateDeadline={handleUpdateDeadline}
        onUpdateNotes={handleUpdateNotes}
        onDelete={handleDelete}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ClientInvoicesDialog;
