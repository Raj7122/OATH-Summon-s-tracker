import { describe, it, expect } from 'vitest';
import { parseContactAddress } from '../src/utils/parseContactAddress';

describe('parseContactAddress', () => {
  it('splits a two-line address into street and city/state/zip', () => {
    expect(parseContactAddress('144-47 27 AVENUE\nFLUSING NY 11354')).toEqual({
      address: '144-47 27 AVENUE',
      cityStateZip: 'FLUSING NY 11354',
    });
  });

  it('treats the last line as city/state/zip and joins earlier lines as street', () => {
    expect(parseContactAddress('144-47 27 AVENUE\nSUITE 5\nFLUSHING NY 11354')).toEqual({
      address: '144-47 27 AVENUE\nSUITE 5',
      cityStateZip: 'FLUSHING NY 11354',
    });
  });

  it('falls back to regex on a single-line "STREET CITY ST ZIP"', () => {
    expect(parseContactAddress('144-47 27 AVENUE FLUSHING NY 11354')).toEqual({
      address: '144-47 27 AVENUE',
      cityStateZip: 'FLUSHING NY 11354',
    });
  });

  it('handles a single-line address with comma and ZIP+4', () => {
    expect(parseContactAddress('123 Main St, New York NY 10001-1234')).toEqual({
      address: '123 Main St',
      cityStateZip: 'New York NY 10001-1234',
    });
  });

  it('keeps a single-line street with no city/state/zip in the address field', () => {
    expect(parseContactAddress('144-47 27 AVENUE')).toEqual({
      address: '144-47 27 AVENUE',
      cityStateZip: '',
    });
  });

  it('trims stray blank lines before splitting', () => {
    expect(parseContactAddress('  144-47 27 AVENUE \n\n FLUSHING NY 11354 \n')).toEqual({
      address: '144-47 27 AVENUE',
      cityStateZip: 'FLUSHING NY 11354',
    });
  });

  it('returns empty strings for empty, null, undefined, or whitespace input', () => {
    expect(parseContactAddress('')).toEqual({ address: '', cityStateZip: '' });
    expect(parseContactAddress(null)).toEqual({ address: '', cityStateZip: '' });
    expect(parseContactAddress(undefined)).toEqual({ address: '', cityStateZip: '' });
    expect(parseContactAddress('   ')).toEqual({ address: '', cityStateZip: '' });
  });
});
