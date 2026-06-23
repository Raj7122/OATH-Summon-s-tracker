/**
 * @vitest-environment jsdom
 *
 * InvoicePreview date rendering — the on-screen view Jacky looks at before
 * generating. Verifies the live preview shows each invoice's OWN stored date
 * (not "today"), and falls back to today only when no date is provided.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import InvoicePreview from '../src/components/InvoicePreview';
import { InvoiceCartItem, InvoiceRecipient } from '../src/types/invoice';

dayjs.extend(utc);

const items: InvoiceCartItem[] = [
  {
    id: '1',
    summons_number: '123456789',
    respondent_name: 'Test Corp',
    clientID: 'c1',
    violation_date: '2024-06-01T00:00:00Z',
    hearing_date: '2024-07-01T00:00:00Z',
    hearing_result: 'DEFAULT',
    status: 'CLOSED',
    amount_due: 500,
    legal_fee: 250,
    addedAt: '2024-06-01T00:00:00Z',
  },
];

const recipient: InvoiceRecipient = {
  companyName: 'Test Corp',
  attention: 'John Doe',
  address: '123 Main St',
  cityStateZip: 'New York, NY 10001',
  email: 'john@test.com',
};

const baseProps = {
  cartItems: items,
  recipient,
  paymentInstructions: 'Pay via Zelle.',
  reviewText: 'Review the evidence.',
  showOverdue: false,
  overdueText: '',
  additionalNotes: '',
};

describe('InvoicePreview — date', () => {
  it('shows the stored invoiceDate, not today', () => {
    const today = dayjs().format('MMMM D, YYYY');
    render(<InvoicePreview {...baseProps} invoiceDate="2025-03-14T00:00:00Z" />);

    expect(screen.getByText('March 14, 2025')).toBeTruthy();
    if (today !== 'March 14, 2025') {
      expect(screen.queryByText(today)).toBeNull();
    }
  });

  it('falls back to today when no invoiceDate is provided (create mode)', () => {
    const today = dayjs().format('MMMM D, YYYY');
    render(<InvoicePreview {...baseProps} />);

    expect(screen.getByText(today)).toBeTruthy();
  });
});
