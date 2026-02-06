/**
 * Invoice Preview Component
 *
 * Renders an HTML/CSS replica of the generated PDF invoice.
 * Updates in real-time as the user edits recipient info, cart items, and footer text.
 * Read-only — all editing happens in the InvoiceBuilder form panels.
 *
 * @module components/InvoicePreview
 */

import { Box, Paper, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { InvoiceCartItem, InvoiceRecipient } from '../types/invoice';
import {
  SENDER,
  INVOICE_SUBJECT,
  INVOICE_SUBTITLE,
  COURT_NAME,
  SERVICES_DESCRIPTION,
  FOOTER_TEXT,
} from '../constants/invoiceDefaults';

interface InvoicePreviewProps {
  cartItems: InvoiceCartItem[];
  recipient: InvoiceRecipient;
  paymentInstructions: string;
  reviewText: string;
  additionalNotes: string;
}

// Format date as M/DD/YY to match PDF output
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '';
  const date = dayjs(dateString);
  return date.isValid() ? date.format('M/DD/YY') : '';
};

// Format currency without decimals (matches PDF table cells)
const formatCurrency = (amount: number | null): string => {
  if (amount === null || amount === undefined) return 'N/A';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Format currency with decimals (matches PDF total)
const formatCurrencyWithDecimals = (amount: number): string => {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const InvoicePreview = ({
  cartItems,
  recipient,
  paymentInstructions,
  reviewText,
  additionalNotes,
}: InvoicePreviewProps) => {
  const invoiceDate = dayjs().format('MMMM D, YYYY');
  const totalLegalFees = cartItems.reduce((sum, item) => sum + item.legal_fee, 0);

  return (
    <Paper
      variant="outlined"
      sx={{
        // US Letter aspect ratio (8.5 x 11) simulated with padding
        width: '100%',
        maxHeight: '80vh',
        overflowY: 'auto',
        p: 3,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: '0.625rem', // Base ~10pt mapped from PDF size:20
        lineHeight: 1.4,
        color: '#000',
        bgcolor: '#fff',
      }}
    >
      {/* Header Row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        {/* Left: Name + Title */}
        <Box>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              lineHeight: 1.3,
            }}
          >
            {SENDER.name}
          </Typography>
          <Typography
            sx={{
              fontSize: '0.6rem',
              fontFamily: 'inherit',
              textDecoration: 'underline',
              pl: 0.5,
            }}
          >
            {SENDER.title}
          </Typography>
        </Box>

        {/* Right: Address block + Date */}
        <Box sx={{ textAlign: 'right' }}>
          <Box sx={{ fontSize: '0.56rem', lineHeight: 1.5 }}>
            <div>{SENDER.address}</div>
            <div>{SENDER.cityStateZip}</div>
            <div>{SENDER.phone}</div>
            <div>{SENDER.fax}</div>
            <div>{SENDER.email}</div>
          </Box>
          <Box sx={{ fontSize: '0.56rem', mt: 0.75 }}>
            {invoiceDate}
          </Box>
        </Box>
      </Box>

      {/* Recipient Block — skip empty fields to avoid gaps */}
      <Box sx={{ fontSize: '0.56rem', mb: 1.5, mt: 1.5, lineHeight: 1.5 }}>
        {recipient.attention && <div>{recipient.attention}</div>}
        {recipient.companyName && <div>{recipient.companyName}</div>}
        {recipient.address && <div>{recipient.address}</div>}
        {recipient.cityStateZip && <div>{recipient.cityStateZip}</div>}
        {recipient.email && <div>Email: {recipient.email}</div>}
      </Box>

      {/* INVOICE Title */}
      <Box sx={{ textAlign: 'center', mb: 0.5 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '1rem',
            fontFamily: 'inherit',
            lineHeight: 1.2,
          }}
        >
          INVOICE
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', fontFamily: 'inherit' }}>
          And Case Status
        </Typography>
      </Box>

      {/* Re: Section */}
      <Box sx={{ fontSize: '0.56rem', my: 1.5, lineHeight: 1.6 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <span>Re:</span>
          <span>{INVOICE_SUBJECT}</span>
        </Box>
        <Box sx={{ pl: 2.5 }}>
          <div style={{ fontWeight: 700 }}>{INVOICE_SUBTITLE}</div>
          <div>
            <span>Ticket No.:{'  '}</span>
            <span>See below</span>
          </div>
          <div>
            <span>Defendant:{'  '}</span>
            <span style={{ fontWeight: 700 }}>
              {recipient.companyName || 'COMPANY NAME'}
            </span>
          </div>
          <div>
            <span>Court:{'  '}</span>
            <span>{COURT_NAME}</span>
          </div>
          <div>
            <span>Court Dates:{'  '}</span>
            <span>As described below</span>
          </div>
        </Box>
      </Box>

      {/* Services Description */}
      <Box sx={{ fontSize: '0.56rem', mb: 1.5, lineHeight: 1.5 }}>
        {SERVICES_DESCRIPTION}
      </Box>

      {/* LEGAL FEE Total — right-aligned */}
      <Box sx={{ textAlign: 'right', mb: 1 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.6rem',
            fontFamily: 'inherit',
          }}
        >
          LEGAL FEE
        </Typography>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.85rem',
            fontFamily: 'inherit',
          }}
        >
          {formatCurrencyWithDecimals(totalLegalFees)}
        </Typography>
      </Box>

      {/* Data Table */}
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.5rem',
          mb: 1.5,
          '& th, & td': {
            border: '0.5px solid #000',
            px: 0.5,
            py: 0.3,
            textAlign: 'left',
            verticalAlign: 'top',
          },
          '& th': {
            fontWeight: 700,
          },
        }}
      >
        <thead>
          <tr>
            <th>Summons<br />Number</th>
            <th>Violation Date</th>
            <th>Hearing Status</th>
            <th>Results</th>
            <th>Hearing Date</th>
            <th style={{ textAlign: 'right' }}>FINE<br />DUE</th>
            <th style={{ textAlign: 'right' }}>LEGAL FEE</th>
          </tr>
        </thead>
        <tbody>
          {cartItems.map((item) => (
            <tr key={item.id}>
              <td style={{ fontFamily: 'monospace' }}>{item.summons_number}</td>
              <td>{formatDate(item.violation_date)}</td>
              <td>{item.status || ''}</td>
              <td>{item.hearing_result || ''}</td>
              <td>{formatDate(item.hearing_date)}</td>
              <td style={{ textAlign: 'right' }}>{formatCurrency(item.amount_due)}</td>
              <td style={{ textAlign: 'right' }}>{formatCurrency(item.legal_fee)}</td>
            </tr>
          ))}
        </tbody>
      </Box>

      {/* Footer Sections — conditional rendering matches invoiceGenerator.ts */}
      <Box sx={{ fontSize: '0.56rem', fontStyle: 'italic', lineHeight: 1.6 }}>
        {/* 1. Payment Instructions (conditional) */}
        {paymentInstructions.trim() && (
          <Box sx={{ mb: 0.75 }}>{paymentInstructions}</Box>
        )}

        {/* 2. Review Text (conditional) */}
        {reviewText.trim() && (
          <Box sx={{ mb: 1 }}>{reviewText}</Box>
        )}

        {/* 3. Overdue Section (always shown) */}
        <Box sx={{ mb: 0.5 }}>{FOOTER_TEXT.overdue}</Box>

        {/* 4. CityPay URL (always shown) */}
        <Box
          component="a"
          href={FOOTER_TEXT.cityPayUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'blue', display: 'block', mb: 1 }}
        >
          {FOOTER_TEXT.cityPayUrl}
        </Box>

        {/* 5. Questions text (always shown) */}
        <Box sx={{ mb: 0.75 }}>{FOOTER_TEXT.questions}</Box>

        {/* 6. Additional Notes (conditional) */}
        {additionalNotes.trim() && (
          <Box sx={{ mb: 0.75 }}>{additionalNotes}</Box>
        )}

        {/* 7. Closing text (always shown) */}
        <Box>{FOOTER_TEXT.closing}</Box>
      </Box>
    </Paper>
  );
};

export default InvoicePreview;
