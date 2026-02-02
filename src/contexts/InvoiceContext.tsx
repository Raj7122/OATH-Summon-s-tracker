import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  InvoiceCartItem,
  InvoiceRecipient,
  InvoiceContextType,
  SummonsForInvoice,
} from '../types/invoice';
import { STORAGE_KEYS, DEFAULT_RECIPIENT, DEFAULT_LEGAL_FEE } from '../constants/invoiceDefaults';

const InvoiceContext = createContext<InvoiceContextType | undefined>(undefined);

export const InvoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize cart from LocalStorage
  const [cartItems, setCartItems] = useState<InvoiceCartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.cart);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error loading cart from LocalStorage:', error);
      return [];
    }
  });

  // Initialize recipient from LocalStorage with migration for new email field
  const [recipient, setRecipientState] = useState<InvoiceRecipient>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.recipient);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate: ensure email field exists for older saved data
        return {
          ...DEFAULT_RECIPIENT,
          ...parsed,
          email: parsed.email || '',
        };
      }
      return DEFAULT_RECIPIENT;
    } catch (error) {
      console.error('Error loading recipient from LocalStorage:', error);
      return DEFAULT_RECIPIENT;
    }
  });

  // Persist cart to LocalStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cartItems));
    } catch (error) {
      console.error('Error saving cart to LocalStorage:', error);
    }
  }, [cartItems]);

  // Persist recipient to LocalStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.recipient, JSON.stringify(recipient));
    } catch (error) {
      console.error('Error saving recipient to LocalStorage:', error);
    }
  }, [recipient]);

  // Add a summons to the invoice cart
  const addToCart = useCallback((summons: SummonsForInvoice) => {
    setCartItems((prev) => {
      // Check if already in cart
      if (prev.some((item) => item.id === summons.id)) {
        return prev;
      }

      const newItem: InvoiceCartItem = {
        id: summons.id,
        summons_number: summons.summons_number,
        respondent_name: summons.respondent_name || '',
        clientID: summons.clientID,
        violation_date: summons.violation_date,
        hearing_date: summons.hearing_date,
        hearing_result: summons.hearing_result,
        status: summons.status || '',
        amount_due: summons.amount_due,
        legal_fee: DEFAULT_LEGAL_FEE,
        addedAt: new Date().toISOString(),
      };

      return [...prev, newItem];
    });
  }, []);

  // Remove a summons from the cart
  const removeFromCart = useCallback((summonsId: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== summonsId));
  }, []);

  // Update the legal fee for a specific summons
  const updateLegalFee = useCallback((summonsId: string, newFee: number) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === summonsId ? { ...item, legal_fee: Math.max(0, newFee) } : item
      )
    );
  }, []);

  // Update the amount due for a specific summons
  const updateAmountDue = useCallback((summonsId: string, newAmount: number | null) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === summonsId ? { ...item, amount_due: newAmount !== null ? Math.max(0, newAmount) : null } : item
      )
    );
  }, []);

  // Clear all items from the cart
  const clearCart = useCallback(() => {
    setCartItems([]);
    setRecipientState(DEFAULT_RECIPIENT);
  }, []);

  // Check if a summons is already in the cart
  const isInCart = useCallback(
    (summonsId: string) => {
      return cartItems.some((item) => item.id === summonsId);
    },
    [cartItems]
  );

  // Set the full recipient object
  const setRecipient = useCallback((newRecipient: InvoiceRecipient) => {
    setRecipientState(newRecipient);
  }, []);

  // Update a single recipient field
  const updateRecipientField = useCallback((field: keyof InvoiceRecipient, value: string) => {
    setRecipientState((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  // Get the count of items in the cart
  const getCartCount = useCallback(() => {
    return cartItems.length;
  }, [cartItems]);

  // Calculate total legal fees
  const getTotalLegalFees = useCallback(() => {
    return cartItems.reduce((sum, item) => sum + item.legal_fee, 0);
  }, [cartItems]);

  // Calculate total fines due
  const getTotalFinesDue = useCallback(() => {
    return cartItems.reduce((sum, item) => sum + (item.amount_due || 0), 0);
  }, [cartItems]);

  const value: InvoiceContextType = {
    cartItems,
    recipient,
    addToCart,
    removeFromCart,
    updateLegalFee,
    updateAmountDue,
    clearCart,
    isInCart,
    setRecipient,
    updateRecipientField,
    getCartCount,
    getTotalLegalFees,
    getTotalFinesDue,
  };

  return <InvoiceContext.Provider value={value}>{children}</InvoiceContext.Provider>;
};

export const useInvoice = () => {
  const context = useContext(InvoiceContext);
  if (context === undefined) {
    throw new Error('useInvoice must be used within an InvoiceProvider');
  }
  return context;
};
