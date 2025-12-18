class AdminPanel {
    constructor() {
        this.bannedIPs = JSON.parse(localStorage.getItem('banned_ips') || '[]');
        this.init();
    }

    async init() {
        // Проверяем права администратора
        const session = auth.getSession();
        if (!session || session.userType !== 'admin') {
            window.location.href = 'index.html';
            return;
        }

        this.loadStats();
        this.loadActiveUsers();
        this.loadBannedIPs();
        this.loadLoginLogs();
        this.loadSettings();
    }

    // Загрузка статистики
    loadStats() {
        // Активные пользователи
        const activeUsers = JSON.parse(localStorage.getItem('active_users') || '{}');
        document.getElementById('activeNow').textContent = Object.keys(activeUsers).length;
        
        // Все пользователи (из логов)
        const logs = JSON.parse(localStorage.getItem('login_logs') || '[]');
        const uniqueUsers = new Set(logs.map(log => log.ip));
        document.getElementById('totalUsers').textContent = uniqueUsers.size;
        
        // Заблокированные IP
        document.getElementById('bannedIPs').textContent = this.bannedIPs.length;
        
        // Файлы (нужно реализовать подсчет из GitHub)
        this.loadFileCount();
    }

    // Загрузка активных пользователей
    loadActiveUsers() {
        const activeUsers = JSON.parse(localStorage.getItem('active_users') || '{}');
        const container = document.getElementById('activeUsersList');
        container.innerHTML = '';
        
        Object.entries(activeUsers).forEach(([ip, data]) => {
            const div = document.createElement('div');
            div.className = 'ip-item';
            div.innerHTML = `
                <div>
                    <strong class="log-ip">${ip}</strong><br>
                    <small>${data.userType} • ${this.timeAgo(data.lastSeen)}</small>
                </div>
                <div>
                    <button onclick="admin.kickUser('${ip}')" class="btn-secondary" style="padding: 5px 10px; font-size: 12px;">
                        <i class="fas fa-user-slash"></i>
                    </button>
                    ${!this.bannedIPs.includes(ip) ? `
                    <button onclick="admin.banUser('${ip}')" class="btn-danger" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;">
                        <i class="fas fa-ban"></i>
                    </button>
                    ` : ''}
                </div>
            `;
            container.appendChild(div);
        });
        
        if (Object.keys(activeUsers).length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Нет активных пользователей</p>';
        }
    }

    // Загрузка заблокированных IP
    loadBannedIPs() {
        const container = document.getElementById('bannedIPsList');
        container.innerHTML = '';
        
        this.bannedIPs.forEach(ip => {
            const div = document.createElement('div');
            div.className = 'ip-item banned';
            div.innerHTML = `
                <div>
                    <strong>${ip}</strong><br>
                    <small>Заблокирован</small>
                </div>
                <div>
                    <button onclick="admin.unbanIP('${ip}')" class="btn-secondary" style="padding: 5px 10px; font-size: 12px;">
                        <i class="fas fa-unlock"></i> Разблокировать
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
        
        if (this.bannedIPs.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Нет заблокированных IP</p>';
        }
    }

    // Загрузка логов входа
    loadLoginLogs() {
        const logs = JSON.parse(localStorage.getItem('login_logs') || '[]');
        const container = document.getElementById('loginLogs');
        container.innerHTML = '';
        
        logs.slice(0, 50).forEach(log => {
            const div = document.createElement('div');
            div.className = 'log-entry';
            div.innerHTML = `
                <span class="timestamp">${new Date(log.timestamp).toLocaleString()}</span>
                • <span class="log-ip">${log.ip}</span>
                • <span class="${log.userType === 'admin' ? 'log-admin' : 'log-user'}">
                    ${log.userType === 'admin' ? '👑 Админ' : '👤 Пользователь'}
                </span>
                • <small>${log.userAgent.substring(0, 50)}...</small>
            `;
            container.appendChild(div);
        });
    }

    // Загрузка настроек
    loadSettings() {
        document.getElementById('checkIP').checked = localStorage.getItem('check_ip') === 'true';
        document.getElementById('requireToken').checked = localStorage.getItem('require_token') === 'true';
        document.getElementById('detailedLog').checked = localStorage.getItem('detailed_log') === 'true';
    }

    // Блокировка IP
    banIP() {
        const ipInput = document.getElementById('ipToBan');
        const ip = ipInput.value.trim();
        
        if (!this.isValidIP(ip)) {
            this.showStatus('Некорректный IP-адрес', 'error');
            return;
        }
        
        if (!this.bannedIPs.includes(ip)) {
            this.bannedIPs.push(ip);
            localStorage.setItem('banned_ips', JSON.stringify(this.bannedIPs));
            
            // Кикаем пользователя с этим IP
            this.kickUser(ip);
            
            this.showStatus(`IP ${ip} заблокирован`, 'success');
            this.loadBannedIPs();
            this.loadStats();
        } else {
            this.showStatus('IP уже заблокирован', 'warning');
        }
        
        ipInput.value = '';
    }

    // Разблокировка IP
    unbanIP(ip) {
        this.bannedIPs = this.bannedIPs.filter(bannedIP => bannedIP !== ip);
        localStorage.setItem('banned_ips', JSON.stringify(this.bannedIPs));
        
        this.showStatus(`IP ${ip} разблокирован`, 'success');
        this.loadBannedIPs();
        this.loadStats();
    }

    // Кик пользователя
    kickUser(ip) {
        const activeUsers = JSON.parse(localStorage.getItem('active_users') || '{}');
        delete activeUsers[ip];
        localStorage.setItem('active_users', JSON.stringify(activeUsers));
        
        // Можно добавить дополнительную логику для принудительного выхода
        this.showStatus(`Пользователь ${ip} отключен`, 'success');
        this.loadActiveUsers();
        this.loadStats();
    }

    // Бан пользователя
    banUser(ip) {
        document.getElementById('ipToBan').value = ip;
        this.banIP();
    }

    // Проверка IP
    isValidIP(ip) {
        const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Pattern.test(ip) || ipv6Pattern.test(ip) || ip === 'unknown';
    }

    // Переключение проверки IP
    toggleIPCheck() {
        const isChecked = document.getElementById('checkIP').checked;
        localStorage.setItem('check_ip', isChecked);
        this.showStatus(`Проверка IP ${isChecked ? 'включена' : 'выключена'}`, 'success');
    }

    // Переключение требования токена
    toggleTokenRequirement() {
        const isChecked = document.getElementById('requireToken').checked;
        localStorage.setItem('require_token', isChecked);
        this.showStatus(`Требование токена ${isChecked ? 'включено' : 'выключено'}`, 'success');
    }

    // Переключение детального лога
    toggleDetailedLog() {
        const isChecked = document.getElementById('detailedLog').checked;
        localStorage.setItem('detailed_log', isChecked);
        this.showStatus(`Детальный лог ${isChecked ? 'включен' : 'выключен'}`, 'success');
    }

    // Очистка логов
    clearLogs() {
        if (confirm('Очистить все логи входа? Это действие нельзя отменить.')) {
            localStorage.removeItem('login_logs');
            this.loadLoginLogs();
            this.showStatus('Логи очищены', 'success');
        }
    }

    // Сброс всех данных
    resetAllData() {
        if (confirm('⚠️ ВНИМАНИЕ! Это удалит ВСЕ данные:\n- Все файлы\n- Все настройки\n- Всех пользователей\n\nПродолжить?')) {
            // Очищаем все данные
            localStorage.clear();
            sessionStorage.clear();
            
            // Очищаем cookies
            document.cookie.split(";").forEach(cookie => {
                document.cookie = cookie.replace(/^ +/, "")
                    .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
            
            this.showStatus('Все данные сброшены. Перезагрузка...', 'success');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    }

    // Принудительный выход всех пользователей
    forceLogoutAll() {
        if (confirm('Выгнать всех пользователей с сайта?')) {
            // Очищаем активных пользователей
            localStorage.removeItem('active_users');
            localStorage.removeItem('aelum_session');
            
            // Можно добавить флаг в базу данных для серверной части
            localStorage.setItem('force_logout', Date.now().toString());
            
            this.showStatus('Все пользователи вышли из системы', 'success');
            this.loadActiveUsers();
            this.loadStats();
        }
    }

    // Подсчет файлов
    async loadFileCount() {
        // Реализация подсчета файлов из GitHub
        const count = 0; // Заглушка
        document.getElementById('totalFiles').textContent = count;
    }

    // Время назад
    timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        const intervals = {
            год: 31536000,
            месяц: 2592000,
            неделю: 604800,
            день: 86400,
            час: 3600,
            минуту: 60,
            секунду: 1
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${this.declineWord(interval, unit)} назад`;
            }
        }
        
        return 'только что';
    }

    declineWord(number, word) {
        const cases = [2, 0, 1, 1, 1, 2];
        const variants = {
            год: ['год', 'года', 'лет'],
            месяц: ['месяц', 'месяца', 'месяцев'],
            неделю: ['неделю', 'недели', 'недель'],
            день: ['день', 'дня', 'дней'],
            час: ['час', 'часа', 'часов'],
            минуту: ['минуту', 'минуты', 'минут'],
            секунду: ['секунду', 'секунды', 'секунд']
        };
        
        const wordVariants = variants[word];
        return wordVariants[
            number % 100 > 4 && number % 100 < 20 ? 2 : cases[Math.min(number % 10, 5)]
        ];
    }

    showStatus(message, type) {
        const statusEl = document.getElementById('adminStatus');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        setTimeout(() => statusEl.textContent = '', 3000);
    }
}

// Инициализация админ-панели
const admin = new AdminPanel();

// Глобальные функции для HTML
function toggleIPCheck() { admin.toggleIPCheck(); }
function toggleTokenRequirement() { admin.toggleTokenRequirement(); }
function toggleDetailedLog() { admin.toggleDetailedLog(); }
function banIP() { admin.banIP(); }
function clearLogs() { admin.clearLogs(); }
function resetAllData() { admin.resetAllData(); }
function forceLogoutAll() { admin.forceLogoutAll(); }
