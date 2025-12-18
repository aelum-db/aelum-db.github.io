// Класс для работы с GitHub API
class GitHubUploader {
    constructor() {
        this.config = gitHubConfig;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        this.chunkSize = 10 * 1024 * 1024; // 10MB для больших файлов
    }

    // Проверка доступности репозитория
    async verifyRepository(token) {
        try {
            const response = await fetch(this.config.getApiUrl(), {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.status === 404) {
                throw new Error('Репозиторий не найден. Проверьте название и доступы.');
            }
            
            if (response.status === 403) {
                throw new Error('Доступ запрещен. Проверьте токен.');
            }
            
            if (!response.ok) {
                throw new Error(`Ошибка GitHub: ${response.status}`);
            }
            
            const repoInfo = await response.json();
            return {
                success: true,
                data: repoInfo,
                message: 'Репозиторий доступен'
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    // Загрузка файла на GitHub
    async uploadFile(file, token, options = {}) {
        // Проверка размера файла
        if (file.size > this.maxFileSize) {
            throw new Error(`Файл слишком большой. Максимум: ${this.formatSize(this.maxFileSize)}`);
        }

        const {
            path = '',           // Путь в репозитории
            message = 'Upload file', // Сообщение коммита
            encrypt = false,     // Шифровать ли файл
            password = '',       // Пароль для шифрования
            onProgress = null    // Callback для прогресса
        } = options;

        try {
            let content;
            let finalPath = path || `files/${Date.now()}_${file.name}`;
            
            // Если нужно шифровать
            if (encrypt && password) {
                const encrypted = await encryptor.encryptFile(file, password);
                content = encrypted.buffer;
                finalPath += '.encrypted';
                
                // Возвращаем метаданные для сохранения
                return {
                    encrypted: true,
                    metadata: encrypted.metadata,
                    path: finalPath,
                    ...await this.uploadContent(finalPath, content, token, message, onProgress)
                };
            } else {
                // Читаем файл как Base64
                content = await this.fileToBase64(file);
                return await this.uploadContent(finalPath, content, token, message, onProgress);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    // Загрузка контента на GitHub
    async uploadContent(path, content, token, message, onProgress) {
        // Конвертируем в Base64 если это ArrayBuffer
        let base64Content;
        if (content instanceof ArrayBuffer) {
            base64Content = this.arrayBufferToBase64(content);
        } else {
            base64Content = content.split(',')[1] || content;
        }

        // Проверяем, существует ли файл (нужен для обновления)
        let sha = '';
        try {
            const existingFile = await this.getFileInfo(path, token);
            if (existingFile) {
                sha = existingFile.sha;
            }
        } catch (error) {
            // Файл не существует - это нормально для новой загрузки
        }

        // Подготавливаем запрос
        const requestBody = {
            message: message,
            content: base64Content
        };

        if (sha) {
            requestBody.sha = sha;
        }

        // Отправляем на GitHub
        const response = await fetch(this.config.getApiUrl(`/contents/${path}`), {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Ошибка загрузки на GitHub');
        }

        const result = await response.json();
        
        // Вызываем callback прогресса
        if (onProgress && typeof onProgress === 'function') {
            onProgress(100);
        }

        return {
            success: true,
            data: result,
            downloadUrl: result.content.download_url,
            htmlUrl: result.content.html_url,
            sha: result.content.sha
        };
    }

    // Загрузка больших файлов по частям (LFS)
    async uploadLargeFile(file, token, options = {}) {
        const {
            path = `files/${Date.now()}_${file.name}`,
            message = 'Upload large file'
        } = options;

        // Создаем LFS объект
        const lfsResult = await this.createLFSObject(file, token);
        
        // Создаем указатель на LFS объект
        const pointerContent = `version https://git-lfs.github.com/spec/v1
oid sha256:${lfsResult.oid}
size ${file.size}`;

        const base64Pointer = btoa(pointerContent);
        
        // Загружаем указатель
        const response = await fetch(this.config.getApiUrl(`/contents/${path}`), {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                content: base64Pointer
            })
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки LFS указателя');
        }

        return {
            success: true,
            lfs: true,
            oid: lfsResult.oid,
            size: file.size
        };
    }

    // Создание LFS объекта
    async createLFSObject(file, token) {
        // Читаем файл как ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Создаем SHA256 хеш
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const oid = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // В реальной реализации здесь должна быть загрузка в LFS хранилище
        // Для GitHub это требует настройки LFS в репозитории
        
        return {
            oid: oid,
            size: file.size
        };
    }

    // Скачивание файла с GitHub
    async downloadFile(path, token, options = {}) {
        const {
            decrypt = false,
            password = ''
        } = options;

        try {
            // Получаем информацию о файле
            const fileInfo = await this.getFileInfo(path, token);
            
            if (!fileInfo) {
                throw new Error('Файл не найден');
            }

            // Если это LFS файл (проверяем по содержимому)
            const content = atob(fileInfo.content);
            if (content.includes('git-lfs.github.com/spec/v1')) {
                return await this.downloadLFSFile(content, token);
            }

            // Скачиваем обычный файл
            const downloadUrl = fileInfo.download_url;
            const response = await fetch(downloadUrl);
            
            if (!response.ok) {
                throw new Error('Ошибка скачивания файла');
            }

            let fileData;
            
            if (decrypt && password) {
                // Если файл зашифрован
                const encryptedBuffer = await response.arrayBuffer();
                fileData = await encryptor.decryptFile(encryptedBuffer, password);
            } else {
                // Обычный файл
                const blob = await response.blob();
                fileData = new File([blob], this.getFileNameFromPath(path), { 
                    type: this.getMimeType(path) 
                });
            }

            return {
                success: true,
                file: fileData,
                metadata: {
                    name: this.getFileNameFromPath(path),
                    size: fileData.size,
                    type: fileData.type,
                    sha: fileInfo.sha,
                    encrypted: decrypt
                }
            };

        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    }

    // Скачивание LFS файла
    async downloadLFSFile(pointerContent, token) {
        // Парсим pointer файл
        const lines = pointerContent.split('\n');
        const oid = lines[1]?.split(':')[1]?.trim();
        const size = parseInt(lines[2]?.split(' ')[1]?.trim());
        
        if (!oid || !size) {
            throw new Error('Неверный LFS pointer файл');
        }

        // Получаем LFS объект
        // В реальной реализации здесь запрос к LFS API GitHub
        // Это требует настройки LFS в репозитории
        
        throw new Error('LFS загрузка требует настройки Git LFS в репозитории');
    }

    // Получение списка файлов
    async listFiles(path = '', token) {
        try {
            const url = this.config.getApiUrl(`/contents/${path}`);
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return []; // Папка не существует
                }
                throw new Error(`Ошибка получения списка файлов: ${response.status}`);
            }

            const items = await response.json();
            
            // Фильтруем только файлы
            const files = items.filter(item => item.type === 'file');
            
            return files.map(file => ({
                name: file.name,
                path: file.path,
                size: file.size,
                downloadUrl: file.download_url,
                htmlUrl: file.html_url,
                sha: file.sha,
                type: this.getFileType(file.name),
                encrypted: file.name.endsWith('.encrypted')
            }));
            
        } catch (error) {
            console.error('List files error:', error);
            throw error;
        }
    }

    // Удаление файла
    async deleteFile(path, token, message = 'Delete file') {
        try {
            // Сначала получаем SHA файла
            const fileInfo = await this.getFileInfo(path, token);
            
            if (!fileInfo) {
                throw new Error('Файл не найден');
            }

            const response = await fetch(this.config.getApiUrl(`/contents/${path}`), {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    sha: fileInfo.sha
                })
            });

            if (!response.ok) {
                throw new Error('Ошибка удаления файла');
            }

            return {
                success: true,
                message: 'Файл удален'
            };
            
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    }

    // Получение информации о файле
    async getFileInfo(path, token) {
        try {
            const response = await fetch(this.config.getApiUrl(`/contents/${path}`), {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Ошибка получения информации о файле: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Get file info error:', error);
            return null;
        }
    }

    // Вспомогательные методы

    // Конвертация файла в Base64
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Конвертация ArrayBuffer в Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Определение типа файла
    getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const types = {
            // Изображения
            'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image',
            'webp': 'image', 'svg': 'image', 'bmp': 'image', 'ico': 'image',
            
            // Документы
            'pdf': 'document', 'doc': 'document', 'docx': 'document',
            'txt': 'text', 'rtf': 'document', 'odt': 'document',
            
            // Таблицы
            'xls': 'spreadsheet', 'xlsx': 'spreadsheet', 'csv': 'spreadsheet',
            'ods': 'spreadsheet',
            
            // Презентации
            'ppt': 'presentation', 'pptx': 'presentation', 'odp': 'presentation',
            
            // Архивы
            'zip': 'archive', 'rar': 'archive', '7z': 'archive', 'tar': 'archive',
            'gz': 'archive',
            
            // Аудио
            'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'flac': 'audio',
            
            // Видео
            'mp4': 'video', 'avi': 'video', 'mov': 'video', 'mkv': 'video',
            
            // Код
            'html': 'code', 'js': 'code', 'css': 'code', 'json': 'code',
            'py': 'code', 'java': 'code', 'cpp': 'code', 'cs': 'code'
        };
        
        return types[ext] || 'unknown';
    }

    // Получение MIME типа
    getMimeType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const mimeTypes = {
            'txt': 'text/plain',
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript',
            'json': 'application/json',
            'pdf': 'application/pdf',
            'zip': 'application/zip',
            'mp3': 'audio/mpeg',
            'mp4': 'video/mp4',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }

    // Получение имени файла из пути
    getFileNameFromPath(path) {
        return path.split('/').pop();
    }

    // Форматирование размера
    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Создание дерева файлов (для отображения структуры)
    async getFileTree(token, path = '') {
        try {
            const files = await this.listFiles(path, token);
            const tree = [];
            
            for (const file of files) {
                if (file.type === 'dir') {
                    // Рекурсивно получаем содержимое папок
                    const children = await this.getFileTree(token, file.path);
                    tree.push({
                        name: file.name,
                        type: 'directory',
                        children: children
                    });
                } else {
                    tree.push({
                        name: file.name,
                        type: 'file',
                        size: file.size,
                        path: file.path,
                        encrypted: file.encrypted
                    });
                }
            }
            
            return tree;
        } catch (error) {
            console.error('Get file tree error:', error);
            return [];
        }
    }
}

// Глобальный экземпляр
const gitHubUploader = new GitHubUploader();
