import { Box, Card, CardContent, Typography, Button, Divider } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Account = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Account Settings
      </Typography>

      <Card sx={{ maxWidth: 600, mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            User Information
          </Typography>
          <Divider sx={{ my: 2 }} />

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Username
            </Typography>
            <Typography variant="body1">{user?.username || 'N/A'}</Typography>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              User ID
            </Typography>
            <Typography variant="body1">{user?.userId || 'N/A'}</Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Button variant="outlined" color="error" onClick={handleSignOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 600, mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            About
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            NYC OATH Summons Tracker
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Law Office of Arthur L. Miller
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Version 1.0.0
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Account;
