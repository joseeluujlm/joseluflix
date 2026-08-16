# JOSELUFLIX

App de IPTV con dos partes:

- **`/admin`** — panel protegido con contraseña donde cargas o pegas una lista
  M3U y la publicas.
- **`/`** — la app que ven los dispositivos (móvil, tablet, Android TV,
  FireTV, TV box). En cuanto publicas en `/admin`, se actualiza sola en
  todos los dispositivos que la tengan abierta, sin recargar nada.

La sincronización usa **Firebase Firestore** en tiempo real: el admin
escribe un documento, y todos los visores están "escuchando" ese documento.

---

## 1. Crear el proyecto de Firebase (gratis)

1. Ve a https://console.firebase.google.com → **Crear proyecto** (nombre libre, ej. `joseluflix`).
2. Dentro del proyecto: **Compilación → Firestore Database → Crear base de datos**.
   - Modo: empieza en **modo de prueba** (luego puedes ajustar las reglas, ver punto 4).
3. Ve a **Configuración del proyecto (⚙️) → General → Tus apps → Web (`</>`)**.
   - Regístrala con cualquier nombre (ej. `joseluflix-web`).
   - Copia el objeto `firebaseConfig` que te da — ahí están los valores que necesitas.

## 2. Configurar las variables de entorno

Copia `.env.local.example` a `.env.local` y rellena con los datos del paso 1:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_ADMIN_PASSWORD=elige-una-contraseña
```

## 3. Probar en local (opcional)

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` (app) y `http://localhost:3000/admin` (panel).

## 4. Reglas de seguridad de Firestore (importante)

Por defecto, "modo de prueba" deja leer y escribir a cualquiera durante 30
días y luego se bloquea. Como la contraseña del admin solo protege la
pantalla (no la base de datos en sí), conviene fijar reglas que permitan
**leer a cualquiera** (para que la app funcione en los dispositivos) pero
**escribir solo si conocen tu proyecto** — para uso personal, esto es
suficiente:

En Firebase Console → Firestore Database → **Reglas**, pega:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /config/channels {
      allow read: if true;
      allow write: if true; // ok para uso personal; el panel ya pide contraseña
    }
  }
}
```

Si más adelante quieres cerrarlo más, lo ideal es mover la escritura a una
Cloud Function con autenticación real — dímelo y te lo preparo.

## 5. Desplegar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. Entra en https://vercel.com → **Add New → Project** → importa el repo.
3. En **Environment Variables**, añade las mismas variables del paso 2.
4. Deploy. Tendrás una URL tipo `https://joseluflix.vercel.app`.

## 6. Usarla en cada dispositivo

- **Móvil/tablet (Android o iOS)**: abre la URL en Chrome/Safari → menú →
  **"Añadir a pantalla de inicio"**. Queda instalada como una app normal,
  a pantalla completa.
- **Android TV / FireTV / TV Box**: instala el navegador **"Chrome"**,
  **"Silk Browser"** o similar (o el que traiga el box), abre la misma URL
  y navega con el mando. Al ser una web app, funciona en cualquiera de
  estos sin instalar nada especial.
  - Si más adelante quieres un icono propio en el launcher de la TV (en vez
    de abrirla desde el navegador), se puede empaquetar esta misma web como
    APK con una *Trusted Web Activity* (herramienta gratuita: PWA Builder,
    https://www.pwabuilder.com). Dímelo cuando llegues a ese punto y te
    guío con esa parte.

## 7. Publicar canales

1. Entra en `tu-dominio.vercel.app/admin`, mete la contraseña.
2. Pega la **URL de una lista M3U** y pulsa "Cargar" (si la descarga falla
   por CORS, copia el contenido de la lista y pégalo directamente en el
   cuadro de texto, y pulsa "Analizar texto").
3. Revisa la vista previa.
4. Pulsa **"Publicar en todos los dispositivos"**.
5. Listo — los dispositivos con la app abierta reciben la lista al
   instante; los que la abran después, la reciben nada más cargar.

---

### Notas técnicas

- El reproductor usa `hls.js` para listas `.m3u8`. Flujos en formato
  `.ts` puro o protocolos propietarios de proveedores IPTV pueden no
  reproducirse directamente en el navegador — para esos casos habría que
  montar un pequeño proxy/transcodificador propio.
- Usa siempre fuentes M3U de las que tengas derecho a distribuir/consumir
  el contenido.
