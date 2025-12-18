// ==============================
// ПОЛНЫЙ DASHBOARD.JS
// ==============================

// Главный класс Dashboard
class Dashboard {
    constructor() {
        this.currentSession = null;
        this.uploadQueue = [];
        this.currentlyUploading = false;
        this.fileToDecrypt = null;
        this.fileToEncrypt = null;
        this.githubFiles = [];
        this.fileMetadata = [];
        this.isDemoMode = localStorage.getItem('demo_mode') === 'true';
        this.init();
    }

    // Инициализация
    async init() {
        console.log('🔧 Инициализация Dashboard...');
        
        // Проверяем аутентификацию
        this.currentSession = await this.checkAuth();
        if (!this.currentSession) return;

        // Проверяем настройки GitHub
        await this.checkGitHubConfig();
        
        // Инициализация UI
        this.initUI();
        await this.loadUserInfo();
        
        // Загрузка данных
        await this.loadAllData();
        
        // Настройка обработчиков событий
        this.setupEventListeners();
        
        // Обновление активности
        this.updateUserActivity();
        
        console.log('✅ Dashboard инициализирован');
    }

    // ==============================
    // АУТЕНТИФИКАЦИЯ
    // ==============================

    async checkAuth() {
        try {
            const auth = new AuthSystem();
            const session = await auth.verifySession();
            
            if (!session) {
                console.log('❌ Сессия не найдена, редирект на логин');
                window.location.href = 'index.html';
                return null;
            }

            // Проверка заблокированных IP
            const bannedIPs = JSON.parse(localStorage.getItem('banned_ips') || '[]');
            const currentIP = await auth.getCurrentIP();
            
            if (bannedIPs.includes(currentIP)) {
                alert('🚫 Ваш IP адрес заблокирован администратором.');
                auth.logout();
                return null;
            }

            console.log('✅ Аутентификация успешна');
            return session;
            
        } catch (error) {
            console.error('Ошибка аутентификации:', error);
            window.location.href = 'index.html';
            return null;
        }
    }

    // ==============================
    // КОНФИГУРАЦИЯ GITHUB
    // ==============================

    async checkGitHubConfig() {
        // Если демо-режим, пропускаем проверку
        if (this.isDemoMode) {
            console.log('🎮 Демо-режим активирован');
            return;
        }

        // Проверяем наличие конфигурации
        if (!gitHubConfig.isValid()) {
            console.log('⚠️ Конфигурация GitHub не найдена');
            this.showGitHubSetupModal();
            return;
        }

        // Проверяем токен
        const token = this.currentSession?.token || localStorage.getItem('github_token');
        if (!token) {
            console.log('⚠️ GitHub Token не найден');
            this.showGitHubTokenModal();
            return;
        }

        // Проверяем доступ к репозиторию
        try {
            console.log('🔍 Проверка доступа к репозиторию...');
            const verifyResult = await gitHubUploader.verifyRepository(token);
            
            if (verifyResult.success) {
                console.log('✅ Репозиторий доступен');
            } else {
                console.error('❌ Ошибка доступа:', verifyResult.message);
                this.showStatus(`Ошибка GitHub: ${verifyResult.message}`, 'error');
            }
        } catch (error) {
            console.error('Ошибка проверки репозитория:', error);
            this.showStatus('Ошибка подключения к GitHub', 'error');
        }
    }

