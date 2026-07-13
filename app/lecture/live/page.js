'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';

import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import CloseIcon from '@mui/icons-material/Close';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';
import ClosedCaptionIcon from '@mui/icons-material/ClosedCaption';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import { LineChart } from '@mui/x-charts/LineChart';

const initialMessages = [
  {
    user: 'Sarah J.',
    time: '10:41 AM',
    text: 'Could you re-explain how inflation expectations shift the short-run curve?',
  },
  {
    user: 'Mark Volkov',
    time: '10:42 AM',
    text: 'The adaptive expectations model is key here.',
  },
  {
    system: true,
    text: 'Professor Henderson attached "Lecture_Notes_Week4.pdf"',
  },
  {
    user: 'Dr. Chen (TA)',
    time: '10:44 AM',
    text: '@Sarah, think of πᵉ as a vertical shifter. When expectations rise, the whole curve moves up.',
    highlighted: true,
  },
];

export default function LiveLecturePage() {
  const [timer] = useState('01:42:15');
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(70);
  const [knowledgeCheckOpen, setKnowledgeCheckOpen] = useState(true);
  const [knowledgeCheckAnswer, setKnowledgeCheckAnswer] = useState('');
  const [messages] = useState(initialMessages);

  return (
    <Box sx={{ bgcolor: '#000', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          borderBottom: '1px solid #24334D',
          bgcolor: '#0B0F14',
          flexShrink: 0,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          UnivAI{' '}
          <Typography component="span" sx={{ fontWeight: 400, color: '#8B9BB5', fontSize: '0.85rem' }}>
            | Macroeconomics 402: Global Fiscal Policy
          </Typography>
        </Typography>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Chip
            icon={<FiberManualRecordIcon sx={{ fontSize: 12 }} />}
            label="LIVE"
            color="error"
            size="small"
            sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
          />
          <Typography
            variant="body2"
            sx={{ fontFamily: '"IBM Plex Mono", monospace', color: '#8B9BB5', ml: 0.5 }}
          >
            {timer}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <IconButton size="small" sx={{ color: '#8B9BB5' }}>
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
          <Button
            variant="outlined"
            size="small"
            startIcon={<CloseFullscreenIcon />}
            sx={{
              color: '#8B9BB5',
              borderColor: '#24334D',
              textTransform: 'none',
              fontFamily: '"Inter", sans-serif',
            }}
          >
            Exit Fullscreen
          </Button>
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            bgcolor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            overflow: 'hidden',
          }}
        >
          <Paper
            sx={{
              bgcolor: '#FAF7EF',
              color: '#14213D',
              width: '70%',
              aspectRatio: '16 / 10',
              p: 4,
              borderRadius: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <Typography variant="h5" sx={{ fontFamily: '"Lora", serif' }}>
              ...ynamics
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', lineHeight: 1.7 }}>
              The relationship between unemployment and inflation remains a cornerstone of modern
              macroeconomic policy analysis. When actual unemployment (u) falls below the natural
              rate (uₙ), inflationary pressure builds as workers demand higher wages.
            </Typography>

            <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Paper
                variant="outlined"
                sx={{ p: 2, bgcolor: '#F3EFE4', minWidth: 200 }}
              >
                <Typography
                  variant="overline"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace', color: '#6B7280', display: 'block', mb: 1 }}
                >
                  KEY METRIC
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: '1rem' }}
                >
                  u &lt; uₙ → π &gt; πᵉ
                </Typography>
              </Paper>

              <Paper variant="outlined" sx={{ flex: 1, height: 260, position: 'relative', bgcolor: '#F3EFE4', overflow: 'hidden' }}>
                <LineChart
                  xAxis={[
                    {
                      data: [2, 3, 4, 5, 6, 7, 8],
                      label: 'Unemployment',
                      tickLabelStyle: { fontSize: 11, fill: '#6B7280' },
                      labelStyle: { fontSize: 12, fill: '#14213D', fontWeight: 600 },
                    },
                  ]}
                  yAxis={[
                    {
                      label: 'Inflation (π)',
                      tickLabelStyle: { fontSize: 11, fill: '#6B7280' },
                      labelStyle: { fontSize: 12, fill: '#14213D', fontWeight: 600 },
                    },
                  ]}
                  series={[
                    {
                      data: [7, 5.5, 4, 3, 2.5, 2.2, 2],
                      color: '#14213D',
                      showMark: true,
                      curve: 'natural',
                    },
                  ]}
                  width={350}
                  height={260}
                  sx={{ '&&': { bgcolor: '#F3EFE4' } }}
                  slotProps={{ legend: { hidden: true } }}
                  margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                />
                <Chip
                  label="FIGURE 4.2"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    fontFamily: '"IBM Plex Mono", monospace',
                  }}
                />
              </Paper>
            </Stack>
          </Paper>

          {knowledgeCheckOpen && (
            <Paper
              elevation={8}
              sx={{
                position: 'absolute',
                top: 24,
                left: 24,
                zIndex: 20,
                bgcolor: 'rgba(20,25,35,0.92)',
                color: '#fff',
                borderRadius: 2,
                p: 3,
                width: 380,
                backdropFilter: 'blur(8px)',
              }}
            >
              <IconButton
                size="small"
                onClick={() => setKnowledgeCheckOpen(false)}
                sx={{ position: 'absolute', top: 8, right: 8, color: '#8B9BB5' }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
                <QuizOutlinedIcon sx={{ color: '#D9A94E' }} />
                <Typography variant="h6" sx={{ fontFamily: '"Lora", serif', fontWeight: 600 }}>
                  Knowledge Check
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: '#B0BECD', mb: 2 }}>
                Which variable represents the natural rate of unemployment in the provided formula?
              </Typography>
              <RadioGroup
                value={knowledgeCheckAnswer}
                onChange={(e) => setKnowledgeCheckAnswer(e.target.value)}
              >
                {[
                  { value: 'pi', label: 'π (Pi)' },
                  { value: 'un', label: 'uₙ (U-sub-n)' },
                  { value: 'pie', label: 'πᵉ (Expected Pi)' },
                ].map((opt) => (
                  <Paper
                    key={opt.value}
                    variant="outlined"
                    sx={{
                      p: 1,
                      mb: 1,
                      bgcolor: 'transparent',
                      borderColor: knowledgeCheckAnswer === opt.value ? '#D9A94E' : '#24334D',
                      borderRadius: 1,
                      '&:hover': { borderColor: '#D9A94E' },
                    }}
                  >
                    <FormControlLabel
                      value={opt.value}
                      control={<Radio sx={{ color: '#8B9BB5', '&.Mui-checked': { color: '#D9A94E' } }} />}
                      label={opt.label}
                      sx={{ color: '#fff', width: '100%', mx: 0 }}
                    />
                  </Paper>
                ))}
              </RadioGroup>
              <Button
                variant="contained"
                color="secondary"
                fullWidth
                sx={{ mt: 1, textTransform: 'uppercase' }}
              >
                Submit Answer
              </Button>
            </Paper>
          )}

          <Paper
            sx={{
              position: 'absolute',
              bottom: 80,
              left: 16,
              zIndex: 10,
              width: 220,
              borderRadius: 1,
              overflow: 'hidden',
              border: '2px solid #D9A94E',
              bgcolor: '#0F1B2E',
            }}
          >
            <Box
              sx={{
                height: 130,
                bgcolor: '#1A2538',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Avatar sx={{ width: 48, height: 48, bgcolor: '#24334D' }}>
                <PersonIcon />
              </Avatar>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                bgcolor: 'rgba(0,0,0,0.6)',
              }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2F6B33', flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600 }}>
                Prof. Henderson
              </Typography>
            </Box>
          </Paper>

          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.5,
              bgcolor: 'rgba(0,0,0,0.6)',
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <IconButton
                size="small"
                onClick={() => setIsPlaying(!isPlaying)}
                sx={{
                  color: '#fff',
                  border: '1px solid #8B9BB5',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                }}
              >
                {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
              </IconButton>
              <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: '#8B9BB5' }}>
                Slide 04 / 20
              </Typography>
              <IconButton size="small" sx={{ color: '#8B9BB5' }}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" sx={{ color: '#8B9BB5' }}>
                <ZoomInOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" sx={{ color: '#8B9BB5' }}>
                <ContentCopyOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Button
              variant="contained"
              startIcon={<PanToolOutlinedIcon />}
              sx={{
                bgcolor: '#D9A94E',
                color: '#14213D',
                borderRadius: 24,
                px: 3,
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': { bgcolor: '#C89A3E' },
              }}
            >
              Raise Hand
            </Button>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <IconButton size="small" sx={{ color: '#8B9BB5' }}>
                  <VolumeUpOutlinedIcon fontSize="small" />
                </IconButton>
                <Slider
                  value={volume}
                  onChange={(_, v) => setVolume(v)}
                  size="small"
                  sx={{
                    width: 60,
                    color: '#8B9BB5',
                    '& .MuiSlider-thumb': { width: 12, height: 12 },
                  }}
                />
              </Stack>
              <Stack direction="column" sx={{ alignItems: 'center' }} spacing={0}>
                <IconButton size="small" sx={{ color: '#8B9BB5' }}>
                  <ClosedCaptionIcon fontSize="small" />
                </IconButton>
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#8B9BB5', lineHeight: 1 }}>
                  Captions
                </Typography>
              </Stack>
              <Stack direction="column" sx={{ alignItems: 'center' }} spacing={0}>
                <IconButton size="small" sx={{ color: '#8B9BB5' }}>
                  <RecordVoiceOverIcon fontSize="small" />
                </IconButton>
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#8B9BB5', lineHeight: 1 }}>
                  Transcribe
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </Box>

        <Box
          sx={{
            width: 340,
            flexShrink: 0,
            bgcolor: '#0B0F14',
            borderLeft: '1px solid #24334D',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1.5,
              borderBottom: '1px solid #24334D',
            }}
          >
            <ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 18, color: '#8B9BB5' }} />
            <Typography variant="h6" sx={{ fontSize: '0.9rem', fontWeight: 600, flex: 1 }}>
              Live Discussion
            </Typography>
            <Typography variant="caption" sx={{ color: '#8B9BB5' }}>
              142 Participants
            </Typography>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
            <Stack spacing={2}>
              {messages.map((msg, i) => {
                if (msg.system) {
                  return (
                    <Paper
                      key={i}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        bgcolor: 'rgba(255,255,255,0.03)',
                        borderColor: '#24334D',
                        textAlign: 'center',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: '#8B9BB5', fontStyle: 'italic', display: 'block' }}
                      >
                        {msg.text}
                      </Typography>
                    </Paper>
                  );
                }

                return (
                  <Box
                    key={i}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: msg.highlighted ? 'rgba(217,169,78,0.12)' : 'transparent',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: msg.user?.includes('TA') || msg.user?.includes('Dr.')
                            ? '#D9A94E'
                            : '#fff',
                        }}
                      >
                        {msg.user}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.65rem' }}>
                        {msg.time}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#B0BECD', fontSize: '0.8rem' }}>
                      {msg.text}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1.5,
              borderTop: '1px solid #24334D',
            }}
          >
            <TextField
              variant="outlined"
              size="small"
              fullWidth
              placeholder="Ask a question or comment..."
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  '& fieldset': { borderColor: '#24334D' },
                  '&:hover fieldset': { borderColor: '#8B9BB5' },
                  '&.Mui-focused fieldset': { borderColor: '#D9A94E' },
                },
                '& .MuiInputBase-input::placeholder': { color: '#6B7280', opacity: 1 },
              }}
            />
            <IconButton size="small" sx={{ color: '#8B9BB5' }}>
              <AttachFileIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              sx={{ bgcolor: '#D9A94E', color: '#14213D', '&:hover': { bgcolor: '#C89A3E' } }}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
