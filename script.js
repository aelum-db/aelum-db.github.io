// Главный скрипт с интеграцией всех модулей
class AelumBD {
    constructor() {
        this.config = {
            repoOwner: localStorage.getItem('repo_owner') || 'your-username',
            repoName: localStorage.getItem('repo_name') || 'aelum-bd',
            dataFolder: 'data',
            documentsFolder: 'documents',
            maxFileSize: 50 * 1024 * 1024 // 50MB
        };
    }

    // Инициализация приложения
    async init() {
        // Проверяем сессию
        const session = await auth.verifySession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        // Проверяем IP, если включено в админке
        if (localStorage.getItem('check_ip') === 'true') {
            await this.checkIP(session);
        }

        // Загружаем интерфейс
        this.loadUI();
    }

    // Проверка IP
    async checkIP(session) {
        const currentIP = await auth.getCurrentIP();
        if (session.ip !== currentIP && session.ip !== 'unknown') {
            alert('Обнаружена смена IP-адреса. Пожалуйста, войдите снова.');
            auth.logout();
            return false;
        }
        return true;
    }

    // Загрузка интерфейса
    loadUI() {
        // Обновляем имя пользователя
        const session = auth.getSession();
        if (session) {
            const userElement = document.getElementById('userName');
            if (userElement) {
                userElement.textContent = session.userType === 'admin' ? '👑 Администратор' : '👤 Пользователь';
            }
        }
    }

    // Загрузка файла с шифрованием
    async uploadFileWithEncryption(file, password) {
        try {
            // Проверка размера файла
            if (file.size > this.config.maxFileSize) {
                throw new Error(`Файл слишком большой. Максимум: ${this.formatFileSize(this.config.maxFileSize)}`);
            }

            // Шифруем файл
            const encrypted = await encryptor.encryptFile(file, password);
            
            // Загружаем на GitHub
            const session = auth.getSession();
            const result = await this.uploadToGitHub(
                `${Date.now()}_${file.name}${encrypted.extension}`,
                encrypted.buffer,
                session.token
            );

            // Сохраняем метаданные
            await this.saveFileMetadata(file, encrypted.metadata, password);
            
            return {
                success: true,
                message: `Файл "${file.name}" зашифрован и загружен`,
                metadata: encrypted.metadata
            };
            
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    // Загрузка на GitHub
    async uploadToGitHub(path, content, token) {
        const url = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/contents/${this.config.dataFolder}/${path}`;
        
        // Конвертируем в base64
        const buffer = new Uint8Array(content);
        let binary = '';
        buffer.forEach(byte => binary += String.fromCharCode(byte));
        const base64Content = btoa(binary);
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Upload: ${path}`,
                content: base64Content
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Ошибка загрузки на GitHub');
        }
        
        return response.json();
    }

    // Сохранение метаданных файла
    async saveFileMetadata(file, metadata, passwordHint = '') {
        const session = auth.getSession();
        const metadataList = JSON.parse(localStorage.getItem('file_metadata') || '[]');
        
        metadataList.push({
            ...metadata,
            passwordHint: passwordHint,
            uploadedBy: session.userType,
            uploadDate: new Date().toISOString(),
            ip: await auth.getCurrentIP()
        });
        
        localStorage.setItem('file_metadata', JSON.stringify(metadataList));
        
        // Также сохраняем на GitHub для синхронизации
        if (session.token) {
            await this.syncMetadataToGitHub(metadataList, session.token);
        }
    }

    // Синхронизация метаданных на GitHub
    async syncMetadataToGitHub(metadataList, token) {
        const url = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/contents/metadata.json`;
        
        const content = btoa(JSON.stringify(metadataList, null, 2));
        
        try {
            // Сначала получаем текущий файл для SHA
            const getResponse = await fetch(url, {
                headers: { 'Authorization': `token ${token}` }
            });
            
            let sha = '';
            if (getResponse.ok) {
                const data = await getResponse.json();
                sha = data.sha;
            }
            
            // Обновляем файл
            const putResponse = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update metadata',
                    content: content,
                    sha: sha || undefined
                })
            });
            
            return putResponse.ok;
            
        } catch (error) {
            console.error('Metadata sync error:', error);
            return false;
        }
    }

    // Форматирование размера файла
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Получение статистики
    getStats() {
        const metadataList = JSON.parse(localStorage.getItem('file_metadata') || '[]');
        const activeUsers = JSON.parse(localStorage.getItem('active_users') || '{}');
        const loginLogs = JSON.parse(localStorage.getItem('login_logs') || '[]');
        
        return {
            totalFiles: metadataList.length,
            totalSize: metadataList.reduce((sum, file) => sum + file.fileSize, 0),
            activeUsers: Object.keys(activeUsers).length,
            totalLogins: loginLogs.length,
            lastLogin: loginLogs[0] ? new Date(loginLogs[0].timestamp) : null
        };
    }
}

// Глобальная инициализация
const aelum = new AelumBD();

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем, не на странице ли логина
    if (!window.location.pathname.includes('index.html')) {
        aelum.init();
    }
});
