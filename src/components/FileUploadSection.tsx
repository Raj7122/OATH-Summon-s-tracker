/**
 * FileUploadSection Component
 *
 * Provides file upload UI for attaching evidence documents to summons.
 * Supports three file categories:
 * - Summons PDF
 * - Client Statement
 * - Evidence Package / Redacted Complaint
 *
 * All authenticated users can view/download uploaded files.
 *
 * @module components/FileUploadSection
 */

import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  LinearProgress,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  SelectChangeEvent,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { Attachment, AttachmentType } from '../types/summons';
import { useFileUpload } from '../hooks/useFileUpload';

// ============================================================================
// TYPES
// ============================================================================

interface FileUploadSectionProps {
  summonsId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  /** Callback when evidence file is successfully uploaded (for audit trail logging) */
  onEvidenceUploaded?: (attachment: Attachment) => void;
  disabled?: boolean;
}

interface FileTypeOption {
  value: AttachmentType;
  label: string;
  icon: React.ReactNode;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FILE_TYPE_OPTIONS: FileTypeOption[] = [
  { value: 'summons_pdf', label: 'Summons PDF', icon: <PictureAsPdfIcon color="error" /> },
  { value: 'client_statement', label: 'Client Statement', icon: <DescriptionIcon color="primary" /> },
  { value: 'evidence_package', label: 'Evidence Package / Redacted Complaint', icon: <FolderIcon color="warning" /> },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get icon component for attachment type
 */
function getAttachmentIcon(type: AttachmentType): React.ReactNode {
  switch (type) {
    case 'summons_pdf':
      return <PictureAsPdfIcon color="error" />;
    case 'client_statement':
      return <DescriptionIcon color="primary" />;
    case 'evidence_package':
      return <FolderIcon color="warning" />;
    default:
      return <AttachFileIcon />;
  }
}

/**
 * Get label for attachment type
 */
function getAttachmentTypeLabel(type: AttachmentType): string {
  const option = FILE_TYPE_OPTIONS.find(o => o.value === type);
  return option?.label || type;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  summonsId,
  attachments,
  onAttachmentsChange,
  onEvidenceUploaded,
  disabled = false,
}) => {
  const [selectedType, setSelectedType] = useState<AttachmentType>('summons_pdf');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadProgress, uploadFile, getFileUrl, deleteFile, validateFile, resetProgress } = useFileUpload();

  /**
   * Handle file type selection change
   */
  const handleTypeChange = (event: SelectChangeEvent<AttachmentType>) => {
    setSelectedType(event.target.value as AttachmentType);
  };

  /**
   * Trigger file input click
   */
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Handle file selection
   */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Upload file
    const attachment = await uploadFile(summonsId, file, selectedType);
    if (attachment) {
      onAttachmentsChange([...attachments, attachment]);
      // Trigger callback for audit trail logging
      onEvidenceUploaded?.(attachment);
    }

    // Reset input and progress after short delay
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => {
      resetProgress();
    }, 2000);
  };

  /**
   * Handle file download
   */
  const handleDownload = async (attachment: Attachment) => {
    const url = await getFileUrl(attachment.key);
    if (url) {
      window.open(url, '_blank');
    } else {
      setError('Failed to get download link');
    }
  };

  /**
   * Open delete confirmation dialog
   */
  const handleDeleteClick = (attachment: Attachment) => {
    setAttachmentToDelete(attachment);
    setDeleteDialogOpen(true);
  };

  /**
   * Confirm and execute file deletion
   */
  const handleDeleteConfirm = async () => {
    if (!attachmentToDelete) return;

    const success = await deleteFile(attachmentToDelete.key);
    if (success) {
      onAttachmentsChange(attachments.filter(a => a.id !== attachmentToDelete.id));
    } else {
      setError('Failed to delete file');
    }

    setDeleteDialogOpen(false);
    setAttachmentToDelete(null);
  };

  /**
   * Cancel delete dialog
   */
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setAttachmentToDelete(null);
  };

  const isUploading = uploadProgress.status === 'uploading';

  return (
    <Box>
      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Upload Progress Alert */}
      {uploadProgress.status === 'error' && (
        <Alert severity="error" onClose={resetProgress} sx={{ mb: 2 }}>
          {uploadProgress.message}
        </Alert>
      )}

      {uploadProgress.status === 'success' && (
        <Alert severity="success" onClose={resetProgress} sx={{ mb: 2 }}>
          {uploadProgress.message}
        </Alert>
      )}

      {/* Upload Controls */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="file-type-label">File Type</InputLabel>
          <Select
            labelId="file-type-label"
            value={selectedType}
            label="File Type"
            onChange={handleTypeChange}
            disabled={disabled || isUploading}
          >
            {FILE_TYPE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {option.icon}
                  {option.label}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          onClick={handleUploadClick}
          disabled={disabled || isUploading}
        >
          Upload File
        </Button>
      </Box>

      {/* Upload Progress Bar */}
      {isUploading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {uploadProgress.message}
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress.progress} />
        </Box>
      )}

      {/* Attached Files List */}
      {attachments.length > 0 ? (
        <List dense>
          {attachments.map((attachment) => (
            <ListItem
              key={attachment.id}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <ListItemIcon>
                {getAttachmentIcon(attachment.type)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {attachment.name}
                    </Typography>
                    <Chip
                      label={getAttachmentTypeLabel(attachment.type)}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.65rem', height: 20 }}
                    />
                  </Box>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    {formatFileSize(attachment.size)} | Uploaded by {attachment.uploadedBy} on{' '}
                    {new Date(attachment.uploadedAt).toLocaleDateString()}
                  </Typography>
                }
              />
              <ListItemSecondaryAction>
                <Tooltip title="Download">
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleDownload(attachment)}
                    disabled={disabled}
                  >
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleDeleteClick(attachment)}
                    disabled={disabled}
                    sx={{ ml: 1 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No files attached yet. Upload evidence documents above.
        </Typography>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete File</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{attachmentToDelete?.name}"?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FileUploadSection;
