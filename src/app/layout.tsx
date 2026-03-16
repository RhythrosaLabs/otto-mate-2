import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ottomatron",
  description: "Your autonomous AI workforce. Multi-agent orchestration powered by the world's best models.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🖥️</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;450;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Theme initializer — runs before paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('ottomatron_theme');
              if (t && t !== 'default') {
                document.documentElement.setAttribute('data-theme', t);
              }
            } catch(e) {}
          })();
        `}} />
        {children}
      </body>
    </html>
  );
}
