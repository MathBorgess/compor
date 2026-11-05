import "./style.css";

export const metadata = {
  title: "Compor",
  description: "Crie uma direção para sua próxima divulgação.",
  icons: { icon: "/studio/compor-avatar.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
