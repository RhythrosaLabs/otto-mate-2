import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ottomate",
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
    <html lang="en" suppressHydrationWarning className={inter.className}>
      <body>
        {/* Theme initializer — runs before paint to avoid flash. Applies both data-theme AND CSS vars. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('ottomate_theme');
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
