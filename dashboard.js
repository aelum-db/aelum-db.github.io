// Обновляем класс Dashboard для работы с реальным GitHub
class Dashboard {
    constructor() {
        this.currentSession = null;
        this.uploadQueue = [];
        this.currentlyUploading = false;
        this.fileToDecrypt = null;
        this.fileToEncrypt = null;
        this.githubFiles = [];
        this.init();
    }

    async init() {
        // Проверяем аутентификацию
        this.currentSession = await this.checkAuth();
        if (!this.currentSession) return;

        // Проверяем конфигурацию GitHub
        if (!gitHubConfig.isValid()) {
            this.showSetupModal();
            return;
        }

        // Инициализируем интерфейс
        this.initUI();
        await this.loadUserInfo();
        await this.loadFilesFromGitHub();
        this.loadRecentActivity();
        this.loadSettings();
        this.setupEventListeners();

        // Обновляем активность пользователя
        this.updateUserActivity();
    }

    // Показ модального окна настройки GitHub
    showSetupModal() {
        const modalHTML = `
            <div class="modal-overlay" style="display: flex;">
                <div class="modal-content">
                    <h3><i class="fab fa-github"></i> Настройка GitHub</h3>
                    <p>Для работы Aelum BD необходимо настроить подключение к GitHub репозиторию.</p>
                    
                    <div style="margin: 20px 0;">
                        <label>Владелец репозитория (username или organization):</label>
                        <input type="text" id="setupOwner" class="form-input" placeholder="your-username">
                        
                        <label style="margin-top: 15px;">Название репозитория:</label>
                        <input type="text" id="setupRepo" class="form-input" placeholder="aelum-bd">
                        
                        <label style="margin-top: 15px;">GitHub Token:</label>
                        <input type="password" id="setupToken" class="form-input" 
                               placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                        
                        <p style="font-size: 12px; color: #666; margin-top: 10px;">
                            <i class="fas fa-info-circle"></i> Token должен иметь права <code>repo</code>
                        </p>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button onclick="dashboard.saveGitHubSetup()" class="btn-primary" style="flex: 1;">
                            Сохранить и продолжить
                        </button>
                        <button onclick="dashboard.skipGitHubSetup()" class="btn-secondary" style="flex: 1;">
                            Пропустить (демо)
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // Сохранение настроек GitHub
    async saveGitHubSetup() {
        const owner = document.getElementById('setupOwner').value.trim();
        const repo = document.getElementById('setupRepo').value.trim();
        const token = document.getElementById('setupToken').value.trim();
        
        if (!owner || !repo || !token) {
            this.showStatus('Заполните все поля', 'error');
            return;
        }
        
        try {
            // Сохраняем конфигурацию
            gitHubConfig.setRepository(owner, repo);
            
            // Проверяем доступ к репозиторию
            const verifyResult = await gitHubUploader.verifyRepository(token);
            
            if (verifyResult.success) {
                // Сохраняем токен
                localStorage.setItem('github_token', token);
                this.currentSession.token = token;
                
                // Закрываем модальное окно
                document.querySelector('.modal-overlay').remove();
                
                this.showStatus('GitHub настроен успешно!', 'success');
                
                // Перезагружаем интерфейс
                await this.loadFilesFromGitHub();
                this.updateStats();
                
            } else {
                this.showStatus(`Ошибка: ${verifyResult.message}`, 'error');
            }
            
        } catch (error) {
            this.showStatus(`Ошибка настройки: ${error.message}`, 'error');
        }
    }

    // Пропуск настройки GitHub
    skipGitHubSetup() {
        // Используем демо-режим
        gitHubConfig.setRepository('demo', 'aelum-bd-demo');
        localStorage.setItem('demo_mode', 'true');
        
        document.querySelector('.modal-overlay').remove();
        this.showStatus('Демо-режим активирован', 'warning');
    }

    // Загрузка файлов с GitHub
    async loadFilesFromGitHub() {
        try {
            const token = this.currentSession.token;
            
            if (!token) {
                this.showStatus('GitHub Token не найден', 'error');
                return;
            }
            
            // Получаем список файлов
            this.githubFiles = await gitHubUploader.listFiles('files', token);
            
            // Отображаем файлы
            this.displayGitHubFiles(this.githubFiles);
            this.updateStats();
            
        } catch (error) {
            console.error('Load files error:', error);
            this.showStatus(`Ошибка загрузки файлов: ${error.message}`, 'error');
        }
    }

    // Отображение файлов с GitHub
    displayGitHubFiles(files) {
        const container = document.getElementById('filesContainer');
        const noFiles = document.getElementById('noFiles');
        
        if (files.length === 0) {
            container.innerHTML = '';
            noFiles.style.display = 'block';
            return;
        }
        
        noFiles.style.display = 'none';
        container.innerHTML = '';
        
        files.forEach(file => {
            const fileElement = this.createGitHubFileElement(file);
            container.appendChild(fileElement);
        });
    }

    // Создание элемента файла GitHub
    createGitHubFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.path = file.path;
        
        const icon = this.getFileIcon(file.name);
        const isEncrypted = file.name.endsWith('.encrypted');
        const displayName = isEncrypted ? 
            file.name.replace('.encrypted', '') : file.name;
        
        div.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name" title="${file.name}">
                ${this.truncateFileName(displayName, 15)}
                ${isEncrypted ? '<span class="encrypted-badge">🔒</span>' : ''}
            </div>
            <div class="file-size">${gitHubUploader.formatSize(file.size)}</div>
            <div style="margin-top: 10px; display: flex; gap: 5px;">
                <button onclick="dashboard.downloadGitHubFile('${file.path}')" 
                        class="btn-secondary" style="flex: 1; padding: 5px;">
                    <i class="fas fa-download"></i>
                </button>
                ${isEncrypted ? `
                <button onclick="dashboard.decryptGitHubFile('${file.path}')" 
                        class="btn-secondary" style="flex: 1; padding: 5px;">
                    <i class="fas fa-unlock"></i>
                </button>
                ` : ''}
                <button onclick="dashboard.deleteGitHubFile('${file.path}')" 
                        class="btn-secondary" style="flex: 1; padding: 5px; background: #e74c3c;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        return div;
    }

    // Загрузка файла на GitHub
    async uploadSingleFile(file) {
        return new Promise(async (resolve, reject) => {
            try {
                const token = this.currentSession.token;
                const autoEncrypt = localStorage.getItem('auto_encrypt') === 'true';
                
                // Показываем прогресс
                document.getElementById('progressStatus').textContent = 
                    `Подготовка: ${file.name}`;
                
                if (autoEncrypt) {
                    // Шифруем файл
                    this.fileToEncrypt = file;
                    this.showPasswordModal();
                    resolve();
                } else {
                    // Загружаем без шифрования
                    const result = await gitHubUploader.uploadFile(file, token, {
                        path: `files/${Date.now()}_${file.name}`,
                        message: `Upload: ${file.name}`,
                        encrypt: false,
                        onProgress: (percent) => {
                            document.getElementById('progressBar').style.width = `${percent}%`;
                            document.getElementById('progressText').textContent = `${percent}%`;
                            document.getElementById('progressStatus').textContent = 
                                `Загрузка: ${file.name} (${percent}%)`;
                        }
                    });
                    
                    if (result.success) {
                        this.showStatus(`Файл "${file.name}" загружен`, 'success');
                        await this.loadFilesFromGitHub();
                        resolve();
                    } else {
                        reject(new Error(result.message));
                    }
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // Скачивание файла с GitHub
    async downloadGitHubFile(path) {
        try {
            const token = this.currentSession.token;
            const file = this.githubFiles.find(f => f.path === path);
            
            if (!file) {
                this.showStatus('Файл не найден', 'error');
                return;
            }
            
            // Показываем прогресс
            this.showStatus(`Скачивание: ${file.name}`, 'info');
            
            const result = await gitHubDownloader.download(file, token, {
                decrypt: false,
                onProgress: (percent) => {
                    // Можно добавить индикатор прогресса
                }
            });
            
            // Запускаем скачивание
            result.download();
            this.showStatus(`Файл "${file.name}" скачан`, 'success');
            
        } catch (error) {
            this.showStatus(`Ошибка скачивания: ${error.message}`, 'error');
        }
    }

    // Расшифровка файла с GitHub
    async decryptGitHubFile(path) {
        try {
            const token = this.currentSession.token;
            const file = this.githubFiles.find(f => f.path === path);
            
            if (!file) {
                this.showStatus('Файл не найден', 'error');
                return;
            }
            
            // Ищем метаданные файла
            const metadataList = JSON.parse(localStorage.getItem('file_metadata') || '[]');
            const metadata = metadataList.find(m => 
                m.fileName === file
