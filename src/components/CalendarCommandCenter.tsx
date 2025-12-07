/**
 * Calendar Command Center Component
 *
 * Implements the Horizon System for calendar visualization:
 * - 🔴 Critical: ≤7 days OR dangerous status (Default/Judgment/Violation)
 * - 🟠 Approaching: 8-30 days away
 * - 🟢 Future: > 30 days away
 *
 * NOTE: "Busy (Volume)" logic has been REMOVED. Arthur cares about Time Horizon,
 * not raw volume. If a day has 10 hearings but they are 2 months away,
 * it is "Future" (Green), not "Danger".
 *
 * The dots on the calendar now mean the EXACT same thing as the chips above the grid.
 * Red = Red. Orange = Orange. Green = Green. Full consistency.
 *
 * @module components/CalendarCommandCenter
 */

import { useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Box, Typography, Paper, Card, CardContent, Chip, Button, alpha } from '@mui/material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import TodayIcon from '@mui/icons-material/Today';
import ClearIcon from '@mui/icons-material/Clear';
import { horizonColors } from '../theme';

// Import shared types
import { Summons } from '../types/summons';

// Configure dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

const NYC_TIMEZONE = 'America/New_York';

/**
 * Horizon System filter type
 * - critical: ≤7 days OR dangerous status
 * - approaching: 8-30 days
 * - future: > 30 days
 * - new: New records (createdAt within 72 hours)
 */
type HorizonFilter = 'critical' | 'approaching' | 'future' | 'new' | null;

/**
 * Horizon stats from parent (CalendarDashboard)
 * These count RECORDS, not days - the accurate counts for filtering
 */
interface HorizonStats {
  criticalCount: number;
  approachingCount: number;
  futureCount: number;
  newCount: number;
}

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
  /** Active Horizon System filter (for calendar highlighting) */
  horizonFilter?: HorizonFilter;
  /** Horizon stats (record counts) from parent */
  horizonStats?: HorizonStats;
  /** Callback when a Horizon filter chip is clicked */
  onHorizonFilterClick?: (filter: 'critical' | 'approaching' | 'future' | 'new') => void;
}

/**
 * Horizon-based dot urgency levels (matching header chips EXACTLY)
 *
 * - RED ('critical'): ≤7 days OR dangerous status (Default/Judgment/Violation)
 * - ORANGE ('approaching'): 8-30 days away
 * - GREEN ('future'): > 30 days away
 *
 * NOTE: Volume-based logic ("Busy 3+") has been REMOVED.
 * Arthur cares about TIME HORIZON, not raw count.
 */
type HorizonUrgency = 'critical' | 'approaching' | 'future';

/**
 * Props for the custom ServerDay component
 */
interface ServerDayProps extends PickersDayProps<Dayjs> {
  /** Map of dates to horizon urgency levels for dot rendering */
  highlightedDays: Map<string, HorizonUrgency>;
  /** Active horizon filter (for dimming non-matching dates) */
  activeHorizonFilter?: HorizonFilter;
}

/**
 * Custom day component that renders colored dots under dates with hearings
 *
 * Implements the Horizon System approach:
 * - 🔴 Red (#d32f2f): Critical (≤7 days OR dangerous status)
 * - 🟠 Orange (#ff9800): Approaching (8-30 days)
 * - 🟢 Green (#4caf50): Future (> 30 days)
 *
 * When a Horizon filter is active:
 * - Matching dates show full opacity with colored ring
 * - Non-matching dates are dimmed (0.3 opacity)
 */
