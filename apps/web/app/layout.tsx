import "./style.css";
import type { ReactNode } from "react";
import { siteMetadata } from "../lib/entry-content";

export const metadata = {
  title: siteMetadata.title,
  description: siteMetadata.description,
  icons: { icon: siteMetadata.icon },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
