import { AppBar, Toolbar, Typography, Button, Box, IconButton, Menu, MenuItem, Chip, Badge } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import UpdateIcon from '@mui/icons-material/Update';

/**
 * Header Props for receiving update counts from parent
 */
interface HeaderProps {
  /** Number of recently updated records (for the pulsing badge) */
  updatedCount?: number;
  /** Callback when Updated chip is clicked */
  onUpdatedClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ updatedCount = 0, onUpdatedClick }) => {
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
        // Blue gradient from primary.main to primary.dark - Arthur's mental model
        background: (theme) =>
          `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        // Subtle white border at bottom for separation
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#FFFFFF',
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
            color: '#FFFFFF',
            letterSpacing: '-0.01em',
          }}
          onClick={() => navigate('/dashboard')}
        >
          NYC OATH Tracker
        </Typography>

        {/* Desktop Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, gap: 1, alignItems: 'center' }}>
          <Button
            onClick={() => handleNavigate('/dashboard')}
            sx={{
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: isActive('/dashboard')
                ? 'rgba(255, 255, 255, 0.15)'
                : 'transparent',
              borderRadius: 2,
              px: 2,
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
                ? 'rgba(255, 255, 255, 0.15)'
                : 'transparent',
              borderRadius: 2,
              px: 2,
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
              },
            }}
          >
            Clients
          </Button>

          {/* High-visibility Updated chip - Pulsing amber badge in header */}
          {updatedCount > 0 && (
            <Chip
              icon={<UpdateIcon sx={{ color: '#FFFFFF !important', fontSize: 16 }} />}
              label={`${updatedCount} Updated`}
              onClick={onUpdatedClick}
              sx={{
                ml: 2,
                fontWeight: 700,
                fontSize: '0.8rem',
                height: 32,
                backgroundColor: (theme) => theme.palette.warning.main,
                color: '#FFFFFF',
                cursor: 'pointer',
                animation: 'pulse-glow 2s ease-in-out infinite',
                '@keyframes pulse-glow': {
                  '0%': {
                    boxShadow: '0 0 0 0 rgba(255, 152, 0, 0.7)',
                  },
                  '50%': {
                    boxShadow: '0 0 12px 4px rgba(255, 152, 0, 0.4)',
                  },
                  '100%': {
                    boxShadow: '0 0 0 0 rgba(255, 152, 0, 0.7)',
                  },
                },
                '&:hover': {
                  backgroundColor: (theme) => theme.palette.warning.dark,
                  transform: 'scale(1.05)',
                },
                transition: 'transform 0.2s ease',
                '& .MuiChip-icon': {
                  color: '#FFFFFF',
                },
              }}
            />
          )}
        </Box>

        {/* Mobile Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' }, alignItems: 'center' }}>
          <IconButton
            size="large"
            onClick={handleMobileMenu}
            sx={{ color: '#FFFFFF' }}
          >
            <MenuIcon />
          </IconButton>
          {/* Mobile Updated badge */}
          {updatedCount > 0 && (
            <Badge
              badgeContent={updatedCount}
              color="warning"
              sx={{
                ml: 1,
                '& .MuiBadge-badge': {
                  animation: 'pulse-glow 2s ease-in-out infinite',
                },
              }}
            >
              <UpdateIcon sx={{ color: '#FFFFFF' }} />
            </Badge>
          )}
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