function ServerDay(props: ServerDayProps) {
  const { highlightedDays, activeHorizonFilter, day, outsideCurrentMonth, ...other } = props;

  const dateKey = day.format('YYYY-MM-DD');
  const urgency = highlightedDays.get(dateKey);

  // Check if this date matches the active filter
  const matchesFilter = !activeHorizonFilter ||
    activeHorizonFilter === 'new' ||
    urgency === activeHorizonFilter;

  // Determine dot color based on Horizon urgency (using semantic colors)
  const dotColor = urgency === 'critical'
    ? horizonColors.critical  // Red - Critical (≤7 days OR danger status)
    : urgency === 'approaching'
    ? horizonColors.approaching  // Orange - Approaching (8-30 days)
    : urgency === 'future'
    ? horizonColors.future  // Green - Future (> 30 days)
    : undefined;

  // Dim non-matching dates when a filter is active
  const isDimmed = activeHorizonFilter &&
    activeHorizonFilter !== 'new' &&
    urgency &&
    urgency !== activeHorizonFilter;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: isDimmed ? 0.3 : 1,
        transition: 'all 0.25s ease-in-out',
        transform: isDimmed ? 'scale(0.95)' : 'scale(1)',
      }}
    >
      <PickersDay
        {...other}
        day={day}
        outsideCurrentMonth={outsideCurrentMonth}
        sx={{
          transition: 'all 0.2s ease-in-out',
          ...(urgency && {
            fontWeight: 600,
          }),
          // Highlight ring when this date matches active filter
          ...(activeHorizonFilter && matchesFilter && urgency && !outsideCurrentMonth && {
            border: '2px solid',
            borderColor: dotColor,
            borderRadius: '50%',
            backgroundColor: alpha(dotColor || '#000', 0.08),
            boxShadow: `0 0 8px ${alpha(dotColor || '#000', 0.3)}`,
          }),
          '&:hover': {
            transform: 'scale(1.1)',
          },
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
            transition: 'all 0.2s ease',
            boxShadow: `0 0 4px ${alpha(dotColor, 0.5)}`,
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
 * 1. MUI DateCalendar with Horizon System dots
 * 2. Day Breakdown summary for selected date
 * 3. Quick navigation controls
 */
const CalendarCommandCenter: React.FC<CalendarCommandCenterProps> = ({
  summonses,
  selectedDate,
  onDateSelect,
  horizonFilter,
  horizonStats,
  onHorizonFilterClick,
}) => {
  const now = dayjs().tz(NYC_TIMEZONE);

  /**
   * Build the highlighted days map using PURE Horizon System logic
   *
   * IMPORTANT: Volume-based logic ("Busy 3+") has been REMOVED.
   * Dots now match header chips EXACTLY:
   *
   * - RED ('critical'): Date has at least 1 hearing that is:
   *   - ≤7 days away (imminent deadline)
   *   - OR has dangerous status (Default/Judgment/Violation)
   * - ORANGE ('approaching'): Date has hearings 8-30 days away (and none critical)
   * - GREEN ('future'): Date has hearings > 30 days away (and none critical/approaching)
   *
   * The "highest urgency wins" rule applies per date.
   */
  const highlightedDays = useMemo(() => {
    // Track the highest urgency level for each date
    const dateUrgency = new Map<string, HorizonUrgency>();

    summonses.forEach((summons) => {
      if (!summons.hearing_date) return;

      // Use UTC parsing to get correct date, then format for display
      const hearingDate = dayjs.utc(summons.hearing_date);
      const dateKey = hearingDate.format('YYYY-MM-DD');
      const daysUntil = hearingDate.diff(now.startOf('day'), 'day');

      // Skip past hearings - no dots for dates that already passed
      if (daysUntil < 0) return;

      // Determine this summons's horizon category
      const status = (summons.status || '').toUpperCase();
      const isDangerStatus =
        status.includes('DEFAULT') ||
        status.includes('JUDGMENT') ||
        status.includes('VIOLATION') ||
        status.includes('FAILURE TO APPEAR');

      let thisUrgency: HorizonUrgency;
      if (daysUntil <= 7 || isDangerStatus) {
        thisUrgency = 'critical';
      } else if (daysUntil <= 30) {
        thisUrgency = 'approaching';
      } else {
        thisUrgency = 'future';
      }

      // Keep the highest urgency for each date (critical > approaching > future)
      const currentUrgency = dateUrgency.get(dateKey);
      if (!currentUrgency) {
        dateUrgency.set(dateKey, thisUrgency);
      } else if (thisUrgency === 'critical' && currentUrgency !== 'critical') {
        dateUrgency.set(dateKey, 'critical');
      } else if (thisUrgency === 'approaching' && currentUrgency === 'future') {
        dateUrgency.set(dateKey, 'approaching');
      }
    });

    return dateUrgency;
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
      // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
      const hearingDateKey = dayjs.utc(s.hearing_date).format('YYYY-MM-DD');
      return hearingDateKey === dateKey;
    });
  }, [summonses, selectedDate]);

  /**
   * Calculate critical count for selected date (danger status only)
   */
  const selectedDateCriticalCount = useMemo(() => {
    return selectedDateSummonses.filter((s) => {
      const status = s.status?.toUpperCase() || '';
      return status.includes('DEFAULT') || status.includes('VIOLATION') || status.includes('JUDGMENT');
    }).length;
  }, [selectedDateSummonses]);

  /**
   * Get total upcoming hearings count for the "no date selected" message
   * NOTE: Horizon stats (Critical/Approaching/Future record counts) are now
   * shown ONLY in the Dashboard header (CalendarDashboard.tsx) where they
   * are accurate and clickable. The Command Center just shows the calendar.
   */
  const totalUpcomingHearings = useMemo(() => {
    return summonses.filter(s => {
      // Use UTC parsing to avoid timezone shift (hearing_date is stored as date-only in UTC)
      const hearingDate = dayjs.utc(s.hearing_date);
      return hearingDate.isAfter(now.subtract(1, 'day'));
    }).length;
  }, [summonses, now]);
  
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
      elevation={0}
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
        borderRadius: 4,
        boxShadow: '0px 4px 20px rgba(145, 158, 171, 0.08)',
        border: (theme) => `1px solid ${alpha(theme.palette.grey[500], 0.08)}`,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 2.5,
            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
            mr: 1.5,
          }}
        >
          <TodayIcon sx={{ color: 'primary.main', fontSize: 22 }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary' }}>
          Hearing Docket
        </Typography>
      </Box>

      {/* Horizon System Filter Chips - Interactive toggle buttons */}
      {horizonStats && onHorizonFilterClick && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
          {/* 🔴 Critical: ≤7 days OR dangerous status */}
          {horizonStats.criticalCount > 0 && (
            <Chip
              label={`${horizonStats.criticalCount} Critical`}
              color="error"
              size="small"
              onClick={() => onHorizonFilterClick('critical')}
              variant={horizonFilter === 'critical' ? 'filled' : 'outlined'}
              sx={{
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: 2,
                px: 0.5,
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${alpha(horizonColors.critical, 0.35)}`,
                },
                ...(horizonFilter === 'critical' && {
                  boxShadow: `0 4px 14px ${alpha(horizonColors.critical, 0.4)}`,
                  transform: 'translateY(-1px)',
                }),
              }}
            />
          )}
          {/* 🟠 Approaching: 8-30 days away */}
          {horizonStats.approachingCount > 0 && (
            <Chip
              label={`${horizonStats.approachingCount} Approaching`}
              color="warning"
              size="small"
              onClick={() => onHorizonFilterClick('approaching')}
              variant={horizonFilter === 'approaching' ? 'filled' : 'outlined'}
              sx={{
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: 2,
                px: 0.5,
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${alpha(horizonColors.approaching, 0.35)}`,
                },
                ...(horizonFilter === 'approaching' && {
                  boxShadow: `0 4px 14px ${alpha(horizonColors.approaching, 0.4)}`,
                  transform: 'translateY(-1px)',
                }),
              }}
            />
          )}
          {/* 🟢 Future: > 30 days away */}
          {horizonStats.futureCount > 0 && (
            <Chip
              label={`${horizonStats.futureCount} Future`}
              color="success"
              size="small"
              onClick={() => onHorizonFilterClick('future')}
              variant={horizonFilter === 'future' ? 'filled' : 'outlined'}
              sx={{
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: 2,
                px: 0.5,
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${alpha(horizonColors.future, 0.35)}`,
                },
                ...(horizonFilter === 'future' && {
                  boxShadow: `0 4px 14px ${alpha(horizonColors.future, 0.4)}`,
                  transform: 'translateY(-1px)',
                }),
              }}
            />
          )}
          {/* NEW records badge */}
          {horizonStats.newCount > 0 && (
            <Chip
              label={`${horizonStats.newCount} New`}
              color="info"
              size="small"
              onClick={() => onHorizonFilterClick('new')}
              variant={horizonFilter === 'new' ? 'filled' : 'outlined'}
              sx={{
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: 2,
                px: 0.5,
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${alpha(horizonColors.new, 0.35)}`,
                },
                ...(horizonFilter === 'new' && {
                  boxShadow: `0 4px 14px ${alpha(horizonColors.new, 0.4)}`,
                  transform: 'translateY(-1px)',
                }),
              }}
            />
          )}
        </Box>
      )}
      
      {/* MUI DateCalendar with Horizon System Heatmap */}
      <Card
        elevation={0}
        sx={{
          mb: 2.5,
          borderRadius: 3,
          border: (theme) => `1px solid ${alpha(theme.palette.grey[300], 0.5)}`,
          overflow: 'hidden',
        }}
      >
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DateCalendar
            value={selectedDate}
            onChange={handleDateChange}
            views={['year', 'month', 'day']}
            openTo="day"
            slots={{
              day: ServerDay as React.ComponentType<PickersDayProps<Dayjs>>,
            }}
            slotProps={{
              day: (ownerState) => ({
                highlightedDays,
                activeHorizonFilter: horizonFilter,
                ...ownerState,
              }),
            }}
            sx={{
              width: '100%',
              '& .MuiPickersCalendarHeader-root': {
                paddingLeft: 2,
                paddingRight: 2,
                marginTop: 1.5,
                marginBottom: 1,
                '& .MuiPickersCalendarHeader-label': {
                  fontWeight: 700,
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  '&:hover': {
                    color: 'primary.main',
                  },
                },
                '& .MuiPickersCalendarHeader-switchViewButton': {
                  padding: 1,
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                },
              },
              '& .MuiDayCalendar-weekDayLabel': {
                fontWeight: 600,
                color: 'text.secondary',
              },
              '& .MuiDayCalendar-weekContainer': {
                justifyContent: 'space-around',
              },
              '& .MuiPickersDay-root': {
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                },
              },
              '& .Mui-selected': {
                backgroundColor: 'primary.main',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(25, 118, 210, 0.35)',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
              },
              '& .MuiPickersArrowSwitcher-button': {
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                  transform: 'scale(1.1)',
                },
              },
            }}
          />
        </LocalizationProvider>
      </Card>
      
      {/* Calendar Legend - Horizon System (matches header chips EXACTLY) */}
      <Box
        sx={{
          display: 'flex',
          gap: 2.5,
          mb: 2.5,
          px: 1.5,
          py: 1,
          flexWrap: 'wrap',
          backgroundColor: (theme) => alpha(theme.palette.grey[500], 0.04),
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: horizonColors.critical,
              boxShadow: `0 0 6px ${alpha(horizonColors.critical, 0.5)}`,
            }}
          />
          <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
            Critical (≤7 days)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: horizonColors.approaching,
              boxShadow: `0 0 6px ${alpha(horizonColors.approaching, 0.5)}`,
            }}
          />
          <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
            Approaching (8-30 days)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: horizonColors.future,
              boxShadow: `0 0 6px ${alpha(horizonColors.future, 0.5)}`,
            }}
          />
          <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
            Future (&gt;30 days)
          </Typography>
        </Box>
      </Box>
      
      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<TodayIcon />}
          onClick={handleGoToToday}
          sx={{
            flex: 1,
            borderRadius: 2.5,
            py: 1,
            fontWeight: 600,
            borderWidth: 1.5,
            transition: 'all 0.2s ease',
            '&:hover': {
              borderWidth: 1.5,
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
            },
          }}
        >
          Today
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ClearIcon />}
          onClick={handleClearSelection}
          disabled={!selectedDate}
          sx={{
            flex: 1,
            borderRadius: 2.5,
            py: 1,
            fontWeight: 600,
            borderWidth: 1.5,
            transition: 'all 0.2s ease',
            '&:hover': {
              borderWidth: 1.5,
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
            },
          }}
        >
          Clear
        </Button>
      </Box>
      
      {/* Day Breakdown Panel */}
      <Card
        elevation={0}
        sx={{
          mt: 'auto',
          borderRadius: 3,
          backgroundColor: selectedDate
            ? (theme) => alpha(theme.palette.primary.main, 0.04)
            : 'transparent',
          border: selectedDate ? '1.5px solid' : '1.5px dashed',
          borderColor: selectedDate
            ? (theme) => alpha(theme.palette.primary.main, 0.3)
            : (theme) => alpha(theme.palette.grey[400], 0.5),
          transition: 'all 0.3s ease',
        }}
      >
        <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
          {selectedDate ? (
            <>
              <Typography
                variant="subtitle1"
                sx={{
                  color: 'primary.main',
                  fontWeight: 700,
                  mb: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                {selectedDate.format('MMMM D, YYYY')}
                {selectedDate.isSame(now, 'day') && (
                  <Chip
                    label="TODAY"
                    size="small"
                    color="primary"
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      borderRadius: 1.5,
                    }}
                  />
                )}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  <Box component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {selectedDateSummonses.length}
                  </Box>{' '}
                  Hearing{selectedDateSummonses.length !== 1 ? 's' : ''} Scheduled
                </Typography>
                {selectedDateCriticalCount > 0 && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'error.main',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: 'error.main',
                        animation: 'pulse 2s infinite',
                        '@keyframes pulse': {
                          '0%': { opacity: 1 },
                          '50%': { opacity: 0.5 },
                          '100%': { opacity: 1 },
                        },
                      }}
                    />
                    <strong>{selectedDateCriticalCount}</strong> Critical Status
                  </Typography>
                )}
                {selectedDateSummonses.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No hearings on this date
                  </Typography>
                )}
              </Box>

              {/* Preview of clients on this date */}
              {selectedDateSummonses.length > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {selectedDateSummonses.slice(0, 3).map((s) => (
                    <Chip
                      key={s.id}
                      label={s.respondent_name}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: '0.7rem',
                        height: 24,
                        fontWeight: 500,
                        borderRadius: 1.5,
                        borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        },
                      }}
                    />
                  ))}
                  {selectedDateSummonses.length > 3 && (
                    <Chip
                      label={`+${selectedDateSummonses.length - 3} more`}
                      size="small"
                      sx={{
                        fontSize: '0.7rem',
                        height: 24,
                        fontWeight: 500,
                        fontStyle: 'italic',
                        borderRadius: 1.5,
                        backgroundColor: (theme) => alpha(theme.palette.grey[500], 0.08),
                        color: 'text.secondary',
                      }}
                    />
                  )}
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                Select a date to view day breakdown
              </Typography>
              <Typography variant="caption" color="text.disabled">
                or view all{' '}
                <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {totalUpcomingHearings}
                </Box>{' '}
                upcoming hearings
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Paper>
  );
};

export default CalendarCommandCenter;

