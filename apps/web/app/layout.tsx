import type { Metadata } from "next";
import { Providers } from "@/lib/providers";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ecommerce OrderFlow",
  description: "Order management dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
