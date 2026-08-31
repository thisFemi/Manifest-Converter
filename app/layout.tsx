import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manifest Conversion Desk — NSW",
  description: "Convert manifests between GovCBR and B'Odogwu formats.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
