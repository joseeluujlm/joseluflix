// Proxy de streams para JOSELUFLIX.
//
// Por qué existe: muchas listas IPTV (incluidas fuentes legítimas de TDT)
// sirven sus streams por http:// sin cifrar. Como esta web se sirve por
// https://, el navegador bloquea ese contenido "mixto" (mixed content) y
// además muchos de esos servidores no envían cabeceras CORS. Este endpoint
// hace de intermediario: pide el contenido él mismo (sin esas restricciones,
// al ser petición servidor-a-servidor) y lo re-sirve desde nuestro propio
// dominio, ya en https y con CORS abierto.
//
// Además, si lo que se pide es una playlist m3u8, reescribe dentro de ella
// todas las URLs (segmentos .ts, sub-playlists, claves de cifrado) para que
// también pasen por este mismo proxy — si no, el navegador iría directo al
// servidor original para esos archivos y volveríamos a tener el mismo
// problema.

export const dynamic = "force-dynamic";

function toAbsoluteUrl(base, relative) {
  try {
    return new URL(relative, base).toString();
  } catch {
    return relative;
  }
}

function proxied(url) {
  return "/api/proxy?url=" + encodeURIComponent(url);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target) {
    return new Response("Falta el parámetro url", { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JOSELUFLIX-Proxy"
      },
      redirect: "follow"
    });
  } catch (err) {
    return new Response("No se pudo conectar con el origen: " + err.message, {
      status: 502
    });
  }

  if (!upstream.ok) {
    return new Response("El origen respondió " + upstream.status, {
      status: upstream.status
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const looksLikePlaylist =
    target.toLowerCase().includes(".m3u8") ||
    contentType.includes("mpegurl") ||
    contentType.includes("x-mpegURL");

  if (looksLikePlaylist) {
    const text = await upstream.text();

    const rewritten = text
      .split("\n")
      .map((rawLine) => {
        const line = rawLine.trim();
        if (!line) return rawLine;

        // Etiquetas que también llevan una URI dentro (clave de cifrado,
        // mapa de inicialización, etc.)
        if (line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP")) {
          return line.replace(/URI="([^"]+)"/, (_m, uri) => {
            const abs = toAbsoluteUrl(target, uri);
            return `URI="${proxied(abs)}"`;
          });
        }

        if (line.startsWith("#")) return rawLine;

        // Línea normal: URL de un segmento o de una sub-playlist
        const abs = toAbsoluteUrl(target, line);
        return proxied(abs);
      })
      .join("\n");

    return new Response(rewritten, {
      status: 200,
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "access-control-allow-origin": "*",
        "cache-control": "no-cache"
      }
    });
  }

  // Contenido binario (segmentos .ts/.m4s, claves, etc.): lo pasamos tal cual.
  const buffer = await upstream.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": contentType || "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": "no-cache"
    }
  });
}
