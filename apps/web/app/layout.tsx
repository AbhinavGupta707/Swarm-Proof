import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwarmProof",
  description: "AI users test your product before real users suffer."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-line bg-panel">
          <nav className="page-shell flex min-h-16 items-center justify-between gap-4">
            <Link className="font-mono text-sm font-semibold tracking-normal text-ink" href="/">
              SwarmProof
            </Link>
            <div className="flex items-center gap-2 text-sm">
              <Link className="rounded-ui px-3 py-2 hover:bg-mist" href="/audits/new">
                New audit
              </Link>
              <Link className="rounded-ui px-3 py-2 hover:bg-mist" href="/novus-proof">
                Novus proof
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
