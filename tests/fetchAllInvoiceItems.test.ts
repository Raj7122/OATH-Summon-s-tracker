/**
 * @vitest-environment jsdom
 *
 * Tests for fetchAllInvoiceItems — the paginated read of an invoice's
 * InvoiceSummons join rows.
 *
 * This helper exists because the `Invoice.items` hasMany connection cannot be
 * trusted: its generated resolver hardcodes
 * `defaultIfNull($ctx.args.limit, 100)`, so any invoice with more than 100 line
 * items came back silently truncated. That produced two real failures in
 * production — a 214-item invoice that opened for editing with 100 items, and a
 * ~266-item invoice whose deletion stranded 166 orphaned join rows.
 *
 * The contract under test: return EVERY row, or throw. Never a partial list,
 * because callers cannot tell a short list from a genuinely small invoice.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAllInvoiceItems } from '../src/utils/fetchAllInvoiceItems';

// The shape the helper passes to client.graphql, and a minimal client to match.
type GqlArg = { query: string; variables: { invoiceID: string; limit: number; nextToken: string | null } };
type FakeClient = { graphql: (arg: GqlArg) => Promise<unknown> };

// Build a fake client that serves the given pages in order, mimicking how
// DynamoDB hands back a nextToken when a Query page is full.
const makeClient = (pages: Array<Array<{ id: string }>>) => {
  const seenTokens: Array<string | null> = [];
  const graphql = vi.fn(async ({ variables }: GqlArg) => {
    seenTokens.push(variables.nextToken ?? null);
    const idx = variables.nextToken ? Number(variables.nextToken) : 0;
    return {
      data: {
        invoiceSummonsByInvoiceIDAndSummonsID: {
          items: pages[idx] ?? [],
          nextToken: idx + 1 < pages.length ? String(idx + 1) : null,
        },
      },
    };
  });
  return { client: { graphql }, graphql, seenTokens };
};

const rows = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => ({ id: `join-${from + i}` }));

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('fetchAllInvoiceItems', () => {
  it('returns a single page without asking for a second', async () => {
    const { client, graphql } = makeClient([rows(0, 12)]);

    const result = await fetchAllInvoiceItems(client as FakeClient, 'inv-1');

    expect(result).toHaveLength(12);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('follows nextToken across pages and preserves order (the 214-item invoice)', async () => {
    // The real CORPORATE EXPRESS invoice: 214 rows, which DynamoDB would hand
    // back as 100 / 100 / 14.
    const { client, graphql, seenTokens } = makeClient([
      rows(0, 100),
      rows(100, 200),
      rows(200, 214),
    ]);

    const result = await fetchAllInvoiceItems(client as FakeClient, 'inv-corp');

    expect(result).toHaveLength(214);
    // Nothing dropped, nothing duplicated across the page boundaries.
    expect(new Set(result.map((r) => r.id)).size).toBe(214);
    expect(result[0].id).toBe('join-0');
    expect(result[213].id).toBe('join-213');
    expect(graphql).toHaveBeenCalledTimes(3);
    // First request carries no token; later ones carry the previous page's.
    expect(seenTokens).toEqual([null, '1', '2']);
  });

  it('passes the invoice id and a page size on every request', async () => {
    const { client, graphql } = makeClient([rows(0, 5)]);

    await fetchAllInvoiceItems(client as FakeClient, 'inv-42');

    const { variables } = graphql.mock.calls[0][0];
    expect(variables.invoiceID).toBe('inv-42');
    expect(variables.limit).toBeGreaterThan(0);
  });

  it('returns an empty array for an invoice with no rows', async () => {
    const { client } = makeClient([[]]);

    await expect(fetchAllInvoiceItems(client as FakeClient, 'inv-empty')).resolves.toEqual([]);
  });

  it('throws and logs rather than returning a partial list when a page fails', async () => {
    // Page 1 succeeds, page 2 blows up: returning the first 100 rows here is the
    // exact failure mode that would silently bill half a client's violations.
    const graphql = vi.fn(async ({ variables }: GqlArg) => {
      if (variables.nextToken) throw new Error('AppSync timeout');
      return {
        data: {
          invoiceSummonsByInvoiceIDAndSummonsID: { items: rows(0, 100), nextToken: '1' },
        },
      };
    });

    await expect(fetchAllInvoiceItems({ graphql } as FakeClient, 'inv-1')).rejects.toThrow(
      'AppSync timeout',
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it('throws on an unexpected response shape instead of reporting zero rows', async () => {
    const graphql = vi.fn(async () => ({ data: {} }));

    await expect(fetchAllInvoiceItems({ graphql } as FakeClient, 'inv-1')).rejects.toThrow(
      /inv-1/,
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it('throws when the pagination guard trips instead of silently truncating', async () => {
    // A nextToken that never clears — a malformed token or a resolver bug. The
    // helper must give up loudly rather than hand back whatever it collected.
    const graphql = vi.fn(async () => ({
      data: {
        invoiceSummonsByInvoiceIDAndSummonsID: { items: rows(0, 10), nextToken: 'always-more' },
      },
    }));

    await expect(fetchAllInvoiceItems({ graphql } as FakeClient, 'inv-runaway')).rejects.toThrow(
      /pagination guard/i,
    );
    // Bounded, not infinite.
    expect(graphql.mock.calls.length).toBeLessThanOrEqual(50);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('refusing to return a partial list'),
    );
  });
});
