/**
 * Invoice Summary Cards
 *
 * Weekly/monthly aggregated summaries of invoice statuses.
 * Uses groupInvoicesByWeek/Month from helpers with horizonColors.
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
} from '@mui/material';
import { Invoice, InvoicePeriodSummary } from '../types/invoiceTracker';
import {
  groupInvoicesByWeek,
  groupInvoicesByMonth,
  summarizeInvoicePeriod,
} from '../utils/invoiceTrackerHelpers';
import { horizonColors } from '../theme';

type ViewMode = 'weekly' | 'monthly';

interface InvoiceSummaryCardsProps {
  invoices: Invoice[];
}

const formatCurrency = (amount: number): string => {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const InvoiceSummaryCards = ({ invoices }: InvoiceSummaryCardsProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');

  const summaries = useMemo((): InvoicePeriodSummary[] => {
    const groups = viewMode === 'weekly'
      ? groupInvoicesByWeek(invoices)
      : groupInvoicesByMonth(invoices);

    const result: InvoicePeriodSummary[] = [];
    for (const [key, group] of groups) {
      result.push(summarizeInvoicePeriod(key, group[0]?.invoice_date || '', group));
    }

    // Sort descending (most recent first)
    return result.sort((a, b) => b.periodLabel.localeCompare(a.periodLabel));
  }, [invoices, viewMode]);

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Summary
        </Typography>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, newMode) => { if (newMode) setViewMode(newMode); }}
          size="small"
        >
          <ToggleButton value="weekly">Weekly</ToggleButton>
          <ToggleButton value="monthly">Monthly</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {summaries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No invoices to summarize.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {summaries.map((summary) => (
            <Card key={summary.periodLabel} variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {summary.periodLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {summary.totalInvoices} invoice{summary.totalInvoices !== 1 ? 's' : ''}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                  {summary.overdueCount > 0 && (
                    <Box sx={{
                      px: 1.5, py: 0.5, borderRadius: 1,
                      bgcolor: alpha(horizonColors.critical, 0.1),
                      color: horizonColors.critical,
                    }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {summary.overdueCount} overdue
                      </Typography>
                    </Box>
                  )}
                  {summary.unpaidCount > 0 && (
                    <Box sx={{
                      px: 1.5, py: 0.5, borderRadius: 1,
                      bgcolor: alpha(horizonColors.approaching, 0.1),
                      color: horizonColors.approaching,
                    }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {summary.unpaidCount} unpaid
                      </Typography>
                    </Box>
                  )}
                  {summary.paidCount > 0 && (
                    <Box sx={{
                      px: 1.5, py: 0.5, borderRadius: 1,
                      bgcolor: alpha(horizonColors.future, 0.1),
                      color: horizonColors.future,
                    }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {summary.paidCount} paid
                      </Typography>
                    </Box>
                  )}
                </Box>
                {summary.totalAmountOutstanding > 0 && (
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 500, color: horizonColors.critical }}>
                    Outstanding: {formatCurrency(summary.totalAmountOutstanding)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default InvoiceSummaryCards;
