import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Activity, ShieldCheck } from "lucide-react";
import PendoInitializer from "./pendo-initializer";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwarmProof",
  description: "AI users test your product before real users suffer."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script id="pendo-install" strategy="afterInteractive">
          {`(function(apiKey){
    (function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=o._q||[];
    v=['initialize','identify','updateOptions','pageLoad','track','trackAgent'];for(w=0,x=v.length;w<x;++w)(function(m){
    o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);
    y=e.createElement(n);y.async=!0;y.src='https://cdn.pendo.io/agent/static/'+apiKey+'/pendo.js';
    z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');
})('dfdb8ed9-48ed-401d-8962-e4b4bb0fb38a');`}
        </Script>
        <PendoInitializer />
        <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
          <nav className="page-shell flex min-h-16 items-center justify-between gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 font-mono text-sm font-semibold tracking-normal text-ink" href="/">
              <span className="grid h-8 w-8 place-items-center rounded-ui bg-ink text-white">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>SwarmProof</span>
            </Link>
            <div className="flex items-center gap-1 text-sm sm:gap-2">
              <Link className="hidden min-h-11 items-center rounded-ui px-3 py-2 font-medium hover:bg-mist sm:inline-flex" href="/demo-target">
                Demo target
              </Link>
              <Link className="hidden min-h-11 items-center rounded-ui px-3 py-2 font-medium hover:bg-mist sm:inline-flex" href="/settings/privacy">
                Privacy
              </Link>
              <Link className="inline-flex min-h-11 items-center rounded-ui px-3 py-2 font-medium hover:bg-mist" href="/novus-proof">
                Novus proof
              </Link>
              <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-ink px-3 py-2 font-semibold text-white hover:bg-slate-800" href="/audits/new">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                New audit
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
