// Immagini di avvio della PWA su iPhone (apple-touch-startup-image). Generate da scripts/make-splash-images.py:
// le misure qui sotto devono essere le stesse di quello script (punti CSS e rapporto di pixel).
// Senza questa immagine, iOS mostra una pagina bianca mentre l'app si avvia.

const DEVICES: [width: number, height: number, ratio: number][] = [
  [440, 956, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [375, 667, 2],
  [320, 568, 2],
];

export const startupImages = DEVICES.map(([w, h, r]) => ({
  url: `/splash/${w * r}x${h * r}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));
