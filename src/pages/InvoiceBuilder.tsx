/**
 * Invoice Builder Page
 *
 * Staging area for generating invoices from selected summonses.
 * Allows editing recipient info, adjusting legal fees, and generating PDF/DOCX invoices.
 *
 * @module pages/InvoiceBuilder
 */

import { useState, useEffect } from 'react';
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
} from '@mui/material';
import { generateClient } from 'aws-amplify/api';
import { getClient, getSummons } from '../graphql/queries';
import { updateSummons } from '../graphql/mutations';
import DeleteIcon from '@mui/icons-material/Delete';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import dayjs from 'dayjs';

import SummonsDetailModal from '../components/SummonsDetailModal';
import { Summons } from '../types/summons';
import { InvoiceCartItem } from '../types/invoice';

import { useInvoice } from '../contexts/InvoiceContext';
import { generatePDF, generateDOCX } from '../utils/invoiceGenerator';
import { FOOTER_TEXT } from '../constants/invoiceDefaults';
import { markAsInvoiced } from '../utils/invoiceTracking';

const apiClient = generateClient();

interface Client {
  id: string;
  name: string;
  contact_name?: string;
  contact_address?: string;
  contact_email1?: string;
}

/**
 * Format date string for display
 */
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '—';
  const date = dayjs(dateString);
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
    updateRecipientField,
    setRecipient,
    removeFromCart,
    updateLegalFee,
    updateAmountDue,
    clearCart,
    getCartCount,
    getTotalLegalFees,
    getTotalFinesDue,
  } = useInvoice();

  const [generating, setGenerating] = useState(false);
  const [detectedClient, setDetectedClient] = useState<Client | null>(null);
  const [clientMismatchError, setClientMismatchError] = useState<string | null>(null);

  // Modal state for viewing summons details
  const [selectedSummons, setSelectedSummons] = useState<Summons | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingSummons, setLoadingSummons] = useState(false);

  // Success snackbar state
  const [successSnackbar, setSuccessSnackbar] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // State for 3 editable footer fields
  const [paymentInstructions, setPaymentInstructions] = useState(FOOTER_TEXT.payment);
  const [reviewText, setReviewText] = useState(FOOTER_TEXT.review);
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Auto-detect client from cart items
  useEffect(() => {
    const detectClientFromCart = async () => {
      if (cartItems.length === 0) {
        setDetectedClient(null);
        setClientMismatchError(null);
        return;
      }

      // Get unique clientIDs from cart
      const clientIDs = [...new Set(cartItems.map(item => item.clientID))];

      // Check for mismatch - cart contains summons from different clients
      if (clientIDs.length > 1) {
        setClientMismatchError(
          `Cart contains summons from ${clientIDs.length} different clients. ` +
          `All summons on an invoice must be from the same client.`
        );
        setDetectedClient(null);
        return;
      }

      // Fetch the single client
      const clientID = clientIDs[0];
      try {
        const response = await apiClient.graphql({
          query: getClient,
          variables: { id: clientID }
        }) as { data: { getClient: Client } };
        const fetchedClient = response.data.getClient;
        setDetectedClient(fetchedClient);
        setClientMismatchError(null);

        // Auto-populate recipient (cityStateZip remains manual entry since it's not in client model)
        setRecipient({
          companyName: fetchedClient.name || '',
          attention: fetchedClient.contact_name || '',
          address: fetchedClient.contact_address || '',
          cityStateZip: recipient.cityStateZip || '', // Keep manual - not in client model
          email: fetchedClient.contact_email1 || '',
        });
      } catch (error) {
        console.error('Failed to fetch client:', error);
        setClientMismatchError('Failed to load client information. Please try again.');
      }
    };

    detectClientFromCart();
  // Note: recipient.cityStateZip is intentionally not in deps to avoid infinite loops
  // We only want to re-run when cartItems change, not when user edits cityStateZip
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems, setRecipient]);

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
   * Mark all cart items as invoiced
   *
   * Uses localStorage for immediate persistence (works before schema deployment).
   * Also attempts DB update which will succeed once schema is deployed.
   */
  const markItemsAsInvoiced = async (): Promise<boolean> => {
    const invoiceDate = new Date().toISOString();

    // Save to localStorage immediately (works before schema deployment)
    markAsInvoiced(cartItems.map(item => item.id));

    // Also attempt DB update (fails silently until schema is deployed)
    try {
      await Promise.all(cartItems.map(item =>
        apiClient.graphql({
          query: updateSummons,
          variables: {
            input: {
              id: item.id,
              is_invoiced: true,
              invoice_date: invoiceDate,
            }
          }
        })
      ));
    } catch (error) {
      // Expected to fail until schema is deployed - localStorage handles it
      console.log('DB update for invoice status skipped (schema not deployed yet):', error);
    }

    return true;
  };

  const handleGeneratePDF = async () => {
    if (cartItems.length === 0) {
      alert('Please add summonses to the cart before generating an invoice.');
      return;
    }

    setGenerating(true);
    try {
      await generatePDF(cartItems, recipient, { paymentInstructions, reviewText, additionalNotes });

      // Mark all cart items as invoiced in the database
      const markedSuccess = await markItemsAsInvoiced();
      if (markedSuccess) {
        // Clear the cart after successful generation and DB update
        clearCart();
        setSuccessMessage(`Invoice generated! ${cartItems.length} summons${cartItems.length !== 1 ? 'es' : ''} marked as invoiced.`);
        setSuccessSnackbar(true);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateDOCX = async () => {
    if (cartItems.length === 0) {
      alert('Please add summonses to the cart before generating an invoice.');
      return;
    }

    setGenerating(true);
    try {
      await generateDOCX(cartItems, recipient, { paymentInstructions, reviewText, additionalNotes });

      // Mark all cart items as invoiced in the database
      const markedSuccess = await markItemsAsInvoiced();
      if (markedSuccess) {
        // Clear the cart after successful generation and DB update
        clearCart();
        setSuccessMessage(`Invoice generated! ${cartItems.length} summons${cartItems.length !== 1 ? 'es' : ''} marked as invoiced.`);
        setSuccessSnackbar(true);
      }
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

  const handleLegalFeeChange = (summonsId: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      updateLegalFee(summonsId, numValue);
    }
  };

  const handleAmountDueChange = (summonsId: string, value: string) => {
    if (value === '' || value === null) {
      updateAmountDue(summonsId, null);
      return;
    }
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      updateAmountDue(summonsId, numValue);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <ShoppingCartIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Invoice Builder
        </Typography>
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
          {getCartCount()} item{getCartCount() !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Client Mismatch Error */}
      {clientMismatchError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {clientMismatchError}
        </Alert>
      )}

      {cartItems.length === 0 ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          Your invoice cart is empty. Add summonses from the Dashboard by clicking the shopping cart icon on each row.
        </Alert>
      ) : (
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
                  Cart Items
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<ClearAllIcon />}
                  onClick={handleClearCart}
                >
                  Clear Cart
                </Button>
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
                    {cartItems.map((item) => (
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
                        </TableCell>
                        <TableCell>{formatDate(item.violation_date)}</TableCell>
                        <TableCell>{item.status || '—'}</TableCell>
                        <TableCell>{item.hearing_result || '—'}</TableCell>
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
                          <Tooltip title="Remove from cart">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => removeFromCart(item.id)}
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
                    {formatCurrency(getTotalFinesDue())}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body1">Total Legal Fees:</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {formatCurrency(getTotalLegalFees())}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={handleGeneratePDF}
                  disabled={generating || cartItems.length === 0 || !!clientMismatchError}
                >
                  Generate PDF
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  size="large"
                  startIcon={<DescriptionIcon />}
                  onClick={handleGenerateDOCX}
                  disabled={generating || cartItems.length === 0 || !!clientMismatchError}
                >
                  Generate DOCX
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Stack>
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
    </Box>
  );
};

export default InvoiceBuilder;
