"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, CHANNELS_DOC_PATH } from "../lib/firebase";
import { groupChannels } from "../lib/m3uParser";

// ---------------------------------------------------------------------
// Apertura en VLC, adaptada a cada plataforma (fuente: documentación y
// foros oficiales de VideoLAN para cada sistema):
//
// - Android / Fire TV / Android TV / TV box Android: Intent nativo de
//   Android (type=video, package=org.videolan.vlc).
// - iPhone / iPad: esquema x-callback-url que registra VLC para iOS
//   (vlc-x-callback://x-callback-url/stream?url=...).
// - PC / Smart TV con navegador de escritorio: no existe un protocolo
//   fiable al 100% para "lanzar" VLC de escritorio desde una web en
//   todos los casos, así que copiamos el enlace al portapapeles y
//   avisamos con instrucciones (Media > Abrir volcado de red).
// ---------------------------------------------------------------------

function detectPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android"; // móvil, Android TV y la mayoría de Fire TV / TV box
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "desktop";
}

function openInVlc(channel, onNeedsCopy) {
  const url = channel.url;
  const platform = detectPlatform();
  const match = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.+)$/);

  if (platform === "android" && match) {
    const [, scheme, rest] = match;
    window.location.href =
      `intent://${rest}#Intent;` +
      `scheme=${scheme};` +
      `action=android.intent.action.VIEW;` +
      `type=video/*;` +
      `package=org.videolan.vlc;` +
      `end`;
    return;
  }

  if (platform === "ios") {
    window.location.href =
      "vlc-x-callback://x-callback-url/stream?url=" + encodeURIComponent(url);
    return;
  }

  // Desktop / cualquier otro caso: copiamos el enlace, VLC de escritorio
  // no tiene una forma universal de lanzarse solo desde el navegador.
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).catch(() => {});
  }
  onNeedsCopy && onNeedsCopy(url);
}

// ---------------------------------------------------------------------

export default function Home() {
  const [channels, setChannels] = useState(null); // null = cargando
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [copyNotice, setCopyNotice] = useState(null);
  const scrollRefs = useRef({});

  useEffect(() => {
    const ref = doc(db, ...CHANNELS_DOC_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setChannels(data.channels || []);
          setUpdatedAt(data.updatedAt || null);
        } else {
          setChannels([]);
        }
      },
      (err) => {
        console.error(err);
        setError(
          "No se pudo conectar con Firebase. Revisa las variables NEXT_PUBLIC_FIREBASE_* en Vercel."
        );
      }
    );
    return () => unsub();
  }, []);

  const groups = useMemo(() => groupChannels(channels || []), [channels]);
  const groupNames = Object.keys(groups);

  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = query.toLowerCase();
    return (channels || []).filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, query, searching]);

  function handleOpen(ch) {
    openInVlc(ch, (url) => setCopyNotice(url));
  }

  function scrollRow(name, dir) {
    const el = scrollRefs.current[name];
    if (!el) return;
    el.scrollBy({ left: dir * 600, behavior: "smooth" });
  }

  return (
    <main style={{ minHeight: "100vh", paddingBottom: 60 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px 32px",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          background:
            "linear-gradient(to bottom, rgba(11,15,20,0.98), rgba(11,15,20,0.85))",
          backdropFilter: "blur(8px)",
          zIndex: 20
        }}
      >
        <h1 className="wordmark" style={{ fontSize: 24, margin: 0, flexShrink: 0 }}>
          JOSELU<span>FLIX</span>
        </h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar canal..."
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--line)",
            borderRadius: 999,
            color: "var(--text)",
            padding: "10px 18px",
            width: "100%",
            maxWidth: 320
          }}
        />
      </header>

      {error && <div style={{ margin: 24, color: "var(--danger)" }}>{error}</div>}

      {!error && channels === null && (
        <div style={{ margin: 24, color: "var(--text-dim)" }}>Cargando canales…</div>
      )}

      {!error && channels !== null && channels.length === 0 && (
        <div style={{ margin: 24, color: "var(--text-dim)", maxWidth: 480 }}>
          Todavía no hay ninguna lista publicada. Entra en <code>/admin</code>,
          carga una lista M3U y pulsa "Publicar" — aparecerá aquí al instante,
          en todos los dispositivos.
        </div>
      )}

      {channels && channels.length > 0 && (
        <>
          {searching ? (
            <ChannelGrid channels={searchResults} onOpen={handleOpen} title={`Resultados para "${query}"`} />
          ) : (
            <div style={{ paddingTop: 24 }}>
              {groupNames.map((name) => (
                <Row
                  key={name}
                  name={name}
                  channels={groups[name]}
                  onOpen={handleOpen}
                  scrollRef={(el) => (scrollRefs.current[name] = el)}
                  onScroll={(dir) => scrollRow(name, dir)}
                />
              ))}
            </div>
          )}

          {updatedAt && (
            <p style={{ padding: "0 32px", color: "var(--text-dim)", fontSize: 12 }}>
              Última actualización: {new Date(updatedAt).toLocaleString("es-ES")}
            </p>
          )}
        </>
      )}

      {copyNotice && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-raised)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius)",
            padding: "16px 20px",
            maxWidth: "min(90vw, 480px)",
            zIndex: 50,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
          }}
        >
          <p style={{ margin: 0, marginBottom: 8, fontWeight: 700 }}>
            Enlace copiado ✅
          </p>
          <p style={{ margin: 0, marginBottom: 8, color: "var(--text-dim)", fontSize: 13 }}>
            Abre VLC → Medio → Abrir volcado de red → pega el enlace y dale a
            reproducir.
          </p>
          <p
            style={{
              margin: 0,
              marginBottom: 12,
              fontSize: 11,
              color: "var(--text-dim)",
              wordBreak: "break-all"
            }}
          >
            {copyNotice}
          </p>
          <button
            onClick={() => setCopyNotice(null)}
            style={{
              background: "var(--accent)",
              color: "#1a1305",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 700
            }}
          >
            Entendido
          </button>
        </div>
      )}
    </main>
  );
}

