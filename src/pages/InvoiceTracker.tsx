/**
 * Invoice Tracker Page
 *
 * Split-view layout mirroring CalendarDashboard:
 * - Left (35%): InvoiceCalendarPanel with colored dots and filter chips
 * - Right (65%): InvoiceListPanel with filter tabs + InvoiceSummaryCards
 *
 * @module pages/InvoiceTracker
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Grid,
  Typography,
  Alert,
  Snackbar,
  CircularProgress,
  Drawer,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';

import InvoiceCalendarPanel from '../components/InvoiceCalendarPanel';
import InvoiceListPanel from '../components/InvoiceListPanel';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import InvoiceSummaryCards from '../components/InvoiceSummaryCards';
import { useInvoiceTracker } from '../contexts/InvoiceTrackerContext';
import { Invoice, InvoiceHorizonFilter } from '../types/invoiceTracker';

dayjs.extend(utc);

const InvoiceTracker = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const {
    invoices,
    loading,
    error,
    fetchInvoices,
    markAsPaid,
    markAsUnpaid,
    updateAlertDeadline,
    updateNotes,
    deleteInvoice,
    getHorizonStats,
  } = useInvoiceTracker();

  // Re-fetch invoices every time the user navigates to this page
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [horizonFilter, setHorizonFilter] = useState<InvoiceHorizonFilter>(null);

  // Detail modal state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Mobile calendar drawer
  const [calendarDrawerOpen, setCalendarDrawerOpen] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const horizonStats = getHorizonStats();

  // Filter invoices by selected date
  const filteredInvoices = selectedDate
    ? invoices.filter((inv) => {
        const deadlineDate = dayjs.utc(inv.alert_deadline).format('YYYY-MM-DD');
        const paymentDate = inv.payment_date ? dayjs.utc(inv.payment_date).format('YYYY-MM-DD') : null;
        const targetDate = selectedDate.format('YYYY-MM-DD');
        return deadlineDate === targetDate || paymentDate === targetDate;
      })
    : invoices;

  const handleHorizonFilterClick = useCallback((filter: 'overdue' | 'due_soon' | 'paid') => {
    setHorizonFilter((prev) => (prev === filter ? null : filter));
  }, []);

  const handleInvoiceClick = useCallback((invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailModalOpen(true);
  }, []);

  const handleMarkPaid = useCallback(async (invoiceId: string) => {
    try {
      await markAsPaid(invoiceId, new Date().toISOString());
      setSnackbar({ open: true, message: 'Invoice marked as paid', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to update invoice', severity: 'error' });
    }
  }, [markAsPaid]);

  const handleMarkUnpaid = useCallback(async (invoiceId: string) => {
    try {
      await markAsUnpaid(invoiceId);
      setSnackbar({ open: true, message: 'Invoice marked as unpaid', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to update invoice', severity: 'error' });
    }
  }, [markAsUnpaid]);

  const handleModalMarkPaid = useCallback(async (invoiceId: string, paymentDate: string) => {
    try {
      await markAsPaid(invoiceId, paymentDate);
      setSnackbar({ open: true, message: 'Invoice marked as paid', severity: 'success' });
      setDetailModalOpen(false);
    } catch {
      setSnackbar({ open: true, message: 'Failed to update invoice', severity: 'error' });
    }
  }, [markAsPaid]);

  const handleModalMarkUnpaid = useCallback(async (invoiceId: string) => {
    try {
      await markAsUnpaid(invoiceId);
      setSnackbar({ open: true, message: 'Invoice marked as unpaid', severity: 'success' });
      setDetailModalOpen(false);
    } catch {
      setSnackbar({ open: true, message: 'Failed to update invoice', severity: 'error' });
    }
  }, [markAsUnpaid]);

  const handleDeleteInvoice = useCallback(async (invoice: Invoice) => {
    try {
      await deleteInvoice(invoice);
      setSnackbar({ open: true, message: 'Invoice deleted', severity: 'success' });
      setDetailModalOpen(false);
      setSelectedInvoice(null);
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete invoice', severity: 'error' });
    }
  }, [deleteInvoice]);

  const calendarPanel = (
    <InvoiceCalendarPanel
      invoices={invoices}
      selectedDate={selectedDate}
      onDateSelect={(date) => {
        setSelectedDate(date);
        if (isMobile) setCalendarDrawerOpen(false);
      }}
      horizonFilter={horizonFilter}
      horizonStats={horizonStats}
      onHorizonFilterClick={handleHorizonFilterClick}
    />
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <ReceiptLongIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Invoice Tracker
        </Typography>
        {isMobile && (
          <IconButton onClick={() => setCalendarDrawerOpen(true)} sx={{ ml: 'auto' }}>
            <CalendarMonthIcon />
          </IconButton>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}

      {/* Split Layout */}
      <Grid container spacing={3}>
        {/* Calendar panel - hidden on mobile (shown in drawer) */}
        {!isMobile && (
          <Grid item xs={12} md={4}>
            {calendarPanel}
          </Grid>
        )}

        {/* Invoice list + summary */}
        <Grid item xs={12} md={8}>
          <InvoiceListPanel
            invoices={filteredInvoices}
            horizonFilter={horizonFilter}
            onInvoiceClick={handleInvoiceClick}
            onMarkPaid={handleMarkPaid}
            onMarkUnpaid={handleMarkUnpaid}
          />
          <InvoiceSummaryCards invoices={invoices} />
        </Grid>
      </Grid>

      {/* Mobile Calendar Drawer */}
      {isMobile && (
        <Drawer
          anchor="left"
          open={calendarDrawerOpen}
          onClose={() => setCalendarDrawerOpen(false)}
          PaperProps={{ sx: { width: 320, p: 2 } }}
        >
          {calendarPanel}
        </Drawer>
      )}

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        open={detailModalOpen}
        invoice={selectedInvoice}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedInvoice(null);
        }}
        onMarkPaid={handleModalMarkPaid}
        onMarkUnpaid={handleModalMarkUnpaid}
        onUpdateDeadline={updateAlertDeadline}
        onUpdateNotes={updateNotes}
        onDelete={handleDeleteInvoice}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default InvoiceTracker;
