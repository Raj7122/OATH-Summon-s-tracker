import { AppBar, Toolbar, Typography, Button, Box, IconButton, Menu, MenuItem, Divider } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import GavelIcon from '@mui/icons-material/Gavel';

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
        // Royal Blue gradient header with shadow
        background: (theme) =>
          `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        color: '#FFFFFF',
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        {/* Brand Logo & Title */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            cursor: 'pointer',
            mr: 3,
            py: 0.5,
            px: 1.5,
            borderRadius: 2,
            transition: 'background-color 0.2s',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
          }}
          onClick={() => navigate('/dashboard')}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            <GavelIcon sx={{ fontSize: 22, color: '#FFFFFF' }} />
          </Box>
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.01em',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            NYC OATH Tracker
          </Typography>
        </Box>

        {/* Divider */}
        <Divider
          orientation="vertical"
          flexItem
          sx={{
            borderColor: 'rgba(255, 255, 255, 0.2)',
            display: { xs: 'none', md: 'block' },
            mx: 1,
          }}
        />

        {/* Desktop Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, gap: 1.5, ml: 1 }}>
          <Button
            onClick={() => handleNavigate('/dashboard')}
            sx={{
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: isActive('/dashboard')
                ? 'rgba(255, 255, 255, 0.18)'
                : 'transparent',
              borderRadius: 2,
              px: 2.5,
              py: 1,
              textTransform: 'none',
              fontSize: '0.95rem',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
              },
            }}
          >
            Dashboard
          </Button>
          <Button
            onClick={() => handleNavigate('/clients')}
            sx={{
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: location.pathname.startsWith('/clients')
                ? 'rgba(255, 255, 255, 0.18)'
                : 'transparent',
              borderRadius: 2,
              px: 2.5,
              py: 1,
              textTransform: 'none',
              fontSize: '0.95rem',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
            sx={{ color: '#FFFFFF' }}
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
              color: '#FFFFFF',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
