self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
  // هنا يمكننا لاحقاً إضافة كود للتخزين المؤقت ليعمل التطبيق بدون إنترنت كلياً
});