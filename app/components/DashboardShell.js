'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Dashboard from '@mui/icons-material/Dashboard';
import UploadFile from '@mui/icons-material/UploadFile';
import CalendarMonth from '@mui/icons-material/CalendarMonth';
import PlayCircleOutlined from '@mui/icons-material/PlayCircleOutlined';
import Assessment from '@mui/icons-material/Assessment';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import Logout from '@mui/icons-material/Logout';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import HelpOutlined from '@mui/icons-material/HelpOutlined';

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: Dashboard, path: '/' },
  { key: 'upload', label: 'Resource Upload', icon: UploadFile, path: '/upload' },
  { key: 'schedule', label: 'Schedule', icon: CalendarMonth, path: '/schedule' },
  { key: 'lecture', label: 'Live Lecture', icon: PlayCircleOutlined, path: '/lecture/get-ready' },
  { key: 'evaluation', label: 'Evaluation', icon: Assessment, path: '/evaluation' },
];

export default function DashboardShell({
  activeNav,
  userName,
  userRole,
  userAvatarUrl,
  pageTitle,
  headerBadge,
  hasNotification,
  children,
}) {
  const router = useRouter();

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Box
        sx={{
          width: 280,
          bgcolor: 'dark.navy',
          height: '100vh',
          color: '#FAF7EF',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontFamily: '"Lora", serif', color: '#FAF7EF' }}>
            Uni-VA
          </Typography>
          <Typography
            variant="overline"
            sx={{ color: '#8A93A8', display: 'block' }}
          >
            ACADEMIC OS
          </Typography>
          <Box sx={{ mt: 4 }}>
            {navItems.map((item) => {
              const isActive = item.key === activeNav;
              const Icon = item.icon;
              return (
                <Box
                  key={item.key}
                  onClick={() => router.push(item.path)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1.5,
                    borderRadius: 1,
                    cursor: 'pointer',
                    bgcolor: isActive ? 'rgba(217,169,78,0.15)' : 'transparent',
                    borderLeft: isActive ? '3px solid' : '3px solid transparent',
                    borderColor: isActive ? 'secondary.main' : 'transparent',
                    color: isActive ? 'secondary.main' : '#AEB8CC',
                    '&:hover': {
                      bgcolor: isActive ? 'rgba(217,169,78,0.15)' : 'rgba(255,255,255,0.05)',
                    },
                  }}
                >
                  <Icon sx={{ fontSize: 20 }} />
                  <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 400 }}>
                    {item.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
        <Box>
          <Divider sx={{ borderColor: '#24334D', mb: 1 }} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.5,
              py: 1.5,
              borderRadius: 1,
              cursor: 'pointer',
              color: '#AEB8CC',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
            }}
          >
            <PersonOutlined sx={{ fontSize: 20 }} />
            <Typography variant="body2">Profile Settings</Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.5,
              py: 1.5,
              borderRadius: 1,
              cursor: 'pointer',
              color: '#AEB8CC',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
            }}
          >
            <Logout sx={{ fontSize: 20 }} />
            <Typography variant="body2">Logout</Typography>
          </Box>
        </Box>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            height: 72,
            bgcolor: 'background.default',
            borderBottom: '1px solid #E4DFD3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 4,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontFamily: '"Lora", serif' }}>
              {pageTitle}
            </Typography>
            {headerBadge && (
              <Chip label={headerBadge} size="small" />
            )}
          </Box>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <IconButton>
              <Badge variant="dot" color="error" invisible={!hasNotification}>
                <NotificationsNone />
              </Badge>
            </IconButton>
            <IconButton>
              <HelpOutlined />
            </IconButton>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Avatar src={userAvatarUrl} sx={{ width: 32, height: 32 }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {userName}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontFamily: '"IBM Plex Mono", monospace',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    lineHeight: 1.2,
                    display: 'block',
                  }}
                >
                  {userRole}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>
        <Box sx={{ flex: 1, p: 4, overflow: 'auto', bgcolor: 'background.default' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
