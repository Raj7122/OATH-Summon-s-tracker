/**
 * Invoice Builder Page
 *
 * Staging area for generating invoices from selected summonses.
 * Allows editing recipient info, adjusting legal fees, and generating PDF/DOCX invoices.
 *
 * @module pages/InvoiceBuilder
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Divider,
  Alert,
  Stack,
  Tooltip,
  Chip,
  Snackbar,
  CircularProgress,
  Dialog,
  FormControlLabel,
  Checkbox,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tabs,
  Tab,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { generateClient } from 'aws-amplify/api';
import { uploadData } from 'aws-amplify/storage';
import { getClient, getSummons } from '../graphql/queries';
import { updateSummons } from '../graphql/mutations';
import {
  createInvoiceRecord,
  createInvoiceSummonsRecord,
  deleteInvoiceSummonsRecord,
  getInvoiceWithItems,
  invoiceSummonsItemsBySummons,
  summonsesByClientForPicker,
  updateInvoiceRecord,
  updateInvoiceSummonsRecord,
} from '../graphql/customQueries';
import DeleteIcon from '@mui/icons-material/Delete';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

import SummonsDetailModal from '../components/SummonsDetailModal';
import InvoicePreview from '../components/InvoicePreview';
import { Summons } from '../types/summons';
import { InvoiceCartItem, InvoiceExtraLineItem } from '../types/invoice';

import { useInvoice } from '../contexts/InvoiceContext';
import { useInvoiceTracker } from '../contexts/InvoiceTrackerContext';
import { generatePDF, generateDOCX, sumExtrasLegalFees } from '../utils/invoiceGenerator';
import { FOOTER_TEXT, DEFAULT_LEGAL_FEE } from '../constants/invoiceDefaults';
import { markAsInvoiced } from '../utils/invoiceTracking';
import { computeAlertDeadline, generateInvoiceNumber } from '../utils/invoiceTrackerHelpers';
import { appendInvoiceAuditEntries, appendInvoiceModifiedEntry, appendInvoiceRemovedEntry } from '../utils/invoiceAuditLog';
import { compareByHearingDateAsc } from '../utils/invoiceOrdering';
import { v4 as uuidv4 } from 'uuid';
import { Invoice as TrackerInvoice } from '../types/invoiceTracker';

const apiClient = generateClient();

interface Client {
  id: string;
  name: string;
  contact_name?: string;
  contact_address?: string;
  contact_email1?: string;
}

// Shape of a summons returned by summonsesByClientForPicker — fields used in
// the "Add summonses" dialog. Kept local since we only consume a subset.
interface PickerCandidate {
  id: string;
  clientID: string;
  summons_number: string;
  respondent_name: string | null;
  hearing_date: string | null;
  hearing_result: string | null;
  status: string | null;
  violation_date: string | null;
  amount_due: number | null;
  is_invoiced: boolean | null;
  invoice_date: string | null;
}

/**
 * Format date string for display
 */
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '—';
  // Use dayjs.utc() to avoid timezone shift on date-only fields stored as UTC midnight
  const date = dayjs.utc(dateString);
  return date.isValid() ? date.format('M/DD/YY') : '—';
};

/**
 * Format currency for display
 */
