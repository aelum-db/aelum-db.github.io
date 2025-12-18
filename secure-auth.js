// Улучшенная система защиты с мгновенной проверкой
class SecureAuth {
    constructor() {
        this.protectedPages = ['dashboard', 'admin', 'editor'];
        this.currentPage = this.getCurrentPage();
        
        // Немедленная проверка при создании экземпляра
        this.immediateCheck();
    }
    
    getCurrentPage() {
        const path = window.location.pathname;
        return path.split('/').pop().replace('.html', '');
    }
    
    immediateCheck() {
        // Если это защищенная страница, проверяем немедленно
        if (this.protectedPages.includes(this.currentPage)) {
            if (!this.hasValidSession()) {
                this.redirectToLogin();
            }
        }
    }
    
    hasValidSession() {
        // Проверяем несколькими способами
        
        // 1. Проверка cookie
        const hasCookie = this.checkCookieSession();
        
        // 2. Проверка localStorage
        const hasLocalStorage = this.checkLocalStorageSession();
        
        // 3. Проверка sessionStorage
        const hasSessionStorage = this.checkSessionStorage();
        
        return hasCookie || hasLocalStorage || hasSessionStorage;
    }
    
    checkCookieSession() {
        const cookies = document.cookie.split(';');
        return cookies.some(cookie => {
            cookie = cookie.trim();
            return cookie.startsWith('aelum_session=') || 
                   cookie.startsWith('aelum_token=') ||
                   cookie.startsWith('github_token=');
        });
    }
    
    checkLocalStorageSession() {
        const sessionKeys = [
            'current_session',
            'github_oauth_token',
            'github_token',
            'aelum_session'
        ];
        
        return sessionKeys.some(key => {
            const value = localStorage.getItem(key);
            if (!value) return false;
            
            // Проверяем срок действия
            try {
                if (key === 'current_session') {
                    const session = JSON.parse(atob(value));
                    return session.expires > Date.now();
                }
                return true;
            } catch {
                return false;
            }
        });
    }
    
    checkSessionStorage() {
        return !!sessionStorage.getItem('authenticated');
    }
    
    redirectToLogin() {
        // Сохраняем текущий URL для возврата после логина
        sessionStorage.setItem('redirect_url', window.location.href);
        
        // Немедленный редирект
        window.location.replace('index.html');
        
        // Блокируем дальнейшее выполнение
        throw new Error('Authentication required');
    }
    
    // Метод для установки сессии
    setSession(token, expiresInHours = 24) {
        // Устанавливаем во всех хранилищах
        
        // 1. Cookie
        const expires = new Date();
        expires.setTime(expires.getTime() + (expiresInHours * 60 * 60 * 1000));
        document.cookie = `aelum_session=${token}; expires=${expires.toUTCString()}; path=/; Secure; SameSite=Strict`;
        
        // 2. localStorage
        const sessionData = {
            token: token,
            expires: expires.getTime(),
            timestamp: Date.now()
        };
        localStorage.setItem('current_session', btoa(JSON.stringify(sessionData)));
        
        // 3. sessionStorage
        sessionStorage.setItem('authenticated', 'true');
        
        // 4. Дополнительная защита
        this.setupAutoRefresh();
    }
    
    setupAutoRefresh() {
        // Обновляем сессию каждые 5 минут
        setInterval(() => {
            if (this.hasValidSession()) {
                // Продлеваем сессию
                this.refreshSession();
            }
        }, 5 * 60 * 1000);
    }
    
    refreshSession() {
        const session = localStorage.getItem('current_session');
        if (session) {
            try {
                const sessionData = JSON.parse(atob(session));
                sessionData.expires = Date.now() + (24 * 60 * 60 * 1000);
                localStorage.setItem('current_session', btoa(JSON.stringify(sessionData)));
                
                // Обновляем cookie
                const expires = new Date(sessionData.expires);
                document.cookie = `aelum_session=refreshed; expires=${expires.toUTCString()}; path=/`;
            } catch (error) {
                console.error('Session refresh error:', error);
            }
        }
    }
    
    // Проверка при каждом действии пользователя
    setupActivityMonitor() {
        const events = ['click', 'keypress', 'mousemove', 'scroll'];
        
        events.forEach(event => {
            document.addEventListener(event, () => {
                if (!this.hasValidSession()) {
                    this.redirectToLogin();
                }
            }, { once: true });
        });
        
        // Проверка каждые 30 секунд
        setInterval(() => {
            if (!this.hasValidSession()) {
                this.redirectToLogin();
            }
        }, 30000);
    }
}

// Немедленная инициализация при загрузке страницы
window.secureAuth = new SecureAuth();
