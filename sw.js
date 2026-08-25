// ========================================================
// 🌐 نظام M&H Offline (Service Worker)
// ========================================================

const CACHE_NAME = 'mh-editor-cache-v2';

// الملفات المحلية الأساسية التي يجب حفظها ليعمل الموقع بدون إنترنت
const LOCAL_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/main.js',
    '/icon.png',
    '/manifest.json'
];

// روابط المكتبات الخارجية (CDNs) التي يحتاجها الموقع
const EXTERNAL_CDNS = [
    'https://fonts.googleapis.com/',
    'https://fonts.gstatic.com/',
    'https://unpkg.com/boxicons@2.1.4/',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/polyfill/3.104.0/polyfill.min.js',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

// 1. تنصيب الـ Service Worker وتخزين الملفات
self.addEventListener('install', (event) => {
    self.skipWaiting(); // تفعيل التحديث فوراً
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('✅ جاري تخزين ملفات M&H للعمل بدون إنترنت...');
            return cache.addAll(LOCAL_ASSETS);
        })
    );
});

// 2. تفعيل وتنظيف الكاش القديم
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('🗑️ تنظيف كاش قديم:', name);
                        return caches.delete(name);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. استراتيجية جلب الملفات (Fetch Strategy)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // تجاهل طلبات قاعدة البيانات (Firebase) والـ APIs الخارجية لأنها تحتاج إنترنت حي
    if (url.hostname.includes('firestore.googleapis.com') || 
        url.hostname.includes('api.imgbb.com') || 
        url.hostname.includes('pythonanywhere.com')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // إذا وجد الملف في الكاش (سواء محلي أو CDN)، قم بإرجاعه فوراً لتسريع الموقع
            if (cachedResponse) {
                return cachedResponse;
            }

            // إذا لم يجده، قم بجلبه من الإنترنت ثم احفظه في الكاش للمرة القادمة
            return fetch(event.request).then((networkResponse) => {
                // التأكد من أن الرد سليم وأنه ليس طلب API أو Extension
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                    return networkResponse;
                }

                // تخزين الرد في الكاش
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // ماذا نفعل إذا انقطع الإنترنت ولم يكن الملف في الكاش؟
                console.log('⚠️ انقطع الإنترنت والملف غير مخزن في الكاش.');
            });
        })
    );
});
