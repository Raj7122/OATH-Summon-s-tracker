/**
 * Simple Summons Table Component
 *
 * Implements the "No-Scroll Rule" - a streamlined DataGrid with only 5 columns:
 * 1. Status (Chip with NEW/UPDATED badge) - Fixed Width
 * 2. Client Name - Flex Width
 * 3. Violation Date (NEW) - Sortable (for Lag Time calculation)
 * 4. Hearing Date - Sortable (Default Sort)
 * 5. Action Icon (to open detail modal)
 *
 * NOTE: "Violation Type" column REMOVED - redundant since app strictly filters
 * for "Idling" cases only. Seeing "Idling" repeated 50 times helps no one.
 *
 * UX Philosophy: Fitts's Law - filter tabs attached directly to grid top,
 * reducing distance to high-frequency actions.
 *
 * Lag Time Strategy: Arthur compares Violation Date vs Hearing Date to calculate
 * "Lag Time" - a key defense strategy metric.
 *
 * @module components/SimpleSummonsTable
 */

import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with UTC plugin for correct date parsing
dayjs.extend(utc);
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
} from '@mui/x-data-grid';
import {
  Box,
  Chip,
  IconButton,
  Typography,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
  useTheme,
  useMediaQuery,
  alpha,
  TextField,
  InputAdornment,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import UpdateIcon from '@mui/icons-material/Update';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SummonsDetailModal from './SummonsDetailModal';
import { dataGridPremiumStyles } from '../theme';

// Import shared types
import { Summons, isNewRecord, isUpdatedRecord, isFreshSummons, getStatusColor } from '../types/summons';

/**
 * Props for SimpleSummonsTable component
 */
interface SimpleSummonsTableProps {
  /** Array of summons to display */
  summonses: Summons[];
  /** Callback when a summons field is updated */
  onUpdate: (id: string, field: string, value: unknown) => void;
  /** Optional: pre-selected filter from parent */
  activeFilter?: 'all' | 'updated' | 'new';
  /** Optional: callback when filter changes */
  onFilterChange?: (filter: 'all' | 'updated' | 'new') => void;
  /** Optional: search query value (controlled from parent) */
  searchQuery?: string;
  /** Optional: callback when search query changes */
  onSearchChange?: (query: string) => void;
}

// Activity filter type
type ActivityFilter = 'all' | 'updated' | 'new';

/**
 * Simple Summons Table Component
 * 
 * A streamlined DataGrid with only 5 columns to eliminate horizontal scrolling.
 * Features attached filter tabs at the top per Fitts's Law.
 */
const SimpleSummonsTable: React.FC<SimpleSummonsTableProps> = ({
  summonses,
  onUpdate,
  activeFilter: externalFilter,
  onFilterChange,
  searchQuery = '',
  onSearchChange,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Local filter state (if not controlled externally)
  const [localFilter, setLocalFilter] = useState<ActivityFilter>('all');
  const activityFilter = externalFilter ?? localFilter;
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSummons, setSelectedSummons] = useState<Summons | null>(null);
  
  /**
   * Handle filter change
   */
  const handleFilterChange = (
    _event: React.MouseEvent<HTMLElement>,
    newFilter: ActivityFilter | null
  ) => {
    const filter = newFilter || 'all';
    if (onFilterChange) {
      onFilterChange(filter);
    } else {
      setLocalFilter(filter);
    }
  };
  
  /**
   * Filter summonses based on activity filter
   */
  const filteredSummonses = useMemo(() => {
    if (activityFilter === 'new') {
      return summonses.filter(isNewRecord);
    }
    if (activityFilter === 'updated') {
      return summonses.filter(isUpdatedRecord);
    }
    return summonses;
  }, [summonses, activityFilter]);
  
  /**
   * Get counts for filter badges
   */
  const filterCounts = useMemo(() => ({
    all: summonses.length,
    new: summonses.filter(isNewRecord).length,
    updated: summonses.filter(isUpdatedRecord).length,
  }), [summonses]);
  
  /**
   * Open detail modal for a summons
   */
  const handleOpenModal = (summons: Summons) => {
    setSelectedSummons(summons);
    setModalOpen(true);
  };
  
  /**
   * Close detail modal
   */
  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedSummons(null);
  };
  
  /**
   * Handle row click to open modal
   */
  const handleRowClick = (params: GridRowParams) => {
    handleOpenModal(params.row as Summons);
  };
  
  /**
   * Handle update from modal
   */
  const handleModalUpdate = (id: string, field: string, value: unknown) => {
    onUpdate(id, field, value);
  };
  
  /**
   * Render Status column with Activity Badge + color-coded Chip
   */
  const renderStatusCell = (params: GridRenderCellParams) => {
    const status = params.value || 'Unknown';
    const summons = params.row as Summons;
    const isNew = isNewRecord(summons);
    const isUpdated = isUpdatedRecord(summons);

    // Check if summons has attachments
    // AWSJSON fields may be stored as JSON strings, so parse before checking length
    let parsedAttachments: Array<unknown> = [];
    if (summons.attachments) {
      if (typeof summons.attachments === 'string') {
        try {
          parsedAttachments = JSON.parse(summons.attachments);
        } catch {
          parsedAttachments = [];
        }
      } else if (Array.isArray(summons.attachments)) {
        parsedAttachments = summons.attachments;
      }
    }
    const hasAttachments = parsedAttachments.length > 0;
    const attachmentCount = parsedAttachments.length;

    // Build tooltip content for UPDATED badge
    const changeTooltip = summons.last_change_summary
      ? `Change: ${summons.last_change_summary}`
      : 'Record was recently updated';

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        {/* Attachment Indicator */}
        {hasAttachments && (
          <Tooltip title={`${attachmentCount} file${attachmentCount > 1 ? 's' : ''} attached`} arrow placement="top">
            <AttachFileIcon
              sx={{
                fontSize: 14,
                color: 'text.secondary',
                transform: 'rotate(45deg)',
              }}
            />
          </Tooltip>
        )}

        {/* Activity Badge - NEW */}
        {isNew && (
          <Chip
            label="NEW"
            icon={<FiberNewIcon sx={{ fontSize: 14 }} />}
            color="info"
            size="small"
            sx={{ fontWeight: 'bold', fontSize: '0.65rem', height: 22 }}
          />
        )}
        
        {/* Activity Badge - UPDATED with Tooltip */}
        {isUpdated && !isNew && (
          <Tooltip title={changeTooltip} arrow placement="top">
            <Chip
              label="UPD"
              color="warning"
              size="small"
              sx={{
                fontWeight: 'bold',
                fontSize: '0.65rem',
                height: 22,
                cursor: 'help',
              }}
            />
          </Tooltip>
        )}
        
        {/* Status Chip */}
        <Chip
          label={status}
          color={getStatusColor(status)}
          size="small"
          sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
        />
      </Box>
    );
  };
  
  /**
   * Render Violation Date column
   * Shows the date when the violation occurred (for Lag Time calculation)
   */
  const renderViolationDateCell = (params: GridRenderCellParams) => {
    const row = params.row as Summons;
    const value = row.violation_date;
    if (!value) return <Typography color="text.secondary">—</Typography>;

    // Use dayjs.utc() to parse date-only fields correctly without timezone shift
    const parsed = dayjs.utc(value);
    if (!parsed.isValid()) return <Typography color="text.secondary">—</Typography>;

    return (
      <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
        {parsed.format(isMobile ? 'MM/DD' : 'MMM D, YYYY')}
      </Typography>
    );
  };
  
  /**
   * Render Action column with open modal button
   * Icon size: 18px for better visibility and alignment
   */
  const renderActionCell = (params: GridRenderCellParams) => {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <Tooltip title="View Details">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenModal(params.row as Summons);
            }}
            sx={{
              color: 'primary.main',
              width: 32,
              height: 32,
              '&:hover': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
              },
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };
  
  // Define the 5 essential columns (Violation Type REMOVED - redundant for Idling-only app)
  // New column order: Status | Client Name | Violation Date | Hearing Date | Action
  const columns: GridColDef[] = [
    {
      field: 'status',
      headerName: 'Status',
      width: isMobile ? 140 : 200,
      minWidth: 140,
      renderCell: renderStatusCell,
      sortable: true,
    },
    {
      field: 'respondent_name',
      headerName: 'Client Name',
      flex: 1,
      minWidth: 150,
      sortable: true,
    },
    {
      field: 'violation_date',
      headerName: 'Violation Date',
      width: isMobile ? 100 : 130,
      sortable: true,
      renderCell: renderViolationDateCell,
    },
    {
      field: 'hearing_date',
      headerName: 'Hearing Date',
      width: isMobile ? 100 : 130,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row as Summons;
        const value = row.hearing_date;
        if (!value) return '—';
        // Use dayjs.utc() to parse date-only fields correctly without timezone shift
        const parsed = dayjs.utc(value);
        if (!parsed.isValid()) return '—';
        return parsed.format(isMobile ? 'MM/DD' : 'MMM D, YYYY');
      },
    },
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: 'center',
      headerAlign: 'center',
      renderCell: renderActionCell,
    },
  ];
  
  return (
    <Box sx={{ width: '100%' }}>
      {/* Attached Filter Tabs (Fitts's Law - close to data) */}
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          backgroundColor: (theme) => alpha(theme.palette.grey[500], 0.04),
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottom: '1px solid',
          borderColor: (theme) => alpha(theme.palette.grey[500], 0.12),
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 2,
            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
          }}
        >
          <FilterListIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        </Box>
        <ToggleButtonGroup
          value={activityFilter}
          exclusive
          onChange={handleFilterChange}
          size="small"
          aria-label="activity filter"
          sx={{
            '& .MuiToggleButton-root': {
              borderRadius: 2,
              px: 2,
              py: 0.75,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-1px)',
              },
            },
          }}
        >
          <ToggleButton
            value="all"
            aria-label="show all records"
            sx={{
              '&.Mui-selected': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
                color: 'primary.main',
                border: '1px solid',
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
                '&:hover': {
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.18),
                },
              },
            }}
          >
            Show All
            <Chip
              label={filterCounts.all}
              size="small"
              sx={{
                ml: 1,
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 600,
                borderRadius: 1.5,
              }}
            />
          </ToggleButton>
          <ToggleButton
            value="updated"
            aria-label="show updated records"
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'warning.main',
                color: 'warning.contrastText',
                boxShadow: '0 4px 12px rgba(255, 152, 0, 0.25)',
                '&:hover': { backgroundColor: 'warning.dark' },
              },
            }}
          >
            <UpdateIcon sx={{ mr: 0.5, fontSize: 16 }} />
            Updated
            {filterCounts.updated > 0 && (
              <Chip
                label={filterCounts.updated}
                size="small"
                color="warning"
                sx={{
                  ml: 1,
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  borderRadius: 1.5,
                }}
              />
            )}
          </ToggleButton>
          <ToggleButton
            value="new"
            aria-label="show new records"
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'info.main',
                color: 'info.contrastText',
                boxShadow: '0 4px 12px rgba(3, 169, 244, 0.25)',
                '&:hover': { backgroundColor: 'info.dark' },
              },
            }}
          >
            <FiberNewIcon sx={{ mr: 0.5, fontSize: 16 }} />
            New
            {filterCounts.new > 0 && (
              <Chip
                label={filterCounts.new}
                size="small"
                color="info"
                sx={{
                  ml: 1,
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  borderRadius: 1.5,
                }}
              />
            )}
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Search Bar - After filter tabs */}
        {onSearchChange && (
          <TextField
            placeholder="Search company, summons #, plate..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => onSearchChange('')}
                    edge="end"
                    sx={{ mr: -0.5 }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              flex: '1 1 auto',
              maxWidth: { xs: '100%', sm: 280 },
              minWidth: 180,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                backgroundColor: 'background.paper',
                border: '1.5px solid',
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.4),
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: 'primary.main',
                  boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)',
                },
                '&.Mui-focused': {
                  borderColor: 'primary.main',
                  boxShadow: (theme) => `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  border: 'none',
                },
              },
            }}
          />
        )}

        {/* Results count */}
        <Typography
          variant="body2"
          sx={{
            ml: 'auto',
            fontWeight: 500,
            color: 'text.secondary',
          }}
        >
          <Box component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {filteredSummonses.length}
          </Box>{' '}
          record{filteredSummonses.length !== 1 ? 's' : ''}
        </Typography>
      </Paper>

      {/* DataGrid - Premium styling with no horizontal scroll */}
      <DataGrid
        rows={filteredSummonses}
        columns={columns}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: {
            paginationModel: { pageSize: 25 },
          },
          sorting: {
            sortModel: [{ field: 'hearing_date', sort: 'desc' }],
          },
        }}
        onRowClick={handleRowClick}
        getRowClassName={(params: GridRowParams) => {
          return isFreshSummons(params.row) ? 'fresh-row' : '';
        }}
        disableRowSelectionOnClick
        disableColumnMenu={isMobile}
        autoHeight
        sx={{
          ...dataGridPremiumStyles,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          backgroundColor: 'background.paper',
          // Column header styling with more padding
          '& .MuiDataGrid-columnHeader': {
            paddingLeft: 3, // Match cell left padding (24px)
            paddingRight: 2,
          },
          // Cell styling with more padding for better spacing
          '& .MuiDataGrid-cell': {
            cursor: 'pointer',
            borderBottom: (theme) => `1px solid ${alpha(theme.palette.grey[200], 0.8)}`,
            paddingLeft: 3, // Increased left padding (24px)
            paddingRight: 2,
            paddingY: 1.5,
          },
          // Row styling with zebra striping and improved hover
          '& .MuiDataGrid-row': {
            transition: 'background-color 0.15s ease',
            // Zebra striping - subtle alternating background
            '&:nth-of-type(even)': {
              backgroundColor: (theme) => alpha(theme.palette.grey[500], 0.04),
            },
            '&:hover': {
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            },
          },
          // Fresh row styling (new/updated records)
          '& .fresh-row': {
            backgroundColor: (theme) => alpha(theme.palette.info.main, 0.06),
            '&:nth-of-type(even)': {
              backgroundColor: (theme) => alpha(theme.palette.info.main, 0.08),
            },
          },
          '& .fresh-row:hover': {
            backgroundColor: (theme) => alpha(theme.palette.info.main, 0.12),
          },
          // Ensure no horizontal scroll
          '& .MuiDataGrid-virtualScroller': {
            overflowX: 'hidden',
          },
        }}
      />
      
      {/* Detail Modal */}
      <SummonsDetailModal
        open={modalOpen}
        summons={selectedSummons}
        onClose={handleCloseModal}
        onUpdate={handleModalUpdate}
      />
    </Box>
  );
};

export default SimpleSummonsTable;

