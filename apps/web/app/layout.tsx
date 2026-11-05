import "./style.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Compor",
  description: "Crie uma direção para sua próxima divulgação.",
  icons: { icon: "/studio/compor-avatar.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
