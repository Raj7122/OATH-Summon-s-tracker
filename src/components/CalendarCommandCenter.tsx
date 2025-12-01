/**
 * Calendar Command Center Component
 * 
 * Implements the "Heatmap Strategy" for the calendar-centric dashboard layout.
 * Displays an MUI DateCalendar with colored dot badges under dates that have hearings:
 * - Red Dot: Critical/Urgent hearing (≤7 business days)
 * - Blue Dot: Standard hearing (8+ days out)
 * 
 * Below the calendar, shows a "Day Breakdown" text summary of the selected date.
 * Clicking a date triggers the onDateSelect callback to filter the DataGrid.
 * 
 * UX Philosophy: "Arthur" needs instant visual triage - the heatmap dots enable
 * pre-attentive processing so he can identify busy/critical days at a glance.
 * 
 * @module components/CalendarCommandCenter
 */

import { useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Box, Typography, Paper, Card, CardContent, Chip, Button } from '@mui/material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventIcon from '@mui/icons-material/Event';
import TodayIcon from '@mui/icons-material/Today';
import ClearIcon from '@mui/icons-material/Clear';

// Import shared types
import { Summons } from '../types/summons';

// Configure dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

const NYC_TIMEZONE = 'America/New_York';

/**
 * Props for CalendarCommandCenter component
 */
interface CalendarCommandCenterProps {
  /** Array of summons to analyze for heatmap */
  summonses: Summons[];
  /** Currently selected date (null = no selection, show all) */
  selectedDate: Dayjs | null;
  /** Callback when a date is selected */
  onDateSelect: (date: Dayjs | null) => void;
}

/**
 * Props for the custom ServerDay component
 */
interface ServerDayProps extends PickersDayProps<Dayjs> {
  /** Map of dates to urgency levels for dot rendering */
  highlightedDays: Map<string, 'critical' | 'standard'>;
}

/**
 * Custom day component that renders colored dots under dates with hearings
 * 
 * Implements the "Heatmap" approach:
 * - Small colored dot badge appears UNDER the day number
 * - Red (#d32f2f) for critical/urgent hearings
 * - Blue (#0288d1) for standard hearings
 * 
 * This avoids trying to render text inside calendar days, which is not
 * supported well by MUI DateCalendar.
 */
