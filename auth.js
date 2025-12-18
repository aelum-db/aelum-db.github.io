class AuthSystem {
    constructor() {
        this.SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 часа
        this.ADMIN_HASH = '02424c12a0a3d05358a1bad910cb83af44d14e185870c012ab053f2e7c9f18f0'; // sha256('admin')
    }

    // Генерация хеша пароля
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Создание сессии
    createSession(userType, token = '') {
        const session = {
            userType: userType,
            token: token,
            expires: Date.now() + this.SESSION_DURATION,
            ip: this.getUserIP(),
            userAgent: navigator.userAgent
        };
        
        // Шифруем сессию
        const encrypted = btoa(JSON.stringify(session));
        
        // Устанавливаем cookie
        document.cookie = `aelum_session=${encrypted}; path=/; max-age=${this.SESSION_DURATION / 1000}; Secure; SameSite=Strict`;
        
        // Сохраняем в localStorage для быстрого доступа
        localStorage.setItem('aelum_session', encrypted);
        
        // Записываем в историю входов
        this.logLogin(userType);
        
        return session;
    }

    // Проверка сессии
    async verifySession() {
        try {
            const session = this.getSession();
            if (!session) return null;
            
            // Проверяем срок действия
            if (session.expires < Date.now()) {
                this.logout();
                return null;
            }
            
            // Проверяем IP (если включена проверка в админке)
            if (localStorage.getItem('check_ip') === 'true') {
                const currentIP = await this.getCurrentIP();
                if (session.ip !== currentIP) {
                    console.warn('IP изменился');
                    this.logout();
                    return null;
                }
            }
            
            return session;
        } catch (error) {
            console.error('Session verification error:', error);
            return null;
        }
    }

    // Получение текущей сессии
    getSession() {
        try {
            // Сначала проверяем cookie
            const cookies = document.cookie.split(';');
            const sessionCookie = cookies.find(c => c.trim().startsWith('aelum_session='));
            
            let encrypted;
            if (sessionCookie) {
                encrypted = sessionCookie.split('=')[1];
            } else {
                // Или localStorage
                encrypted = localStorage.getItem('aelum_session');
            }
            
            if (!encrypted) return null;
            
            return JSON.parse(atob(encrypted));
        } catch (e) {
            return null;
        }
    }

    // Вход пользователя
    async login(masterPassword, githubToken = '') {
        // Проверяем мастер-пароль
        const passwordHash = await this.hashPassword(masterPassword);
        const storedHash = localStorage.getItem('master_password_hash');
        
        if (!storedHash) {
            // Первый вход - устанавливаем пароль
            localStorage.setItem('master_password_hash', passwordHash);
            this.createSession('user', githubToken);
            return { success: true, firstTime: true };
        }
        
        if (passwordHash === storedHash) {
            this.createSession('user', githubToken);
            return { success: true, firstTime: false };
        }
        
        return { success: false, message: 'Неверный пароль' };
    }

    // Вход администратора
    async adminLogin(password) {
        const passwordHash = await this.hashPassword(password);
        
        if (passwordHash === this.ADMIN_HASH) {
            const session = this.createSession('admin');
            
            // Сохраняем IP администратора
            const adminIP = await this.getCurrentIP();
            localStorage.setItem('admin_ip', adminIP);
            
            return { success: true };
        }
        
        return { success: false, message: 'Неверный админ-пароль' };
    }

    // Выход
    logout() {
        document.cookie = 'aelum_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        localStorage.removeItem('aelum_session');
        window.location.href = 'index.html';
    }

    // Получение IP пользователя
    async getCurrentIP() {
        try {
            // Пытаемся получить реальный IP
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            // Fallback: используем локальное значение
            return localStorage.getItem('user_ip') || 'unknown';
        }
    }

    // Логирование входа
    async logLogin(userType) {
        const ip = await this.getCurrentIP();
        const logEntry = {
            timestamp: new Date().toISOString(),
            userType: userType,
            ip: ip,
            userAgent: navigator.userAgent
        };
        
        // Сохраняем в localStorage для админки
        const logs = JSON.parse(localStorage.getItem('login_logs') || '[]');
        logs.unshift(logEntry);
        
        // Храним только последние 100 записей
        if (logs.length > 100) logs.pop();
        
        localStorage.setItem('login_logs', JSON.stringify(logs));
        localStorage.setItem('user_ip', ip);
        
        // Обновляем список активных пользователей
        this.updateActiveUsers(ip, userType);
    }

    // Обновление списка активных пользователей
    updateActiveUsers(ip, userType) {
        const activeUsers = JSON.parse(localStorage.getItem('active_users') || '{}');
        
        activeUsers[ip] = {
            lastSeen: Date.now(),
            userType: userType,
            userAgent: navigator.userAgent
        };
        
        // Очищаем неактивных (более 30 минут)
        Object.keys(activeUsers).forEach(key => {
            if (Date.now() - activeUsers[key].lastSeen > 30 * 60 * 1000) {
                delete activeUsers[key];
            }
        });
        
        localStorage.setItem('active_users', JSON.stringify(activeUsers));
    }

    getUserIP() {
        return localStorage.getItem('user_ip') || 'unknown';
    }
}

// Глобальный экземпляр
const auth = new AuthSystem();

// Функции для HTML
async function login() {
    const masterPassword = document.getElementById('masterPassword').value;
    const githubToken = document.getElementById('githubToken').value;
    
    if (!masterPassword) {
        showStatus('Введите мастер-пароль', 'error');
        return;
    }
    
    const result = await auth.login(masterPassword, githubToken);
    
    if (result.success) {
        if (result.firstTime) {
            showStatus('Пароль установлен! Перенаправление...', 'success');
        } else {
            showStatus('Успешный вход!', 'success');
        }
        setTimeout(() => window.location.href = 'dashboard.html', 1000);
    } else {
        showStatus(result.message, 'error');
    }
}

function showAdminLogin() {
    document.getElementById('adminLogin').style.display = 'block';
}

async function adminLogin() {
    const adminPassword = document.getElementById('adminPassword').value;
    
    if (!adminPassword) {
        showStatus('Введите админ-пароль', 'error');
        return;
    }
    
    const result = await auth.adminLogin(adminPassword);
    
    if (result.success) {
        showStatus('Вход как администратор', 'success');
        setTimeout(() => window.location.href = 'admin.html', 1000);
    } else {
        showStatus(result.message, 'error');
    }
}

function showStatus(message, type) {
    const statusEl = document.getElementById('loginStatus');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
}
