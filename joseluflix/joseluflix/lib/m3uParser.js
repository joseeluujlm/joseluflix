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
