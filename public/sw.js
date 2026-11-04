// Service worker: deixa o app instalável, abre a tela mesmo sem rede e mostra as notificações.
const CACHE = 'voos-v2';
const ARQUIVOS = ['/', '/index.html', '/estilo.css', '/app.js', '/painel.js', '/valor.js', '/aviao.svg', '/icone-192.png', '/login.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Tela: tenta a rede primeiro (sempre a versão nova) e usa o cache se estiver sem conexão.
// A API nunca vem do cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((resposta) => {
        const copia = resposta.clone();
        if (resposta.ok) caches.open(CACHE).then((c) => c.put(e.request, copia));
        return resposta;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
  );
});

self.addEventListener('push', (e) => {
  let dados = {};
  try { dados = e.data.json(); } catch { dados = { titulo: 'Voos', texto: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(dados.titulo || 'Voos', {
    body: dados.texto || '',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: dados.id,
    data: { link: dados.link || '/#avisos' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data?.link || '/#avisos';
  // Links externos (site da companhia) abrem direto; internos reaproveitam a janela do app.
  e.waitUntil((async () => {
    const destino = new URL(link, location.origin);
    if (destino.origin === location.origin) {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const janela = janelas.find((j) => new URL(j.url).origin === location.origin);
      if (janela) { await janela.navigate(destino.href).catch(() => {}); return janela.focus(); }
    }
    return self.clients.openWindow(destino.href);
  })());
});
