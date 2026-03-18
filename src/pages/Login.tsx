import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

type ViewMode = 'login' | 'forgotPassword' | 'resetPassword' | 'newPassword';

const Login = () => {
  const navigate = useNavigate();
  const { signIn, completeNewPassword, forgotPassword, forgotPasswordSubmit, isAuthenticated, requiresPasswordChange } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('login');

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/dashboard');
  }

  // Handle new password requirement from Cognito
  const currentView: ViewMode = requiresPasswordChange ? 'newPassword' : viewMode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      if (!requiresPasswordChange) {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      console.error('Login error:', err);
      setError(
        err instanceof Error && err.message !== 'NEW_PASSWORD_REQUIRED'
          ? err.message
          : 'Failed to sign in. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      await completeNewPassword(newPassword);
      navigate('/dashboard');
    } catch (err: unknown) {
      console.error('Password change error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to change password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(email);
      setSuccess('Verification code sent to your email');
      setViewMode('resetPassword');
    } catch (err: unknown) {
      console.error('Forgot password error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to send verification code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      await forgotPasswordSubmit(email, verificationCode, newPassword);
      setSuccess('Password reset successfully! You can now sign in.');
      setViewMode('login');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setVerificationCode('');
    } catch (err: unknown) {
      console.error('Reset password error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to reset password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setViewMode('login');
    setError('');
    setSuccess('');
    setNewPassword('');
    setConfirmPassword('');
    setVerificationCode('');
  };

  const renderLoginForm = () => (
    <form onSubmit={handleSubmit}>
      <TextField
        fullWidth
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        margin="normal"
        autoComplete="email"
        autoFocus
      />
      <TextField
        fullWidth
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        margin="normal"
        autoComplete="current-password"
      />
      <Button
        fullWidth
        type="submit"
        variant="contained"
        size="large"
        disabled={loading}
        sx={{ mt: 3, mb: 2 }}
      >
        {loading ? <CircularProgress size={24} /> : 'Sign In'}
      </Button>
      <Typography variant="body2" color="text.secondary" align="center">
        <Link
          component="button"
          type="button"
          variant="body2"
          onClick={() => {
            setViewMode('forgotPassword');
            setError('');
            setSuccess('');
          }}
          sx={{ cursor: 'pointer' }}
        >
          Forgot password?
        </Link>
      </Typography>
    </form>
  );

  const renderForgotPasswordForm = () => (
    <form onSubmit={handleForgotPassword}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter your email address and we'll send you a verification code to reset your password.
      </Typography>
      <TextField
        fullWidth
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        margin="normal"
        autoComplete="email"
        autoFocus
      />
      <Button
        fullWidth
        type="submit"
        variant="contained"
        size="large"
        disabled={loading}
        sx={{ mt: 3, mb: 2 }}
      >
        {loading ? <CircularProgress size={24} /> : 'Send Verification Code'}
      </Button>
      <Typography variant="body2" color="text.secondary" align="center">
        <Link
          component="button"
          type="button"
          variant="body2"
          onClick={handleBackToLogin}
          sx={{ cursor: 'pointer' }}
        >
          Back to Sign In
        </Link>
      </Typography>
    </form>
  );

  const renderResetPasswordForm = () => (
    <form onSubmit={handleResetPassword}>
      <Alert severity="info" sx={{ mb: 2 }}>
        A verification code was sent to {email}
      </Alert>
      <TextField
        fullWidth
        label="Verification Code"
        value={verificationCode}
        onChange={(e) => setVerificationCode(e.target.value)}
        required
        margin="normal"
        autoFocus
      />
      <TextField
        fullWidth
        label="New Password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        margin="normal"
        helperText="Must be at least 8 characters"
      />
      <TextField
        fullWidth
        label="Confirm New Password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        margin="normal"
      />
      <Button
        fullWidth
        type="submit"
        variant="contained"
        size="large"
        disabled={loading}
        sx={{ mt: 3, mb: 2 }}
      >
        {loading ? <CircularProgress size={24} /> : 'Reset Password'}
      </Button>
      <Typography variant="body2" color="text.secondary" align="center">
        <Link
          component="button"
          type="button"
          variant="body2"
          onClick={handleBackToLogin}
          sx={{ cursor: 'pointer' }}
        >
          Back to Sign In
        </Link>
      </Typography>
    </form>
  );

  const renderNewPasswordForm = () => (
    <form onSubmit={handlePasswordChange}>
      <Alert severity="info" sx={{ mb: 2 }}>
        Please set a new password to continue
      </Alert>
      <TextField
        fullWidth
        label="New Password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        margin="normal"
        autoFocus
        helperText="Must be at least 8 characters"
      />
      <TextField
        fullWidth
        label="Confirm New Password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        margin="normal"
      />
      <Button
        fullWidth
        type="submit"
        variant="contained"
        size="large"
        disabled={loading}
        sx={{ mt: 3, mb: 2 }}
      >
        {loading ? <CircularProgress size={24} /> : 'Set New Password'}
      </Button>
    </form>
  );

  const getTitle = () => {
    switch (currentView) {
      case 'forgotPassword':
        return 'Reset Password';
      case 'resetPassword':
        return 'Enter Verification Code';
      case 'newPassword':
        return 'Set New Password';
      default:
        return 'NYC OATH Tracker';
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            {getTitle()}
          </Typography>
          {currentView === 'login' && (
            <Typography
              variant="body2"
              color="text.secondary"
              gutterBottom
              align="center"
              sx={{ mb: 3 }}
            >
              Law Office of Arthur L. Miller
            </Typography>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          {currentView === 'login' && renderLoginForm()}
          {currentView === 'forgotPassword' && renderForgotPasswordForm()}
          {currentView === 'resetPassword' && renderResetPasswordForm()}
          {currentView === 'newPassword' && renderNewPasswordForm()}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
