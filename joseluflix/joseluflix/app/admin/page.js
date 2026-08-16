"use client";

import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db, CHANNELS_DOC_PATH } from "../../lib/firebase";
import { parseM3U } from "../../lib/m3uParser";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [url, setUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  function handleLogin(e) {
    e.preventDefault();
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setAuthed(true);
      setAuthError("");
    } else {
      setAuthError("Contraseña incorrecta.");
    }
  }

  async function handleFetchFromUrl() {
    if (!url.trim()) return;
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(url.trim());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      setRawText(text);
      const parsed = parseM3U(text);
      setPreview(parsed);
      setStatus(`Cargados ${parsed.length} canales desde la URL. Revisa y pulsa "Publicar".`);
    } catch (err) {
      console.error(err);
      setStatus(
        "No se pudo descargar la URL desde aquí (puede ser CORS). Prueba a pegar el contenido M3U directamente en el cuadro de texto."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleParseRaw() {
    const parsed = parseM3U(rawText);
    setPreview(parsed);
    setStatus(`${parsed.length} canales detectados. Revisa y pulsa "Publicar".`);
  }

  async function handlePublish() {
    if (preview.length === 0) {
      setStatus("No hay canales para publicar. Carga o pega una lista primero.");
      return;
    }
    setLoading(true);
    try {
      const ref = doc(db, ...CHANNELS_DOC_PATH);
      await setDoc(ref, {
        channels: preview,
        updatedAt: Date.now(),
        sourceUrl: url || null
      });
      setStatus(`✅ Publicado. ${preview.length} canales visibles ahora en todos los dispositivos.`);
    } catch (err) {
      console.error(err);
      setStatus("Error al publicar en Firebase: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: 32,
            width: 320,
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}
        >
          <h1 className="wordmark" style={{ fontSize: 20, margin: 0 }}>
            JOSELU<span>FLIX</span> · Admin
          </h1>
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          {authError && <p style={{ color: "var(--danger)", margin: 0 }}>{authError}</p>}
          <button type="submit" style={primaryBtn}>
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 className="wordmark" style={{ fontSize: 22 }}>
        JOSELU<span>FLIX</span> · Panel de administración
      </h1>
      <p style={{ color: "var(--text-dim)" }}>
        Carga aquí la lista de canales. Al publicar, se sincroniza al instante en
        todos los móviles, tablets y TV boxes que tengan la app abierta.
      </p>

      <section style={{ marginTop: 24 }}>
        <label style={labelStyle}>URL de la lista M3U/M3U8</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://.../lista.m3u"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={handleFetchFromUrl} disabled={loading} style={secondaryBtn}>
            Cargar
          </button>
        </div>

        <label style={{ ...labelStyle, marginTop: 20 }}>
          ...o pega aquí el contenido M3U directamente
        </label>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={8}
          placeholder="#EXTM3U..."
          style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }}
        />
        <button onClick={handleParseRaw} style={{ ...secondaryBtn, marginTop: 8 }}>
          Analizar texto
        </button>
      </section>

      {preview.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 8 }}>Vista previa ({preview.length} canales)</h3>
          <div
            style={{
              maxHeight: 220,
              overflowY: "auto",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)"
            }}
          >
            {preview.slice(0, 50).map((ch) => (
              <div
                key={ch.id}
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--line)",
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "space-between"
                }}
              >
                <span>{ch.name}</span>
                <span style={{ color: "var(--text-dim)" }}>{ch.group}</span>
              </div>
            ))}
            {preview.length > 50 && (
              <div style={{ padding: 10, color: "var(--text-dim)", fontSize: 12 }}>
                y {preview.length - 50} más…
              </div>
            )}
          </div>
        </section>
      )}

      <button
        onClick={handlePublish}
        disabled={loading}
        style={{ ...primaryBtn, marginTop: 24, width: "100%" }}
      >
        {loading ? "Publicando…" : "Publicar en todos los dispositivos"}
      </button>

      {status && <p style={{ marginTop: 14, color: "var(--text-dim)" }}>{status}</p>}
    </main>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "10px 12px",
  boxSizing: "border-box"
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  color: "var(--text-dim)"
};

const primaryBtn = {
  background: "var(--accent)",
  color: "#1a1305",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "12px 18px",
  fontWeight: 700
};

const secondaryBtn = {
  background: "var(--bg-raised)",
  color: "var(--text)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: "10px 16px",
  fontWeight: 600
};
