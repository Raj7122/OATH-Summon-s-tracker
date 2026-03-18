import { AppBar, Toolbar, Typography, Button, Box, IconButton, Menu, MenuItem, Divider, Badge } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useInvoice } from '../contexts/InvoiceContext';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import GavelIcon from '@mui/icons-material/Gavel';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SyncStatusBadge from './SyncStatusBadge';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { getCartCount } = useInvoice();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<null | HTMLElement>(null);

  const cartCount = getCartCount();

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
        // Professional neutral dark header
        background: '#1C2536',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
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
          <Button
            onClick={() => handleNavigate('/invoice-builder')}
            sx={{
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: isActive('/invoice-builder')
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
            startIcon={
              <Badge
                badgeContent={cartCount}
                color="error"
                sx={{
                  '& .MuiBadge-badge': {
                    right: -3,
                    top: 3,
                    fontSize: '0.7rem',
                    minWidth: 18,
                    height: 18,
                  },
                }}
              >
                <ShoppingCartIcon sx={{ fontSize: 20 }} />
              </Badge>
            }
          >
            Invoice
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
            <MenuItem onClick={() => handleNavigate('/invoice-builder')}>
              <Badge
                badgeContent={cartCount}
                color="error"
                sx={{ mr: 1 }}
              >
                <ShoppingCartIcon sx={{ fontSize: 20 }} />
              </Badge>
              Invoice {cartCount > 0 && `(${cartCount})`}
            </MenuItem>
          </Menu>
        </Box>

        {/* Sync Status Badge - Shows when last daily sweep ran */}
        <SyncStatusBadge />

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
