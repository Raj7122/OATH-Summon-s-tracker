/**
 * Advanced Filters Bar
 *
 * Always-visible filter row that sits above the summons grid on Dashboard
 * and ClientDetail. Two controls compose (AND) with whatever quick filters
 * the page already runs:
 *   1. Status — multi-select Autocomplete (options derived from data)
 *   2. Hearing Date range — From / To DatePickers
 *
 * Active selections render as deletable chips inline; a "Clear" link wipes
 * just the advanced filter state. Page-level "Clear all" buttons should
 * call onChange(EMPTY_ADVANCED_FILTERS).
 */

import { useMemo } from 'react';
import {
  Box,
  Paper,
  Autocomplete,
  TextField,
  Chip,
  Typography,
  Button,
  Stack,
} from '@mui/material';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import ClearIcon from '@mui/icons-material/Clear';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import { Summons, getStatusColor } from '../types/summons';
import {
  AdvancedFilterCriteria,
  EMPTY_ADVANCED_FILTERS,
  getStatusOptions,
  isAdvancedFilterActive,
} from '../lib/advancedFilter';

interface SummonsAdvancedFiltersProps {
  summonses: Summons[];
  value: AdvancedFilterCriteria;
  onChange: (next: AdvancedFilterCriteria) => void;
  /** Total before this component's filter is applied — for the "Showing X of Y" caption */
  totalCount: number;
  /** Total after this component's filter is applied */
  filteredCount: number;
}

const SummonsAdvancedFilters: React.FC<SummonsAdvancedFiltersProps> = ({
  summonses,
  value,
  onChange,
  totalCount,
  filteredCount,
}) => {
  const statusOptions = useMemo(() => getStatusOptions(summonses), [summonses]);
  const active = isAdvancedFilterActive(value);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        borderColor: 'divider',
        bgcolor: 'background.default',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 140 }}>
          <FilterAltOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Filter Report
          </Typography>
        </Box>

        <Autocomplete
          multiple
          size="small"
          options={statusOptions}
          value={value.statuses}
          onChange={(_, next) => onChange({ ...value, statuses: next })}
          sx={{ flex: 2, minWidth: 260 }}
          renderTags={(selected, getTagProps) =>
            selected.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={option}
                label={option}
                size="small"
                color={getStatusColor(option)}
                sx={{ fontWeight: 600 }}
              />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Status"
              placeholder={value.statuses.length === 0 ? 'Any status' : ''}
            />
          )}
        />

        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            label="Hearing From"
            value={value.dateFrom}
            onChange={(d) => onChange({ ...value, dateFrom: d })}
            slotProps={{
              textField: { size: 'small', sx: { flex: 1, minWidth: 160 } },
              field: { clearable: true, onClear: () => onChange({ ...value, dateFrom: null }) },
            }}
          />
          <DatePicker
            label="Hearing To"
            value={value.dateTo}
            onChange={(d) => onChange({ ...value, dateTo: d })}
            slotProps={{
              textField: { size: 'small', sx: { flex: 1, minWidth: 160 } },
              field: { clearable: true, onClear: () => onChange({ ...value, dateTo: null }) },
            }}
            minDate={value.dateFrom ?? undefined}
          />
        </LocalizationProvider>

        {active && (
          <Button
            onClick={() => onChange(EMPTY_ADVANCED_FILTERS)}
            startIcon={<ClearIcon />}
            size="small"
            color="secondary"
            sx={{ flexShrink: 0 }}
          >
            Clear
          </Button>
        )}
      </Stack>

      {active && (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} records
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default SummonsAdvancedFilters;
