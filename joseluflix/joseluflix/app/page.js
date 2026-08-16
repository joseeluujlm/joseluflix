"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, CHANNELS_DOC_PATH } from "../lib/firebase";
import { groupChannels } from "../lib/m3uParser";

export default function Home() {
  const [channels, setChannels] = useState(null); // null = cargando
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("Todos");
  const [playing, setPlaying] = useState(null);

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
  const groupNames = ["Todos", ...Object.keys(groups)];

  const filtered = useMemo(() => {
    let list = channels || [];
    if (activeGroup !== "Todos") list = list.filter((c) => c.group === activeGroup);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [channels, activeGroup, query]);

  return (
    <main style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 24px",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          background: "rgba(11,15,20,0.92)",
          backdropFilter: "blur(6px)",
          zIndex: 5
        }}
      >
        <h1 className="wordmark" style={{ fontSize: 22, margin: 0 }}>
          JOSELU<span>FLIX</span>
        </h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar canal..."
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            padding: "10px 14px",
            width: 220
          }}
        />
      </header>

      {error && (
        <div style={{ margin: 24, color: "var(--danger)" }}>{error}</div>
      )}

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
          <nav
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              padding: "16px 24px",
              borderBottom: "1px solid var(--line)"
            }}
          >
            {groupNames.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  flexShrink: 0,
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  background: activeGroup === g ? "var(--accent)" : "var(--bg-raised)",
                  color: activeGroup === g ? "#1a1305" : "var(--text)",
                  fontWeight: 600,
                  fontSize: 13
                }}
              >
                {g}
              </button>
            ))}
          </nav>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 16,
              padding: 24
            }}
          >
            {filtered.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setPlaying(ch)}
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  color: "var(--text)"
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: 60,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {ch.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ch.logo}
                      alt=""
                      style={{ maxHeight: 60, maxWidth: "100%", objectFit: "contain" }}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : (
                    <div style={{ fontSize: 28, opacity: 0.4 }}>📺</div>
                  )}
                </div>
                <span style={{ fontSize: 13, textAlign: "center", lineHeight: 1.3 }}>
                  {ch.name}
                </span>
              </button>
            ))}
          </section>

          {updatedAt && (
            <p style={{ padding: "0 24px", color: "var(--text-dim)", fontSize: 12 }}>
              Última actualización: {new Date(updatedAt).toLocaleString("es-ES")}
            </p>
          )}
        </>
      )}

      {playing && <Player channel={playing} onClose={() => setPlaying(null)} />}
    </main>
  );
}

function Player({ channel, onClose }) {
  const videoRef = useRef(null);
  const [playerError, setPlayerError] = useState("");

  useEffect(() => {
    let hls;
    const video = videoRef.current;
    if (!video) return;

    const isM3U8 = /\.m3u8($|\?)/i.test(channel.url);

    async function setup() {
      if (isM3U8) {
        const Hls = (await import("hls.js")).default;
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(channel.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) setPlayerError("No se pudo reproducir este canal.");
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = channel.url;
        } else {
          setPlayerError("Este dispositivo no soporta HLS.");
        }
      } else {
        video.src = channel.url;
      }
      video.play().catch(() => {});
    }
    setup();

    return () => {
      if (hls) hls.destroy();
    };
  }, [channel]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 960, padding: 16 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10
          }}
        >
          <strong>{channel.name}</strong>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--line)",
              color: "var(--text)",
              borderRadius: 8,
              padding: "6px 12px"
            }}
          >
            Cerrar ✕
          </button>
        </div>
        <video
          ref={videoRef}
          controls
          autoPlay
          style={{ width: "100%", background: "#000", borderRadius: 8 }}
        />
        {playerError && (
          <p style={{ color: "var(--danger)", marginTop: 10 }}>{playerError}</p>
        )}
      </div>
    </div>
  );
}
