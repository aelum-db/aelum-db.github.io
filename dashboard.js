// Проверка сессии при загрузке каждой страницы
async function checkAuth() {
    const auth = new AuthSystem();
    const session = await auth.verifySession();
    
    if (!session) {
        // Редирект на страницу логина
        window.location.href = 'index.html';
        return null;
    }
    
    // Проверка заблокированных IP
    const bannedIPs = JSON.parse(localStorage.getItem('banned_ips') || '[]');
    const currentIP = await auth.getCurrentIP();
    
    if (bannedIPs.includes(currentIP)) {
        alert('Ваш IP адрес заблокирован администратором.');
        auth.logout();
        return null;
    }
    
    return session;
}

// Защита от прямого доступа к файлам
document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkAuth();
    if (session) {
        // Инициализация Dashboard
        initDashboard(session);
    }
});
