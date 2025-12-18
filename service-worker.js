// Service Worker для защиты маршрутов
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Защищенные маршруты
    const protectedPaths = ['/dashboard.html', '/admin.html', '/editor.html'];
    const isProtected = protectedPaths.some(path => url.pathname.endsWith(path));
    
    if (isProtected) {
        // Проверяем сессию через IndexedDB или сообщение
        event.respondWith(
            checkSession().then(hasSession => {
                if (!hasSession) {
                    // Возвращаем страницу логина
                    return caches.match('/index.html').then(response => {
                        return response || fetch('/index.html');
                    });
                }
                return fetch(event.request);
            })
        );
    }
});

async function checkSession() {
    // Проверяем сессию через клиентское API
    return new Promise((resolve) => {
        // Используем BroadcastChannel для связи с клиентом
        const channel = new BroadcastChannel('session-channel');
        
        // Отправляем запрос на проверку сессии
        channel.postMessage({ type: 'CHECK_SESSION' });
        
        // Ждем ответа
        const timeout = setTimeout(() => resolve(false), 1000);
        
        channel.onmessage = (event) => {
            if (event.data.type === 'SESSION_STATUS') {
                clearTimeout(timeout);
                resolve(event.data.hasSession);
            }
        };
    });
}
