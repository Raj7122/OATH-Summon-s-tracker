/**
 * Invoice List Panel
 *
 * Displays filtered invoice list with status chips, filter tabs, and actions.
 * Follows SimpleSummonsTable pattern for consistent UI.
 */

import { useMemo, useState } from 'react';
import {
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
} from '@mui/material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Invoice, InvoiceHorizonFilter } from '../types/invoiceTracker';
import { getInvoiceHorizonColor } from '../utils/invoiceTrackerHelpers';
import { horizonColors } from '../theme';

dayjs.extend(utc);

type FilterTab = 'all' | 'unpaid' | 'overdue' | 'paid';

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

const InvoiceListPanel = ({
  invoices,
  horizonFilter,
  onInvoiceClick,
  onMarkPaid,
  onMarkUnpaid,
}: InvoiceListPanelProps) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Apply both horizon filter (from calendar) and tab filter
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

    return result;
  }, [invoices, horizonFilter, filterTab]);

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
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Invoices
      </Typography>

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
                <TableCell sx={{ fontWeight: 600 }}>Invoice #</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Recipient</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Items</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Total</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Deadline</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredInvoices.map((invoice) => (
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
                    <Tooltip title={invoice.recipient_attention || ''}>
                      <span>{invoice.recipient_company}</span>
                    </Tooltip>
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
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default InvoiceListPanel;
