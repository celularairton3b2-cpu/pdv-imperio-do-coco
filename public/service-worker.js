// Service worker do "Coco da Praia"
// Faz cache dos arquivos do app (HTML/CSS/JS/ícones) para abrir rápido e
// funcionar mesmo com internet fraca na praia. Os dados (clientes, entregas,
// pagamentos) ficam no Firestore, que tem cache/offline próprio.

const CACHE_NAME = "coco-da-praia-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/app.js",
  "./js/auth.js",
  "./manifest.json",
  "./img/logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Estratégia: "network first" para HTML/JS (pega sempre a versão mais nova
// quando há internet) e "cache first" para o resto (ícones etc.).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Nunca interceptar chamadas ao Firebase/Firestore/Google - deixar a
  // própria lib do Firebase cuidar disso.
  if (req.url.includes("googleapis.com") || req.url.includes("firebaseio.com") || req.url.includes("firestore")) {
    return;
  }

  const isAppFile = req.destination === "document" || req.destination === "script" || req.destination === "style";

  if (isAppFile) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
