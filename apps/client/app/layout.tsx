import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgentOS", template: "%s — AgentOS" },
  description: "Developer platform for building and running AI agents at scale.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <TooltipProvider>
          {children}
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.14 0 0)",
                border: "1px solid oklch(1 0 0 / 8%)",
                color: "oklch(0.97 0 0)",
              },
            }}
          />
        </TooltipProvider>
      </body>
    </html>
  );
}