const formatCurrency = (amount: number | null): string => {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const InvoiceBuilder = () => {
  const {
    cartItems,
    recipient,
    alertDeadline,
    updateRecipientField,
    setRecipient,
    removeFromCart,
    removeManyFromCart,
    updateLegalFee,
    updateAmountDue,
    updateStatus,
    updateHearingResult,
    clearCart,
    setAlertDeadline,
  } = useInvoice();

  const { fetchInvoices } = useInvoiceTracker();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Edit mode: the builder reuses the same UI to edit an existing invoice.
  // When editInvoiceId is present, we hydrate local state from the invoice and
  // ignore the shared cart. Save writes back to the same Invoice record and
  // regenerates the S3 PDF.
  const editInvoiceId = searchParams.get('editInvoiceId');
  const isEditMode = !!editInvoiceId;

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detectedClient, setDetectedClient] = useState<Client | null>(null);

  // Loaded invoice data (edit mode only).
  const [loadedInvoice, setLoadedInvoice] = useState<TrackerInvoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);

  // Working copy of line items while editing an existing invoice.
  // Mirrors InvoiceCartItem shape so the table and preview components can be
  // reused unchanged. Hydrated from getInvoiceWithItems + getSummons per row.
  const [editItems, setEditItems] = useState<InvoiceCartItem[]>([]);

  // Snapshot of the original InvoiceSummons join-row IDs keyed by summonsID.
  // Used to diff what was kept/added/removed on save.
  const [originalJoinRows, setOriginalJoinRows] = useState<
    { id: string; summonsID: string; legal_fee: number; amount_due: number | null }[]
  >([]);

  // Paid-invoice confirmation dialog (edit mode).
  const [paidWarningOpen, setPaidWarningOpen] = useState(false);

  // Manual extra line items (research fee, etc.) — fully free-text rows that
  // render below the summons rows on the invoice. In create mode they're
  // scoped per-active-client and ephemeral; in edit mode they're hydrated
  // from and persisted back to the Invoice record's `extra_line_items` field.
  const [createExtrasByClient, setCreateExtrasByClient] = useState<
    Record<string, InvoiceExtraLineItem[]>
  >({});
  const [editExtras, setEditExtras] = useState<InvoiceExtraLineItem[]>([]);

  // "Add summonses" picker dialog state (edit mode).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<PickerCandidate[]>([]);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());

  // Active client for the current invoice being built.
  // Cart can hold summonses from any number of clients; the builder processes
  // one client at a time because an Invoice is single-client by schema.
  const [activeClientID, setActiveClientID] = useState<string | null>(null);

  // Group cart items by clientID. Recomputed when the cart changes so that
  // the tabs/counts stay in sync as items are added, removed, or invoiced out.
  const itemsByClient = useMemo(() => {
    const map = new Map<string, InvoiceCartItem[]>();
    for (const item of cartItems) {
      const list = map.get(item.clientID);
      if (list) list.push(item);
      else map.set(item.clientID, [item]);
    }
    return map;
  }, [cartItems]);

  const clientIDs = useMemo(() => Array.from(itemsByClient.keys()), [itemsByClient]);

  // Keep activeClientID valid as the cart changes:
  // - If it's null or points to a client that no longer has items, snap to the first available.
  useEffect(() => {
    if (clientIDs.length === 0) {
      if (activeClientID !== null) setActiveClientID(null);
      return;
    }
    if (!activeClientID || !itemsByClient.has(activeClientID)) {
      setActiveClientID(clientIDs[0]);
    }
  }, [clientIDs, activeClientID, itemsByClient]);

  // Items for the invoice currently being built (active client's subset only).
  const activeClientItems = useMemo(() => {
    if (!activeClientID) return [];
    return itemsByClient.get(activeClientID) ?? [];
  }, [activeClientID, itemsByClient]);

  // Items the builder is currently showing in the table / preview.
  // Edit mode uses the local edit-items snapshot; cart mode uses the active
  // client's subset of the shared cart.
  const displayItems = isEditMode ? editItems : activeClientItems;
  const displayExtras: InvoiceExtraLineItem[] = isEditMode
    ? editExtras
    : (activeClientID ? (createExtrasByClient[activeClientID] ?? []) : []);
  const displayTotalLegalFees = useMemo(
    () =>
      displayItems.reduce((sum, item) => sum + item.legal_fee, 0) +
      sumExtrasLegalFees(displayExtras),
    [displayItems, displayExtras],
  );
  const displayTotalFinesDue = useMemo(
    () => displayItems.reduce((sum, item) => sum + (item.amount_due || 0), 0),
    [displayItems],
  );

  // Extras handlers. Both modes funnel through these so the UI doesn't need
  // to branch on isEditMode in every cell handler.
  const updateExtras = useCallback(
    (updater: (prev: InvoiceExtraLineItem[]) => InvoiceExtraLineItem[]) => {
      if (isEditMode) {
        setEditExtras(updater);
      } else if (activeClientID) {
        setCreateExtrasByClient((prev) => ({
          ...prev,
          [activeClientID]: updater(prev[activeClientID] ?? []),
        }));
      }
    },
    [isEditMode, activeClientID],
  );

  const handleAddExtraLine = useCallback(() => {
    const blank: InvoiceExtraLineItem = {
      id: `extra-${uuidv4()}`,
      summons_number: '',
      violation_date: '',
      status: '',
      hearing_result: '',
      hearing_date: '',
      amount_due: '',
      legal_fee: '',
    };
    updateExtras((prev) => [...prev, blank]);
  }, [updateExtras]);

  const handleExtraFieldChange = useCallback(
    (id: string, field: keyof InvoiceExtraLineItem, value: string) => {
      updateExtras((prev) =>
        prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
      );
    },
    [updateExtras],
  );

  const handleRemoveExtraLine = useCallback(
    (id: string) => {
      updateExtras((prev) => prev.filter((e) => e.id !== id));
    },
    [updateExtras],
  );

  // Modal state for viewing summons details
  const [selectedSummons, setSelectedSummons] = useState<Summons | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingSummons, setLoadingSummons] = useState(false);

  // Success snackbar state
  const [successSnackbar, setSuccessSnackbar] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Post-generation dialog state (asks user to keep or clear cart)
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);

  // Previously-invoiced status for each summons in cart
  // Maps summonsID -> { invoiceDate, paymentStatus, paymentDate }
  const [invoiceHistory, setInvoiceHistory] = useState<Record<string, { invoiceDate: string; paymentStatus: string; paymentDate?: string | null }[]>>({});

  // Fetch invoice history for the active client's cart items
  useEffect(() => {
    const fetchInvoiceHistory = async () => {
      if (activeClientItems.length === 0) {
        setInvoiceHistory({});
        return;
      }

      const history: Record<string, { invoiceDate: string; paymentStatus: string; paymentDate?: string | null }[]> = {};
      try {
        await Promise.all(activeClientItems.map(async (item) => {
          try {
            const result: any = await apiClient.graphql({
              query: invoiceSummonsItemsBySummons,
              variables: { summonsID: item.id, limit: 100 },
            });
            const items = result.data?.invoiceSummonsesBySummonsID?.items || [];
            if (items.length > 0) {
              history[item.id] = items
                .filter((i: any) => i.invoice)
                .map((i: any) => ({
                  invoiceDate: i.invoice.invoice_date,
                  paymentStatus: i.invoice.payment_status,
                  paymentDate: i.invoice.payment_date,
                }));
            }
          } catch {
            // Gracefully degrade if InvoiceSummons table doesn't exist yet
          }
        }));
        setInvoiceHistory(history);
      } catch {
        // Gracefully degrade
      }
    };

    fetchInvoiceHistory();
  }, [activeClientItems]);

  // State for editable footer fields
  const [paymentInstructions, setPaymentInstructions] = useState(FOOTER_TEXT.payment);
  const [reviewText, setReviewText] = useState(FOOTER_TEXT.review);
  const [showOverdue, setShowOverdue] = useState(true);
  const [overdueText, setOverdueText] = useState(FOOTER_TEXT.overdue);
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Cache of fetched Client records keyed by clientID.
  // Populated lazily as new clients show up in the cart — used for tab labels
  // and for auto-filling the recipient form when the active client changes.
  const [clientsByID, setClientsByID] = useState<Record<string, Client>>({});

  // Fetch Client records for every clientID that appears in the cart (once each).
  useEffect(() => {
    const fetchMissingClients = async () => {
      const missing = clientIDs.filter((id) => !clientsByID[id]);
      if (missing.length === 0) return;

      try {
        const results = await Promise.all(
          missing.map((id) =>
            apiClient.graphql({ query: getClient, variables: { id } }) as Promise<{ data: { getClient: Client } }>,
          ),
        );
        const updates: Record<string, Client> = {};
        results.forEach((res, idx) => {
          const client = res?.data?.getClient;
          if (client) updates[missing[idx]] = client;
        });
        if (Object.keys(updates).length > 0) {
          setClientsByID((prev) => ({ ...prev, ...updates }));
        }
      } catch (error) {
        console.error('Failed to fetch client info for cart:', error);
      }
    };

    fetchMissingClients();
  }, [clientIDs, clientsByID]);

  // When the active client changes, swap the detected-client chip and
  // auto-populate the recipient form with that client's contact info.
  // Skipped in edit mode — the recipient is loaded from the saved invoice.
  useEffect(() => {
    if (isEditMode) return;
    if (!activeClientID) {
      setDetectedClient(null);
      return;
    }
    const client = clientsByID[activeClientID];
    if (!client) return;

    setDetectedClient(client);
    setRecipient({
      companyName: client.name || '',
      attention: client.contact_name || '',
      address: client.contact_address || '',
      cityStateZip: recipient.cityStateZip || '', // Keep manual - not in client model
      email: client.contact_email1 || '',
    });
  // recipient.cityStateZip intentionally excluded to avoid infinite loops while
  // the user edits that field manually.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientID, clientsByID, setRecipient, isEditMode]);

  // Edit mode: load the existing invoice and hydrate the working state.
  // Runs once when editInvoiceId appears in the URL.
  useEffect(() => {
    if (!editInvoiceId) {
      // Left edit mode — reset local state.
      setLoadedInvoice(null);
      setEditItems([]);
      setOriginalJoinRows([]);
      setEditLoadError(null);
      return;
    }

    let cancelled = false;
    const loadInvoice = async () => {
      setLoadingInvoice(true);
      setEditLoadError(null);
      try {
        const invoiceResult: any = await apiClient.graphql({
          query: getInvoiceWithItems,
          variables: { id: editInvoiceId },
        });
        const invoice: TrackerInvoice | null = invoiceResult?.data?.getInvoice ?? null;
        if (!invoice) {
          if (!cancelled) setEditLoadError('Invoice not found.');
          return;
        }

        // Pre-populate recipient form from the saved invoice record.
        setRecipient({
          companyName: invoice.recipient_company || '',
          attention: invoice.recipient_attention || '',
          address: invoice.recipient_address || '',
          cityStateZip: '', // Not stored on Invoice; user re-enters if needed.
          email: invoice.recipient_email || '',
        });
        setAlertDeadline(invoice.alert_deadline || null);

        // Fetch full Summons details for each line item so the table and
        // preview can show violation_date / status / etc. Fall back to sparse
        // data if the summons was archived or deleted.
        const joinItems = invoice.items?.items || [];
        const summonsResults = await Promise.all(
          joinItems.map(async (j) => {
            try {
              const res: any = await apiClient.graphql({ query: getSummons, variables: { id: j.summonsID } });
              return res?.data?.getSummons ?? null;
            } catch (err) {
              console.error('Failed to fetch summons for edit hydration:', err);
              return null;
            }
          }),
        );

        const hydrated: InvoiceCartItem[] = joinItems.map((j, idx) => {
          const s = summonsResults[idx];
          return {
            id: j.summonsID,
            summons_number: j.summons_number,
            respondent_name: s?.respondent_name || '',
            clientID: s?.clientID || invoice.clientID || '',
            violation_date: s?.violation_date || null,
            hearing_date: s?.hearing_date || null,
            hearing_result: s?.hearing_result || null,
            status: s?.status || '',
            amount_due: j.amount_due ?? s?.amount_due ?? null,
            legal_fee: j.legal_fee,
            addedAt: invoice.invoice_date,
          };
        });

        if (cancelled) return;
        setLoadedInvoice(invoice);
        setEditItems([...hydrated].sort(compareByHearingDateAsc));

        // Hydrate manual extra-line rows from the Invoice record. Stored as
        // AWSJSON (serialized array) — defensively parse to tolerate null,
        // legacy records without the field, or malformed payloads.
        const rawExtras = invoice.extra_line_items;
        if (rawExtras) {
          try {
            const parsed = typeof rawExtras === 'string' ? JSON.parse(rawExtras) : rawExtras;
            if (Array.isArray(parsed)) {
              setEditExtras(parsed as InvoiceExtraLineItem[]);
            } else {
              setEditExtras([]);
            }
          } catch (parseErr) {
            console.error('Failed to parse extra_line_items:', parseErr);
            setEditExtras([]);
          }
        } else {
          setEditExtras([]);
        }
        setOriginalJoinRows(
          joinItems.map((j) => ({
            id: j.id,
            summonsID: j.summonsID,
            legal_fee: j.legal_fee,
            amount_due: j.amount_due ?? null,
          })),
        );
      } catch (err) {
        console.error('Failed to load invoice for editing:', err);
        if (!cancelled) setEditLoadError('Failed to load invoice. Please try again.');
      } finally {
        if (!cancelled) setLoadingInvoice(false);
      }
    };

    loadInvoice();
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId, setRecipient, setAlertDeadline]);

  /**
   * Fetch full summons data for the detail modal
   */
  const fetchFullSummons = async (id: string): Promise<Summons | null> => {
    try {
      const response = await apiClient.graphql({
        query: getSummons,
        variables: { id }
      }) as { data: { getSummons: Summons } };
      return response.data.getSummons;
    } catch (error) {
      console.error('Failed to fetch summons:', error);
      return null;
    }
  };

  /**
   * Handle clicking on a summons number to open detail modal
   */
  const handleSummonsClick = async (item: InvoiceCartItem) => {
    setLoadingSummons(true);
    const fullSummons = await fetchFullSummons(item.id);
    setLoadingSummons(false);
    if (fullSummons) {
      setSelectedSummons(fullSummons);
      setModalOpen(true);
    }
  };

  /**
   * Mark the active client's cart items as invoiced and persist an Invoice
   * record + InvoiceSummons join rows. Only the active client's subset is
   * invoiced so that a multi-client cart can be drained one client at a time.
   */
  const markItemsAsInvoiced = async (
    items: InvoiceCartItem[],
    extras: InvoiceExtraLineItem[] = [],
  ): Promise<string | null> => {
    const invoiceDate = new Date().toISOString();
    const deadline = alertDeadline || computeAlertDeadline(invoiceDate);
    let invoiceId: string | null = null;

    // Save to localStorage immediately (works before schema deployment)
    markAsInvoiced(items.map(item => item.id));

    // Generate invoice number early so it can be used for both the Invoice record and audit entries
    const invoiceNumber = generateInvoiceNumber(recipient.companyName, invoiceDate);

    // Also attempt DB update (fails silently until schema is deployed)
    // Fetch each summons's existing activity_log, append invoice audit entries, and update
    try {
      // Batch-fetch existing summons records to get their current activity_log
      const summonsResults = await Promise.all(items.map(item =>
        apiClient.graphql({ query: getSummons, variables: { id: item.id } })
      ));

      await Promise.all(items.map((item, idx) => {
        const existing = (summonsResults[idx] as any)?.data?.getSummons;
        const updatedLog = appendInvoiceAuditEntries(
          existing?.activity_log,
          invoiceNumber,
          recipient.companyName,
          invoiceDate,
          deadline,
        );
        return apiClient.graphql({
          query: updateSummons,
          variables: {
            input: {
              id: item.id,
              is_invoiced: true,
              invoice_date: invoiceDate,
              activity_log: updatedLog,
            }
          }
        });
      }));
    } catch (error) {
      console.log('DB update for invoice status skipped (schema not deployed yet):', error);
    }

    // Create persistent Invoice record with linked InvoiceSummons items
    try {
      const clientID = items[0]?.clientID || null;
      const totalLegalFees =
        items.reduce((sum, i) => sum + i.legal_fee, 0) + sumExtrasLegalFees(extras);
      const totalFinesDue = items.reduce((sum, i) => sum + (i.amount_due || 0), 0);

      const invoiceResult: any = await apiClient.graphql({
        query: createInvoiceRecord,
        variables: {
          input: {
            invoice_number: invoiceNumber,
            invoice_date: invoiceDate,
            recipient_company: recipient.companyName,
            recipient_attention: recipient.attention || null,
            recipient_address: recipient.address || null,
            recipient_email: recipient.email || null,
            total_legal_fees: totalLegalFees,
            total_fines_due: totalFinesDue,
            item_count: items.length,
            payment_status: 'unpaid',
            alert_deadline: deadline,
            clientID,
            extra_line_items: extras.length > 0 ? JSON.stringify(extras) : null,
          },
        },
      });

      // Check for GraphQL errors in the response
      if (invoiceResult.errors) {
        console.error('GraphQL errors creating invoice:', invoiceResult.errors);
      }

      invoiceId = invoiceResult.data?.createInvoice?.id || null;
      console.log('Invoice created with ID:', invoiceId);

      if (invoiceId) {
        // Create join records linking each summons to the invoice
        await Promise.all(items.map(item =>
          apiClient.graphql({
            query: createInvoiceSummonsRecord,
            variables: {
              input: {
                invoiceID: invoiceId,
                summonsID: item.id,
                summons_number: item.summons_number,
                legal_fee: item.legal_fee,
                amount_due: item.amount_due,
              },
            },
          })
        ));
        console.log(`Created ${items.length} InvoiceSummons join records`);
      } else {
        console.error('Invoice creation returned no ID — record may not have been saved');
      }
    } catch (error) {
      console.error('Invoice record creation failed:', error);
    }

    return invoiceId;
  };

  // Upload generated invoice file to S3 and store the key on the Invoice record
  const uploadInvoiceToS3 = async (invoiceId: string, blob: Blob, filename: string, contentType: string) => {
    const s3Key = `public/invoices/${invoiceId}/${filename}`;
    try {
      await uploadData({
        key: s3Key,
        data: blob,
        options: { contentType },
      }).result;

      await apiClient.graphql({
        query: updateInvoiceRecord,
        variables: { input: { id: invoiceId, pdf_s3_key: s3Key } },
      });
      console.log('Invoice file saved to S3:', s3Key);
    } catch (uploadError) {
      console.error('Invoice file upload to S3 failed (invoice still created):', uploadError);
    }
  };

  // Snapshot of items that were just invoiced — used by the post-generate
  // dialog so the user can choose to keep or drain them from the cart.
  const [lastGeneratedItems, setLastGeneratedItems] = useState<InvoiceCartItem[]>([]);

  const handleGeneratePDF = async () => {
    if (activeClientItems.length === 0) {
      alert('Please add summonses to the cart before generating an invoice.');
      return;
    }

    setGenerating(true);
    const itemsToInvoice = activeClientItems;
    const extrasToInvoice = activeClientID ? (createExtrasByClient[activeClientID] ?? []) : [];
    try {
      const { blob, filename } = await generatePDF(
        itemsToInvoice,
        recipient,
        { paymentInstructions, reviewText, additionalNotes, showOverdue, overdueText },
        extrasToInvoice,
      );

      // Mark only the active client's items as invoiced
      const invoiceId = await markItemsAsInvoiced(itemsToInvoice, extrasToInvoice);

      // Upload the PDF to S3 and link it to the invoice record
      if (invoiceId) {
        await uploadInvoiceToS3(invoiceId, blob, filename, 'application/pdf');
      }

      // Remember which items were just invoiced so the post-generate dialog
      // can drain exactly those items if the user confirms.
      setLastGeneratedItems(itemsToInvoice);
      setSuccessMessage(`Invoice generated! ${itemsToInvoice.length} summons${itemsToInvoice.length !== 1 ? 'es' : ''} marked as invoiced.`);
      setSuccessDialogOpen(true);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateDOCX = async () => {
    if (activeClientItems.length === 0) {
      alert('Please add summonses to the cart before generating an invoice.');
      return;
    }

    setGenerating(true);
    const itemsToInvoice = activeClientItems;
    const extrasToInvoice = activeClientID ? (createExtrasByClient[activeClientID] ?? []) : [];
    try {
      const { blob, filename } = await generateDOCX(
        itemsToInvoice,
        recipient,
        { paymentInstructions, reviewText, additionalNotes, showOverdue, overdueText },
        extrasToInvoice,
      );

      // Mark only the active client's items as invoiced
      const invoiceId = await markItemsAsInvoiced(itemsToInvoice, extrasToInvoice);

      // Upload the DOCX to S3 and link it to the invoice record
      if (invoiceId) {
        await uploadInvoiceToS3(invoiceId, blob, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }

      setLastGeneratedItems(itemsToInvoice);
      setSuccessMessage(`Invoice generated! ${itemsToInvoice.length} summons${itemsToInvoice.length !== 1 ? 'es' : ''} marked as invoiced.`);
      setSuccessDialogOpen(true);
    } catch (error) {
      console.error('Error generating DOCX:', error);
      alert('Failed to generate DOCX. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleClearCart = () => {
    if (cartItems.length === 0) return;
    if (window.confirm('Clear all items from the invoice cart? This will also reset the recipient information.')) {
      clearCart();
    }
  };

  /**
   * Save edits to an existing invoice:
   *   1. Diff line items (kept vs added vs removed)
   *   2. Update/create/delete InvoiceSummons join rows
   *   3. Toggle is_invoiced flag + append audit entries on affected summonses
   *   4. Update the Invoice record (totals, recipient, alert deadline)
   *   5. Regenerate the PDF and overwrite the S3 object
   *
   * Each group is wrapped in its own try/catch — DB writes are not rolled back
   * if PDF regeneration fails; a snackbar surfaces the partial failure so the
   * user can retry regeneration from the detail view.
   */
  const executeSaveEdits = useCallback(async () => {
    if (!loadedInvoice || !editInvoiceId) return;
    if (editItems.length === 0) {
      alert('An invoice must have at least one summons. Delete the invoice instead if you want to remove all line items.');
      return;
    }

    setSaving(true);
    let partialFailureMessage: string | null = null;

    try {
      // --- 1 & 2. Diff and apply InvoiceSummons changes ------------------
      const originalBySummons = new Map(originalJoinRows.map((r) => [r.summonsID, r]));
      const editedBySummons = new Map(editItems.map((i) => [i.id, i]));

      const kept = editItems.filter((i) => originalBySummons.has(i.id));
      const added = editItems.filter((i) => !originalBySummons.has(i.id));
      const removed = originalJoinRows.filter((r) => !editedBySummons.has(r.summonsID));

      // Apply updates for kept rows with changed fees/amount.
      await Promise.all(
        kept.map(async (item) => {
          const orig = originalBySummons.get(item.id);
          if (!orig) return;
          const feeChanged = orig.legal_fee !== item.legal_fee;
          const amtChanged = (orig.amount_due ?? null) !== (item.amount_due ?? null);
          if (!feeChanged && !amtChanged) return;

          try {
            await apiClient.graphql({
              query: updateInvoiceSummonsRecord,
              variables: {
                input: {
                  id: orig.id,
                  legal_fee: item.legal_fee,
                  amount_due: item.amount_due,
                },
              },
            });

            // Audit the summons activity log with an INVOICE_MODIFIED entry.
            const diffParts: string[] = [];
            if (feeChanged) diffParts.push(`legal fee $${orig.legal_fee} → $${item.legal_fee}`);
            if (amtChanged) diffParts.push(`amount due ${orig.amount_due ?? 'none'} → ${item.amount_due ?? 'none'}`);
            const existingSummons: any = await apiClient.graphql({
              query: getSummons,
              variables: { id: item.id },
            });
            const updatedLog = appendInvoiceModifiedEntry(
              existingSummons?.data?.getSummons?.activity_log,
              loadedInvoice.invoice_number,
              diffParts.join('; '),
            );
            await apiClient.graphql({
              query: updateSummons,
              variables: { input: { id: item.id, activity_log: updatedLog } },
            });
          } catch (err) {
            console.error(`Failed to update InvoiceSummons for ${item.summons_number}:`, err);
          }
        }),
      );

      // Delete removed rows + un-mark the underlying summonses.
      // Before flipping is_invoiced=false we check whether the summons still
      // appears on any OTHER invoice — if it does, the flag must stay true.
      await Promise.all(
        removed.map(async (r) => {
          try {
            await apiClient.graphql({
              query: deleteInvoiceSummonsRecord,
              variables: { input: { id: r.id } },
            });

            // Check remaining InvoiceSummons rows for this summons (excluding the one we just deleted).
            let stillOnAnotherInvoice = false;
            try {
              const remainingResult: any = await apiClient.graphql({
                query: invoiceSummonsItemsBySummons,
                variables: { summonsID: r.summonsID, limit: 100 },
              });
              const remaining = remainingResult?.data?.invoiceSummonsesBySummonsID?.items || [];
              stillOnAnotherInvoice = remaining.some(
                (i: any) => i.invoiceID && i.invoiceID !== editInvoiceId,
              );
            } catch (checkErr) {
              console.warn('Failed to check remaining invoices for summons; leaving is_invoiced untouched:', checkErr);
              stillOnAnotherInvoice = true; // fail-safe: don't flip the flag if unsure
            }

            const existingSummons: any = await apiClient.graphql({
              query: getSummons,
              variables: { id: r.summonsID },
            });
            const updatedLog = appendInvoiceRemovedEntry(
              existingSummons?.data?.getSummons?.activity_log,
              loadedInvoice.invoice_number,
            );

            const input: any = {
              id: r.summonsID,
              activity_log: updatedLog,
            };
            if (!stillOnAnotherInvoice) {
              input.is_invoiced = false;
              input.invoice_date = null;
            }

            await apiClient.graphql({
              query: updateSummons,
              variables: { input },
            });
          } catch (err) {
            console.error(`Failed to remove summons ${r.summonsID} from invoice:`, err);
          }
        }),
      );

      // Create added rows + mark underlying summonses as invoiced.
      await Promise.all(
        added.map(async (item) => {
          try {
            await apiClient.graphql({
              query: createInvoiceSummonsRecord,
              variables: {
                input: {
                  invoiceID: editInvoiceId,
                  summonsID: item.id,
                  summons_number: item.summons_number,
                  legal_fee: item.legal_fee,
                  amount_due: item.amount_due,
                },
              },
            });

            const existingSummons: any = await apiClient.graphql({
              query: getSummons,
              variables: { id: item.id },
            });
            const updatedLog = appendInvoiceAuditEntries(
              existingSummons?.data?.getSummons?.activity_log,
              loadedInvoice.invoice_number,
              loadedInvoice.recipient_company,
              loadedInvoice.invoice_date,
              loadedInvoice.alert_deadline,
            );
            await apiClient.graphql({
              query: updateSummons,
              variables: {
                input: {
                  id: item.id,
                  is_invoiced: true,
                  invoice_date: loadedInvoice.invoice_date,
                  activity_log: updatedLog,
                },
              },
            });
          } catch (err) {
            console.error(`Failed to add summons ${item.summons_number} to invoice:`, err);
          }
        }),
      );

      // --- 4. Update the Invoice record with new totals + recipient -------
      try {
        await apiClient.graphql({
          query: updateInvoiceRecord,
          variables: {
            input: {
              id: editInvoiceId,
              recipient_company: recipient.companyName,
              recipient_attention: recipient.attention || null,
              recipient_address: recipient.address || null,
              recipient_email: recipient.email || null,
              total_legal_fees: displayTotalLegalFees,
              total_fines_due: displayTotalFinesDue,
              item_count: editItems.length,
              alert_deadline: alertDeadline || loadedInvoice.alert_deadline,
              extra_line_items: editExtras.length > 0 ? JSON.stringify(editExtras) : null,
            },
          },
        });
      } catch (err) {
        console.error('Failed to update Invoice record:', err);
        partialFailureMessage = 'Invoice record update failed.';
      }

      // --- 5. Regenerate PDF + overwrite S3 -------------------------------
      try {
        const { blob, filename } = await generatePDF(
          editItems,
          recipient,
          {
            paymentInstructions,
            reviewText,
            additionalNotes,
            showOverdue,
            overdueText,
          },
          editExtras,
        );
        await uploadInvoiceToS3(editInvoiceId, blob, filename, 'application/pdf');
      } catch (err) {
        console.error('PDF regeneration failed:', err);
        partialFailureMessage =
          partialFailureMessage ||
          'Invoice saved, but PDF regeneration failed. You can retry from the invoice detail view.';
      }

      // Refresh tracker so the detail view reflects changes.
      await fetchInvoices();

      // Navigate back to the tracker with a message for its snackbar.
      navigate('/invoice-tracker', {
        state: {
          invoiceEditMessage: partialFailureMessage
            ? partialFailureMessage
            : `Invoice ${loadedInvoice.invoice_number} updated.`,
          invoiceEditSeverity: partialFailureMessage ? 'warning' : 'success',
        },
      });
    } catch (err) {
      console.error('Unexpected error saving invoice edits:', err);
      alert('Failed to save invoice. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [
    loadedInvoice,
    editInvoiceId,
    editItems,
    editExtras,
    originalJoinRows,
    recipient,
    alertDeadline,
    displayTotalLegalFees,
    displayTotalFinesDue,
    paymentInstructions,
    reviewText,
    additionalNotes,
    showOverdue,
    overdueText,
    fetchInvoices,
    navigate,
  ]);

  const handleSaveEdits = () => {
    if (editItems.length === 0) {
      alert('An invoice must have at least one summons. Delete the invoice instead if you want to remove all line items.');
      return;
    }
    // If the invoice is marked paid, warn before proceeding.
    if (loadedInvoice?.payment_status === 'paid') {
      setPaidWarningOpen(true);
      return;
    }
    executeSaveEdits();
  };

  const handleCancelEdit = () => {
    navigate('/invoice-tracker');
  };

  /**
   * Open the "Add summonses" picker. Pulls all summonses for the same client
   * and filters out any that are either (a) already on this invoice's working
   * copy, or (b) currently invoiced on a different invoice. Users can pick
   * previously-uninvoiced summonses to add to the working invoice.
   */
  const handleOpenPicker = async () => {
    if (!loadedInvoice?.clientID) {
      alert('Cannot determine which client this invoice belongs to.');
      return;
    }
    setPickerOpen(true);
    setPickerLoading(true);
    setPickerSelection(new Set());
    try {
      const result: { data?: { summonsByClientIDAndHearing_date?: { items?: PickerCandidate[] } } } =
        await apiClient.graphql({
          query: summonsesByClientForPicker,
          variables: { clientID: loadedInvoice.clientID, limit: 1000 },
        }) as { data?: { summonsByClientIDAndHearing_date?: { items?: PickerCandidate[] } } };
      const items: PickerCandidate[] = result?.data?.summonsByClientIDAndHearing_date?.items || [];

      // Exclude summonses already on this invoice's working copy and those on
      // a DIFFERENT invoice (still invoiced). We allow previously un-invoiced
      // summonses to be added here.
      const editIds = new Set(editItems.map((i) => i.id));
      const filtered = items.filter((s) => {
        if (editIds.has(s.id)) return false;
        // If the summons is currently invoiced but its invoice_date matches
        // this invoice's date, it was probably removed from this invoice
        // during the current edit — let the user re-add it.
        if (s.is_invoiced && s.invoice_date && loadedInvoice.invoice_date) {
          if (s.invoice_date !== loadedInvoice.invoice_date) return false;
        } else if (s.is_invoiced) {
          return false;
        }
        return true;
      });
      setPickerCandidates([...filtered].sort(compareByHearingDateAsc));
    } catch (err) {
      console.error('Failed to load summonses for picker:', err);
      alert('Failed to load summonses. Please try again.');
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleTogglePickerSelection = (summonsID: string) => {
    setPickerSelection((prev) => {
      const next = new Set(prev);
      if (next.has(summonsID)) next.delete(summonsID);
      else next.add(summonsID);
      return next;
    });
  };

  const handleConfirmPickerAdd = () => {
    if (pickerSelection.size === 0) {
      setPickerOpen(false);
      return;
    }

    // Map the selected summonses into InvoiceCartItem shape and append to
    // the working edit list. Default to DEFAULT_LEGAL_FEE for legal fee.
    const now = new Date().toISOString();
    const newItems: InvoiceCartItem[] = pickerCandidates
      .filter((s) => pickerSelection.has(s.id))
      .map((s) => ({
        id: s.id,
        summons_number: s.summons_number,
        respondent_name: s.respondent_name || '',
        clientID: s.clientID || loadedInvoice?.clientID || '',
        violation_date: s.violation_date || null,
        hearing_date: s.hearing_date || null,
        hearing_result: s.hearing_result || null,
        status: s.status || '',
        amount_due: s.amount_due ?? null,
        legal_fee: DEFAULT_LEGAL_FEE,
        addedAt: now,
      }));

    setEditItems((prev) => [...prev, ...newItems].sort(compareByHearingDateAsc));
    setPickerOpen(false);
    setPickerSelection(new Set());
  };

  // Post-generation dialog handlers.
  // "Remove these" drains only the items from the invoice we just generated
  // so the user can continue processing other clients still in the cart.
  const handleSuccessDialogClear = () => {
    if (lastGeneratedItems.length > 0) {
      removeManyFromCart(lastGeneratedItems.map((i) => i.id));
    }
    // Drop the extras for the client we just invoiced — they were baked in
    // and persisted on the Invoice record, so keeping them staged would
    // cause double-inclusion on the next invoice for this client.
    const clientIDJustInvoiced = lastGeneratedItems[0]?.clientID;
    if (clientIDJustInvoiced) {
      setCreateExtrasByClient((prev) => {
        const next = { ...prev };
        delete next[clientIDJustInvoiced];
        return next;
      });
    }
    setLastGeneratedItems([]);
    setSuccessDialogOpen(false);
    setSuccessSnackbar(true);
  };

  const handleSuccessDialogKeep = () => {
    setLastGeneratedItems([]);
    setSuccessDialogOpen(false);
    setSuccessSnackbar(true);
  };

  const handleLegalFeeChange = (summonsId: string, value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;
    if (isEditMode) {
      setEditItems((prev) =>
        prev.map((item) => (item.id === summonsId ? { ...item, legal_fee: numValue } : item)),
      );
    } else {
      updateLegalFee(summonsId, numValue);
    }
  };

  const handleAmountDueChange = (summonsId: string, value: string) => {
    if (value === '' || value === null) {
      if (isEditMode) {
        setEditItems((prev) =>
          prev.map((item) => (item.id === summonsId ? { ...item, amount_due: null } : item)),
        );
      } else {
        updateAmountDue(summonsId, null);
      }
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;
    if (isEditMode) {
      setEditItems((prev) =>
        prev.map((item) => (item.id === summonsId ? { ...item, amount_due: numValue } : item)),
      );
    } else {
      updateAmountDue(summonsId, numValue);
    }
  };

  const handleRemoveItem = (summonsId: string) => {
    if (isEditMode) {
      setEditItems((prev) => prev.filter((item) => item.id !== summonsId));
    } else {
      removeFromCart(summonsId);
    }
  };

  // Edit-on-the-invoice overrides for the Hearing Status and Results columns.
  // These are per-invoice display values — they flow into the generated PDF
  // and preview, but do not touch the underlying Summons record.
  const handleStatusChange = (summonsId: string, value: string) => {
    if (isEditMode) {
      setEditItems((prev) =>
        prev.map((item) => (item.id === summonsId ? { ...item, status: value } : item)),
      );
    } else {
      updateStatus(summonsId, value);
    }
  };

  const handleHearingResultChange = (summonsId: string, value: string) => {
    // Treat an empty string as "no result" so the PDF shows a blank cell
    // rather than a literal "".
    const normalized = value === '' ? null : value;
    if (isEditMode) {
      setEditItems((prev) =>
        prev.map((item) => (item.id === summonsId ? { ...item, hearing_result: normalized } : item)),
      );
    } else {
      updateHearingResult(summonsId, normalized);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        {isEditMode ? (
          <EditIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        ) : (
          <ShoppingCartIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        )}
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {isEditMode
            ? loadedInvoice
              ? `Edit Invoice ${loadedInvoice.invoice_number}`
              : 'Edit Invoice'
            : 'Invoice Builder'}
        </Typography>
        {!isEditMode && (
          <Typography
            variant="body1"
            sx={{
              ml: 1,
              px: 2,
              py: 0.5,
              bgcolor: 'primary.main',
              color: 'white',
              borderRadius: 2,
              fontWeight: 600,
            }}
          >
            {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
            {clientIDs.length > 1 ? ` across ${clientIDs.length} clients` : ''}
          </Typography>
        )}
        {isEditMode && loadedInvoice?.payment_status === 'paid' && (
          <Chip label="PAID" color="success" size="small" sx={{ fontWeight: 600 }} />
        )}
      </Box>

      {/* Edit mode load state / errors */}
      {isEditMode && loadingInvoice && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Loading invoice…</Typography>
        </Box>
      )}
      {isEditMode && editLoadError && (
        <Alert severity="error" sx={{ mb: 3 }}>{editLoadError}</Alert>
      )}

      {/* Multi-client cart selector — hidden in edit mode (single client per invoice) */}
      {!isEditMode && clientIDs.length > 1 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your cart contains summonses from {clientIDs.length} clients. Invoices are generated one client at a time — pick a client below, generate its invoice, then move to the next.
        </Alert>
      )}

      {!isEditMode && clientIDs.length > 1 && activeClientID && (
        <Paper variant="outlined" sx={{ mb: 3 }}>
          <Tabs
            value={activeClientID}
            onChange={(_, newValue) => setActiveClientID(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Cart client selector"
          >
            {clientIDs.map((cid) => {
              const clientName = clientsByID[cid]?.name || 'Loading…';
              const count = itemsByClient.get(cid)?.length ?? 0;
              return (
                <Tab
                  key={cid}
                  value={cid}
                  label={`${clientName} (${count})`}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                />
              );
            })}
          </Tabs>
        </Paper>
      )}

      {!isEditMode && cartItems.length === 0 ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          Your invoice cart is empty. Add summonses from the Dashboard by clicking the shopping cart icon on each row.
        </Alert>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: 3,
          }}
        >
          {/* Left panel: editor */}
          <Stack spacing={3}>
            {/* Recipient Form Section */}
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Invoice Recipient
                  </Typography>
                  {detectedClient && (
                    <Chip
                      label={`Client: ${detectedClient.name}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </Box>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                    mt: 2,
                  }}
                >
                  <TextField
                    label="Company Name"
                    value={recipient.companyName}
                    onChange={(e) => updateRecipientField('companyName', e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Attention"
                    value={recipient.attention}
                    onChange={(e) => updateRecipientField('attention', e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Address"
                    value={recipient.address}
                    onChange={(e) => updateRecipientField('address', e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="City, State, ZIP"
                    value={recipient.cityStateZip}
                    onChange={(e) => updateRecipientField('cityStateZip', e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Email"
                    type="email"
                    value={recipient.email}
                    onChange={(e) => updateRecipientField('email', e.target.value)}
                    fullWidth
                    sx={{ gridColumn: { sm: 'span 2' } }}
                  />
                </Box>
              </CardContent>
            </Card>

            {/* Cart Items Table */}
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {isEditMode ? 'Invoice Line Items' : 'Cart Items'}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddExtraLine}
                      disabled={!isEditMode && !activeClientID}
                    >
                      Add Line
                    </Button>
                    {isEditMode ? (
                      <Button
                        variant="outlined"
                        color="primary"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={handleOpenPicker}
                      >
                        Add Summonses
                      </Button>
                    ) : (
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<ClearAllIcon />}
                        onClick={handleClearCart}
                      >
                        Clear Cart
                      </Button>
                    )}
                  </Stack>
                </Box>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell sx={{ fontWeight: 600 }}>Summons #</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Violation Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Hearing Status</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Results</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Hearing Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">Fine Due</TableCell>
                        <TableCell sx={{ fontWeight: 600, minWidth: 100 }} align="right">Legal Fee</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="center">Remove</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {displayItems.map((item) => (
                        <TableRow key={item.id} hover>
                          <TableCell>
                            <Box
                              sx={{
                                cursor: 'pointer',
                                color: 'primary.main',
                                fontWeight: 500,
                                '&:hover': { textDecoration: 'underline' },
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.5,
                              }}
                              onClick={() => handleSummonsClick(item)}
                            >
                              {item.summons_number}
                              {loadingSummons && (
                                <CircularProgress size={12} sx={{ ml: 0.5 }} />
                              )}
                            </Box>
                            {/* Previously invoiced/paid indicator */}
                            {invoiceHistory[item.id]?.map((hist, idx) => (
                              <Chip
                                key={idx}
                                label={
                                  hist.paymentStatus === 'paid'
                                    ? `Paid ${formatDate(hist.paymentDate || hist.invoiceDate)}`
                                    : `Invoiced ${formatDate(hist.invoiceDate)}`
                                }
                                size="small"
                                color={hist.paymentStatus === 'paid' ? 'success' : 'warning'}
                                variant="outlined"
                                sx={{ ml: 0.5, mt: 0.5, fontSize: '0.65rem', height: 20 }}
                              />
                            ))}
                          </TableCell>
                          <TableCell>{formatDate(item.violation_date)}</TableCell>
                          <TableCell>
                            <TextField
                              value={item.status || ''}
                              onChange={(e) => handleStatusChange(item.id, e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="—"
                              sx={{ minWidth: 110 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              value={item.hearing_result || ''}
                              onChange={(e) => handleHearingResultChange(item.id, e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="—"
                              sx={{ minWidth: 110 }}
                            />
                          </TableCell>
                          <TableCell>{formatDate(item.hearing_date)}</TableCell>
                          <TableCell align="right">
                            <TextField
                              type="number"
                              value={item.amount_due ?? ''}
                              onChange={(e) => handleAmountDueChange(item.id, e.target.value)}
                              size="small"
                              inputProps={{ min: 0, step: 50, style: { textAlign: 'right' } }}
                              sx={{ width: 110 }}
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              type="number"
                              value={item.legal_fee}
                              onChange={(e) => handleLegalFeeChange(item.id, e.target.value)}
                              size="small"
                              inputProps={{ min: 0, step: 25, style: { textAlign: 'right' } }}
                              sx={{ width: 100 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title={isEditMode ? 'Remove from invoice' : 'Remove from cart'}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveItem(item.id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Manual extra-line rows — every cell is a free-text
                          field. Pinned below the summons rows so the invoice
                          reads chronologically at the top and "other fees"
                          group at the bottom. */}
                      {displayExtras.map((extra) => (
                        <TableRow key={extra.id} hover sx={{ bgcolor: 'grey.50' }}>
                          <TableCell>
                            <TextField
                              value={extra.summons_number}
                              onChange={(e) => handleExtraFieldChange(extra.id, 'summons_number', e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="Research Fee"
                              sx={{ minWidth: 120 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              value={extra.violation_date}
                              onChange={(e) => handleExtraFieldChange(extra.id, 'violation_date', e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="—"
                              sx={{ minWidth: 90 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              value={extra.status}
                              onChange={(e) => handleExtraFieldChange(extra.id, 'status', e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="—"
                              sx={{ minWidth: 110 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              value={extra.hearing_result}
                              onChange={(e) => handleExtraFieldChange(extra.id, 'hearing_result', e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="—"
                              sx={{ minWidth: 110 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              value={extra.hearing_date}
                              onChange={(e) => handleExtraFieldChange(extra.id, 'hearing_date', e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="—"
                              sx={{ minWidth: 90 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              value={extra.amount_due}
                              onChange={(e) => handleExtraFieldChange(extra.id, 'amount_due', e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="—"
                              inputProps={{ style: { textAlign: 'right' } }}
                              sx={{ width: 100 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              value={extra.legal_fee}
                              onChange={(e) => handleExtraFieldChange(extra.id, 'legal_fee', e.target.value)}
                              size="small"
                              variant="standard"
                              placeholder="0"
                              inputProps={{ style: { textAlign: 'right' } }}
                              sx={{ width: 90 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Remove line">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveExtraLine(extra.id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>

            {/* Invoice Footer Text Section */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  Invoice Footer Text
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Customize the text that appears after the summons table.
                </Typography>

                <Stack spacing={2}>
                  <TextField
                    label="Payment Instructions"
                    value={paymentInstructions}
                    onChange={(e) => setPaymentInstructions(e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                    helperText="Payment methods and instructions"
                  />

                  <TextField
                    label="Review Request"
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                    helperText="Asks client about defenses/explanations for the violations"
                  />

                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={showOverdue}
                          onChange={(e) => setShowOverdue(e.target.checked)}
                        />
                      }
                      label="Include Overdue Fine Paragraph"
                    />
                    {showOverdue && (
                      <TextField
                        label="Overdue Fine Text"
                        value={overdueText}
                        onChange={(e) => setOverdueText(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                        helperText="Paragraph about overdue fines and CityPay link"
                        sx={{ mt: 1 }}
                      />
                    )}
                  </Box>

                  <TextField
                    label="Additional Notes (Optional)"
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Add any case-specific notes here..."
                    helperText="Custom text that appears at the end of the invoice"
                  />
                </Stack>
              </CardContent>
            </Card>

            {/* Totals Section */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  Invoice Summary
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1">Total Fines Due:</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {formatCurrency(displayTotalFinesDue)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1">Total Legal Fees:</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {formatCurrency(displayTotalLegalFees)}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Alert Deadline Picker */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Payment Alert Deadline
                  </Typography>
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DatePicker
                      value={alertDeadline ? dayjs.utc(alertDeadline) : null}
                      onChange={(newValue) => {
                        setAlertDeadline(newValue ? newValue.toISOString() : null);
                      }}
                      slotProps={{
                        textField: {
                          size: 'small',
                          fullWidth: true,
                          helperText: alertDeadline
                            ? undefined
                            : 'Defaults to 7 days after invoice date',
                          placeholder: 'Select deadline...',
                        },
                      }}
                    />
                  </LocalizationProvider>
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Action Buttons — Generate (cart mode) vs Save/Cancel (edit mode) */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {isEditMode ? (
                    <>
                      <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                        onClick={handleSaveEdits}
                        disabled={saving || editItems.length === 0}
                      >
                        {saving ? 'Saving…' : 'Save Changes'}
                      </Button>
                      <Button
                        variant="outlined"
                        color="inherit"
                        size="large"
                        onClick={handleCancelEdit}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        startIcon={<PictureAsPdfIcon />}
                        onClick={handleGeneratePDF}
                        disabled={generating || activeClientItems.length === 0}
                      >
                        Generate PDF
                      </Button>
                      <Button
                        variant="outlined"
                        color="primary"
                        size="large"
                        startIcon={<DescriptionIcon />}
                        onClick={handleGenerateDOCX}
                        disabled={generating || activeClientItems.length === 0}
                      >
                        Generate DOCX
                      </Button>
                    </>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Stack>

          {/* Right panel: sticky live preview */}
          <Box sx={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  Preview
                </Typography>
                <InvoicePreview
                  cartItems={displayItems}
                  recipient={recipient}
                  paymentInstructions={paymentInstructions}
                  reviewText={reviewText}
                  showOverdue={showOverdue}
                  overdueText={overdueText}
                  additionalNotes={additionalNotes}
                  extras={displayExtras}
                />
              </CardContent>
            </Card>
          </Box>
        </Box>
      )}

      {/* Summons Detail Modal */}
      <SummonsDetailModal
        open={modalOpen}
        summons={selectedSummons}
        onClose={() => {
          setModalOpen(false);
          setSelectedSummons(null);
        }}
        onUpdate={() => {
          // Updates are handled internally by the modal
        }}
      />

      {/* Post-Generation Dialog — asks user to keep or drain the invoiced items */}
      <Dialog
        open={successDialogOpen}
        onClose={handleSuccessDialogKeep}
      >
        <DialogTitle>Invoice Generated</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {successMessage}
            {clientIDs.length > 1
              ? ' Remove these items from the cart, or keep them to regenerate? Other clients in the cart will stay either way.'
              : ' Remove these items from the cart, or keep them to regenerate?'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSuccessDialogKeep}>
            Keep in Cart
          </Button>
          <Button onClick={handleSuccessDialogClear} color="error" variant="contained">
            Remove These Items
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={successSnackbar}
        autoHideDuration={5000}
        onClose={() => setSuccessSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSuccessSnackbar(false)}
          severity="success"
          sx={{ width: '100%' }}
        >
          {successMessage}
        </Alert>
      </Snackbar>

      {/* Paid-invoice confirmation dialog — guards against accidental edits to a paid invoice */}
      <Dialog open={paidWarningOpen} onClose={() => setPaidWarningOpen(false)}>
        <DialogTitle>Edit Paid Invoice?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This invoice is marked <strong>paid</strong>. Saving changes will update the invoice record and its PDF but will not change its payment status. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaidWarningOpen(false)}>Cancel</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              setPaidWarningOpen(false);
              executeSaveEdits();
            }}
          >
            Save Anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Summonses picker — edit mode */}
      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Add Summonses to Invoice</DialogTitle>
        <DialogContent dividers>
          {pickerLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : pickerCandidates.length === 0 ? (
            <Typography color="text.secondary">
              No un-invoiced summonses available for this client.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell padding="checkbox"></TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Summons #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Violation Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Hearing Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Fine Due</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pickerCandidates.map((s) => {
                    const selected = pickerSelection.has(s.id);
                    return (
                      <TableRow
                        key={s.id}
                        hover
                        onClick={() => handleTogglePickerSelection(s.id)}
                        sx={{ cursor: 'pointer' }}
                        selected={selected}
                      >
                        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected} onChange={() => handleTogglePickerSelection(s.id)} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{s.summons_number}</TableCell>
                        <TableCell>{formatDate(s.violation_date)}</TableCell>
                        <TableCell>{formatDate(s.hearing_date)}</TableCell>
                        <TableCell>{s.status || '—'}</TableCell>
                        <TableCell align="right">{formatCurrency(s.amount_due)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmPickerAdd}
            disabled={pickerSelection.size === 0}
          >
            Add {pickerSelection.size > 0 ? `${pickerSelection.size} ` : ''}to Invoice
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvoiceBuilder;
