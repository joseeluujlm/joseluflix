"use client";

import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db, CHANNELS_DOC_PATH } from "../../lib/firebase";
import { parseM3U } from "../../lib/m3uParser";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Varias fuentes: cada una es { id, url, status: 'idle'|'loading'|'ok'|'error', count }
  const [sources, setSources] = useState([{ id: crypto.randomUUID(), url: "" }]);
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

  function addSourceField() {
    setSources((prev) => [...prev, { id: crypto.randomUUID(), url: "" }]);
  }

  function removeSourceField(id) {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSourceUrl(id, value) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, url: value } : s)));
  }

  // Si la URL es un archivo "en bruto" de GitHub (raw.githubusercontent.com),
  // devuelve la misma ruta servida a través del espejo jsDelivr. GitHub
  // limita cada vez más el acceso anónimo a raw.githubusercontent.com desde
  // servidores en la nube (como el de nuestro proxy en Vercel), aunque
  // funcione perfectamente desde un navegador normal. jsDelivr sirve el
  // mismo contenido sin esa restricción.
  function githubRawToJsDelivr(rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.hostname !== "raw.githubusercontent.com") return null;
      const parts = u.pathname.split("/").filter(Boolean);

      let user, repo, branch, filePath;
      if (parts[2] === "refs" && parts[3] === "heads") {
        // /user/repo/refs/heads/branch/resto/del/path
        [user, repo] = parts;
        branch = parts[4];
        filePath = parts.slice(5).join("/");
      } else {
        // /user/repo/branch/resto/del/path
        [user, repo, branch] = parts;
        filePath = parts.slice(3).join("/");
      }

      if (!user || !repo || !branch || !filePath) return null;
      return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`;
    } catch {
      return null;
    }
  }

  // Descarga una URL a través del proxy; si es de GitHub y falla, reintenta
  // sola con el espejo jsDelivr antes de rendirse.
  async function fetchListSmart(u) {
    const tryUrl = async (target) => {
      const proxied = "/api/proxy?url=" + encodeURIComponent(target);
      const res = await fetch(proxied);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    };

    try {
      return { text: await tryUrl(u), via: u };
    } catch (firstErr) {
      const mirror = githubRawToJsDelivr(u);
      if (!mirror) throw firstErr;
      try {
        return { text: await tryUrl(mirror), via: mirror };
      } catch {
        throw firstErr; // informamos del error original, más claro para el usuario
      }
    }
  }

  async function handleFetchAll() {
    const urls = sources.map((s) => s.url.trim()).filter(Boolean);
    if (urls.length === 0) return;

    setLoading(true);
    setStatus(`Cargando ${urls.length} lista(s)...`);

    let merged = [];
    const results = [];

    for (const u of urls) {
      try {
        const { text, via } = await fetchListSmart(u);
        const parsed = parseM3U(text);
        const viaNote = via !== u ? " (vía espejo jsDelivr)" : "";
        // Prefijamos el id con el índice de la fuente para evitar
        // colisiones si dos listas repiten el mismo tvg-id/nombre.
        const withUniqueIds = parsed.map((ch, i) => ({
          ...ch,
          id: `${merged.length + i}-${ch.id}`
        }));
        merged = merged.concat(withUniqueIds);
        results.push(`✅ ${u.slice(0, 50)}${u.length > 50 ? "…" : ""}: ${parsed.length} canales${viaNote}`);
      } catch (err) {
        results.push(`❌ ${u.slice(0, 50)}${u.length > 50 ? "…" : ""}: ${err.message}`);
      }
    }

    setPreview(merged);
    setStatus(results.join("\n") + `\n\nTotal combinado: ${merged.length} canales.`);
    setLoading(false);
  }

  function handleParseRaw() {
    const parsed = parseM3U(rawText);
    // El texto pegado a mano se AÑADE a lo que ya hubiera en la vista previa
    // (de las URLs), no lo sustituye, así puedes combinar ambas fuentes.
    setPreview((prev) => {
      const offset = prev.length;
      const withUniqueIds = parsed.map((ch, i) => ({ ...ch, id: `${offset + i}-${ch.id}` }));
      return prev.concat(withUniqueIds);
    });
    setStatus(`${parsed.length} canales añadidos desde el texto pegado. Revisa y pulsa "Publicar".`);
  }

  function clearPreview() {
    setPreview([]);
    setStatus("Vista previa vaciada.");
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
        sourceUrls: sources.map((s) => s.url.trim()).filter(Boolean)
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
        Carga aquí una o varias listas de canales. Al publicar, se combinan
        en una sola y se sincronizan al instante en todos los móviles,
        tablets y TV boxes que tengan la app abierta.
      </p>

      <section style={{ marginTop: 24 }}>
        <label style={labelStyle}>URLs de listas M3U/M3U8 (puedes añadir varias)</label>

        {sources.map((s, i) => (
          <div key={s.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={s.url}
              onChange={(e) => updateSourceUrl(s.id, e.target.value)}
              placeholder={`https://.../lista${i > 0 ? i + 1 : ""}.m3u`}
              style={{ ...inputStyle, flex: 1 }}
            />
            {sources.length > 1 && (
              <button
                onClick={() => removeSourceField(s.id)}
                style={{ ...secondaryBtn, padding: "10px 14px" }}
                aria-label="Quitar"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={addSourceField} style={secondaryBtn}>
            + Añadir otra lista
          </button>
          <button onClick={handleFetchAll} disabled={loading} style={primaryBtn}>
            {loading ? "Cargando…" : "Cargar todas"}
          </button>
        </div>

        <label style={{ ...labelStyle, marginTop: 20 }}>
          ...o pega aquí contenido M3U directamente (se añade a lo ya cargado)
        </label>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={6}
          placeholder="#EXTM3U..."
          style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }}
        />
        <button onClick={handleParseRaw} style={{ ...secondaryBtn, marginTop: 8 }}>
          Añadir este texto a la vista previa
        </button>
      </section>

      {preview.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Vista previa ({preview.length} canales)</h3>
            <button onClick={clearPreview} style={{ ...secondaryBtn, padding: "6px 12px", fontSize: 12 }}>
              Vaciar
            </button>
          </div>
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

      {status && (
        <p style={{ marginTop: 14, color: "var(--text-dim)", whiteSpace: "pre-line", fontSize: 13 }}>
          {status}
        </p>
      )}
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
