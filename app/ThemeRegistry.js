'use client';

import { useState } from 'react';
import createCache from '@emotion/cache';
import { useServerInsertedHTML } from 'next/navigation';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';

export default function ThemeRegistry({ children }) {
  const [cache] = useState(() => {
    const cache = createCache({ key: 'mui' });
    cache.compat = true;
    return cache;
  });

  useServerInsertedHTML(() => {
    const entries = cache.inserted;
    const names = Object.keys(entries);
    if (names.length === 0) return null;
    let styles = '';
    names.forEach((name) => {
      styles += entries[name];
    });
    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
