const CACHE_NAME = 'mh-editor-pro-v3'; // تغيير الاسم لإجبار المتصفح على تحديث الكاش
const ASSETS = [
    './',
    './index.html',
    './student.html',
    './style.css',
    './script.js',
    './main.js',
    './icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // نستخدم catch لتجاهل أي ملف غير موجود بدلاً من تعطيل الكاش بالكامل
            return Promise.allSettled(
                ASSETS.map(url => cache.add(url).catch(err => console.warn(`فشل كاش الملف: ${url}`, err)))
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // 🛑 الدرع الواقي لفايربيز: منع كاش روابط قاعدة البيانات والمصادقة
    if (event.request.url.includes('firestore.googleapis.com') || 
        event.request.url.includes('firebaseio.com') || 
        event.request.url.includes('identitytoolkit') ||
        event.request.method !== 'GET') {
        return; // اترك الطلب يمر للإنترنت والسيرفر مباشرة
    }

    // للملفات العادية (HTML, CSS, JS): حاول جلبها من الكاش، وإلا جلبها من الإنترنت
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});