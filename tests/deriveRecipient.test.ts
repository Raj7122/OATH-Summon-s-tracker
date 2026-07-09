import { describe, it, expect } from 'vitest';
import { deriveRecipient } from '../src/utils/deriveRecipient';

describe('deriveRecipient', () => {
  it('returns an empty recipient when there is no client and no fallback', () => {
    // Root-cause guarantee: with nothing to show, the recipient is blank — never
    // the previous client's data.
    expect(deriveRecipient(null)).toEqual({
      companyName: '',
      attention: '',
      address: '',
      cityStateZip: '',
      email: '',
    });
    expect(deriveRecipient(undefined)).toEqual(deriveRecipient(null));
  });

  it('falls back to the summons company name when the client record is unresolved', () => {
    // Symptom 2 (blank after logout/login): the client fetch hasn't resolved, so
    // use the respondent_name the cart item carries instead of showing nothing.
    const recipient = deriveRecipient(null, 'GEORGE HILDEBRANDT TRUCKING');
    expect(recipient.companyName).toBe('GEORGE HILDEBRANDT TRUCKING');
    expect(recipient.address).toBe('');
    expect(recipient.cityStateZip).toBe('');
    expect(recipient.attention).toBe('');
    expect(recipient.email).toBe('');
  });

  it('maps a resolved client into the full recipient block', () => {
    const recipient = deriveRecipient({
      name: 'JLSHM',
      contact_name: 'Jane Doe',
      contact_address: '144-47 27 AVENUE\nFLUSHING NY 11354',
      contact_email1: 'jane@jlshm.com',
    });
    expect(recipient).toEqual({
      companyName: 'JLSHM',
      attention: 'Jane Doe',
      address: '144-47 27 AVENUE',
      cityStateZip: 'FLUSHING NY 11354',
      email: 'jane@jlshm.com',
    });
  });

  it('prefers the resolved client name over the fallback', () => {
    const recipient = deriveRecipient({ name: 'George Hildebrandt Inc.' }, 'GEORGE HILDEBRANDT TRUCKING');
    expect(recipient.companyName).toBe('George Hildebrandt Inc.');
  });

  it('uses the fallback when the resolved client has an empty name', () => {
    const recipient = deriveRecipient(
      { name: '', contact_name: 'Jane Doe' },
      'GEORGE HILDEBRANDT TRUCKING',
    );
    expect(recipient.companyName).toBe('GEORGE HILDEBRANDT TRUCKING');
    expect(recipient.attention).toBe('Jane Doe');
  });

  it('leaves optional fields empty when the client omits them', () => {
    const recipient = deriveRecipient({ name: 'Acme Co' });
    expect(recipient).toEqual({
      companyName: 'Acme Co',
      attention: '',
      address: '',
      cityStateZip: '',
      email: '',
    });
  });
});
