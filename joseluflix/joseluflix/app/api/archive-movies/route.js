// Genera una lista M3U de películas en dominio público / con licencia
// abierta, usando la API pública y gratuita de Internet Archive
// (archive.org). No hace falta clave de API ni cuenta.
//
// Uso en el panel /admin, como una URL más:
//   https://tu-dominio.vercel.app/api/archive-movies
//   https://tu-dominio.vercel.app/api/archive-movies?q=terror&page=2
//
// Parámetros opcionales:
//   q     -> palabra de búsqueda dentro de las películas en español (por
//            defecto, sin filtro: trae todo lo disponible en español).
//   page  -> página de resultados (empieza en 1). Como el catálogo completo
//            es demasiado grande para traerlo de una sola vez (el servidor
//            tiene un límite de tiempo por petición), cada llamada trae un
//            bloque de películas. Sube el número de página para ir
//            consiguiendo más tandas (page=2, page=3...) y publícalas todas
//            juntas desde el admin usando "Añadir otra lista" varias veces.
//   rows  -> cuántas películas trae cada página (por defecto 24, máx. 40 —
//            limitado por el tiempo máximo de una función serverless).

export const dynamic = "force-dynamic";

const SEARCH_URL = "https://archive.org/advancedsearch.php";
const METADATA_URL = "https://archive.org/metadata/";
const THUMB_URL = "https://archive.org/services/img/";

async function findMp4(identifier) {
  try {
    const res = await fetch(METADATA_URL + identifier, {
      headers: { "User-Agent": "JOSELUFLIX/1.0 (+archive.org public API)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const files = data.files || [];

    // Preferimos un mp4 h.264 ya listo para reproducir directamente.
    const mp4 = files.find(
      (f) => f.name && f.name.toLowerCase().endsWith(".mp4") && f.source === "derivative"
    ) || files.find((f) => f.name && f.name.toLowerCase().endsWith(".mp4"));

    if (!mp4) return null;
    return `https://archive.org/download/${identifier}/${encodeURIComponent(mp4.name)}`;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const rows = Math.min(parseInt(searchParams.get("rows") || "24", 10) || 24, 40);

  const query =
    (q ? `${q} AND ` : "") +
    "mediatype:(movies) AND (language:(Spanish) OR language:(spa) OR language:(español)) " +
    "AND licenseurl:*";

  const searchUrl =
    `${SEARCH_URL}?q=${encodeURIComponent(query)}` +
    `&fl[]=identifier&fl[]=title` +
    `&sort[]=downloads+desc` +
    `&rows=${rows}&page=${page}&output=json`;

  let items = [];
  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "JOSELUFLIX/1.0 (+archive.org public API)" }
    });
    const data = await res.json();
    items = data?.response?.docs || [];
  } catch (err) {
    return new Response("No se pudo consultar archive.org: " + err.message, {
      status: 502
    });
  }

  // Buscamos el archivo mp4 real de cada película en paralelo.
  const resolved = await Promise.all(
    items.map(async (item) => {
      const mp4Url = await findMp4(item.identifier);
      return mp4Url ? { ...item, mp4Url } : null;
    })
  );

  const lines = ["#EXTM3U"];
  for (const item of resolved.filter(Boolean)) {
    const title = (item.title || item.identifier).replace(/[\r\n]/g, " ");
    const logo = THUMB_URL + item.identifier;
    lines.push(
      `#EXTINF:-1 tvg-logo="${logo}" group-title="PELICULAS (Archive.org - Español, Dominio público)",${title}`
    );
    lines.push(item.mp4Url);
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "content-type": "application/vnd.apple.mpegurl",
      "cache-control": "public, max-age=3600"
    }
  });
}
