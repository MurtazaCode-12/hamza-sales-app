import type { Metadata, Viewport } from "next"; // Import Viewport
import { Inter } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/context/StoreContext";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

// 1. Add Viewport settings (Crucial for "App Feel")
export const viewport: Viewport = {
  themeColor: "#0f172a", // Matches your dark theme
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents zooming when tapping inputs
  userScalable: false, // Forces it to behave like a native app
};

// 2. Add Apple-specific metadata
export const metadata: Metadata = {
  title: "Hamza Trading Co.",
  description: "Field Sales App",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hamza Sales",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <StoreProvider>
            {children}
          </StoreProvider>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}