import { AppBar, Toolbar, Typography, Button, Box, IconButton, Menu, MenuItem, alpha } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<null | HTMLElement>(null);

  const handleAccountMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMobileMenu = (event: React.MouseEvent<HTMLElement>) => {
    setMobileMenuAnchor(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setMobileMenuAnchor(null);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
    handleClose();
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    handleClose();
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: alpha('#FFFFFF', 0.8),
        backdropFilter: 'blur(6px)',
        borderBottom: (theme) => `1px solid ${alpha(theme.palette.grey[500], 0.12)}`,
        color: 'text.primary',
      }}
    >
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{
            flexGrow: 0,
            mr: 4,
            cursor: 'pointer',
            fontWeight: 700,
            color: 'primary.main',
          }}
          onClick={() => navigate('/dashboard')}
        >
          NYC OATH Tracker
        </Typography>

        {/* Desktop Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, gap: 1 }}>
          <Button
            onClick={() => handleNavigate('/dashboard')}
            sx={{
              fontWeight: 600,
              color: isActive('/dashboard') ? 'primary.main' : 'text.secondary',
              backgroundColor: isActive('/dashboard')
                ? (theme) => alpha(theme.palette.primary.main, 0.08)
                : 'transparent',
              borderRadius: 2,
              px: 2,
              '&:hover': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
              },
            }}
          >
            Dashboard
          </Button>
          <Button
            onClick={() => handleNavigate('/clients')}
            sx={{
              fontWeight: 600,
              color: location.pathname.startsWith('/clients') ? 'primary.main' : 'text.secondary',
              backgroundColor: location.pathname.startsWith('/clients')
                ? (theme) => alpha(theme.palette.primary.main, 0.08)
                : 'transparent',
              borderRadius: 2,
              px: 2,
              '&:hover': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
              },
            }}
          >
            Clients
          </Button>
        </Box>

        {/* Mobile Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }}>
          <IconButton
            size="large"
            onClick={handleMobileMenu}
            sx={{ color: 'text.secondary' }}
          >
            <MenuIcon />
          </IconButton>
          <Menu
            anchorEl={mobileMenuAnchor}
            open={Boolean(mobileMenuAnchor)}
            onClose={handleClose}
          >
            <MenuItem onClick={() => handleNavigate('/dashboard')}>Dashboard</MenuItem>
            <MenuItem onClick={() => handleNavigate('/clients')}>Clients</MenuItem>
          </Menu>
        </Box>

        {/* Account Menu */}
        <Box>
          <IconButton
            size="large"
            onClick={handleAccountMenu}
            sx={{
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <AccountCircleIcon />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                {user?.username || 'User'}
              </Typography>
            </MenuItem>
            <MenuItem onClick={() => handleNavigate('/account')}>Account Settings</MenuItem>
            <MenuItem onClick={handleSignOut}>Sign Out</MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
