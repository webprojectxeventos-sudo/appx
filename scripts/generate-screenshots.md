# Guia: Capturas de pantalla para App Store y Play Store

## Que necesitas

### Google Play Store
- **Capturas de pantalla movil:** minimo 2, maximo 8. Tamano: **1080x1920 px** (PNG o JPEG)
- **Feature graphic:** 1 imagen de **1024x500 px** (se muestra como banner en la tienda)
- **Icono:** 512x512 px (ya lo tienes en `/public/icon-512.png`)

### Apple App Store
- **iPhone 6.7" (iPhone 15 Pro Max):** minimo 2 capturas de **1290x2796 px**
- **iPhone 6.5" (iPhone 14 Plus):** minimo 2 capturas de **1284x2778 px**
- *Opcionalmente:* iPad capturas si quieres aparecer en iPad

---

## Como generar las capturas

### Opcion A: Chrome DevTools (rapido)

1. Abre tu app desplegada en Chrome: `https://app.projectxeventos.es`
2. Abre DevTools (F12 o Cmd+Opt+I)
3. Click en el icono de dispositivo (Toggle device toolbar)
4. Configura la resolucion:
   - **Play Store:** 360x640 (DPR 3.0 = resultado 1080x1920)
   - **App Store:** 430x932 (DPR 3.0 = resultado 1290x2796)
5. Inicia sesion con una cuenta de prueba
6. Navega a cada pantalla y haz captura:
   - Cmd+Shift+P → "Capture full size screenshot"

### Opcion B: Dispositivo real (mejor calidad)

1. Abre la app en tu movil
2. Navega a cada pantalla
3. Haz captura de pantalla nativa (boton lateral + volumen en iPhone)

---

## Capturas recomendadas (por orden de importancia)

| # | Pantalla | Que mostrar | Archivo |
|---|----------|-------------|---------|
| 1 | Home | Countdown + quick actions + info evento | `home.png` |
| 2 | Chat | Conversacion activa con mensajes | `chat.png` |
| 3 | Galeria | Grid de fotos con lightbox abierto | `gallery.png` |
| 4 | Bebidas | Formulario de seleccion de bebidas | `drinks.png` |
| 5 | QR Ticket | Pantalla completa del QR de entrada | `ticket.png` |
| 6 | Playlist | Lista de canciones con votaciones | `playlist.png` |

---

## Donde guardar

```
public/
  screenshots/
    home.png        (1080x1920)
    chat.png        (1080x1920)
    gallery.png     (1080x1920)
    drinks.png      (1080x1920)
    ticket.png      (1080x1920)
    playlist.png    (1080x1920)
    feature.png     (1024x500 — solo Play Store)
```

---

## Feature graphic (Play Store)

La feature graphic es un banner horizontal (1024x500) que se muestra destacado en la Play Store. Sugerencia:

- Fondo oscuro (#0a0a0a) con el gradient mesh de la app
- Logo de Project X centrado
- Texto: "Tu graduacion, tu noche"
- Puedes crear esto en Canva, Figma o cualquier editor de imagenes

---

## Checklist antes de subir

- [ ] Minimo 2 capturas en 1080x1920 en `public/screenshots/`
- [ ] Capturas muestran la app con datos reales (no pantallas vacias)
- [ ] Feature graphic 1024x500 creada
- [ ] No se muestran datos personales reales en las capturas
- [ ] Las capturas coinciden con las rutas definidas en `manifest.json`
