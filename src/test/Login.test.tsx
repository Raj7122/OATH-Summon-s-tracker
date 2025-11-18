/**
 * Unit Tests for Login Component
 *
 * Tests that the Login page renders correctly with:
 * - Email and password input fields
 * - Submit button
 * - Page title and branding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../pages/Login';

// Mock useNavigate from react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock AuthContext
const mockSignIn = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    isAuthenticated: false,
  }),
}));

describe('Login Component', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    render(<Login />);

    // Page should have the main title
    expect(screen.getByText('NYC OATH Tracker')).toBeInTheDocument();
  });

  it('should display email input field', () => {
    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toBeRequired();
  });

  it('should display password input field', () => {
    render(<Login />);

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toBeRequired();
  });

  it('should display submit button', () => {
    render(<Login />);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  it('should display firm branding', () => {
    render(<Login />);

    expect(screen.getByText('NYC OATH Tracker')).toBeInTheDocument();
    expect(screen.getByText('Law Office of Arthur L. Miller')).toBeInTheDocument();
  });

  it('should display forgot password message', () => {
    render(<Login />);

    expect(screen.getByText(/forgot password\? contact your administrator/i)).toBeInTheDocument();
  });

  it('should allow user to type in email field', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'test@example.com');

    expect(emailInput).toHaveValue('test@example.com');
  });

  it('should allow user to type in password field', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'password123');

    expect(passwordInput).toHaveValue('password123');
  });

  it('should call signIn when form is submitted', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({});

    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Fill in the form
    await user.type(emailInput, 'arthur@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // signIn should have been called with email and password
    expect(mockSignIn).toHaveBeenCalledWith('arthur@example.com', 'password123');
  });

  it('should disable submit button while loading', async () => {
    const user = userEvent.setup();
    // Make signIn take time to resolve
    mockSignIn.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Submit the form
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Button should be disabled during loading
    expect(submitButton).toBeDisabled();
  });

  it('should display loading spinner when submitting', async () => {
    const user = userEvent.setup();
    mockSignIn.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Submit the form
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Loading spinner should appear
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should display error message on failed login', async () => {
    const user = userEvent.setup();
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));

    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Submit with incorrect credentials
    await user.type(emailInput, 'wrong@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    // Error message should be displayed
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it('should clear error message when form is resubmitted', async () => {
    const user = userEvent.setup();
    mockSignIn.mockRejectedValueOnce(new Error('Invalid credentials')).mockResolvedValueOnce({});

    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // First submission fails
    await user.type(emailInput, 'wrong@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    // Error message appears
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();

    // Clear fields and resubmit
    await user.clear(emailInput);
    await user.clear(passwordInput);
    await user.type(emailInput, 'correct@example.com');
    await user.type(passwordInput, 'correctpassword');
    await user.click(submitButton);

    // Error message should be cleared
    expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
  });

  it('should navigate to dashboard on successful login', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({});

    render(<Login />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Submit the form
    await user.type(emailInput, 'arthur@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Should navigate to dashboard
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
