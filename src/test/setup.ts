/**
 * Vitest Setup File
 *
 * Configures the testing environment with necessary global matchers and utilities.
 * This file is automatically loaded before all test files run.
 */

import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test case (e.g., clearing jsdom)
afterEach(() => {
  cleanup();
});
