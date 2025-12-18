// ==============================
// ПОЛНЫЙ AUTH.JS
// ==============================

// Конфигурация
const AUTH_CONFIG = {
    SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 часа
    ADMIN_HASH: '02424c12a0a3d05358a1bad910cb83af44d14e185870c012ab053f2e7c9f18f0', // sha256('admin')
    GITHUB_OAUTH: {
        clientId: localStorage.getItem('github_client_id') || '',
        redirectUri: `${window.location.origin}/auth-callback.html`,
        scope: 'repo user',
        state: '',
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://api.github.com/login/oauth/access_token'
    },
    PROXY_SERVER: localStorage.getItem('proxy_server_url') || 'https://your-proxy-server.herokuapp.com'
};

// Главный класс системы аутентификации
class AuthSystem {
    constructor() {
        this.session = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        console.log('🔧 Инициализация системы аутентификации...');
        
        // Генерируем state для OAuth
        AUTH_CONFIG.GITHUB_OAUTH.state = this.generateState();
        
        // Обрабатываем OAuth callback если есть
        await this.handleOAuthCallback();
        
        // Восстанавливаем сессию из cookie
        await this.restoreSession();
        
        this.isInitialized = true;
        console.log('✅ Система аутентификации инициализирована');
    }

    // ==============================
    // ОБРАБОТКА OAuth CALLBACK
    // ==============================

