// Convierte el texto plano de un M3U/M3U8 en un array de canales.
// Cada canal: { id, name, logo, group, url }

function extractAttr(line, attr) {
  const re = new RegExp(attr + '="([^"]*)"');
  const m = line.match(re);
  return m ? m[1].trim() : "";
}

export function parseM3U(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const channels = [];
  let pending = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,(.*)$/);
      pending = {
        name: nameMatch ? nameMatch[1].trim() : "Canal sin nombre",
        logo: extractAttr(line, "tvg-logo"),
        group: extractAttr(line, "group-title") || "Sin categoría",
        tvgId: extractAttr(line, "tvg-id")
      };
      continue;
    }

    if (line.startsWith("#")) continue; // otras etiquetas (#EXTM3U, #EXTGRP, etc.)

    // Si llegamos aquí, la línea es una URL
    if (pending && /^https?:\/\//i.test(line)) {
      channels.push({
        id: `${channels.length}-${pending.tvgId || pending.name}`.replace(/\s+/g, "_"),
        name: pending.name,
        logo: pending.logo,
        group: pending.group,
        url: line
      });
      pending = null;
    }
  }

  return channels;
}

export function groupChannels(channels) {
  const groups = {};
  for (const ch of channels) {
    if (!groups[ch.group]) groups[ch.group] = [];
    groups[ch.group].push(ch);
  }
  return groups;
}

// Clasifica un canal en "tv", "movies" o "series" a partir del nombre de su
// categoría (group-title) en la lista M3U. Las listas IPTV no tienen un
// campo estándar para esto, así que lo deducimos por palabras clave
// habituales en español e inglés.
const MOVIE_HINTS = ["pelicul", "movie", "cine", "vod", "film"];
const SERIES_HINTS = ["serie", "series", "temporada", "season"];

export function classifyCategory(groupName) {
  const g = (groupName || "").toLowerCase();
  if (SERIES_HINTS.some((h) => g.includes(h))) return "series";
  if (MOVIE_HINTS.some((h) => g.includes(h))) return "movies";
  return "tv";
}
