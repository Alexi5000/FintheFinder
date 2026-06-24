import type { Metadata } from 'next';
import Link from 'next/link';
import { Fish, History, Info, Settings, Search } from 'lucide-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fin the Finder',
  description: 'Evidence-first AI deep research workspace with cited reports and auditable research runs.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              <Fish size={24} />
              <span>Fin the Finder</span>
            </div>
            <nav className="nav" aria-label="Primary">
              <Link href="/">
                <Search size={16} /> Workspace
              </Link>
              <Link href="/sessions">
                <History size={16} /> Sessions
              </Link>
              <Link href="/about">
                <Info size={16} /> About
              </Link>
              <Link href="/settings">
                <Settings size={16} /> Settings
              </Link>
            </nav>
          </aside>
          <main className="main">
            <div className="topbar">
              <div>
                <div className="eyebrow">AI Deep Research</div>
                <strong>Human-reviewed, cited, reproducible research runs</strong>
              </div>
            </div>
            <div className="content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
