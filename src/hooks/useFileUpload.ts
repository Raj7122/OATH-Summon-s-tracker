/**
 * useFileUpload Hook
 *
 * Custom hook for handling file upload/download operations with AWS S3.
 * All authenticated users can view/download files uploaded by any user.
 *
 * Key Features:
 * - Upload files to S3 with progress tracking
 * - Generate signed URLs for downloads
 * - Delete files from S3
 * - Automatic file path organization by summons ID
 *
 * @module hooks/useFileUpload
 */

import { useState, useCallback } from 'react';
import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import { v4 as uuidv4 } from 'uuid';
import { Attachment, AttachmentType } from '../types/summons';
import { useAuth } from '../contexts/AuthContext';

// Maximum file size (25MB)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.doc', '.docx'];

// ============================================================================
// TYPES
// ============================================================================

export interface UploadProgress {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number; // 0-100
  message: string;
}

export interface UseFileUploadResult {
  uploadProgress: UploadProgress;
  uploadFile: (summonsId: string, file: File, fileType: AttachmentType) => Promise<Attachment | null>;
  getFileUrl: (key: string) => Promise<string | null>;
  deleteFile: (key: string) => Promise<boolean>;
  validateFile: (file: File) => { valid: boolean; error?: string };
  resetProgress: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useFileUpload(): UseFileUploadResult {
  const { userInfo } = useAuth();

  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    status: 'idle',
    progress: 0,
    message: '',
  });

  /**
   * Validate file before upload
   */
  const validateFile = useCallback((file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds 25MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
      };
    }

    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      };
    }

    return { valid: true };
  }, []);

  /**
   * Upload file to S3 and return attachment metadata
   */
  const uploadFile = useCallback(async (
    summonsId: string,
    file: File,
    fileType: AttachmentType
  ): Promise<Attachment | null> => {
    // Validate file first
    const validation = validateFile(file);
    if (!validation.valid) {
      setUploadProgress({
        status: 'error',
        progress: 0,
        message: validation.error || 'File validation failed',
      });
      return null;
    }

    // Generate unique file key
    const fileId = uuidv4();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `public/evidence/${summonsId}/${fileId}_${sanitizedFilename}`;

    try {
      setUploadProgress({
        status: 'uploading',
        progress: 0,
        message: 'Starting upload...',
      });

      // Upload to S3 with progress tracking
      const result = await uploadData({
        key,
        data: file,
        options: {
          contentType: file.type,
          onProgress: ({ transferredBytes, totalBytes }) => {
            if (totalBytes) {
              const percent = Math.round((transferredBytes / totalBytes) * 100);
              setUploadProgress({
                status: 'uploading',
                progress: percent,
                message: `Uploading... ${percent}%`,
              });
            }
          },
        },
      }).result;

      // Create attachment metadata
      const attachment: Attachment = {
        id: fileId,
        key: result.key,
        type: fileType,
        name: file.name,
        size: file.size,
        uploadedBy: userInfo?.displayName || userInfo?.username || 'Unknown',
        uploadedById: userInfo?.userId || 'unknown',
        uploadedAt: new Date().toISOString(),
      };

      setUploadProgress({
        status: 'success',
        progress: 100,
        message: 'Upload complete!',
      });

      return attachment;
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadProgress({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed',
      });
      return null;
    }
  }, [userInfo, validateFile]);

  /**
   * Get signed URL for downloading a file
   */
  const getFileUrl = useCallback(async (key: string): Promise<string | null> => {
    try {
      const urlResult = await getUrl({
        key,
        options: {
          expiresIn: 3600, // URL valid for 1 hour
        },
      });
      return urlResult.url.toString();
    } catch (error) {
      console.error('Error getting file URL:', error);
      return null;
    }
  }, []);

  /**
   * Delete file from S3
   */
  const deleteFile = useCallback(async (key: string): Promise<boolean> => {
    try {
      await remove({ key });
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }, []);

  /**
   * Reset upload progress to idle state
   */
  const resetProgress = useCallback(() => {
    setUploadProgress({
      status: 'idle',
      progress: 0,
      message: '',
    });
  }, []);

  return {
    uploadProgress,
    uploadFile,
    getFileUrl,
    deleteFile,
    validateFile,
    resetProgress,
  };
}

export default useFileUpload;
