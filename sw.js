const CACHE_NAME = 'cryptid-pwa-v2';

const CORE_PRECACHE_URLS = [
  './',
  './index.html',
  './cryptid.css',
  './w3.css',
  './lang_settings.js',
  './manifest.webmanifest',
  './img/favicon.png',
  './img/apple-touch-icon.png',
  './img/Cryptid_devil.png',
  './img/Cryptid_Title.png',
  './js/lib/jquery-3.3.1.min.js',
  './js/lib/howler.min.js',
  './js/lib/js.cookies.js',
  './js/namespace.js',
  './js/i18n.js',
  './js/errors.js',
  './js/mapData.js',
  './js/mapRenderer.js',
  './js/settings.js',
  './js/sound.js',
  './js/tutorial.js',
  './js/gameGenerator.js',
  './js/gameStore.js',
  './js/game.js',
  './js/sharing.js',
  './js/app.js'
];

const PRECACHE_URLS = [
  './',
  './cryptid.css',
  './img/apple-touch-icon.png',
  './img/art_tiles/desktop/0.png',
  './img/art_tiles/desktop/1.png',
  './img/art_tiles/desktop/10.png',
  './img/art_tiles/desktop/11.png',
  './img/art_tiles/desktop/2.png',
  './img/art_tiles/desktop/3.png',
  './img/art_tiles/desktop/4.png',
  './img/art_tiles/desktop/5.png',
  './img/art_tiles/desktop/6.png',
  './img/art_tiles/desktop/7.png',
  './img/art_tiles/desktop/8.png',
  './img/art_tiles/desktop/9.png',
  './img/art_tiles/desktop/mask.png',
  './img/art_tiles/desktop/p1.png',
  './img/art_tiles/desktop/p2.png',
  './img/art_tiles/desktop/p3.png',
  './img/art_tiles/desktop/p4.png',
  './img/art_tiles/desktop/s1.png',
  './img/art_tiles/desktop/s2.png',
  './img/art_tiles/desktop/s3.png',
  './img/art_tiles/desktop/s4.png',
  './img/art_tiles/desktop/target.png',
  './img/art_tiles/mobile/0.png',
  './img/art_tiles/mobile/1.png',
  './img/art_tiles/mobile/10.png',
  './img/art_tiles/mobile/11.png',
  './img/art_tiles/mobile/2.png',
  './img/art_tiles/mobile/3.png',
  './img/art_tiles/mobile/4.png',
  './img/art_tiles/mobile/5.png',
  './img/art_tiles/mobile/6.png',
  './img/art_tiles/mobile/7.png',
  './img/art_tiles/mobile/8.png',
  './img/art_tiles/mobile/9.png',
  './img/art_tiles/mobile/mask.png',
  './img/art_tiles/mobile/p1.png',
  './img/art_tiles/mobile/p2.png',
  './img/art_tiles/mobile/p3.png',
  './img/art_tiles/mobile/p4.png',
  './img/art_tiles/mobile/s1.png',
  './img/art_tiles/mobile/s2.png',
  './img/art_tiles/mobile/s3.png',
  './img/art_tiles/mobile/s4.png',
  './img/art_tiles/mobile/target.png',
  './img/art_tiles/solo-mobile/0.png',
  './img/art_tiles/solo-mobile/1.png',
  './img/art_tiles/solo-mobile/10.png',
  './img/art_tiles/solo-mobile/11.png',
  './img/art_tiles/solo-mobile/2.png',
  './img/art_tiles/solo-mobile/3.png',
  './img/art_tiles/solo-mobile/4.png',
  './img/art_tiles/solo-mobile/5.png',
  './img/art_tiles/solo-mobile/6.png',
  './img/art_tiles/solo-mobile/7.png',
  './img/art_tiles/solo-mobile/8.png',
  './img/art_tiles/solo-mobile/9.png',
  './img/art_tiles/tablet/0.png',
  './img/art_tiles/tablet/1.png',
  './img/art_tiles/tablet/10.png',
  './img/art_tiles/tablet/11.png',
  './img/art_tiles/tablet/2.png',
  './img/art_tiles/tablet/3.png',
  './img/art_tiles/tablet/4.png',
  './img/art_tiles/tablet/5.png',
  './img/art_tiles/tablet/6.png',
  './img/art_tiles/tablet/7.png',
  './img/art_tiles/tablet/8.png',
  './img/art_tiles/tablet/9.png',
  './img/art_tiles/tablet/mask.png',
  './img/art_tiles/tablet/p1.png',
  './img/art_tiles/tablet/p2.png',
  './img/art_tiles/tablet/p3.png',
  './img/art_tiles/tablet/p4.png',
  './img/art_tiles/tablet/s1.png',
  './img/art_tiles/tablet/s2.png',
  './img/art_tiles/tablet/s3.png',
  './img/art_tiles/tablet/s4.png',
  './img/art_tiles/tablet/target.png',
  './img/bgm25.png',
  './img/bgmsmall.png',
  './img/Cryptid_devil.png',
  './img/Cryptid_foliage.png',
  './img/Cryptid_house.png',
  './img/Cryptid_Title.png',
  './img/favicon.png',
  './img/flags/en.png',
  './img/flags/es.png',
  './img/flags/fi.png',
  './img/flags/fr.png',
  './img/flags/hu.png',
  './img/flags/it.png',
  './img/flags/ja.png',
  './img/flags/pl.png',
  './img/help.png',
  './img/icons/icon-128.png',
  './img/icons/icon-144.png',
  './img/icons/icon-152.png',
  './img/icons/icon-180.png',
  './img/icons/icon-192.png',
  './img/icons/icon-384.png',
  './img/icons/icon-512.png',
  './img/icons/icon-72.png',
  './img/icons/icon-96.png',
  './img/icons/maskable-192.png',
  './img/icons/maskable-512.png',
  './img/logos/en.large.png',
  './img/logos/en.small.png',
  './img/logos/es.large.png',
  './img/logos/es.small.png',
  './img/logos/fi.large.png',
  './img/logos/fi.small.png',
  './img/logos/fr.large.png',
  './img/logos/fr.small.png',
  './img/logos/hu.large.png',
  './img/logos/hu.small.png',
  './img/logos/it.large.png',
  './img/logos/it.small.png',
  './img/logos/ja.large.png',
  './img/logos/ja.small.png',
  './img/logos/pl.large.png',
  './img/logos/pl.small.png',
  './img/sfx.png',
  './index.html',
  './js/app.js',
  './js/errors.js',
  './js/game.js',
  './js/gameGenerator.js',
  './js/gameStore.js',
  './js/i18n.js',
  './js/lib/howler.min.js',
  './js/lib/jquery-3.3.1.min.js',
  './js/lib/js.cookies.js',
  './js/mapData.js',
  './js/mapRenderer.js',
  './js/namespace.js',
  './js/settings.js',
  './js/sharing.js',
  './js/sound.js',
  './js/tutorial.js',
  './lang_settings.js',
  './manifest.webmanifest',
  './rules/cryptid-deduction-sheet.pdf',
  './rules/cryptid-paattymislomake-fi.pdf',
  './rules/cryptid-paattymislomake-normaali-fi.pdf',
  './rules/cryptid-rulebook-english.pdf',
  './snd/button.mp3',
  './snd/click.mp3',
  './snd/music.mp3',
  './snd/start.mp3',
  './snd/twigs.mp3',
  './w3.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const cleanup = caches.keys()
    .then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
    .then(() => self.clients.claim());

  event.waitUntil(
    cleanup
  );

  cleanup.then(() => warmFullCache());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request, { ignoreSearch: true })) || cache.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

async function warmFullCache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(
    PRECACHE_URLS.map((url) => cache.add(url))
  );
}
