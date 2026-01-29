const CACHE_NAME = 'contabil-app-v6';
const ASSETS = [
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Força o novo Service Worker a entrar em ação imediatamente
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Limpa caches antigos quando a nova versão ativa
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

// --- NOTIFICAÇÕES EM SEGUNDO PLANO (BACKGROUND SYNC) ---

// 1. Recebe o usuário logado da página principal e salva no cache
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_USER') {
    const user = event.data.user;
    caches.open('config-cache').then(cache => {
      cache.put('/user-config', new Response(JSON.stringify({ user })));
    });
  }
});

// 2. Evento disparado pelo navegador periodicamente (Android/Chrome)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-bills') {
    event.waitUntil(checkBillsInBackground());
  }
});

async function checkBillsInBackground() {
  try {
    // Recupera o usuário salvo
    const cache = await caches.open('config-cache');
    const resp = await cache.match('/user-config');
    if (!resp) return;
    const { user } = await resp.json();
    if (!user) return;

    // Consulta o Firebase via API REST (mais leve para o SW)
    const url = `https://site-contabil-7396e-default-rtdb.firebaseio.com/expenses/${user}.json`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data) return;
    
    const expenses = Object.values(data);
    const today = new Date().toISOString().split('T')[0];
    
    const overdue = expenses.filter(e => e.status !== 'paid' && e.date < today);
    const dueToday = expenses.filter(e => e.status !== 'paid' && e.date === today);
    
    let title = '';
    let body = '';
    
    if (overdue.length > 0) {
        title = "⚠️ Contas Atrasadas!";
        body = `Você tem ${overdue.length} conta(s) atrasada(s).`;
    } else if (dueToday.length > 0) {
        title = "📅 Vence Hoje!";
        body = `Você tem ${dueToday.length} conta(s) para hoje.`;
    }
    
    if (title) {
        self.registration.showNotification(title, {
            body: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/2344/2344147.png',
            tag: 'bills-notification'
        });
    }
  } catch (e) {
    console.error('Background check failed:', e);
  }
}