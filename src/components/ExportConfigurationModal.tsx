/**
 * Export Configuration Modal
 *
 * Reusable modal for configuring CSV export options.
 * Allows dynamic column selection and scope configuration.
 *
 * Features:
 * - Column selector with categories
 * - Select All / Deselect All
 * - Date range toggle (Active Era vs Full History)
 * - Date format selection (ISO vs US)
 * - Progress indicator during export
 *
 * @module components/ExportConfigurationModal
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  LinearProgress,
  Alert,
  Chip,
  IconButton,
  Switch,
  RadioGroup,
  Radio,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import DeselectIcon from '@mui/icons-material/Deselect';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TableChartIcon from '@mui/icons-material/TableChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import BusinessIcon from '@mui/icons-material/Business';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';

import { Client } from '../types/summons';
import {
  EXPORT_COLUMNS,
  ExportColumn,
  ExportConfig,
  getDefaultSelectedColumns,
  getColumnsByCategory,
} from '../lib/csvExport';
import { ExportProgress } from '../hooks/useCSVExport';

// ============================================================================
// TYPES
// ============================================================================

interface ExportConfigurationModalProps {
  open: boolean;
  onClose: () => void;
  onExport: (config: ExportConfig) => Promise<void>;
  client?: Client; // Optional - if not provided, it's a global export
  progress: ExportProgress;
  isExporting: boolean;
  error: string | null;
}

interface CategoryConfig {
  label: string;
  icon: React.ReactNode;
  description: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  core: {
    label: 'Core Fields',
    icon: <TableChartIcon fontSize="small" />,
    description: 'Essential summons information',
  },
  financial: {
    label: 'Financial',
    icon: <AttachMoneyIcon fontSize="small" />,
    description: 'Fines, payments, and balances',
  },
  evidence: {
    label: 'Evidence Status',
    icon: <FactCheckIcon fontSize="small" />,
    description: 'Evidence tracking checkboxes',
  },
  internal: {
    label: 'Internal/Billing',
    icon: <BusinessIcon fontSize="small" />,
    description: 'Internal notes and billing status',
  },
  ocr: {
    label: 'OCR Data',
    icon: <DocumentScannerIcon fontSize="small" />,
    description: 'Data extracted from scanned documents',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

const ExportConfigurationModal: React.FC<ExportConfigurationModalProps> = ({
  open,
  onClose,
  onExport,
  client,
  progress,
  isExporting,
  error,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // State
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(getDefaultSelectedColumns())
  );
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [dateFormat, setDateFormat] = useState<'iso' | 'us'>('us');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['core'])
  );

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedColumns(new Set(getDefaultSelectedColumns()));
      setIncludeHistorical(false);
      setDateFormat('us');
    }
  }, [open]);

  // Get columns grouped by category
  const columnsByCategory = useMemo(() => getColumnsByCategory(), []);

  // Calculate selection stats
  const selectionStats = useMemo(() => {
    const total = EXPORT_COLUMNS.length;
    const selected = selectedColumns.size;
    return { total, selected };
  }, [selectedColumns]);

  /**
   * Toggle a single column
   */
  const handleColumnToggle = useCallback((columnKey: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  }, []);

  /**
   * Select all columns
   */
  const handleSelectAll = useCallback(() => {
    setSelectedColumns(new Set(EXPORT_COLUMNS.map((col) => col.key)));
  }, []);

  /**
   * Deselect all columns
   */
  const handleDeselectAll = useCallback(() => {
    setSelectedColumns(new Set());
  }, []);

  /**
   * Toggle all columns in a category
   */
  const handleCategoryToggle = useCallback((category: string, checked: boolean) => {
    const categoryColumns = columnsByCategory[category] || [];
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      categoryColumns.forEach((col) => {
        if (checked) {
          next.add(col.key);
        } else {
          next.delete(col.key);
        }
      });
      return next;
    });
  }, [columnsByCategory]);

  /**
   * Check if all columns in a category are selected
   */
  const isCategoryFullySelected = useCallback((category: string): boolean => {
    const categoryColumns = columnsByCategory[category] || [];
    return categoryColumns.every((col) => selectedColumns.has(col.key));
  }, [columnsByCategory, selectedColumns]);

  /**
   * Check if some (but not all) columns in a category are selected
   */
  const isCategoryPartiallySelected = useCallback((category: string): boolean => {
    const categoryColumns = columnsByCategory[category] || [];
    const selectedInCategory = categoryColumns.filter((col) => selectedColumns.has(col.key));
    return selectedInCategory.length > 0 && selectedInCategory.length < categoryColumns.length;
  }, [columnsByCategory, selectedColumns]);

  /**
   * Toggle category expansion
   */
  const handleCategoryExpand = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  /**
   * Handle export button click
   */
  const handleExport = useCallback(async () => {
    const config: ExportConfig = {
      columns: Array.from(selectedColumns),
      dateFormat,
      includeHistorical,
      clientName: client?.name,
    };

    await onExport(config);
  }, [selectedColumns, dateFormat, includeHistorical, client, onExport]);

  /**
   * Render a column checkbox
   */
  const renderColumnCheckbox = (column: ExportColumn) => (
    <FormControlLabel
      key={column.key}
      control={
        <Checkbox
          checked={selectedColumns.has(column.key)}
          onChange={() => handleColumnToggle(column.key)}
          disabled={isExporting}
          size="small"
        />
      }
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2">{column.label}</Typography>
          {column.defaultChecked && (
            <Chip label="Default" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
          )}
        </Box>
      }
      sx={{ width: isMobile ? '100%' : '50%' }}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={isExporting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6">
            {client ? `Export: ${client.name}` : 'Global Export: All Clients'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {selectionStats.selected} of {selectionStats.total} columns selected
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={isExporting}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Progress Indicator */}
        {isExporting && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {progress.message}
              </Typography>
              {progress.total > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {progress.current} / {progress.total}
                </Typography>
              )}
            </Box>
            <LinearProgress
              variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
              value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
            />
          </Box>
        )}

        {/* Scope Configuration */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Scope Configuration
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Date Range Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={includeHistorical}
                  onChange={(e) => setIncludeHistorical(e.target.checked)}
                  disabled={isExporting}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Include Historical Data</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {includeHistorical
                      ? 'Full history (all records)'
                      : 'Active Era only (2022 onwards)'}
                  </Typography>
                </Box>
              }
            />

            {/* Date Format */}
            <Box sx={{ ml: 1 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Date Format:
              </Typography>
              <RadioGroup
                row
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as 'iso' | 'us')}
              >
                <FormControlLabel
                  value="us"
                  control={<Radio size="small" disabled={isExporting} />}
                  label="MM/DD/YYYY"
                />
                <FormControlLabel
                  value="iso"
                  control={<Radio size="small" disabled={isExporting} />}
                  label="YYYY-MM-DD"
                />
              </RadioGroup>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Column Selection */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Column Selection
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<SelectAllIcon />}
                onClick={handleSelectAll}
                disabled={isExporting}
              >
                Select All
              </Button>
              <Button
                size="small"
                startIcon={<DeselectIcon />}
                onClick={handleDeselectAll}
                disabled={isExporting}
              >
                Deselect All
              </Button>
            </Box>
          </Box>

          {/* Category Accordions */}
          {Object.entries(CATEGORY_CONFIG).map(([category, config]) => (
            <Accordion
              key={category}
              expanded={expandedCategories.has(category)}
              onChange={() => handleCategoryExpand(category)}
              disabled={isExporting}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  <Checkbox
                    checked={isCategoryFullySelected(category)}
                    indeterminate={isCategoryPartiallySelected(category)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleCategoryToggle(category, e.target.checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    disabled={isExporting}
                    size="small"
                  />
                  {config.icon}
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {config.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {config.description}
                    </Typography>
                  </Box>
                  <Chip
                    label={`${columnsByCategory[category]?.filter((c) => selectedColumns.has(c.key)).length || 0}/${columnsByCategory[category]?.length || 0}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <FormGroup row sx={{ display: 'flex', flexWrap: 'wrap' }}>
                  {columnsByCategory[category]?.map(renderColumnCheckbox)}
                </FormGroup>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isExporting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          disabled={isExporting || selectedColumns.size === 0}
        >
          {isExporting ? 'Exporting...' : `Generate CSV (${selectionStats.selected} columns)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportConfigurationModal;
