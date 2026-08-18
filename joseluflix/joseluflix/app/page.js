"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, CHANNELS_DOC_PATH } from "../lib/firebase";
import { groupChannels, classifyCategory } from "../lib/m3uParser";

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

const TABS = [
  { id: "tv", label: "TV" },
  { id: "movies", label: "PELIS" },
  { id: "series", label: "SERIES" }
];

// ---------------------------------------------------------------------

export default function Home() {
  const [channels, setChannels] = useState(null); // null = cargando
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tv");
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

  // Canales de la pestaña activa (TV / PELIS / SERIES), agrupados por su
  // categoría original (group-title) para las filas tipo Netflix.
  const channelsInTab = useMemo(() => {
    return (channels || []).filter((c) => classifyCategory(c.group) === activeTab);
  }, [channels, activeTab]);

  const groups = useMemo(() => groupChannels(channelsInTab), [channelsInTab]);
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
    el.scrollBy({ left: dir * 700, behavior: "smooth" });
  }

  return (
    <main style={{ minHeight: "100vh", paddingBottom: 60 }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background:
            "linear-gradient(to bottom, rgba(11,15,20,0.98), rgba(11,15,20,0.9))",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--line)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 20px",
            flexWrap: "wrap"
          }}
        >
          <h1 className="wordmark" style={{ fontSize: 22, margin: 0, flexShrink: 0 }}>
            JOSELU<span>FLIX</span>
          </h1>

          <nav style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTab(t.id);
                  setSearchOpen(false);
                  setQuery("");
                }}
                style={{
                  flexShrink: 0,
                  padding: "9px 18px",
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  background:
                    !searching && activeTab === t.id ? "var(--accent)" : "var(--bg-raised)",
                  color: !searching && activeTab === t.id ? "#1a1305" : "var(--text)",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "0.03em"
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {searchOpen ? (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => {
                  if (!query) setSearchOpen(false);
                }}
                placeholder="Buscar..."
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--line)",
                  borderRadius: 999,
                  color: "var(--text)",
                  padding: "9px 16px",
                  width: "min(60vw, 260px)"
                }}
              />
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar"
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--line)",
                  borderRadius: "50%",
                  width: 38,
                  height: 38,
                  color: "var(--text)",
                  fontSize: 16,
                  flexShrink: 0
                }}
              >
                🔍
              </button>
            )}
          </div>
        </div>
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
          ) : groupNames.length === 0 ? (
            <div style={{ margin: 24, color: "var(--text-dim)" }}>
              No hay nada en esta categoría todavía.
            </div>
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
    <section style={{ marginBottom: 40 }}>
      <h2
        style={{
          padding: "0 32px",
          margin: 0,
          marginBottom: 12,
          fontSize: 18,
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
            gap: 18,
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
        width: 48,
        border: "none",
        background:
          dir === -1
            ? "linear-gradient(to right, var(--bg), transparent)"
            : "linear-gradient(to left, var(--bg), transparent)",
        color: "var(--text)",
        fontSize: 26,
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
        <h2 style={{ margin: 0, marginBottom: 18, fontSize: 18, fontWeight: 700 }}>
          {title}
        </h2>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
          gap: 20
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
        width: wide ? "100%" : 260,
        aspectRatio: "16 / 9",
        background: "linear-gradient(145deg, var(--bg-raised), #0e141c)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 18,
        color: "var(--text)",
        transition: "transform 0.15s ease, border-color 0.15s ease"
      }}
    >
      {channel.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={channel.logo}
          alt=""
          style={{ maxHeight: "60%", maxWidth: "85%", objectFit: "contain" }}
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : (
        <div style={{ fontSize: 38, opacity: 0.4 }}>📺</div>
      )}
      <span
        style={{
          fontSize: 14,
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