    showGitHubSetupModal() {
        const modalHTML = `
            <div id="githubSetupModal" class="modal-overlay" style="display: flex; z-index: 2000;">
                <div class="modal-content" style="max-width: 500px;">
                    <h3><i class="fab fa-github"></i> Настройка GitHub</h3>
                    <p>Для работы Aelum BD необходимо настроить подключение к GitHub репозиторию.</p>
                    
                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold;">
                            Владелец репозитория:
                        </label>
                        <input type="text" id="setupOwner" class="form-input" 
                               placeholder="your-username" value="${localStorage.getItem('github_owner') || ''}">
                        
                        <label style="display: block; margin: 15px 0 8px; font-weight: bold;">
                            Название репозитория:
                        </label>
                        <input type="text" id="setupRepo" class="form-input" 
                               placeholder="aelum-bd" value="${localStorage.getItem('github_repo') || 'aelum-bd'}">
                        
                        <label style="display: block; margin: 15px 0 8px; font-weight: bold;">
                            GitHub Token:
                        </label>
                        <input type="password" id="setupToken" class="form-input" 
                               placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" 
                               value="${localStorage.getItem('github_token') || ''}">
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 15px;">
                            <h4 style="margin-top: 0;"><i class="fas fa-info-circle"></i> Инструкция:</h4>
                            <ol style="margin: 10px 0; padding-left: 20px; font-size: 14px;">
                                <li>Создайте новый публичный репозиторий на GitHub</li>
                                <li>Сгенерируйте Personal Access Token с правами <code>repo</code></li>
                                <li>Введите данные выше и нажмите "Сохранить"</li>
                            </ol>
                            <a href="https://github.com/settings/tokens/new" target="_blank" 
                               style="color: #0366d6; text-decoration: none;">
                               <i class="fas fa-external-link-alt"></i> Создать Token
                            </a>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button onclick="dashboard.saveGitHubSetup()" class="btn-primary" style="flex: 1;">
                            <i class="fas fa-save"></i> Сохранить
                        </button>
                        <button onclick="dashboard.enableDemoMode()" class="btn-secondary" style="flex: 1;">
                            <i class="fas fa-play-circle"></i> Демо-режим
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    showGitHubTokenModal() {
        const modalHTML = `
            <div id="githubTokenModal" class="modal-overlay" style="display: flex; z-index: 2000;">
                <div class="modal-content" style="max-width: 400px;">
                    <h3><i class="fab fa-github"></i> Требуется GitHub Token</h3>
                    <p>Для загрузки файлов введите ваш GitHub Personal Access Token.</p>
                    
                    <div style="margin: 20px 0;">
                        <input type="password" id="githubTokenInput" class="form-input" 
                               placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" 
                               value="${localStorage.getItem('github_token') || ''}">
                        <p style="font-size: 12px; color: #666; margin-top: 8px;">
                            Token должен иметь права <code>repo</code>
                        </p>
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <button onclick="dashboard.saveGitHubToken()" class="btn-primary" style="flex: 1;">
                            <i class="fas fa-check"></i> Сохранить
                        </button>
                        <button onclick="dashboard.closeModal('githubTokenModal')" class="btn-secondary" style="flex: 1;">
                            Отмена
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    async saveGitHubSetup() {
        const owner = document.getElementById('setupOwner').value.trim();
        const repo = document.getElementById('setupRepo').value.trim();
        const token = document.getElementById('setupToken').value.trim();
        
        if (!owner || !repo) {
            this.showStatus('Введите владельца и название репозитория', 'error');
            return;
        }
        
        if (!token) {
            this.showStatus('Введите GitHub Token', 'error');
            return;
        }
        
        try {
            // Сохраняем конфигурацию
            gitHubConfig.setRepository(owner, repo);
            localStorage.setItem('github_token', token);
            
            // Обновляем сессию
            if (this.currentSession) {
                this.currentSession.token = token;
            }
            
            // Проверяем доступ к репозиторию
            this.showStatus('Проверка подключения к GitHub...', 'info');
            
            const verifyResult = await gitHubUploader.verifyRepository(token);
            
            if (verifyResult.success) {
                // Закрываем модальное окно
                this.closeModal('githubSetupModal');
                
                // Показываем успех
                this.showStatus('✅ GitHub настроен успешно!', 'success');
                
                // Загружаем файлы
                await this.loadAllData();
                
                // Обновляем UI
                this.updateGitHubInfo();
                
            } else {
                this.showStatus(`❌ Ошибка: ${verifyResult.message}`, 'error');
            }
            
        } catch (error) {
            console.error('Ошибка настройки GitHub:', error);
            this.showStatus(`Ошибка: ${error.message}`, 'error');
        }
    }

    async saveGitHubToken() {
        const token = document.getElementById('githubTokenInput').value.trim();
        
        if (!token) {
            this.showStatus('Введите GitHub Token', 'error');
            return;
        }
        
        try {
            // Сохраняем токен
            localStorage.setItem('github_token', token);
            
            // Обновляем сессию
            if (this.currentSession) {
                this.currentSession.token = token;
            }
            
            // Проверяем токен
            const verifyResult = await gitHubUploader.verifyRepository(token);
            
            if (verifyResult.success) {
                this.closeModal('githubTokenModal');
                this.showStatus('✅ Token сохранен', 'success');
                await this.loadAllData();
            } else {
                this.showStatus(`❌ Ошибка: ${verifyResult.message}`, 'error');
            }
            
        } catch (error) {
            this.showStatus(`Ошибка: ${error.message}`, 'error');
        }
    }

    enableDemoMode() {
        this.isDemoMode = true;
        localStorage.setItem('demo_mode', 'true');
        
        // Устанавливаем демо-репозиторий
        gitHubConfig.setRepository('demo', 'aelum-bd-demo');
        
        // Закрываем модальное окно
        this.closeModal('githubSetupModal');
        
        // Показываем демо-данные
        this.showDemoData();
        
        this.showStatus('🎮 Демо-режим активирован', 'warning');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }

    updateGitHubInfo() {
        if (gitHubConfig.isValid()) {
            const config = gitHubConfig.getUserConfig();
            const infoElement = document.getElementById('githubInfo');
            
            if (infoElement) {
                infoElement.innerHTML = `
                    <small style="color: #666;">
                        <i class="fab fa-github"></i> 
                        ${config.owner}/${config.repo}
                    </small>
                `;
            }
        }
    }

    // ==============================
    // ЗАГРУЗКА ДАННЫХ
    // ==============================

    async loadAllData() {
        console.log('📥 Загрузка всех данных...');
        
        // Показываем индикатор загрузки
        this.showLoading(true);
        
        try {
            // Загружаем файлы с GitHub
            await this.loadFilesFromGitHub();
            
            // Загружаем метаданные
            await this.loadMetadata();
            
            // Загружаем недавние действия
            this.loadRecentActivity();
            
            // Обновляем статистику
            this.updateStats();
            
            console.log('✅ Данные загружены');
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.showStatus(`Ошибка загрузки: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadFilesFromGitHub() {
        try {
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            
            if (!token && !this.isDemoMode) {
                console.log('⚠️ Token не найден, пропускаем загрузку файлов');
                return;
            }
            
            if (this.isDemoMode) {
                // Демо-данные
                this.githubFiles = this.generateDemoFiles();
                this.displayFiles(this.githubFiles);
                return;
            }
            
            console.log('📁 Загрузка файлов с GitHub...');
            
            // Получаем список файлов
            this.githubFiles = await gitHubUploader.listFiles('files', token);
            console.log(`📊 Загружено файлов: ${this.githubFiles.length}`);
            
            // Отображаем файлы
            this.displayFiles(this.githubFiles);
            
        } catch (error) {
            console.error('Ошибка загрузки файлов с GitHub:', error);
            
            // Показываем демо-данные в случае ошибки
            if (this.githubFiles.length === 0) {
                this.githubFiles = this.generateDemoFiles();
                this.displayFiles(this.githubFiles);
                this.showStatus('Используются демо-данные', 'warning');
            }
            
            throw error;
        }
    }

    generateDemoFiles() {
        return [
            {
                name: 'document.pdf.encrypted',
                path: 'files/document.pdf.encrypted',
                size: 2048576,
                download_url: '#',
                encrypted: true
            },
            {
                name: 'photo.jpg',
                path: 'files/photo.jpg',
                size: 1048576,
                download_url: '#',
                encrypted: false
            },
            {
                name: 'data.csv',
                path: 'files/data.csv',
                size: 524288,
                download_url: '#',
                encrypted: false
            },
            {
                name: 'presentation.pptx.encrypted',
                path: 'files/presentation.pptx.encrypted',
                size: 5242880,
                download_url: '#',
                encrypted: true
            },
            {
                name: 'notes.txt',
                path: 'files/notes.txt',
                size: 10240,
                download_url: '#',
                encrypted: false
            }
        ];
    }

    async loadMetadata() {
        try {
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            
            if (!token && !this.isDemoMode) {
                return;
            }
            
            if (this.isDemoMode) {
                // Демо-метаданные
                this.fileMetadata = JSON.parse(localStorage.getItem('demo_metadata') || '[]');
                return;
            }
            
            // Пытаемся загрузить metadata.json с GitHub
            const metadataContent = await this.loadMetadataFromGitHub(token);
            
            if (metadataContent) {
                this.fileMetadata = JSON.parse(metadataContent);
                console.log(`📋 Загружено метаданных: ${this.fileMetadata.length}`);
            } else {
                // Загружаем из localStorage
                this.fileMetadata = JSON.parse(localStorage.getItem('file_metadata') || '[]');
            }
            
        } catch (error) {
            console.error('Ошибка загрузки метаданных:', error);
            this.fileMetadata = JSON.parse(localStorage.getItem('file_metadata') || '[]');
        }
    }

    async loadMetadataFromGitHub(token) {
        try {
            const fileInfo = await gitHubUploader.getFileInfo('metadata.json', token);
            if (fileInfo && fileInfo.content) {
                return atob(fileInfo.content);
            }
        } catch (error) {
            // Файл не найден - это нормально для первого запуска
        }
        return null;
    }

    // ==============================
    // ОТОБРАЖЕНИЕ ФАЙЛОВ
    // ==============================

    displayFiles(files) {
        const container = document.getElementById('filesContainer');
        const noFiles = document.getElementById('noFiles');
        
        if (!container) return;
        
        if (!files || files.length === 0) {
            container.innerHTML = '';
            if (noFiles) noFiles.style.display = 'block';
            return;
        }
        
        if (noFiles) noFiles.style.display = 'none';
        container.innerHTML = '';
        
        // Сортируем файлы по времени (новые сверху)
        const sortedFiles = [...files].sort((a, b) => {
            const timeA = this.getFileTimestamp(a.name);
            const timeB = this.getFileTimestamp(b.name);
            return timeB - timeA;
        });
        
        sortedFiles.forEach(file => {
            const fileElement = this.createFileElement(file);
            container.appendChild(fileElement);
        });
    }

    getFileTimestamp(filename) {
        // Пытаемся извлечить timestamp из имени файла
        const match = filename.match(/(\d{13})_/);
        if (match) {
            return parseInt(match[1]);
        }
        return Date.now();
    }

    createFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.path = file.path;
        div.dataset.name = file.name;
        
        const icon = this.getFileIcon(file.name);
        const isEncrypted = file.encrypted || file.name.endsWith('.encrypted');
        const displayName = isEncrypted ? 
            file.name.replace('.encrypted', '') : file.name;
        
        // Находим метаданные для этого файла
        const metadata = this.fileMetadata.find(m => 
            m.fileName === displayName || m.fileName === file.name);
        
        const uploadDate = metadata?.timestamp ? 
            new Date(metadata.timestamp).toLocaleDateString() : 
            'Неизвестно';
        
        div.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name" title="${file.name}">
                ${this.truncateFileName(displayName, 20)}
                ${isEncrypted ? '<span class="encrypted-badge">🔒</span>' : ''}
            </div>
            <div class="file-size">${this.formatFileSize(file.size)}</div>
            <div class="file-date" style="font-size: 11px; color: #888; margin-top: 5px;">
                ${uploadDate}
            </div>
            <div style="margin-top: 10px; display: flex; gap: 5px;">
                <button onclick="dashboard.downloadFile('${file.path}', ${isEncrypted})" 
                        class="btn-secondary" style="flex: 1; padding: 5px;" title="Скачать">
                    <i class="fas fa-download"></i>
                </button>
                ${isEncrypted ? `
                <button onclick="dashboard.decryptFile('${file.path}')" 
                        class="btn-secondary" style="flex: 1; padding: 5px;" title="Расшифровать">
                    <i class="fas fa-unlock"></i>
                </button>
                ` : ''}
                <button onclick="dashboard.deleteFile('${file.path}')" 
                        class="btn-secondary" style="flex: 1; padding: 5px; background: #e74c3c;" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        return div;
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            // Изображения
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
            'webp': '🖼️', 'svg': '🖼️', 'bmp': '🖼️', 'ico': '🖼️',
            
            // Документы
            'pdf': '📕', 'doc': '📄', 'docx': '📄',
            'txt': '📝', 'rtf': '📄', 'odt': '📄',
            
            // Таблицы
            'xls': '📊', 'xlsx': '📊', 'csv': '📊',
            'ods': '📊',
            
            // Презентации
            'ppt': '📽️', 'pptx': '📽️', 'odp': '📽️',
            
            // Архивы
            'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦',
            'gz': '📦',
            
            // Аудио
            'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
            
            // Видео
            'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'mkv': '🎬',
            
            // Код
            'html': '🌐', 'js': '📜', 'css': '🎨', 'json': '📋',
            'py': '🐍', 'java': '☕', 'cpp': '⚙️', 'cs': '🔷'
        };
        
        return icons[ext] || '📁';
    }

    truncateFileName(name, maxLength = 20) {
        if (name.length <= maxLength) return name;
        return name.substring(0, maxLength - 3) + '...';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ==============================
    // ЗАГРУЗКА ФАЙЛОВ
    // ==============================

    async handleFileSelect(files) {
        if (!files || files.length === 0) return;
        
        // Добавляем файлы в очередь
        Array.from(files).forEach(file => {
            this.uploadQueue.push(file);
        });
        
        this.showUploadQueue();
    }

    showUploadQueue() {
        const queueList = document.getElementById('queueList');
        const uploadQueue = document.getElementById('uploadQueue');
        
        if (!queueList || !uploadQueue) return;
        
        queueList.innerHTML = '';
        
        this.uploadQueue.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.style.margin = '10px 0';
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="file-icon">${this.getFileIcon(file.name)}</div>
                            <div>
                                <strong>${file.name}</strong><br>
                                <small>${this.formatFileSize(file.size)}</small>
                            </div>
                        </div>
                    </div>
                    <div>
                        <button onclick="dashboard.removeFromQueue(${index})" 
                                class="btn-secondary" style="padding: 5px 10px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
            queueList.appendChild(div);
        });
        
        uploadQueue.style.display = 'block';
        document.getElementById('uploadProgress').style.display = 'none';
    }

    removeFromQueue(index) {
        this.uploadQueue.splice(index, 1);
        this.showUploadQueue();
        
        if (this.uploadQueue.length === 0) {
            document.getElementById('uploadQueue').style.display = 'none';
        }
    }

    async startUpload() {
        if (this.uploadQueue.length === 0 || this.currentlyUploading) {
            return;
        }
        
        // Проверяем токен для реальной загрузки
        if (!this.isDemoMode) {
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            if (!token) {
                this.showGitHubTokenModal();
                return;
            }
        }
        
        this.currentlyUploading = true;
        
        // Показываем прогресс
        const progressContainer = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const progressStatus = document.getElementById('progressStatus');
        
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        
        const totalFiles = this.uploadQueue.length;
        let uploadedFiles = 0;
        let errors = [];
        
        for (let i = 0; i < totalFiles; i++) {
            const file = this.uploadQueue[i];
            
            try {
                // Обновляем статус
                progressStatus.textContent = 
                    `Загрузка: ${file.name} (${i + 1}/${totalFiles})`;
                
                // Загружаем файл
                await this.uploadSingleFile(file, (percent) => {
                    // Рассчитываем общий прогресс
                    const fileProgress = (uploadedFiles / totalFiles) * 100;
                    const currentFileProgress = (percent / 100) * (100 / totalFiles);
                    const totalProgress = fileProgress + currentFileProgress;
                    
                    progressBar.style.width = `${totalProgress}%`;
                    progressText.textContent = `${Math.round(totalProgress)}%`;
                });
                
                uploadedFiles++;
                
            } catch (error) {
                console.error(`Ошибка загрузки ${file.name}:`, error);
                errors.push({
                    file: file.name,
                    error: error.message
                });
            }
        }
        
        // Завершение
        if (errors.length === 0) {
            progressStatus.textContent = '✅ Загрузка завершена!';
            progressBar.style.backgroundColor = '#4CAF50';
            this.showStatus(`Загружено ${uploadedFiles} файлов`, 'success');
        } else {
            progressStatus.textContent = `Загружено ${uploadedFiles}/${totalFiles} файлов`;
            progressBar.style.backgroundColor = '#ff9800';
            this.showStatus(`Загружено ${uploadedFiles} из ${totalFiles} файлов. Ошибок: ${errors.length}`, 'warning');
        }
        
        // Сброс
        this.uploadQueue = [];
        this.currentlyUploading = false;
        
        // Обновляем список файлов
        await this.loadAllData();
        
        // Скрываем прогресс через 3 секунды
        setTimeout(() => {
            progressContainer.style.display = 'none';
            document.getElementById('uploadQueue').style.display = 'none';
        }, 3000);
    }

    async uploadSingleFile(file, onProgress) {
        return new Promise(async (resolve, reject) => {
            try {
                // Проверяем настройки шифрования
                const autoEncrypt = localStorage.getItem('auto_encrypt') === 'true';
                
                if (autoEncrypt) {
                    // Шифруем файл
                    this.fileToEncrypt = file;
                    this.showPasswordModal();
                    resolve();
                } else {
                    // Реальная загрузка на GitHub
                    if (!this.isDemoMode) {
                        const token = this.currentSession?.token || localStorage.getItem('github_token');
                        
                        const result = await gitHubUploader.uploadFile(file, token, {
                            path: `files/${Date.now()}_${file.name}`,
                            message: `Upload: ${file.name}`,
                            encrypt: false,
                            onProgress: onProgress
                        });
                        
                        if (result.success) {
                            // Сохраняем метаданные
                            await this.saveFileMetadata(file, result);
                            resolve();
                        } else {
                            reject(new Error(result.message));
                        }
                    } else {
                        // Демо-загрузка
                        setTimeout(() => {
                            if (onProgress) {
                                for (let i = 0; i <= 100; i += 10) {
                                    setTimeout(() => onProgress(i), i * 20);
                                }
                            }
                            resolve();
                        }, 100);
                    }
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async saveFileMetadata(file, uploadResult) {
        const metadata = {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            timestamp: Date.now(),
            uploadDate: new Date().toISOString(),
            sha: uploadResult.sha,
            downloadUrl: uploadResult.downloadUrl,
            path: uploadResult.path || `files/${Date.now()}_${file.name}`,
            encrypted: false
        };
        
        // Добавляем в локальный список
        this.fileMetadata.push(metadata);
        localStorage.setItem('file_metadata', JSON.stringify(this.fileMetadata));
        
        // Сохраняем на GitHub (если не демо-режим)
        if (!this.isDemoMode) {
            await this.saveMetadataToGitHub();
        }
    }

    async saveMetadataToGitHub() {
        try {
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            if (!token) return;
            
            const content = JSON.stringify(this.fileMetadata, null, 2);
            const base64Content = btoa(content);
            
            // Получаем текущий SHA файла
            let sha = '';
            try {
                const existingFile = await gitHubUploader.getFileInfo('metadata.json', token);
                if (existingFile) {
                    sha = existingFile.sha;
                }
            } catch (error) {
                // Файл не существует - это нормально
            }
            
            // Сохраняем на GitHub
            await fetch(gitHubConfig.getApiUrl('/contents/metadata.json'), {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update metadata',
                    content: base64Content,
                    sha: sha || undefined
                })
            });
            
        } catch (error) {
            console.error('Ошибка сохранения метаданных на GitHub:', error);
        }
    }

    // ==============================
    // СКАЧИВАНИЕ ФАЙЛОВ
    // ==============================

    async downloadFile(path, isEncrypted = false) {
        try {
            if (this.isDemoMode) {
                this.showStatus('В демо-режиме скачивание недоступно', 'warning');
                return;
            }
            
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            if (!token) {
                this.showGitHubTokenModal();
                return;
            }
            
            this.showStatus('Скачивание файла...', 'info');
            
            if (isEncrypted) {
                // Для зашифрованных файлов показываем модальное окно
                this.decryptFile(path);
            } else {
                // Скачивание обычного файла
                const file = this.githubFiles.find(f => f.path === path);
                if (!file) {
                    this.showStatus('Файл не найден', 'error');
                    return;
                }
                
                const result = await gitHubDownloader.download(file, token, {
                    decrypt: false,
                    onProgress: (percent) => {
                        // Можно добавить индикатор прогресса
                    }
                });
                
                // Запускаем скачивание
                result.download();
                this.showStatus('Файл скачан', 'success');
            }
            
        } catch (error) {
            console.error('Ошибка скачивания:', error);
            this.showStatus(`Ошибка: ${error.message}`, 'error');
        }
    }

    async decryptFile(path) {
        try {
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            if (!token) {
                this.showGitHubTokenModal();
                return;
            }
            
            const file = this.githubFiles.find(f => f.path === path);
            if (!file) {
                this.showStatus('Файл не найден', 'error');
                return;
            }
            
            // Ищем метаданные файла
            const displayName = file.name.replace('.encrypted', '');
            const metadata = this.fileMetadata.find(m => 
                m.fileName === displayName || m.fileName === file.name);
            
            this.fileToDecrypt = {
                ...file,
                metadata: metadata,
                token: token
            };
            
            // Показываем модальное окно для пароля
            document.getElementById('decryptFileName').textContent = 
                `Файл: ${displayName}`;
            document.getElementById('decryptHint').textContent = 
                metadata?.passwordHint ? `Подсказка: ${metadata.passwordHint}` : 'Подсказки нет';
            document.getElementById('decryptModal').style.display = 'flex';
            
        } catch (error) {
            console.error('Ошибка подготовки к расшифровке:', error);
            this.showStatus(`Ошибка: ${error.message}`, 'error');
        }
    }

    async confirmDecryption() {
        const password = document.getElementById('decryptionPassword').value;
        
        if (!password) {
            this.showStatus('Введите пароль для расшифровки', 'error');
            return;
        }
        
        try {
            const { file, token } = this.fileToDecrypt;
            
            this.showStatus('Расшифровка файла...', 'info');
            
            const result = await gitHubDownloader.download(file, token, {
                decrypt: true,
                password: password,
                onProgress: (percent) => {
                    // Прогресс расшифровки
                }
            });
            
            // Запускаем скачивание расшифрованного файла
            result.download();
            
            this.showStatus('✅ Файл успешно расшифрован', 'success');
            this.closeDecryptModal();
            
        } catch (error) {
            console.error('Ошибка расшифровки:', error);
            this.showStatus(`❌ Ошибка расшифровки: ${error.message}`, 'error');
        }
    }

    closeDecryptModal() {
        document.getElementById('decryptModal').style.display = 'none';
        document.getElementById('decryptionPassword').value = '';
        this.fileToDecrypt = null;
    }

    // ==============================
    // УДАЛЕНИЕ ФАЙЛОВ
    // ==============================

    async deleteFile(path) {
        if (!confirm('Удалить этот файл? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            if (this.isDemoMode) {
                // Демо-удаление
                this.githubFiles = this.githubFiles.filter(f => f.path !== path);
                this.displayFiles(this.githubFiles);
                this.showStatus('Файл удален (демо)', 'success');
                return;
            }
            
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            if (!token) {
                this.showGitHubTokenModal();
                return;
            }
            
            const result = await gitHubUploader.deleteFile(
                path, 
                token, 
                `Delete: ${path.split('/').pop()}`
            );
            
            if (result.success) {
                // Удаляем из локального списка
                this.githubFiles = this.githubFiles.filter(f => f.path !== path);
                
                // Удаляем метаданные
                const fileName = path.split('/').pop();
                this.fileMetadata = this.fileMetadata.filter(m => 
                    m.fileName !== fileName && m.fileName !== fileName.replace('.encrypted', ''));
                
                // Сохраняем обновленные метаданные
                localStorage.setItem('file_metadata', JSON.stringify(this.fileMetadata));
                
                // Обновляем отображение
                this.displayFiles(this.githubFiles);
                this.updateStats();
                
                this.showStatus('✅ Файл удален', 'success');
                
                // Обновляем метаданные на GitHub
                await this.saveMetadataToGitHub();
                
            } else {
                this.showStatus(`❌ Ошибка удаления: ${result.message}`, 'error');
            }
            
        } catch (error) {
            console.error('Ошибка удаления:', error);
            this.showStatus(`❌ Ошибка: ${error.message}`, 'error');
        }
    }

    // ==============================
    // НАСТРОЙКИ И ИНТЕРФЕЙС
    // ==============================

    initUI() {
        this.updateUserGreeting();
        this.setupDragAndDrop();
        this.setupTabSwitching();
    }

    async loadUserInfo() {
        const session = this.currentSession;
        if (!session) return;

        // Имя пользователя
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = 
                session.userType === 'admin' ? '👑 Администратор' : '👤 Пользователь';
        }

        // IP адрес
        const auth = new AuthSystem();
        const ip = await auth.getCurrentIP();
        const userIPElement = document.getElementById('userIP');
        if (userIPElement) {
            userIPElement.textContent = `IP: ${ip}`;
        }

        // Информация о GitHub
        this.updateGitHubInfo();
    }

    loadRecentActivity() {
        const loginLogs = JSON.parse(localStorage.getItem('login_logs') || '[]');
        const activityLog = document.getElementById('activityLog');
        
        if (!activityLog) return;
        
        activityLog.innerHTML = '';
        
        // Показываем последние 10 действий
        loginLogs.slice(0, 10).forEach(log => {
            const div = document.createElement('div');
            div.className = 'log-entry';
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #eee';
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <strong>${new Date(log.timestamp).toLocaleString()}</strong><br>
                        <span style="color: ${log.userType === 'admin' ? '#e74c3c' : '#2ecc71'}">
                            ${log.userType === 'admin' ? '👑 Админ' : '👤 Пользователь'}
                        </span>
                        <span style="color: #3498db; margin-left: 10px;">${log.ip}</span>
                    </div>
                    <div style="font-size: 12px; color: #888;">
                        ${navigator.userAgent.substring(0, 30)}...
                    </div>
                </div>
            `;
            activityLog.appendChild(div);
        });
        
        if (loginLogs.length === 0) {
            activityLog.innerHTML = '<p style="text-align: center; color: #888;">Нет данных</p>';
        }
    }

    loadSettings() {
        const autoEncrypt = document.getElementById('autoEncrypt');
        const notifications = document.getElementById('notifications');
        const themeSelect = document.getElementById('themeSelect');
        const githubRepo = document.getElementById('githubRepo');
        
        if (autoEncrypt) {
            autoEncrypt.checked = localStorage.getItem('auto_encrypt') === 'true';
        }
        
        if (notifications) {
            notifications.checked = localStorage.getItem('notifications') !== 'false';
        }
        
        if (themeSelect) {
            themeSelect.value = localStorage.getItem('theme') || 'light';
            this.applyTheme();
        }
        
        if (githubRepo && gitHubConfig.isValid()) {
            const config = gitHubConfig.getUserConfig();
            githubRepo.value = `${config.owner}/${config.repo}`;
        }
    }

    saveSettings() {
        const autoEncrypt = document.getElementById('autoEncrypt');
        const notifications = document.getElementById('notifications');
        const themeSelect = document.getElementById('themeSelect');
        const githubRepo = document.getElementById('githubRepo');
        
        if (autoEncrypt) {
            localStorage.setItem('auto_encrypt', autoEncrypt.checked);
        }
        
        if (notifications) {
            localStorage.setItem('notifications', notifications.checked);
        }
        
        if (themeSelect) {
            localStorage.setItem('theme', themeSelect.value);
            this.applyTheme();
        }
        
        if (githubRepo) {
            const repoValue = githubRepo.value.trim();
            if (repoValue.includes('/')) {
                const [owner, repo] = repoValue.split('/');
                if (owner && repo) {
                    gitHubConfig.setRepository(owner, repo);
                    this.updateGitHubInfo();
                }
            }
        }
        
        this.showStatus('✅ Настройки сохранены', 'success');
        this.closeSettings();
    }

    applyTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (theme === 'auto') {
            // Автоматическое определение темы системы
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                document.body.classList.add('dark-theme');
            } else {
                document.body.classList.remove('dark-theme');
            }
        } else {
            document.body.classList.remove('dark-theme');
        }
    }

    showSettings() {
        this.loadSettings();
        document.getElementById('settingsModal').style.display = 'flex';
    }

    closeSettings() {
        document.getElementById('settingsModal').style.display = 'none';
    }

    showPasswordModal() {
        document.getElementById('passwordModal').style.display = 'flex';
    }

    async confirmEncryption() {
        const password = document.getElementById('encryptionPassword').value;
        const hint = document.getElementById('passwordHint').value;
        
        if (!password) {
            this.showStatus('Введите пароль для шифрования', 'error');
            return;
        }
        
        try {
            const file = this.fileToEncrypt;
            const token = this.currentSession?.token || localStorage.getItem('github_token');
            
            this.showStatus('Шифрование файла...', 'info');
            
            // Шифруем файл
            const encrypted = await encryptor.encryptFile(file, password);
            
            // Загружаем на GitHub
            if (!this.isDemoMode && token) {
                const result = await gitHubUploader.uploadFile(file, token, {
                    path: `files/${Date.now()}_${file.name}.encrypted`,
                    message: `Upload encrypted: ${file.name}`,
                    encrypt: true,
                    password: password
                });
                
                if (result.success) {
                    // Сохраняем метаданные
                    const metadata = {
                        ...encrypted.metadata,
                        passwordHint: hint,
                        uploadedBy: this.currentSession.userType,
                        uploadDate: new Date().toISOString(),
                        sha: result.sha,
                        downloadUrl: result.downloadUrl,
                        path: result.path,
                        encrypted: true
                    };
                    
                    this.fileMetadata.push(metadata);
                    localStorage.setItem('file_metadata', JSON.stringify(this.fileMetadata));
                    
                    // Обновляем метаданные на GitHub
                    await this.saveMetadataToGitHub();
                    
                    // Обновляем список файлов
                    await this.loadAllData();
                    
                    this.showStatus('✅ Файл зашифрован и загружен', 'success');
                }
            } else {
                // Демо-режим
                const metadata = {
                    ...encrypted.metadata,
                    passwordHint: hint,
                    encrypted: true
                };
                
                this.fileMetadata.push(metadata);
                localStorage.setItem('file_metadata', JSON.stringify(this.fileMetadata));
                
                // Добавляем демо-файл
                this.githubFiles.push({
                    name: `${file.name}.encrypted`,
                    path: `files/${Date.now()}_${file.name}.encrypted`,
                    size: file.size,
                    encrypted: true
                });
                
                this.displayFiles(this.githubFiles);
                this.updateStats();
                
                this.showStatus('✅ Файл зашифрован (демо)', 'success');
            }
            
            this.closePasswordModal();
            
        } catch (error) {
            console.error('Ошибка шифрования:', error);
            this.showStatus(`❌ Ошибка: ${error.message}`, 'error');
        }
    }

    closePasswordModal() {
        document.getElementById('passwordModal').style.display = 'none';
        document.getElementById('encryptionPassword').value = '';
        document.getElementById('passwordHint').value = '';
        this.fileToEncrypt = null;
    }

    // ==============================
    // СТАТИСТИКА
    // ==============================

    updateStats() {
        // Общее количество файлов
        const totalFiles = this.githubFiles.length;
        document.getElementById('statFiles').textContent = totalFiles;
        
        // Общий размер файлов
        const totalSize = this.githubFiles.reduce((sum, file) => sum + file.size, 0);
        document.getElementById('statStorage').textContent = this.formatFileSize(totalSize);
        
        // Количество зашифрованных файлов
        const encryptedCount = this.githubFiles.filter(file => 
            file.encrypted || file.name.endsWith('.encrypted')
        ).length;
        document.getElementById('statEncrypted').textContent = encryptedCount;
        
        // Последний вход
        const loginLogs = JSON.parse(localStorage.getItem('login_logs') || '[]');
        if (loginLogs.length > 0) {
            const lastLogin = new Date(loginLogs[0].timestamp);
            const now = new Date();
            const diffTime = Math.abs(now - lastLogin);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            let lastLoginText;
            if (diffDays === 0) {
                const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
                if (diffHours === 0) {
                    const diffMinutes = Math.floor(diffTime / (1000 * 60));
                    lastLoginText = `${diffMinutes} мин.`;
                } else {
                    lastLoginText = `${diffHours} ч.`;
                }
            } else if (diffDays === 1) {
                lastLoginText = 'Вчера';
            } else if (diffDays < 7) {
                lastLoginText = `${diffDays} дн.`;
            } else {
                lastLoginText = lastLogin.toLocaleDateString();
            }
            
            document.getElementById('statLastLogin').textContent = lastLoginText;
        }
    }

    // ==============================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ==============================

    updateUserGreeting() {
        const hour = new Date().getHours();
        let greeting;
        
        if (hour < 6) greeting = 'Доброй ночи';
        else if (hour < 12) greeting = 'Доброе утро';
        else if (hour < 18) greeting = 'Добрый день';
        else greeting = 'Добрый вечер';
        
        const greetingElement = document.getElementById('userGreeting');
        if (greetingElement) {
            greetingElement.textContent = greeting;
        }
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('uploadArea');
        
        if (!uploadArea) return;
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files);
            }
        });
        
        // Клик по области загрузки
        uploadArea.addEventListener('click', () => {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    setupTabSwitching() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('onclick')?.match(/switchTab\('(\w+)'\)/)?.[1];
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });
    }

    switchTab(tabName) {
        // Скрываем все вкладки
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Убираем активный класс со всех кнопок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Показываем выбранную вкладку
        const tabElement = document.getElementById(`tab-${tabName}`);
        if (tabElement) {
            tabElement.classList.add('active');
        }
        
        // Активируем кнопку
        if (event && event.target) {
            event.target.classList.add('active');
        }
        
        // Загружаем данные для вкладки
        switch(tabName) {
            case 'files':
                this.loadFilesFromGitHub();
                break;
            case 'recent':
                this.loadRecentActivity();
                break;
        }
    }

    setupEventListeners() {
        // Обработчик выбора файлов
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e.target.files);
            });
        }
        
        // Кнопка обновления файлов
        const refreshBtn = document.querySelector('button[onclick*="refreshFiles"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadAllData();
            });
        }
        
        // Поиск файлов
        const searchInput = document.getElementById('searchFiles');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchFiles(e.target.value);
            });
        }
    }

    searchFiles(query) {
        if (!query.trim()) {
            this.displayFiles(this.githubFiles);
            return;
        }
        
        const filteredFiles = this.githubFiles.filter(file => 
            file.name.toLowerCase().includes(query.toLowerCase())
        );
        
        this.displayFiles(filteredFiles);
    }

    showDemoData() {
        // Демо-файлы
        this.githubFiles = this.generateDemoFiles();
        this.displayFiles(this.githubFiles);
        
        // Демо-метаданные
        this.fileMetadata = [
            {
                fileName: 'document.pdf',
                fileType: 'application/pdf',
                fileSize: 2048576,
                timestamp: Date.now() - 86400000,
                encrypted: true,
                passwordHint: 'пароль от архива'
            },
            {
                fileName: 'photo.jpg',
                fileType: 'image/jpeg',
                fileSize: 1048576,
                timestamp: Date.now() - 172800000,
                encrypted: false
            }
        ];
        
        // Обновляем статистику
        this.updateStats();
        
        // Показываем сообщение
        const demoAlert = document.createElement('div');
        demoAlert.className = 'status warning';
        demoAlert.innerHTML = `
            <strong>🎮 Демо-режим</strong>
            <p>Данные сохраняются только в вашем браузере. Для реальной работы настройте GitHub.</p>
            <button onclick="dashboard.showGitHubSetupModal()" class="btn-primary" style="margin-top: 10px;">
                <i class="fab fa-github"></i> Настроить GitHub
            </button>
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(demoAlert, container.firstChild);
        }
    }

    showLoading(show) {
        const loadingElement = document.getElementById('loadingIndicator');
        
        if (show) {
            if (!loadingElement) {
                const loader = document.createElement('div');
                loader.id = 'loadingIndicator';
                loader.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255,255,255,0.8);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                `;
                loader.innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 40px; margin-bottom: 20px;">⏳</div>
                        <div>Загрузка данных...</div>
                    </div>
                `;
                document.body.appendChild(loader);
            }
        } else {
            if (loadingElement) {
                loadingElement.remove();
            }
        }
    }

    updateUserActivity() {
        const auth = new AuthSystem();
        if (this.currentSession) {
            auth.updateActiveUsers(this.currentSession.ip, this.currentSession.userType);
        }
    }

    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('dashboardStatus');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        
        // Автоматически скрываем через 5 секунд
        setTimeout(() => {
            if (statusEl.textContent === message) {
                statusEl.textContent = '';
            }
        }, 5000);
    }

    refreshFiles() {
        this.loadAllData();
    }

    newDocument() {
        window.location.href = 'editor.html';
    }
}

// ==============================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ==============================

// Инициализация Dashboard
let dashboard;

document.addEventListener('DOMContentLoaded', async () => {
    dashboard = new Dashboard();
});

// Функции для HTML событий
function switchTab(tabName) {
    if (dashboard) dashboard.switchTab(tabName);
}

function showSettings() {
    if (dashboard) dashboard.showSettings();
}

function closeSettings() {
    if (dashboard) dashboard.closeSettings();
}

function saveSettings() {
    if (dashboard) dashboard.saveSettings();
}

function cancelEncryption() {
    if (dashboard) dashboard.closePasswordModal();
}

function startUpload() {
    if (dashboard) dashboard.startUpload();
}

function confirmEncryption() {
    if (dashboard) dashboard.confirmEncryption();
}

function confirmDecryption() {
    if (dashboard) dashboard.confirmDecryption();
}

function closeDecryptModal() {
    if (dashboard) dashboard.closeDecryptModal();
}

// Глобальный auth объект
const auth = new AuthSystem();
