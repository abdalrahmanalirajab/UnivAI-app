'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import LinearProgress from '@mui/material/LinearProgress';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import { PieChart } from '@mui/x-charts/PieChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

import DashboardShell from '@/app/components/DashboardShell';

const initialGrades = [
  {
    name: 'Introduction to Macroeconomics',
    type: 'Quiz 1',
    date: 'Oct 12, 2023',
    score: '92/100',
    status: 'PASSED',
  },
  {
    name: 'Statistical Theory I',
    type: 'Mid-Term',
    date: 'Oct 05, 2023',
    score: '82/100',
    status: 'PASSED',
  },
  {
    name: 'History of Economic Thought',
    type: 'Final Essay',
    date: 'Sep 28, 2023',
    score: '78/100',
    status: 'PASSED',
  },
];

export default function EvaluationPage() {
  const [tabValue, setTabValue] = useState(0);
  const [grades] = useState(initialGrades);
  // Derived stats — swap with real API data later
  const overallGrade = 84.2;
  const gradeLetter = 'B+';
  const attendancePct = 93;
  const attendedSessions = 42;
  const totalSessions = 45;
  const quizzesCompleted = 18;
  const quizzesTotal = 20;

  return (
    <DashboardShell
      activeNav="evaluation"
      pageTitle="My Evaluations"
      userName="John Doe"
      userRole="Student"
    >
      <Box>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 3, borderRadius: 2, position: 'relative' }}>
              <TrendingUpIcon
                sx={{ position: 'absolute', top: 16, right: 16, fontSize: 20, color: '#6B7280' }}
              />
              <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
                OVERALL GRADE
              </Typography>
              <Typography variant="h3" sx={{ fontFamily: '"Lora", serif', lineHeight: 1.1 }}>
                {overallGrade}
                <Typography
                  component="span"
                  sx={{ fontSize: '1rem', fontWeight: 400, color: '#6B7280' }}
                >
                  %
                </Typography>
              </Typography>
              <Typography variant="body2" sx={{ color: '#D9A94E', fontWeight: 700, mt: 0.5 }}>
                Grade: {gradeLetter}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={overallGrade}
                sx={{
                  mt: 1.5,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: '#E4DFD3',
                  '& .MuiLinearProgress-bar': { bgcolor: '#14213D' },
                }}
              />
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
                ATTENDANCE
              </Typography>
              <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <PieChart
                  series={[
                    {
                      data: [
                        { value: attendancePct, color: '#14213D' },
                        { value: 100 - attendancePct, color: '#E4DFD3' },
                      ],
                      innerRadius: 38,
                      outerRadius: 58,
                      paddingAngle: 0,
                      cornerRadius: 0,
                    },
                  ]}
                  width={130}
                  height={110}
                  slotProps={{ legend: { hidden: true } }}
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}
                  >
                    {attendancePct}%
                  </Typography>
                </Box>
              </Box>
              <Typography
                variant="caption"
                sx={{ color: '#6B7280', display: 'block', textAlign: 'center', mt: 0.5 }}
              >
                {attendedSessions} / {totalSessions} Sessions
              </Typography>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
                QUIZZES
              </Typography>
              <Typography variant="h3" sx={{ fontFamily: '"Lora", serif', lineHeight: 1.1 }}>
                {quizzesCompleted}
                <Typography
                  component="span"
                  sx={{ fontSize: '1rem', fontWeight: 400, color: '#6B7280' }}
                >
                  /{quizzesTotal}
                </Typography>
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                  PROGRESS
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: '"IBM Plex Mono", monospace', color: '#6B7280' }}
                >
                  {Math.round((quizzesCompleted / quizzesTotal) * 100)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(quizzesCompleted / quizzesTotal) * 100}
                sx={{
                  mt: 0.5,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: '#E4DFD3',
                  '& .MuiLinearProgress-bar': { bgcolor: '#14213D' },
                }}
              />
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              sx={{
                p: 3,
                borderRadius: 2,
                bgcolor: '#14213D',
                color: '#fff',
                position: 'relative',
              }}
            >
              <CalendarMonthIcon
                sx={{ position: 'absolute', top: 16, right: 16, fontSize: 20, color: 'rgba(255,255,255,0.5)' }}
              />
              <Typography
                variant="overline"
                sx={{ display: 'block', mb: 1, color: 'rgba(255,255,255,0.6)' }}
              >
                UPCOMING
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography variant="h3" sx={{ fontFamily: '"Lora", serif', lineHeight: 1 }}>
                  02
                </Typography>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Dec 15, 10:30 AM
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                    Macro Midterm
                  </Typography>
                </Box>
              </Stack>
              <Button
                variant="contained"
                fullWidth
                sx={{ mt: 2, bgcolor: '#fff', color: '#14213D', '&:hover': { bgcolor: '#E4DFD3' } }}
              >
                View Schedule
              </Button>
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 4 }}>
          <Tabs
            value={tabValue}
            onChange={(_, v) => setTabValue(v)}
            sx={{
              borderBottom: '1px solid #E4DFD3',
              '& .MuiTab-root': { textTransform: 'uppercase', fontWeight: 600 },
              '& .Mui-selected': { color: '#14213D' },
              '& .MuiTabs-indicator': { bgcolor: '#D9A94E' },
            }}
          >
            <Tab label="Grades" />
            <Tab label="Attendance" />
            <Tab label="Exams & Quizzes" />
          </Tabs>

          {tabValue === 0 && (
            <Paper variant="outlined" sx={{ mt: 3 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ASSESSMENT NAME</TableCell>
                    <TableCell>TYPE</TableCell>
                    <TableCell>DATE</TableCell>
                    <TableCell>SCORE</TableCell>
                    <TableCell>STATUS</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {grades.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {row.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#6B7280' }}>
                          {row.type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#6B7280' }}>
                          {row.date}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                          {row.score}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={row.status}
                          size="small"
                          sx={{
                            bgcolor: '#D9A94E',
                            color: '#14213D',
                            fontWeight: 700,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small">
                          <VisibilityOutlinedIcon fontSize="small" sx={{ color: '#6B7280' }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {tabValue === 1 && (
            <Typography variant="body1" sx={{ color: '#6B7280', mt: 3 }}>
              Coming soon
            </Typography>
          )}

          {tabValue === 2 && (
            <Typography variant="body1" sx={{ color: '#6B7280', mt: 3 }}>
              Coming soon
            </Typography>
          )}
        </Box>
      </Box>
    </DashboardShell>
  );
}
