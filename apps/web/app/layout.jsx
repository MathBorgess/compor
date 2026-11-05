import "./style.css";

export const metadata = {
  title: "Compor",
  description: "Crie uma direção para sua próxima divulgação.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
