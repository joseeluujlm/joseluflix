import "./globals.css";

export const metadata = {
  title: "JOSELUFLIX",
  description: "JOSELUFLIX — reproductor IPTV con panel de administración",
  manifest: "/manifest.json"
};

export const viewport = {
  themeColor: "#0b0f14"
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
