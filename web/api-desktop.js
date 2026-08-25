// Obal nad Pythonem. Existuje jen proto, aby si app.js mohl vybrat backend
// a nemusel vědět, který zrovna běží.
export function desktopBackend() {
  const api = () => window.pywebview.api;
  return {
    zaklad: () => api().zaklad(),
    prochazet: (pole) => api().prochazet(pole),
    zkontrolovat: (pdf, xlsx) => api().zkontrolovat(pdf, xlsx),
    ulozit: () => api().ulozit(),
    uloz_rezim: (tmavy) => api().uloz_rezim(tmavy),
  };
}
