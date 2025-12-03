import { AppBar, Toolbar, Typography, Button, Box, IconButton, Menu, MenuItem } from '@mui/material';
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
    <AppBar position="sticky">
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{ flexGrow: 0, mr: 4, cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
        >
          NYC OATH Tracker
        </Typography>

        {/* Desktop Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, gap: 2 }}>
          <Button
            color="inherit"
            onClick={() => handleNavigate('/dashboard')}
            sx={{
              fontWeight: isActive('/dashboard') ? 'bold' : 'normal',
              textDecoration: isActive('/dashboard') ? 'underline' : 'none',
            }}
          >
            Dashboard
          </Button>
          <Button
            color="inherit"
            onClick={() => handleNavigate('/clients')}
            sx={{
              fontWeight: isActive('/clients') ? 'bold' : 'normal',
              textDecoration: isActive('/clients') ? 'underline' : 'none',
            }}
          >
            Clients
          </Button>
          <Button
            color="inherit"
            onClick={() => handleNavigate('/client-center')}
            sx={{
              fontWeight: location.pathname.startsWith('/client-center') ? 'bold' : 'normal',
              textDecoration: location.pathname.startsWith('/client-center') ? 'underline' : 'none',
            }}
          >
            Client Center
          </Button>
        </Box>

        {/* Mobile Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }}>
          <IconButton
            size="large"
            color="inherit"
            onClick={handleMobileMenu}
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
            <MenuItem onClick={() => handleNavigate('/client-center')}>Client Center</MenuItem>
          </Menu>
        </Box>

        {/* Account Menu */}
        <Box>
          <IconButton
            size="large"
            color="inherit"
            onClick={handleAccountMenu}
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
