import './globals.css';

export const metadata = {
  title: 'FPL Transfer Radar',
  description: 'Transfer decisions powered by FPL data and YouTube sentiment.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
