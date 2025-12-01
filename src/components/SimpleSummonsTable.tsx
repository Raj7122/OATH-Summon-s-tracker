/**
 * Simple Summons Table Component
 * 
 * Implements the "No-Scroll Rule" - a streamlined DataGrid with only 5 columns:
 * 1. Status (Chip with NEW/UPDATED badge)
 * 2. Client Name
 * 3. Hearing Date
 * 4. Violation Type
 * 5. Action Icon (to open detail modal)
 * 
 * This eliminates horizontal scrolling by showing only essential identification
 * columns. Full details are accessed via the SummonsDetailModal.
 * 
 * UX Philosophy: Fitts's Law - filter tabs attached directly to grid top,
 * reducing distance to high-frequency actions.
 * 
 * @module components/SimpleSummonsTable
 */

import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
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
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import UpdateIcon from '@mui/icons-material/Update';
import FilterListIcon from '@mui/icons-material/FilterList';
import SummonsDetailModal from './SummonsDetailModal';

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
    
    // Build tooltip content for UPDATED badge
    const changeTooltip = summons.last_change_summary
      ? `Change: ${summons.last_change_summary}`
      : 'Record was recently updated';
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
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
   * Render Violation Type column with truncation and tooltip
   */
  const renderViolationCell = (params: GridRenderCellParams) => {
    const codeDesc = params.value || 'Unknown';
    const maxLength = isMobile ? 15 : 25;
    const displayText = codeDesc.length > maxLength ? `${codeDesc.substring(0, maxLength - 3)}...` : codeDesc;
    
    return (
      <Tooltip title={codeDesc} placement="top">
        <Chip
          label={displayText}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem', maxWidth: '100%' }}
        />
      </Tooltip>
    );
  };
  
  /**
   * Render Action column with open modal button
   */
  const renderActionCell = (params: GridRenderCellParams) => {
    return (
      <Tooltip title="View Details">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenModal(params.row as Summons);
          }}
          sx={{ color: 'primary.main' }}
        >
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  };
  
  // Define the 5 essential columns
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
      field: 'hearing_date',
      headerName: 'Hearing Date',
      width: isMobile ? 100 : 130,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row as Summons;
        const value = row.hearing_date;
        if (!value) return '—';
        // Validate that dayjs can parse the date
        const parsed = dayjs(value);
        if (!parsed.isValid()) return '—';
        return parsed.format(isMobile ? 'MM/DD' : 'MMM D, YYYY');
      },
    },
    {
      field: 'code_description',
      headerName: 'Violation Type',
      width: isMobile ? 120 : 180,
      minWidth: 120,
      renderCell: renderViolationCell,
      sortable: true,
    },
    {
      field: 'actions',
      headerName: '',
      width: 50,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
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
          p: 1.5,
          backgroundColor: 'grey.50',
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <FilterListIcon sx={{ color: 'text.secondary' }} />
        <ToggleButtonGroup
          value={activityFilter}
          exclusive
          onChange={handleFilterChange}
          size="small"
          aria-label="activity filter"
        >
          <ToggleButton
            value="all"
            aria-label="show all records"
            sx={{
              px: 2,
              '&.Mui-selected': {
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { backgroundColor: 'primary.dark' },
              },
            }}
          >
            Show All
            <Chip
              label={filterCounts.all}
              size="small"
              sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
            />
          </ToggleButton>
          <ToggleButton
            value="updated"
            aria-label="show updated records"
            sx={{
              px: 2,
              '&.Mui-selected': {
                backgroundColor: 'warning.main',
                color: 'warning.contrastText',
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
                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
              />
            )}
          </ToggleButton>
          <ToggleButton
            value="new"
            aria-label="show new records"
            sx={{
              px: 2,
              '&.Mui-selected': {
                backgroundColor: 'info.main',
                color: 'info.contrastText',
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
                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
              />
            )}
          </ToggleButton>
        </ToggleButtonGroup>
        
        {/* Results count */}
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredSummonses.length} record{filteredSummonses.length !== 1 ? 's' : ''}
        </Typography>
      </Paper>
      
      {/* DataGrid - No horizontal scroll */}
      <DataGrid
        rows={filteredSummonses}
        columns={columns}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: {
            paginationModel: { pageSize: 25 },
          },
          sorting: {
            sortModel: [{ field: 'hearing_date', sort: 'asc' }],
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
          border: 'none',
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          backgroundColor: 'background.paper',
          '& .MuiDataGrid-cell': {
            padding: '8px 12px',
            cursor: 'pointer',
          },
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: 'grey.100',
            borderBottom: '2px solid',
            borderColor: 'divider',
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
          '& .fresh-row': {
            backgroundColor: '#FFFDE7', // Pale yellow for freshness
          },
          '& .fresh-row:hover': {
            backgroundColor: '#FFF9C4',
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

