/**
 * Invoice Calendar Panel
 *
 * Calendar visualization for invoice deadlines using the Horizon System.
 * Adapted from CalendarCommandCenter pattern for invoice-specific semantics.
 *
 * Dot colors:
 * - Red: overdue (past alert_deadline AND unpaid)
 * - Orange: due soon (within 3 days of deadline AND unpaid)
 * - Green: paid
 * - Blue: normal unpaid (not yet due)
 */

import { useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Box, Typography, Paper, Chip, Button, alpha } from '@mui/material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import TodayIcon from '@mui/icons-material/Today';
import ClearIcon from '@mui/icons-material/Clear';
import { horizonColors } from '../theme';
import { Invoice, InvoiceHorizonFilter, InvoiceHorizonStats } from '../types/invoiceTracker';
import { getInvoiceHorizonColor } from '../utils/invoiceTrackerHelpers';

dayjs.extend(utc);

type DotColor = 'overdue' | 'dueSoon' | 'paid' | 'normal';

interface InvoiceServerDayProps extends PickersDayProps<Dayjs> {
  highlightedDays: Map<string, DotColor>;
  activeFilter?: InvoiceHorizonFilter;
}

/**
 * Custom day component with colored dots for invoice deadlines
 */
function InvoiceServerDay(props: InvoiceServerDayProps) {
  const { highlightedDays, activeFilter, day, outsideCurrentMonth, ...other } = props;

  const dateKey = day.format('YYYY-MM-DD');
  const dotType = highlightedDays.get(dateKey);

  const dotColor = dotType === 'overdue'
    ? horizonColors.critical
    : dotType === 'dueSoon'
    ? horizonColors.approaching
    : dotType === 'paid'
    ? horizonColors.future
    : dotType === 'normal'
    ? horizonColors.new
    : undefined;

  // Check if dot matches active filter
  const matchesFilter = !activeFilter ||
    (activeFilter === 'overdue' && dotType === 'overdue') ||
    (activeFilter === 'due_soon' && dotType === 'dueSoon') ||
    (activeFilter === 'paid' && dotType === 'paid');

  const isDimmed = activeFilter && dotType && !matchesFilter;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: isDimmed ? 0.3 : 1,
        transition: 'all 0.25s ease-in-out',
      }}
    >
      <PickersDay
        {...other}
        day={day}
        outsideCurrentMonth={outsideCurrentMonth}
        sx={{
          transition: 'all 0.2s ease-in-out',
          ...(dotType && { fontWeight: 600 }),
          ...(activeFilter && matchesFilter && dotType && !outsideCurrentMonth && {
            border: '2px solid',
            borderColor: dotColor,
            borderRadius: '50%',
            backgroundColor: alpha(dotColor || '#000', 0.08),
          }),
        }}
      />
      {/* Colored dot under the date */}
      {dotType && !outsideCurrentMonth && (
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: dotColor,
            position: 'absolute',
            bottom: 2,
          }}
        />
      )}
    </Box>
  );
}

interface InvoiceCalendarPanelProps {
  invoices: Invoice[];
  selectedDate: Dayjs | null;
  onDateSelect: (date: Dayjs | null) => void;
  horizonFilter: InvoiceHorizonFilter;
  horizonStats: InvoiceHorizonStats;
  onHorizonFilterClick: (filter: 'overdue' | 'due_soon' | 'paid') => void;
}

const InvoiceCalendarPanel = ({
  invoices,
  selectedDate,
  onDateSelect,
  horizonFilter,
  horizonStats,
  onHorizonFilterClick,
}: InvoiceCalendarPanelProps) => {
  // Build map of date -> dot color for the calendar heatmap
  // Dots placed on alert_deadline for unpaid, payment_date for paid
  const highlightedDays = useMemo(() => {
    const map = new Map<string, DotColor>();
    for (const inv of invoices) {
      const color = getInvoiceHorizonColor(inv);
      const dateKey = inv.payment_status === 'paid' && inv.payment_date
        ? dayjs.utc(inv.payment_date).format('YYYY-MM-DD')
        : dayjs.utc(inv.alert_deadline).format('YYYY-MM-DD');

      // If multiple invoices on same day, prioritize: overdue > dueSoon > normal > paid
      const existing = map.get(dateKey);
      if (!existing || priorityOf(color) > priorityOf(existing)) {
        map.set(dateKey, color);
      }
    }
    return map;
  }, [invoices]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Invoice Calendar
      </Typography>

      {/* Horizon filter chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Chip
          label={`Overdue (${horizonStats.overdueCount})`}
          size="small"
          onClick={() => onHorizonFilterClick('overdue')}
          sx={{
            bgcolor: horizonFilter === 'overdue' ? horizonColors.critical : alpha(horizonColors.critical, 0.12),
            color: horizonFilter === 'overdue' ? '#fff' : horizonColors.critical,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        />
        <Chip
          label={`Due Soon (${horizonStats.dueSoonCount})`}
          size="small"
          onClick={() => onHorizonFilterClick('due_soon')}
          sx={{
            bgcolor: horizonFilter === 'due_soon' ? horizonColors.approaching : alpha(horizonColors.approaching, 0.12),
            color: horizonFilter === 'due_soon' ? '#fff' : horizonColors.approaching,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        />
        <Chip
          label={`Paid (${horizonStats.paidCount})`}
          size="small"
          onClick={() => onHorizonFilterClick('paid')}
          sx={{
            bgcolor: horizonFilter === 'paid' ? horizonColors.future : alpha(horizonColors.future, 0.12),
            color: horizonFilter === 'paid' ? '#fff' : horizonColors.future,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        />
      </Box>

      {/* Calendar */}
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <DateCalendar
          value={selectedDate}
          onChange={(newValue) => onDateSelect(newValue)}
          slots={{
            day: InvoiceServerDay as any,
          }}
          slotProps={{
            day: {
              highlightedDays,
              activeFilter: horizonFilter,
            } as any,
          }}
          sx={{
            width: '100%',
            '& .MuiPickersCalendarHeader-root': {
              paddingLeft: 1,
              paddingRight: 1,
            },
          }}
        />
      </LocalizationProvider>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button
          size="small"
          startIcon={<TodayIcon />}
          onClick={() => onDateSelect(dayjs())}
        >
          Today
        </Button>
        {selectedDate && (
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={() => onDateSelect(null)}
          >
            Clear
          </Button>
        )}
      </Box>
    </Paper>
  );
};

function priorityOf(color: DotColor): number {
  switch (color) {
    case 'overdue': return 3;
    case 'dueSoon': return 2;
    case 'normal': return 1;
    case 'paid': return 0;
  }
}

export default InvoiceCalendarPanel;
