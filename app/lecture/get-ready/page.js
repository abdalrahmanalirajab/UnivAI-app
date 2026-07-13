'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';

import SchoolIcon from '@mui/icons-material/School';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

const INITIAL_SECONDS = 178;

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function GetReadyPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(INITIAL_SECONDS);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [countdown]);

  return (
    <Box sx={{ bgcolor: '#0B0F14', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 3 }}>
        <Box
          sx={{
            bgcolor: '#D9A94E',
            borderRadius: 1,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SchoolIcon sx={{ color: '#14213D' }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
            Uni-VA
          </Typography>
          <Typography variant="overline" sx={{ color: '#8B9BB5', display: 'block', lineHeight: 1.2 }}>
            ACADEMIC OPERATING SYSTEM
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, flex: 1 }}>
        <Paper
          sx={{
            bgcolor: '#12192A',
            border: '1px solid #24334D',
            borderRadius: 2,
            p: 5,
            width: 560,
            textAlign: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <Typography variant="overline" sx={{ color: '#D9A94E', display: 'block' }}>
            LIVE LECTURE SESSION
          </Typography>

          <Typography variant="h4" sx={{ fontFamily: '"Lora", serif', color: '#fff', mt: 1 }}>
            Advanced Macroeconomic Systems & Policy Integration
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{ justifyContent: 'center', alignItems: 'center', mt: 2 }}
          >
            <Avatar
              src=""
              sx={{ width: 44, height: 44, bgcolor: '#24334D' }}
            >
              JV
            </Avatar>
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="body1" sx={{ fontWeight: 700, color: '#fff' }}>
                Dr. Julian Vance
              </Typography>
              <Typography variant="body2" sx={{ color: '#8A93A8', fontSize: '0.8rem' }}>
                Chair of Economic Theory
              </Typography>
            </Box>
          </Stack>

          <Box
            sx={{
              mt: 4,
              mx: 'auto',
              width: 180,
              height: 180,
              border: '2px solid #D9A94E',
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="h3"
              sx={{ fontFamily: '"IBM Plex Mono", monospace', color: '#D9A94E' }}
            >
              {formatTime(countdown)}
            </Typography>
            <Typography variant="overline" sx={{ color: '#8B9BB5', mt: 0.5 }}>
              STARTING SOON
            </Typography>
          </Box>

          <Paper
            variant="outlined"
            sx={{
              mt: 4,
              bgcolor: '#0F1B2E',
              border: '1px solid #24334D',
              borderRadius: 1,
              p: 3,
              textAlign: 'left',
            }}
          >
            <Typography variant="overline" sx={{ color: '#8B9BB5', display: 'block', mb: 1 }}>
              SYSTEM VERIFICATION
            </Typography>

            {[
              { label: 'Camera Ready', status: 'CONNECTED' },
              { label: 'Microphone Ready', status: 'CONNECTED' },
              { label: 'Stable Connection', status: 'LATENCY 24MS' },
            ].map((item) => (
              <Box
                key={item.label}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <CheckCircleIcon sx={{ color: '#D9A94E', fontSize: 18 }} />
                  <Typography variant="body2" sx={{ color: '#fff' }}>
                    {item.label}
                  </Typography>
                </Stack>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace', color: '#8B9BB5' }}
                >
                  {item.status}
                </Typography>
              </Box>
            ))}
          </Paper>

          <Button
            variant="contained"
            fullWidth
            startIcon={<OpenInFullIcon />}
            endIcon={<ArrowForwardIcon />}
            onClick={() => router.push('/lecture/live')}
            sx={{
              mt: 4,
              bgcolor: '#D9A94E',
              color: '#14213D',
              height: 56,
              '&:hover': { bgcolor: '#C89A3E' },
            }}
          >
            Enter Fullscreen & Join
          </Button>
        </Paper>
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 3,
          borderTop: '1px solid #24334D',
          width: '100%',
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <LockOutlinedIcon sx={{ fontSize: 14, color: '#8B9BB5' }} />
          <Typography variant="caption" sx={{ color: '#8B9BB5' }}>
            Encrypted Academic Channel
          </Typography>
        </Stack>
        <Stack direction="row" spacing={3}>
          <Typography variant="caption" sx={{ color: '#8B9BB5', cursor: 'pointer' }}>
            Help Desk
          </Typography>
          <Typography variant="caption" sx={{ color: '#8B9BB5', cursor: 'pointer' }}>
            Resources
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
