/**
 * @vitest-environment jsdom
 *
 * InvoiceContext — cart-mutation action tests
 *
 * Covers the actions added for the editable Hearing Status / Results feature
 * in the Invoice Builder. These overrides are ephemeral (live in the cart /
 * localStorage only) — these tests lock in that contract.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { InvoiceProvider, useInvoice } from '../src/contexts/InvoiceContext';
import { InvoiceCartItem } from '../src/types/invoice';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const cartItem1: InvoiceCartItem = {
  id: 'sum-1',
  summons_number: 'SUM-001',
  respondent_name: 'Test Corp',
  clientID: 'client-1',
  violation_date: '2026-01-15T00:00:00.000Z',
  hearing_date: '2026-02-01T00:00:00.000Z',
  hearing_result: 'DEFAULT',
  status: 'CLOSED',
  amount_due: 500,
  legal_fee: 250,
  addedAt: '2026-02-01T00:00:00.000Z',
};

const cartItem2: InvoiceCartItem = {
  id: 'sum-2',
  summons_number: 'SUM-002',
  respondent_name: 'Test Corp',
  clientID: 'client-1',
  violation_date: '2026-01-16T00:00:00.000Z',
  hearing_date: '2026-02-02T00:00:00.000Z',
  hearing_result: 'DISMISSED',
  status: 'CLOSED',
  amount_due: 300,
  legal_fee: 250,
  addedAt: '2026-02-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'oath-invoice-cart';

// Seed the cart into localStorage so InvoiceProvider hydrates from it on mount.
// InvoiceProvider reads from localStorage during its initial useState, so the
// seed must happen BEFORE renderHook.
function seedCart(items: InvoiceCartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <InvoiceProvider>{children}</InvoiceProvider>
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceContext — updateStatus / updateHearingResult', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updateStatus mutates only the matching cart item', () => {
    seedCart([cartItem1, cartItem2]);
    const { result } = renderHook(() => useInvoice(), { wrapper });

    act(() => {
      result.current.updateStatus('sum-1', 'DEFAULT');
    });

    const item1 = result.current.cartItems.find((i) => i.id === 'sum-1');
    const item2 = result.current.cartItems.find((i) => i.id === 'sum-2');
    expect(item1?.status).toBe('DEFAULT');
    // Untouched neighbor still has its original status.
    expect(item2?.status).toBe('CLOSED');
  });

  it('updateStatus accepts an empty string (user clearing the cell)', () => {
    seedCart([cartItem1]);
    const { result } = renderHook(() => useInvoice(), { wrapper });

    act(() => {
      result.current.updateStatus('sum-1', '');
    });

    const item1 = result.current.cartItems.find((i) => i.id === 'sum-1');
    expect(item1?.status).toBe('');
  });

  it('updateHearingResult mutates only the matching cart item', () => {
    seedCart([cartItem1, cartItem2]);
    const { result } = renderHook(() => useInvoice(), { wrapper });

    act(() => {
      result.current.updateHearingResult('sum-2', 'Granted');
    });

    const item1 = result.current.cartItems.find((i) => i.id === 'sum-1');
    const item2 = result.current.cartItems.find((i) => i.id === 'sum-2');
    expect(item2?.hearing_result).toBe('Granted');
    expect(item1?.hearing_result).toBe('DEFAULT');
  });

  it('updateHearingResult accepts null (user clearing the cell)', () => {
    seedCart([cartItem1]);
    const { result } = renderHook(() => useInvoice(), { wrapper });

    act(() => {
      result.current.updateHearingResult('sum-1', null);
    });

    const item1 = result.current.cartItems.find((i) => i.id === 'sum-1');
    expect(item1?.hearing_result).toBeNull();
  });

  it('edits survive the localStorage round-trip (cart is persisted)', () => {
    seedCart([cartItem1]);
    const { result } = renderHook(() => useInvoice(), { wrapper });

    act(() => {
      result.current.updateStatus('sum-1', 'DEFAULT');
      result.current.updateHearingResult('sum-1', 'Granted');
    });

    // InvoiceProvider writes the cart back to localStorage via a useEffect;
    // read it raw to confirm the override is persisted, not just in memory.
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!) as InvoiceCartItem[];
    const persistedItem = persisted.find((i) => i.id === 'sum-1');
    expect(persistedItem?.status).toBe('DEFAULT');
    expect(persistedItem?.hearing_result).toBe('Granted');
  });
});