function Row({ name, channels, onOpen, scrollRef, onScroll }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          padding: "0 32px",
          margin: 0,
          marginBottom: 10,
          fontSize: 17,
          fontWeight: 700
        }}
      >
        {name}
      </h2>
      <div style={{ position: "relative" }}>
        <RowArrow dir={-1} onClick={() => onScroll(-1)} />
        <div
          ref={scrollRef}
          style={{
            display: "flex",
            gap: 14,
            overflowX: "auto",
            padding: "4px 32px 12px",
            scrollSnapType: "x proximity",
            scrollbarWidth: "none"
          }}
        >
          {channels.map((ch) => (
            <ChannelTile key={ch.id} channel={ch} onOpen={onOpen} />
          ))}
        </div>
        <RowArrow dir={1} onClick={() => onScroll(1)} />
      </div>
    </section>
  );
}

function RowArrow({ dir, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === -1 ? "Anterior" : "Siguiente"}
      style={{
        position: "absolute",
        top: 0,
        bottom: 12,
        [dir === -1 ? "left" : "right"]: 0,
        width: 40,
        border: "none",
        background:
          dir === -1
            ? "linear-gradient(to right, var(--bg), transparent)"
            : "linear-gradient(to left, var(--bg), transparent)",
        color: "var(--text)",
        fontSize: 22,
        cursor: "pointer",
        zIndex: 2
      }}
      className="row-arrow"
    >
      {dir === -1 ? "‹" : "›"}
    </button>
  );
}

function ChannelGrid({ channels, onOpen, title }) {
  return (
    <section style={{ padding: "24px 32px" }}>
      {title && (
        <h2 style={{ margin: 0, marginBottom: 16, fontSize: 17, fontWeight: 700 }}>
          {title}
        </h2>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 16
        }}
      >
        {channels.map((ch) => (
          <ChannelTile key={ch.id} channel={ch} onOpen={onOpen} wide />
        ))}
      </div>
    </section>
  );
}

function ChannelTile({ channel, onOpen, wide }) {
  return (
    <button
      onClick={() => onOpen(channel)}
      className="channel-tile"
      style={{
        flexShrink: 0,
        scrollSnapAlign: "start",
        width: wide ? "100%" : 160,
        aspectRatio: "16 / 9",
        background:
          "linear-gradient(145deg, var(--bg-raised), #0e141c)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 12,
        color: "var(--text)",
        transition: "transform 0.15s ease, border-color 0.15s ease"
      }}
    >
      {channel.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={channel.logo}
          alt=""
          style={{ maxHeight: "55%", maxWidth: "80%", objectFit: "contain" }}
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : (
        <div style={{ fontSize: 26, opacity: 0.4 }}>📺</div>
      )}
      <span
        style={{
          fontSize: 12,
          textAlign: "center",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical"
        }}
      >
        {channel.name}
      </span>
    </button>
  );
}
