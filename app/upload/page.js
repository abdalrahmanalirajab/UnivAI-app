'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import CloudUpload from '@mui/icons-material/CloudUpload';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import Delete from '@mui/icons-material/Delete';
import ArrowForward from '@mui/icons-material/ArrowForward';

import DashboardShell from '@/app/components/DashboardShell';

const initialFiles = [
  { name: 'Quantum_Mechanics_Lec04.pdf', size: '4.2 MB', status: 'PROCESSING', progress: 65 },
  { name: 'Advanced_Calculus_Syllabus.docx', size: '1.1 MB', status: 'LINKED', progress: 100 },
  { name: 'Corrupted_Archive_Data.pdf', size: '0.8 MB', status: 'FAILED', progress: 20 },
];

const progressColor = (status) => {
  if (status === 'PROCESSING') return 'warning';
  if (status === 'LINKED') return 'success';
  return 'error';
};

export default function UploadPage() {
  const [files, setFiles] = useState(initialFiles);
  const [courseName, setCourseName] = useState('');
  const [subject, setSubject] = useState('Natural Sciences');
  const [description, setDescription] = useState('');

  return (
    <DashboardShell activeNav="upload" pageTitle="Upload Material" userName="John Doe" userRole="Student">
      <Box>
        <Typography variant="h3" sx={{ fontFamily: '"Lora", serif', mb: 1 }}>
          Upload Study Material
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
          Files will be processed and linked via{' '}
          <Typography component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
            RAG
          </Typography>{' '}
          for intelligent cross-lecture search and citation mapping.
        </Typography>

        <Paper
          variant="outlined"
          sx={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: '#D8D2C2',
            bgcolor: '#F3EFE4',
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
            mb: 4,
          }}
        >
          <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" sx={{ mb: 2 }}>
            Drag & drop PDF or DOCX files here
          </Typography>
          <Button variant="contained" color="primary">
            Browse Files
          </Button>
          {/* TODO: connect to file input / upload API */}
        </Paper>

        <Typography variant="overline" sx={{ display: 'block', mb: 2 }}>
          UPLOADED RESOURCES
        </Typography>

        <Stack spacing={2} sx={{ mb: 4 }}>
          {files.map((file, index) => (
            <Paper
              key={index}
              variant="outlined"
              sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Stack direction="row" spacing={2} sx={{ flex: 1, alignItems: 'center' }}>
                <Box
                  sx={{
                    bgcolor: '#E7ECF6',
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                  }}
                >
                  <InsertDriveFileOutlined sx={{ color: '#14213D' }} />
                </Box>
                <Box>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, '&:hover': { textDecoration: 'underline', cursor: 'pointer' } }}
                  >
                    {file.name}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={file.progress}
                    color={progressColor(file.status)}
                    sx={{ width: 300, mt: 0.5 }}
                  />
                </Box>
              </Stack>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: '"IBM Plex Mono", monospace' }}>
                  {file.size}
                </Typography>
                <Chip
                  label={file.status}
                  color={progressColor(file.status)}
                  size="small"
                />
                <IconButton size="small">
                  <Delete fontSize="small" />
                </IconButton>
              </Stack>
            </Paper>
          ))}
        </Stack>

        <Typography variant="h6" sx={{ fontFamily: '"Lora", serif', mb: 2 }}>
          Metadata Information
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 3 }}>
          <Box>
            <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
              COURSE NAME
            </Typography>
            <TextField
              fullWidth
              placeholder="e.g. PHYS-401 Theoretical Physics"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </Box>
          <Box>
            <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
              SUBJECT/CATEGORY
            </Typography>
            <FormControl fullWidth>
              <Select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <MenuItem value="Natural Sciences">Natural Sciences</MenuItem>
                <MenuItem value="Social Sciences">Social Sciences</MenuItem>
                <MenuItem value="Engineering">Engineering</MenuItem>
                <MenuItem value="Humanities">Humanities</MenuItem>
                <MenuItem value="Mathematics">Mathematics</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
            DESCRIPTION
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Briefly summarize the content for contextual indexing..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Box>

        <Button
          variant="contained"
          color="primary"
          size="large"
          fullWidth
          endIcon={<ArrowForward />}
          sx={{ height: 56 }}
        >
          Process & Link to RAG
        </Button>
        {/* TODO: POST to /api/resources */}
      </Box>
    </DashboardShell>
  );
}
