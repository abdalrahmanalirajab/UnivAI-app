'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Alert from '@mui/material/Alert';
import Fab from '@mui/material/Fab';
import School from '@mui/icons-material/School';
import WarningAmber from '@mui/icons-material/WarningAmber';
import Psychology from '@mui/icons-material/Psychology';
import Science from '@mui/icons-material/Science';
import Person from '@mui/icons-material/Person';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import CalendarMonth from '@mui/icons-material/CalendarMonth';

import DashboardShell from '@/app/components/DashboardShell';

const iconMap = {
  school: School,
  warning: WarningAmber,
  psychology: Psychology,
  science: Science,
};

const days = [
  { name: 'Mon', date: 14 },
  { name: 'Tue', date: 15 },
  { name: 'Wed', date: 16 },
  { name: 'Thu', date: 17 },
  { name: 'Fri', date: 18 },
  { name: 'Sat', date: 19 },
  { name: 'Sun', date: 20 },
];

const initialSchedule = [
  {
    time: '09:00',
    events: [
      {
        title: 'Advanced Macroeconomics IV',
        tag: 'CORE CURRICULUM',
        tagColor: 'primary',
        instructor: 'Prof. H. Miller',
        location: 'Lecture Hall 402',
        icon: 'school',
      },
    ],
  },
  {
    time: '10:30',
    events: [
      {
        title: 'Statistical Theory Mid-Term',
        tag: 'EXAMINATION',
        tagColor: 'error',
        meta: 'Duration: 120 Minutes \u2022 Main Auditorium',
        icon: 'warning',
        highlighted: true,
      },
      {
        title: 'Ethics in AI & Automation',
        tag: 'ELECTIVE',
        tagColor: 'warning',
        meta: 'Sem. Room B-12 \u2022 Guest Speaker: Dr. Aris',
        icon: 'psychology',
      },
    ],
  },
  {
    time: '13:00',
    recess: true,
    label: 'Mid-day Recess \u2022 Faculty Commons Open',
  },
  {
    time: '14:30',
    events: [
      {
        title: 'Quantitative Methods Lab',
        tag: 'LABORATORY',
        tagColor: 'info',
        meta: 'Computer Lab 3 \u2022 Practical Session',
        icon: 'science',
      },
    ],
  },
];

const tagBorderColor = (color) => {
  const map = {
    primary: '#14213D',
    error: '#9B2C2C',
    warning: '#D9A94E',
    info: '#0288D1',
  };
  return map[color] || '#14213D';
};

export default function SchedulePage() {
  const [selectedDay, setSelectedDay] = useState('Tue');
  const [viewMode, setViewMode] = useState('week');
  const [alertVisible, setAlertVisible] = useState(true);
  const [schedule] = useState(initialSchedule);

  return (
    <DashboardShell
      activeNav="schedule"
      pageTitle="My Schedule"
      headerBadge="TERM: FALL 2024"
      userName="John Doe"
      userRole="Student"
    >
      <Box>
        {alertVisible && (
          <Alert
            severity="info"
            sx={{ bgcolor: '#E4E9F7', mb: 3 }}
            onClose={() => setAlertVisible(false)}
          >
            <Typography component="span" sx={{ display: 'inline' }}>
              Upcoming:{' '}
              <Typography component="span" sx={{ fontWeight: 700 }}>
                Advanced Macroeconomics
              </Typography>{' '}
              starts in 12 minutes.{' '}
              <Typography
                component="span"
                sx={{ textDecoration: 'underline', cursor: 'pointer', color: 'primary.main' }}
              >
                Join Lecture Hall 402
              </Typography>
            </Typography>
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
          <Box>
            <Typography variant="h3" sx={{ fontFamily: '"Lora", serif' }}>
              Weekly Schedule
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Academic Week 08 &bull; October 14 - 20, 2024
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ButtonGroup>
              <Button
                variant={viewMode === 'week' ? 'contained' : 'outlined'}
                color="primary"
                onClick={() => setViewMode('week')}
              >
                Week
              </Button>
              <Button
                variant={viewMode === 'month' ? 'contained' : 'outlined'}
                color="primary"
                onClick={() => setViewMode('month')}
              >
                Month
              </Button>
            </ButtonGroup>
            <Button variant="outlined" startIcon={<FileDownloadOutlined />}>
              Excel Export
            </Button>
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
          {days.map((day) => {
            const isSelected = day.name === selectedDay;
            const isWeekend = day.name === 'Sat' || day.name === 'Sun';
            return (
              <Paper
                key={day.name}
                onClick={() => setSelectedDay(day.name)}
                sx={{
                  p: 1.5,
                  minWidth: 90,
                  textAlign: 'center',
                  cursor: 'pointer',
                  bgcolor: isSelected ? 'primary.main' : 'background.paper',
                  color: isSelected ? '#FAF7EF' : isWeekend ? 'text.disabled' : 'text.primary',
                  border: isSelected ? 'none' : '1px solid #E4DFD3',
                  '&:hover': { opacity: 0.85 },
                }}
              >
                <Typography
                  variant="overline"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace', display: 'block', lineHeight: 1 }}
                >
                  {day.name}
                </Typography>
                <Typography variant="h6" sx={{ fontFamily: '"Lora", serif', mt: 0.5 }}>
                  {day.date}
                </Typography>
              </Paper>
            );
          })}
        </Stack>

        <Stack spacing={2}>
          {schedule.map((slot, index) => (
            <Box key={index} sx={{ display: 'flex' }}>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  color: 'text.secondary',
                  width: 80,
                  flexShrink: 0,
                  pt: 2.5,
                }}
              >
                {slot.time}
              </Typography>
              {slot.recess ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', py: 2.5 }}>
                  {slot.label}
                </Typography>
              ) : slot.events.length === 1 ? (
                <EventCard event={slot.events[0]} />
              ) : (
                <Box sx={{ display: 'flex', gap: 2, flex: 1 }}>
                  {slot.events.map((evt, i) => (
                    <Box key={i} sx={{ flex: '0 0 calc(50% - 8px)' }}>
                      <EventCard event={evt} />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Stack>

        <Fab color="primary" sx={{ position: 'fixed', bottom: 32, right: 32 }}>
          <CalendarMonth />
        </Fab>
      </Box>
    </DashboardShell>
  );
}

function EventCard({ event }) {
  const Icon = iconMap[event.icon] || School;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 2,
        borderLeft: '4px solid',
        borderLeftColor: tagBorderColor(event.tagColor),
        bgcolor: event.highlighted ? '#F3EFE4' : 'background.paper',
        flex: 1,
        position: 'relative',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Chip label={event.tag} color={event.tagColor} size="small" />
        <Icon sx={{ fontSize: 20, color: event.highlighted ? '#D9A94E' : 'text.secondary' }} />
      </Box>
      <Typography variant="h6" sx={{ fontFamily: '"Lora", serif', mb: 0.5 }}>
        {event.title}
      </Typography>
      {event.instructor && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.25 }}>
          <Person sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {event.instructor}
          </Typography>
        </Stack>
      )}
      {event.location && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <PlaceOutlined sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {event.location}
          </Typography>
        </Stack>
      )}
      {event.meta && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {event.meta}
        </Typography>
      )}
    </Paper>
  );
}
