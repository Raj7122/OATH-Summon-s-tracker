/**
 * @vitest-environment jsdom
 *
 * Comment Deletion Tests — SummonsDetailModal "Internal Notes"
 *
 * Verifies the fix for Jacky's report that she could not delete her older
 * (pre-migration) comments on a summons.
 *
 * Background: the account migration to Arthur's AWS account moved users into a
 * new Cognito pool but did NOT copy the `name` attribute. Comments saved before
 * the migration are stamped with the OLD pool's sub on `comment.userId` and the
 * display name on `comment.by` (e.g. "Jacky"). The delete (X) button is gated
 * by `isOwnComment`, which matches on userId OR a `comment.by === currentUser.name`
 * fallback. The fallback only works when `currentUser.name` actually resolves to
 * the display name — which requires the Cognito `name` attribute to be present.
 *
 * These tests mount the real modal so they exercise the real `isOwnComment`
 * gate and `handleDeleteComment` path:
 *   1. With the name restored, a pre-migration comment shows the delete button.
 *   2. Clicking it calls onUpdate with that comment removed.
 *   3. Another user's comment shows no delete button.
 *   4. Regression guard: when the display name is an unresolved sub UUID (the
 *      broken migration state), the delete button is hidden — pins exactly why
 *      the bug occurred.
 *
 * Run with: npx vitest run tests/commentDeletion.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import type { Summons, NoteComment } from '../src/types/summons';

// MUI's useMediaQuery / date pickers expect window.matchMedia, absent in jsdom.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// AppSync client — the modal loads linked invoices on mount; an empty payload
// is enough (loadLinkedInvoices uses optional chaining).
const mockGraphql = vi.hoisted(() => vi.fn());
vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({ graphql: mockGraphql }),
}));

vi.mock('aws-amplify/storage', () => ({
  getUrl: vi.fn().mockResolvedValue({ url: new URL('https://example.com/file') }),
}));

// Auth — mutated per test to simulate who is signed in.
const authState = vi.hoisted(() => ({
  userInfo: { userId: '', username: '', displayName: '' } as {
    userId: string;
    username: string;
    displayName: string;
  },
}));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../src/contexts/InvoiceContext', () => ({
  useInvoice: () => ({
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    isInCart: () => false,
  }),
}));

// Heavy children irrelevant to comment deletion — stub them out.
vi.mock('../src/components/FileUploadSection', () => ({ default: () => null }));
vi.mock('../src/components/InvoiceDetailModal', () => ({ default: () => null }));

import SummonsDetailModal from '../src/components/SummonsDetailModal';

// ---------------------------------------------------------------------------
// Test data — mirrors the real production shape (see DynamoDB scan in the
// investigation): Jacky's legacy comments carry her OLD-pool sub on userId.
// ---------------------------------------------------------------------------

const JACKY_OLD_SUB = 'b448c438-6081-70cd-61dc-1c109d365e44';
const JACKY_NEW_SUB = '4458d468-9011-70e8-671a-25fe482545a3';
const ARTHUR_OLD_SUB = 'c418e498-8031-70aa-1583-96a9ca6d9ee6';

const jackyComment: NoteComment = {
  id: 'c-jacky',
  text: '02.19.26 SUMMONS UPLOADED W/HEARING NOTES',
  by: 'Jacky',
  userId: JACKY_OLD_SUB,
  date: '2026-02-19T17:20:40.730Z',
};

const arthurComment: NoteComment = {
  id: 'c-arthur',
  text: 'Arthur reviewed this case file',
  by: 'Arthur',
  userId: ARTHUR_OLD_SUB,
  date: '2026-03-01T10:00:00.000Z',
};

const makeSummons = (): Summons => ({
  id: 'summons-1',
  clientID: 'client-1',
  summons_number: '000890179Y',
  respondent_name: 'Test Corp',
  hearing_date: '2026-06-01T00:00:00.000Z',
  status: 'Hearing Scheduled',
  license_plate: 'ABC1234',
  base_fine: 350,
  amount_due: 350,
  violation_date: '2026-01-15T00:00:00.000Z',
  violation_location: '123 Main St, Brooklyn NY',
  summons_pdf_link: 'https://example.com/pdf',
  video_link: 'https://example.com/video',
  added_to_calendar: false,
  evidence_reviewed: false,
  evidence_requested: false,
  evidence_received: false,
  notes_comments: [jackyComment, arthurComment],
});

const renderModal = (onUpdate: ReturnType<typeof vi.fn> = vi.fn()) => {
  render(
    <SummonsDetailModal
      open
      summons={makeSummons()}
      onClose={vi.fn()}
      onUpdate={onUpdate}
    />,
  );
  return onUpdate;
};

// The comment text Typography sits directly inside its comment <Box>; the only
// <button> in that box is the delete (X) IconButton.
const deleteButtonFor = (commentText: string): HTMLElement | null => {
  const box = screen.getByText(commentText).parentElement as HTMLElement;
  return within(box).queryByRole('button');
};

const signInAs = (displayName: string, userId: string) => {
  authState.userInfo = { userId, username: 'support@amlawny.com', displayName };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SummonsDetailModal — pre-migration comment deletion', () => {
  beforeEach(() => {
    mockGraphql.mockReset();
    mockGraphql.mockResolvedValue({ data: {} });
    authState.userInfo = { userId: '', username: '', displayName: '' };
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the delete button on a pre-migration comment once the display name is restored', () => {
    // Jacky signed in: new-pool sub, and name restored to "Jacky".
    signInAs('Jacky', JACKY_NEW_SUB);
    renderModal();

    // userId match fails (old sub != new sub); the by-name fallback rescues it.
    expect(deleteButtonFor(jackyComment.text)).not.toBeNull();
  });

  it('deletes the comment and persists the remaining comments via onUpdate', async () => {
    signInAs('Jacky', JACKY_NEW_SUB);
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderModal(onUpdate);

    const deleteBtn = deleteButtonFor(jackyComment.text);
    expect(deleteBtn).not.toBeNull();
    fireEvent.click(deleteBtn as HTMLElement);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    const [id, field, value] = onUpdate.mock.calls[0];
    expect(id).toBe('summons-1');
    expect(field).toBe('notes_comments');

    // AWSJSON field is persisted as a JSON string; Jacky's comment is gone,
    // Arthur's remains untouched.
    const remaining = JSON.parse(value as string) as NoteComment[];
    expect(remaining.map((c) => c.id)).toEqual(['c-arthur']);

    // The deleted comment is removed from the rendered list.
    expect(screen.queryByText(jackyComment.text)).toBeNull();
  });

  it('does not show a delete button on another user\'s comment', () => {
    // Jacky is signed in; Arthur's comment is not hers to delete.
    signInAs('Jacky', JACKY_NEW_SUB);
    renderModal();

    expect(deleteButtonFor(arthurComment.text)).toBeNull();
  });

  it('regression: hides the delete button when the display name is an unresolved sub UUID', () => {
    // The broken post-migration state — Cognito `name` attribute missing, so
    // displayName degraded to the raw sub UUID. Neither isOwnComment branch
    // matches, so Jacky cannot delete her own legacy comment. This is the bug.
    signInAs(JACKY_NEW_SUB, JACKY_NEW_SUB);
    renderModal();

    expect(deleteButtonFor(jackyComment.text)).toBeNull();
  });
});