    async handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        
        // Если это страница callback и есть код
        if (window.location.pathname.includes('auth-callback.html')) {
            console.log('🔑 Обработка OAuth callback...');
            
            if (error) {
                this.showOAuthError(error, urlParams.get('error_description'));
                return;
            }
            
            if (!code) {
                this.showOAuthError('NO_CODE', 'Authorization code not found');
                return;
            }
            
            // Проверяем state
            if (!this.verifyState(state)) {
                this.showOAuthError('INVALID_STATE', 'Invalid state parameter');
                return;
            }
            
            try {
                // Получаем access token
                const tokenData = await this.exchangeCodeForToken(code);
                
                if (tokenData.access_token) {
                    // Сохраняем токен
                    localStorage.setItem('github_oauth_token', tokenData.access_token);
                    
                    // Получаем информацию о пользователе
                    const userInfo = await this.getGitHubUserInfo(tokenData.access_token);
                    
                    // Создаем сессию
                    this.createSession('user', tokenData.access_token, {
                        github_user: userInfo.login,
                        github_name: userInfo.name || userInfo.login,
                        github_avatar: userInfo.avatar_url,
                        github_id: userInfo.id,
                        scope: tokenData.scope,
                        token_type: tokenData.token_type
                    });
                    
                    // Перенаправляем на dashboard
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1000);
                    
                } else {
                    this.showOAuthError('NO_TOKEN', 'Failed to get access token');
                }
                
            } catch (error) {
                console.error('OAuth callback error:', error);
                this.showOAuthError('EXCHANGE_ERROR', error.message);
            }
        }
    }

    showOAuthError(error, description) {
        const errorMessages = {
            'access_denied': 'Доступ запрещен пользователем',
            'NO_CODE': 'Код авторизации не найден',
            'INVALID_STATE': 'Неверный параметр state',
            'NO_TOKEN': 'Не удалось получить токен доступа',
            'EXCHANGE_ERROR': `Ошибка обмена токена: ${description}`
        };
        
        const message = errorMessages[error] || `Ошибка авторизации: ${error}`;
        
        document.body.innerHTML = `
            <div class="login-container">
                <div class="login-box" style="text-align: center;">
                    <h2 style="color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i> Ошибка авторизации</h2>
                    <p>${message}</p>
                    <button onclick="window.location.href='index.html'" 
                            class="btn-primary" style="margin-top: 20px;">
                        <i class="fas fa-arrow-left"></i> Вернуться на главную
                    </button>
                </div>
            </div>
        `;
    }

    // Генерация state для защиты от CSRF
    generateState() {
        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        sessionStorage.setItem('oauth_state', state);
        return state;
    }

    // Проверка state
    verifyState(state) {
        const savedState = sessionStorage.getItem('oauth_state');
        sessionStorage.removeItem('oauth_state');
        return state === savedState;
    }

    // Обмен authorization code на access token
    async exchangeCodeForToken(code) {
        console.log('🔄 Обмен code на access token...');
        
        // Используем прокси сервер для обхода CORS
        const proxyUrl = `${AUTH_CONFIG.PROXY_SERVER}/api/oauth/token`;
        
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                redirect_uri: AUTH_CONFIG.GITHUB_OAUTH.redirectUri,
                client_id: AUTH_CONFIG.GITHUB_OAUTH.clientId
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to exchange token: ${response.status} - ${errorText}`);
        }
        
        return await response.json();
    }

    // Получение информации о пользователе GitHub
    async getGitHubUserInfo(token) {
        const proxyUrl = `${AUTH_CONFIG.PROXY_SERVER}/api/github/user`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to get user info');
        }
        
        return await response.json();
    }

    // ==============================
    // СЕССИИ И COOKIES
    // ==============================

    // Создание сессии
    createSession(userType, token = '', userData = {}) {
        const sessionData = {
            id: this.generateSessionId(),
            userType: userType,
            token: token,
            userData: userData,
            createdAt: Date.now(),
            expires: Date.now() + AUTH_CONFIG.SESSION_DURATION,
            ip: this.getUserIP(),
            userAgent: navigator.userAgent,
            lastActivity: Date.now()
        };
        
        // Шифруем данные сессии
        const encryptedSession = this.encryptSession(sessionData);
        
        // Сохраняем в cookie
        this.setSessionCookie(encryptedSession);
        
        // Сохраняем в localStorage для быстрого доступа
        localStorage.setItem('current_session', encryptedSession);
        
        // Сохраняем в памяти
        this.session = sessionData;
        
        // Логируем вход
        this.logLogin(userType, sessionData.ip);
        
        console.log(`✅ Создана сессия для: ${userType}`);
        
        return sessionData;
    }

    // Генерация ID сессии
    generateSessionId() {
        return 'session_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Шифрование сессии
    encryptSession(sessionData) {
        try {
            const sessionString = JSON.stringify(sessionData);
            return btoa(unescape(encodeURIComponent(sessionString)));
        } catch (error) {
            console.error('Session encryption error:', error);
            return btoa(JSON.stringify(sessionData));
        }
    }

    // Расшифровка сессии
    decryptSession(encryptedSession) {
        try {
            const sessionString = decodeURIComponent(escape(atob(encryptedSession)));
            return JSON.parse(sessionString);
        } catch (error) {
            console.error('Session decryption error:', error);
            try {
                return JSON.parse(atob(encryptedSession));
            } catch (e) {
                return null;
            }
        }
    }

    // Установка cookie сессии
    setSessionCookie(encryptedSession) {
        const expires = new Date(Date.now() + AUTH_CONFIG.SESSION_DURATION).toUTCString();
        const cookieValue = `aelum_session=${encodeURIComponent(encryptedSession)}; expires=${expires}; path=/; Secure; SameSite=Strict`;
        
        document.cookie = cookieValue;
    }

    // Получение сессии из cookie
    getSessionFromCookie() {
        const cookies = document.cookie.split(';');
        
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith('aelum_session=')) {
                const encryptedSession = decodeURIComponent(cookie.substring('aelum_session='.length));
                return this.decryptSession(encryptedSession);
            }
        }
        
        return null;
    }

    // Восстановление сессии
    async restoreSession() {
        // Пробуем получить из cookie
        let session = this.getSessionFromCookie();
        
        // Если нет в cookie, пробуем localStorage
        if (!session) {
            const encryptedSession = localStorage.getItem('current_session');
            if (encryptedSession) {
                session = this.decryptSession(encryptedSession);
            }
        }
        
        if (session) {
            // Проверяем срок действия
            if (session.expires < Date.now()) {
                console.log('❌ Сессия истекла');
                this.logout();
                return null;
            }
            
            // Проверяем IP если включено в настройках
            if (localStorage.getItem('check_ip') === 'true') {
                const currentIP = await this.getCurrentIP();
                if (session.ip !== currentIP && session.ip !== 'unknown') {
                    console.log('⚠️ IP изменился, завершаем сессию');
                    this.logout();
                    return null;
                }
            }
            
            // Проверяем GitHub токен (если есть)
            if (session.token && session.userType === 'user') {
                const isValid = await this.validateGitHubToken(session.token);
                if (!isValid) {
                    console.log('❌ GitHub токен невалиден');
                    this.logout();
                    return null;
                }
            }
            
            // Обновляем время последней активности
            session.lastActivity = Date.now();
            this.session = session;
            
            // Обновляем cookie
            this.updateSessionActivity();
            
            console.log(`✅ Сессия восстановлена: ${session.userType}`);
            return session;
        }
        
        return null;
    }

    // Проверка сессии
    async verifySession() {
        if (!this.isInitialized) {
            await this.init();
        }
        
        if (!this.session) {
            return null;
        }
        
        // Проверяем время бездействия (30 минут)
        const inactiveTime = Date.now() - this.session.lastActivity;
        const maxInactiveTime = 30 * 60 * 1000; // 30 минут
        
        if (inactiveTime > maxInactiveTime) {
            console.log('❌ Сессия истекла из-за бездействия');
            this.logout();
            return null;
        }
        
        // Обновляем время активности
        this.session.lastActivity = Date.now();
        this.updateSessionActivity();
        
        return this.session;
    }

    // Обновление активности сессии
    updateSessionActivity() {
        if (this.session) {
            this.session.lastActivity = Date.now();
            const encryptedSession = this.encryptSession(this.session);
            this.setSessionCookie(encryptedSession);
            localStorage.setItem('current_session', encryptedSession);
        }
    }

    // ==============================
    // АУТЕНТИФИКАЦИЯ
    // ==============================

    // Вход с мастер-паролем
    async login(masterPassword, githubToken = '') {
        console.log('🔑 Попытка входа с мастер-паролем...');
        
        // Проверяем мастер-пароль
        const passwordHash = await this.hashPassword(masterPassword);
        const storedHash = localStorage.getItem('master_password_hash');
        
        // Первый вход - устанавливаем пароль
        if (!storedHash) {
            localStorage.setItem('master_password_hash', passwordHash);
            
            const session = this.createSession('user', githubToken, {
                first_login: true,
                setup_complete: false
            });
            
            return {
                success: true,
                firstTime: true,
                session: session,
                message: 'Пароль установлен! Настройте подключение к GitHub.'
            };
        }
        
        // Проверка пароля
        if (passwordHash === storedHash) {
            // Проверяем GitHub токен если предоставлен
            if (githubToken) {
                const isValid = await this.validateGitHubToken(githubToken);
                if (!isValid) {
                    return {
                        success: false,
                        message: 'Неверный GitHub токен'
                    };
                }
            }
            
            const session = this.createSession('user', githubToken, {
                first_login: false,
                setup_complete: !!githubToken
            });
            
            return {
                success: true,
                firstTime: false,
                session: session,
                message: 'Успешный вход!'
            };
        }
        
        return {
            success: false,
            message: 'Неверный пароль'
        };
    }

    // Вход администратора
    async adminLogin(password) {
        console.log('👑 Попытка входа администратора...');
        
        const passwordHash = await this.hashPassword(password);
        
        if (passwordHash === AUTH_CONFIG.ADMIN_HASH) {
            const session = this.createSession('admin', '', {
                admin: true,
                permissions: ['all']
            });
            
            // Сохраняем IP администратора
            const adminIP = await this.getCurrentIP();
            localStorage.setItem('admin_ip', adminIP);
            
            return {
                success: true,
                session: session,
                message: 'Вход как администратор выполнен'
            };
        }
        
        return {
            success: false,
            message: 'Неверный админ-пароль'
        };
    }

    // Вход через GitHub OAuth
    async loginWithGitHub() {
        console.log('🐙 Запуск OAuth потока GitHub...');
        
        // Проверяем Client ID
        if (!AUTH_CONFIG.GITHUB_OAUTH.clientId) {
            return {
                success: false,
                message: 'GitHub Client ID не настроен. Пожалуйста, настройте приложение.'
            };
        }
        
        // Запускаем OAuth flow
        const params = new URLSearchParams({
            client_id: AUTH_CONFIG.GITHUB_OAUTH.clientId,
            redirect_uri: AUTH_CONFIG.GITHUB_OAUTH.redirectUri,
            scope: AUTH_CONFIG.GITHUB_OAUTH.scope,
            state: AUTH_CONFIG.GITHUB_OAUTH.state,
            allow_signup: 'true'
        });
        
        const authUrl = `${AUTH_CONFIG.GITHUB_OAUTH.authorizeUrl}?${params.toString()}`;
        window.location.href = authUrl;
        
        return {
            success: true,
            redirecting: true
        };
    }

    // Вход с GitHub PAT токеном
    async loginWithPAT(token) {
        console.log('🔑 Проверка GitHub PAT...');
        
        if (!token) {
            return {
                success: false,
                message: 'Введите GitHub токен'
            };
        }
        
        try {
            // Проверяем токен
            const isValid = await this.validateGitHubToken(token);
            
            if (isValid) {
                // Получаем информацию о пользователе
                const userInfo = await this.getGitHubUserInfo(token);
                
                // Создаем сессию
                const session = this.createSession('user', token, {
                    github_user: userInfo.login,
                    github_name: userInfo.name || userInfo.login,
                    github_avatar: userInfo.avatar_url,
                    github_id: userInfo.id,
                    token_type: 'pat',
                    using_pat: true
                });
                
                // Сохраняем токен
                localStorage.setItem('github_token', token);
                
                return {
                    success: true,
                    session: session,
                    userInfo: userInfo,
                    message: 'Успешный вход с GitHub токеном'
                };
            } else {
                return {
                    success: false,
                    message: 'Неверный GitHub токен'
                };
            }
            
        } catch (error) {
            console.error('PAT login error:', error);
            return {
                success: false,
                message: `Ошибка проверки токена: ${error.message}`
            };
        }
    }

    // Валидация GitHub токена
    async validateGitHubToken(token) {
        try {
            const proxyUrl = `${AUTH_CONFIG.PROXY_SERVER}/api/github/user`;
            const response = await fetch(proxyUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/json'
                }
            });
            
            return response.ok;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }

    // ==============================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ==============================

    // Хеширование пароля
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Получение IP пользователя
    async getCurrentIP() {
        try {
            // Пробуем получить реальный IP
            const response = await fetch('https://api.ipify.org?format=json');
            if (response.ok) {
                const data = await response.json();
                return data.ip;
            }
        } catch (error) {
            console.warn('Failed to get external IP:', error);
        }
        
        // Fallback: используем локальное значение или генерируем
        return localStorage.getItem('user_ip') || 'unknown_' + Math.random().toString(36).substr(2, 9);
    }

    getUserIP() {
        return localStorage.getItem('user_ip') || 'unknown';
    }

    // Логирование входа
    async logLogin(userType, ip = null) {
        const loginLog = {
            timestamp: new Date().toISOString(),
            userType: userType,
            ip: ip || await this.getCurrentIP(),
            userAgent: navigator.userAgent,
            path: window.location.pathname
        };
        
        // Сохраняем в localStorage
        const logs = JSON.parse(localStorage.getItem('login_logs') || '[]');
        logs.unshift(loginLog);
        
        // Ограничиваем количество записей
        if (logs.length > 100) {
            logs.pop();
        }
        
        localStorage.setItem('login_logs', JSON.stringify(logs));
        
        // Сохраняем IP
        if (ip) {
            localStorage.setItem('user_ip', ip);
        }
        
        // Обновляем активных пользователей
        this.updateActiveUsers(loginLog.ip, userType);
    }

    // Обновление списка активных пользователей
    updateActiveUsers(ip, userType) {
        const activeUsers = JSON.parse(localStorage.getItem('active_users') || '{}');
        
        activeUsers[ip] = {
            lastSeen: Date.now(),
            userType: userType,
            userAgent: navigator.userAgent,
            loginTime: new Date().toISOString()
        };
        
        // Очищаем неактивных (более 30 минут)
        Object.keys(activeUsers).forEach(key => {
            if (Date.now() - activeUsers[key].lastSeen > 30 * 60 * 1000) {
                delete activeUsers[key];
            }
        });
        
        localStorage.setItem('active_users', JSON.stringify(activeUsers));
    }

    // Проверка, является ли пользователь администратором
    isAdmin() {
        return this.session && this.session.userType === 'admin';
    }

    // Получение текущего пользователя
    getCurrentUser() {
        return this.session ? {
            type: this.session.userType,
            data: this.session.userData,
            token: this.session.token
        } : null;
    }

    // Получение GitHub токена
    getGitHubToken() {
        if (this.session && this.session.token) {
            return this.session.token;
        }
        
        // Пробуем другие источники
        return (
            localStorage.getItem('github_oauth_token') ||
            localStorage.getItem('github_token') ||
            null
        );
    }

    // Проверка наличия GitHub токена
    hasGitHubToken() {
        return !!this.getGitHubToken();
    }

    // Проверка настроен ли GitHub
    isGitHubConfigured() {
        return this.hasGitHubToken() && localStorage.getItem('github_repo');
    }

    // ==============================
    // ВЫХОД И ОЧИСТКА
    // ==============================

    // Выход из системы
    logout() {
        console.log('👋 Выход из системы...');
        
        // Удаляем сессию из памяти
        this.session = null;
        
        // Удаляем cookie
        document.cookie = 'aelum_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
        
        // Удаляем из localStorage
        localStorage.removeItem('current_session');
        
        // Очищаем активных пользователей для этого IP
        const ip = localStorage.getItem('user_ip');
        if (ip) {
            const activeUsers = JSON.parse(localStorage.getItem('active_users') || '{}');
            delete activeUsers[ip];
            localStorage.setItem('active_users', JSON.stringify(activeUsers));
        }
        
        // Перенаправляем на страницу входа
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    }

    // Принудительный выход всех пользователей (для админа)
    forceLogoutAll() {
        if (!this.isAdmin()) {
            return false;
        }
        
        // Устанавливаем флаг принудительного выхода
        localStorage.setItem('force_logout_all', Date.now().toString());
        
        // Очищаем все сессии
        localStorage.removeItem('current_session');
        localStorage.removeItem('active_users');
        
        // Удаляем cookie у всех (теоретически)
        document.cookie.split(";").forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, "")
                .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        return true;
    }

    // Проверка принудительного выхода
    checkForceLogout() {
        const forceLogoutTime = localStorage.getItem('force_logout_all');
        if (forceLogoutTime) {
            const logoutTime = parseInt(forceLogoutTime);
            const currentTime = Date.now();
            
            // Если флаг установлен менее 5 минут назад
            if (currentTime - logoutTime < 5 * 60 * 1000) {
                this.logout();
                return true;
            } else {
                // Удаляем устаревший флаг
                localStorage.removeItem('force_logout_all');
            }
        }
        
        return false;
    }

    // ==============================
    // НАСТРОЙКИ
    // ==============================

    // Установка Client ID
    setGitHubClientId(clientId) {
        AUTH_CONFIG.GITHUB_OAUTH.clientId = clientId;
        localStorage.setItem('github_client_id', clientId);
        return true;
    }

    // Установка Proxy сервера
    setProxyServer(url) {
        AUTH_CONFIG.PROXY_SERVER = url;
        localStorage.setItem('proxy_server_url', url);
        return true;
    }

    // Получение настроек
    getConfig() {
        return {
            hasClientId: !!AUTH_CONFIG.GITHUB_OAUTH.clientId,
            hasProxy: !!AUTH_CONFIG.PROXY_SERVER && AUTH_CONFIG.PROXY_SERVER !== 'https://your-proxy-server.herokuapp.com',
            proxyUrl: AUTH_CONFIG.PROXY_SERVER,
            redirectUri: AUTH_CONFIG.GITHUB_OAUTH.redirectUri
        };
    }

    // Проверка конфигурации
    checkConfig() {
        const config = this.getConfig();
        
        if (!config.hasClientId) {
            return {
                valid: false,
                message: 'GitHub Client ID не настроен'
            };
        }
        
        if (!config.hasProxy) {
            return {
                valid: false,
                message: 'Proxy сервер не настроен'
            };
        }
        
        return {
            valid: true,
            message: 'Конфигурация в порядке'
        };
    }

    // ==============================
    // СИСТЕМНЫЕ МЕТОДЫ
    // ==============================

    // Проверка доступа к странице
    async requireAuth(requireAdmin = false) {
        const session = await this.verifySession();
        
        if (!session) {
            window.location.href = 'index.html';
            return false;
        }
        
        if (requireAdmin && session.userType !== 'admin') {
            window.location.href = 'dashboard.html';
            return false;
        }
        
        // Проверяем заблокированные IP
        const bannedIPs = JSON.parse(localStorage.getItem('banned_ips') || '[]');
        const currentIP = await this.getCurrentIP();
        
        if (bannedIPs.includes(currentIP)) {
            alert('🚫 Ваш IP адрес заблокирован администратором.');
            this.logout();
            return false;
        }
        
        // Проверяем принудительный выход
        if (this.checkForceLogout()) {
            return false;
        }
        
        return true;
    }

    // Защита маршрутов
    setupRouteProtection() {
        // Только для страниц, которые требуют аутентификации
        const protectedPages = ['dashboard.html', 'admin.html', 'editor.html'];
        const currentPage = window.location.pathname.split('/').pop();
        
        if (protectedPages.includes(currentPage)) {
            document.addEventListener('DOMContentLoaded', async () => {
                const isAuthenticated = await this.requireAuth(currentPage === 'admin.html');
                if (!isAuthenticated) {
                    return;
                }
            });
        }
    }

    // Инициализация на каждой странице
    setupPageAuth() {
        // Проверяем, не на странице ли логина
        if (!window.location.pathname.includes('index.html') && 
            !window.location.pathname.includes('auth-callback.html')) {
            
            // Проверяем аутентификацию
            this.requireAuth(window.location.pathname.includes('admin.html'));
        }
    }
}

// ==============================
// ГЛОБАЛЬНЫЙ ЭКЗЕМПЛЯР И ФУНКЦИИ
// ==============================

// Создаем глобальный экземпляр
const auth = new AuthSystem();

// Функции для использования в HTML
async function login() {
    const masterPassword = document.getElementById('masterPassword').value;
    const githubToken = document.getElementById('githubToken') ? 
        document.getElementById('githubToken').value : '';
    
    if (!masterPassword) {
        showStatus('Введите мастер-пароль', 'error');
        return;
    }
    
    const result = await auth.login(masterPassword, githubToken);
    
    if (result.success) {
        showStatus(result.message, 'success');
        
        if (result.firstTime) {
            // Первый вход - показываем настройки
            setTimeout(() => {
                window.location.href = 'setup.html';
            }, 1500);
        } else {
            // Обычный вход
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        }
    } else {
        showStatus(result.message, 'error');
    }
}

async function adminLogin() {
    const adminPassword = document.getElementById('adminPassword').value;
    
    if (!adminPassword) {
        showStatus('Введите админ-пароль', 'error');
        return;
    }
    
    const result = await auth.adminLogin(adminPassword);
    
    if (result.success) {
        showStatus('Вход как администратор выполнен', 'success');
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
    } else {
        showStatus(result.message, 'error');
    }
}

function loginWithGitHub() {
    auth.loginWithGitHub();
}

async function loginWithPAT() {
    const token = document.getElementById('patToken').value;
    const result = await auth.loginWithPAT(token);
    
    if (result.success) {
        showStatus('Успешный вход с GitHub токеном', 'success');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
    } else {
        showStatus(result.message, 'error');
    }
}

function showAdminLogin() {
    document.getElementById('adminLogin').style.display = 'block';
}

function showPATLogin() {
    document.getElementById('patLogin').style.display = 'block';
}

function logout() {
    auth.logout();
}

function showStatus(message, type) {
    const statusEl = document.getElementById('loginStatus') || 
                     document.getElementById('status') ||
                     document.getElementById('authStatus');
    
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="status ${type}">
                ${message}
            </div>
        `;
        
        // Автоскрытие через 5 секунд
        setTimeout(() => {
            if (statusEl.innerHTML.includes(message)) {
                statusEl.innerHTML = '';
            }
        }, 5000);
    } else {
        // Создаем временный элемент
        const tempStatus = document.createElement('div');
        tempStatus.className = `status ${type}`;
        tempStatus.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        tempStatus.textContent = message;
        document.body.appendChild(tempStatus);
        
        setTimeout(() => {
            tempStatus.remove();
        }, 5000);
    }
}

// ==============================
// ИНИЦИАЛИЗАЦИЯ
// ==============================

// Автоматическая настройка защиты маршрутов
document.addEventListener('DOMContentLoaded', () => {
    auth.setupPageAuth();
});

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthSystem, auth };
}
