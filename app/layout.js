import './globals.css';
import ThemeRegistry from './ThemeRegistry';

export const metadata = {
  title: 'Uni-VA | Academic OS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
