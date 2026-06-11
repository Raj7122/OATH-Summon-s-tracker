/**
 * Invoice List Panel
 *
 * Displays filtered invoice list with status chips, filter tabs, and actions.
 * Follows SimpleSummonsTable pattern for consistent UI.
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Tabs,
  Tab,
  Tooltip,
  TableSortLabel,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Invoice, InvoiceHorizonFilter } from '../types/invoiceTracker';
import { getInvoiceHorizonColor, parseSentToClient } from '../utils/invoiceTrackerHelpers';
import { downloadCSV } from '../lib/csvExport';
import { generateInvoiceCSV, buildInvoiceCsvFilename } from '../lib/invoiceCsvExport';
import { horizonColors } from '../theme';

dayjs.extend(utc);

type FilterTab = 'all' | 'unpaid' | 'overdue' | 'paid';

// Columns the user can sort by via the clickable header labels.
type SortField =
  | 'invoice_number'
  | 'invoice_date'
  | 'recipient_company'
  | 'item_count'
  | 'total'
  | 'alert_deadline';

const TAB_LABELS: Record<FilterTab, string> = {
  all: 'All',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  paid: 'Paid',
};

interface InvoiceListPanelProps {
  invoices: Invoice[];
  horizonFilter: InvoiceHorizonFilter;
  onInvoiceClick: (invoice: Invoice) => void;
  onMarkPaid: (invoiceId: string) => void;
  onMarkUnpaid: (invoiceId: string) => void;
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

// Local timestamp (date + time) for the sent-to-client tooltip.
const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('M/DD/YY h:mm A') : '';
};

const InvoiceListPanel = ({
  invoices,
  horizonFilter,
  onInvoiceClick,
  onMarkPaid,
  onMarkUnpaid,
}: InvoiceListPanelProps) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  // null sortField = keep the default order from context (sorting is opt-in).
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Toggle direction when re-clicking the active column; otherwise switch to the
  // new column starting ascending (A→Z / oldest / smallest first).
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Apply both horizon filter (from calendar) and tab filter, then optional sort
  const filteredInvoices = useMemo(() => {
    let result = invoices;

    // Horizon filter from calendar chips
    if (horizonFilter) {
      result = result.filter((inv) => {
        const color = getInvoiceHorizonColor(inv);
        if (horizonFilter === 'overdue') return color === 'overdue';
        if (horizonFilter === 'due_soon') return color === 'dueSoon';
        if (horizonFilter === 'paid') return color === 'paid';
        return true;
      });
    }

    // Tab filter
    if (filterTab === 'unpaid') {
      result = result.filter((inv) => inv.payment_status === 'unpaid');
    } else if (filterTab === 'overdue') {
      result = result.filter((inv) => getInvoiceHorizonColor(inv) === 'overdue');
    } else if (filterTab === 'paid') {
      result = result.filter((inv) => inv.payment_status === 'paid');
    }

    // Sort (opt-in): compare on a copy so we never mutate the context array.
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortField) {
          case 'invoice_number':
          case 'recipient_company':
            // Case-insensitive alphabetical (e.g. "AAA EGG DEPOT" before "Benjamin").
            cmp = (a[sortField] || '').localeCompare(b[sortField] || '', undefined, {
              sensitivity: 'base',
            });
            break;
          case 'invoice_date':
          case 'alert_deadline':
            cmp = dayjs.utc(a[sortField]).valueOf() - dayjs.utc(b[sortField]).valueOf();
            break;
          case 'item_count':
            cmp = a.item_count - b.item_count;
            break;
          case 'total':
            // Grand total = legal fees + fines, matching the displayed Total column.
            cmp =
              a.total_legal_fees + a.total_fines_due - (b.total_legal_fees + b.total_fines_due);
            break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [invoices, horizonFilter, filterTab, sortField, sortDir]);

  const handleExportCsv = () => {
    const csv = generateInvoiceCSV(filteredInvoices);
    downloadCSV(csv, buildInvoiceCsvFilename(TAB_LABELS[filterTab]));
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

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Invoices
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FileDownloadIcon />}
          onClick={handleExportCsv}
          disabled={filteredInvoices.length === 0}
        >
          Export CSV
        </Button>
      </Box>

      {/* Filter tabs */}
      <Tabs
        value={filterTab}
        onChange={(_, newValue) => setFilterTab(newValue)}
        sx={{ mb: 2, minHeight: 36 }}
      >
        <Tab label={`All (${invoices.length})`} value="all" sx={{ minHeight: 36, py: 0 }} />
        <Tab label="Unpaid" value="unpaid" sx={{ minHeight: 36, py: 0 }} />
        <Tab label="Overdue" value="overdue" sx={{ minHeight: 36, py: 0 }} />
        <Tab label="Paid" value="paid" sx={{ minHeight: 36, py: 0 }} />
      </Tabs>

      {filteredInvoices.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No invoices match the current filter.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortField === 'invoice_number'}
                    direction={sortField === 'invoice_number' ? sortDir : 'asc'}
                    onClick={() => handleSort('invoice_number')}
                  >
                    Invoice #
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortField === 'invoice_date'}
                    direction={sortField === 'invoice_date' ? sortDir : 'asc'}
                    onClick={() => handleSort('invoice_date')}
                  >
                    Date
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortField === 'recipient_company'}
                    direction={sortField === 'recipient_company' ? sortDir : 'asc'}
                    onClick={() => handleSort('recipient_company')}
                  >
                    Recipient
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">
                  <TableSortLabel
                    active={sortField === 'item_count'}
                    direction={sortField === 'item_count' ? sortDir : 'asc'}
                    onClick={() => handleSort('item_count')}
                  >
                    Items
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  <TableSortLabel
                    active={sortField === 'total'}
                    direction={sortField === 'total' ? sortDir : 'asc'}
                    onClick={() => handleSort('total')}
                  >
                    Total
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortField === 'alert_deadline'}
                    direction={sortField === 'alert_deadline' ? sortDir : 'asc'}
                    onClick={() => handleSort('alert_deadline')}
                  >
                    Deadline
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredInvoices.map((invoice) => {
                const sentToClient = parseSentToClient(invoice.sent_to_client_attr);
                return (
                <TableRow
                  key={invoice.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onInvoiceClick(invoice)}
                >
                  <TableCell sx={{ fontWeight: 500, color: 'primary.main' }}>
                    {invoice.invoice_number}
                  </TableCell>
                  <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Tooltip title={invoice.recipient_attention || ''}>
                        <span>{invoice.recipient_company}</span>
                      </Tooltip>
                      {sentToClient && (
                        <Tooltip
                          title={`Sent to client on ${formatDateTime(sentToClient.date)}${sentToClient.by ? ` by ${sentToClient.by}` : ''}`}
                        >
                          <MarkEmailReadIcon sx={{ fontSize: 16, color: horizonColors.future }} />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">{invoice.item_count}</TableCell>
                  <TableCell align="right">
                    {formatCurrency(invoice.total_legal_fees + invoice.total_fines_due)}
                  </TableCell>
                  <TableCell align="center">{getStatusChip(invoice)}</TableCell>
                  <TableCell>{formatDate(invoice.alert_deadline)}</TableCell>
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    {invoice.payment_status === 'unpaid' ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        onClick={() => onMarkPaid(invoice.id)}
                      >
                        Mark Paid
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        onClick={() => onMarkUnpaid(invoice.id)}
                      >
                        Undo
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default InvoiceListPanel;