function ServerDay(props: ServerDayProps) {
  const { highlightedDays, day, outsideCurrentMonth, ...other } = props;
  
  const dateKey = day.format('YYYY-MM-DD');
  const urgency = highlightedDays.get(dateKey);
  
  // Determine dot color based on urgency
  const dotColor = urgency === 'critical' ? '#d32f2f' : urgency === 'standard' ? '#0288d1' : undefined;
  
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <PickersDay
        {...other}
        day={day}
        outsideCurrentMonth={outsideCurrentMonth}
        sx={{
          ...(urgency && {
            fontWeight: 'bold',
          }),
        }}
      />
      {/* Colored dot indicator below the day */}
      {dotColor && !outsideCurrentMonth && (
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: dotColor,
            position: 'absolute',
            bottom: 2,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </Box>
  );
}

/**
 * Calendar Command Center Component
 * 
 * The left column (35%) of the split-view dashboard layout.
 * Contains:
 * 1. MUI DateCalendar with heatmap dots
 * 2. Day Breakdown summary for selected date
 * 3. Quick navigation controls
 */
const CalendarCommandCenter: React.FC<CalendarCommandCenterProps> = ({
  summonses,
  selectedDate,
  onDateSelect,
}) => {
  const now = dayjs().tz(NYC_TIMEZONE);
  
  /**
   * Build the highlighted days map for the heatmap
   * 
   * Analyzes all summonses and categorizes dates as 'critical' or 'standard'
   * based on proximity to today:
   * - Critical: 0-7 days out
   * - Standard: 8+ days out
   */
  const highlightedDays = useMemo(() => {
    const dateMap = new Map<string, 'critical' | 'standard'>();
    
    summonses.forEach((summons) => {
      if (!summons.hearing_date) return;
      
      const hearingDate = dayjs(summons.hearing_date).tz(NYC_TIMEZONE);
      const dateKey = hearingDate.format('YYYY-MM-DD');
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');
      
      // Critical: within 7 days (including today and past)
      // Standard: 8+ days out
      const urgency: 'critical' | 'standard' = daysUntil <= 7 ? 'critical' : 'standard';
      
      // Only upgrade to critical, never downgrade
      if (!dateMap.has(dateKey) || urgency === 'critical') {
        dateMap.set(dateKey, urgency);
      }
    });
    
    return dateMap;
  }, [summonses, now]);
  
  /**
   * Get summonses for the selected date
   *
   * Note: hearing_date is stored as ISO format (e.g., "2025-01-15T00:00:00.000Z")
   * We compare by extracting the date portion only.
   */
  const selectedDateSummonses = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = selectedDate.format('YYYY-MM-DD');
    return summonses.filter((s) => {
      if (!s.hearing_date) return false;
      const hearingDateKey = dayjs(s.hearing_date).format('YYYY-MM-DD');
      return hearingDateKey === dateKey;
    });
  }, [summonses, selectedDate]);
  
  /**
   * Calculate critical count for selected date
   */
  const criticalCount = useMemo(() => {
    return selectedDateSummonses.filter((s) => {
      const status = s.status?.toUpperCase() || '';
      return status.includes('DEFAULT') || status.includes('VIOLATION') || status.includes('JUDGMENT');
    }).length;
  }, [selectedDateSummonses]);
  
  /**
   * Get summary stats for the calendar overview
   */
  const calendarStats = useMemo(() => {
    const criticalDates = new Set<string>();
    const standardDates = new Set<string>();
    
    highlightedDays.forEach((urgency, date) => {
      if (urgency === 'critical') {
        criticalDates.add(date);
      } else {
        standardDates.add(date);
      }
    });
    
    return {
      criticalDays: criticalDates.size,
      standardDays: standardDates.size,
      totalHearings: summonses.filter(s => {
        const hearingDate = dayjs(s.hearing_date);
        return hearingDate.isAfter(now.subtract(1, 'day'));
      }).length,
    };
  }, [highlightedDays, summonses, now]);
  
  /**
   * Handle date selection from calendar
   */
  const handleDateChange = (date: Dayjs | null) => {
    onDateSelect(date);
  };
  
  /**
   * Clear date selection to show all summonses
   */
  const handleClearSelection = () => {
    onDateSelect(null);
  };
  
  /**
   * Jump to today
   */
  const handleGoToToday = () => {
    onDateSelect(now);
  };
  
  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
        borderRadius: 2,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <TodayIcon sx={{ color: 'primary.main', mr: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Command Center
        </Typography>
      </Box>
      
      {/* Calendar Stats Summary */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          icon={<WarningAmberIcon />}
          label={`${calendarStats.criticalDays} Critical Days`}
          size="small"
          sx={{
            backgroundColor: '#ffebee',
            color: '#d32f2f',
            fontWeight: 500,
            '& .MuiChip-icon': { color: '#d32f2f' },
          }}
        />
        <Chip
          icon={<EventIcon />}
          label={`${calendarStats.standardDays} Upcoming Days`}
          size="small"
          sx={{
            backgroundColor: '#e3f2fd',
            color: '#0288d1',
            fontWeight: 500,
            '& .MuiChip-icon': { color: '#0288d1' },
          }}
        />
      </Box>
      
      {/* MUI DateCalendar with Heatmap */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DateCalendar
            value={selectedDate}
            onChange={handleDateChange}
            slots={{
              day: ServerDay as React.ComponentType<PickersDayProps<Dayjs>>,
            }}
            slotProps={{
              day: (ownerState) => ({
                highlightedDays,
                ...ownerState,
              }),
            }}
            sx={{
              width: '100%',
              '& .MuiPickersCalendarHeader-root': {
                paddingLeft: 2,
                paddingRight: 2,
              },
              '& .MuiDayCalendar-weekContainer': {
                justifyContent: 'space-around',
              },
              '& .MuiPickersDay-root': {
                fontSize: '0.875rem',
              },
              '& .Mui-selected': {
                backgroundColor: 'primary.main',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
              },
            }}
          />
        </LocalizationProvider>
      </Card>
      
      {/* Calendar Legend */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, px: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#d32f2f',
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Critical (≤7 days)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#0288d1',
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Standard (8+ days)
          </Typography>
        </Box>
      </Box>
      
      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<TodayIcon />}
          onClick={handleGoToToday}
          sx={{ flex: 1 }}
        >
          Today
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ClearIcon />}
          onClick={handleClearSelection}
          disabled={!selectedDate}
          sx={{ flex: 1 }}
        >
          Clear
        </Button>
      </Box>
      
      {/* Day Breakdown Panel */}
      <Card
        variant="outlined"
        sx={{
          mt: 'auto',
          backgroundColor: selectedDate ? 'grey.50' : 'transparent',
          border: selectedDate ? '1px solid' : '1px dashed',
          borderColor: selectedDate ? 'primary.main' : 'grey.300',
        }}
      >
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          {selectedDate ? (
            <>
              <Typography
                variant="subtitle2"
                sx={{
                  color: 'primary.main',
                  fontWeight: 600,
                  mb: 1,
                }}
              >
                {selectedDate.format('MMMM D, YYYY')}
                {selectedDate.isSame(now, 'day') && (
                  <Chip
                    label="TODAY"
                    size="small"
                    color="primary"
                    sx={{ ml: 1, height: 20, fontSize: '0.65rem' }}
                  />
                )}
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2">
                  <strong>{selectedDateSummonses.length}</strong> Hearing{selectedDateSummonses.length !== 1 ? 's' : ''} Scheduled
                </Typography>
                {criticalCount > 0 && (
                  <Typography
                    variant="body2"
                    sx={{ color: 'error.main', fontWeight: 500 }}
                  >
                    <strong>{criticalCount}</strong> Critical Status
                  </Typography>
                )}
                {selectedDateSummonses.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No hearings on this date
                  </Typography>
                )}
              </Box>
              
              {/* Preview of clients on this date */}
              {selectedDateSummonses.length > 0 && (
                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selectedDateSummonses.slice(0, 3).map((s) => (
                    <Chip
                      key={s.id}
                      label={s.respondent_name}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  ))}
                  {selectedDateSummonses.length > 3 && (
                    <Chip
                      label={`+${selectedDateSummonses.length - 3} more`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22, fontStyle: 'italic' }}
                    />
                  )}
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Select a date to view day breakdown
              </Typography>
              <Typography variant="caption" color="text.secondary">
                or view all {calendarStats.totalHearings} upcoming hearings
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Paper>
  );
};

export default CalendarCommandCenter;

