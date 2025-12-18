// Класс для скачивания файлов с GitHub
class GitHubDownloader {
    constructor() {
        this.config = gitHubConfig;
    }

    // Скачивание файла
    async download(fileInfo, token, options = {}) {
        const {
            decrypt = false,
            password = '',
            onProgress = null
        } = options;

        try {
            // Если есть прямая ссылка на скачивание
            if (fileInfo.download_url) {
                return await this.downloadFromUrl(
                    fileInfo.download_url, 
                    fileInfo.name, 
                    decrypt, 
                    password, 
                    onProgress
                );
            }
            
            // Иначе используем API
            return await this.downloadFromAPI(
                fileInfo.path, 
                token, 
                decrypt, 
                password, 
                onProgress
            );
            
        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    }

    // Скачивание по URL
    async downloadFromUrl(url, filename, decrypt = false, password = '', onProgress) {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Ошибка скачивания: ${response.status}`);
        }

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        // Создаем reader для отслеживания прогресса
        const reader = response.body.getReader();
        const chunks = [];
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            chunks.push(value);
            loaded += value.length;
            
            // Обновляем прогресс
            if (onProgress && total > 0) {
                const percent = Math.round((loaded / total) * 100);
                onProgress(percent);
            }
        }

        // Собираем все чанки в ArrayBuffer
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const arrayBuffer = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const chunk of chunks) {
            arrayBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        // Обработка файла
        if (decrypt && password) {
            // Расшифровка
            const decryptedFile = await encryptor.decryptFile(arrayBuffer.buffer, password);
            return this.createDownload(decryptedFile, filename);
        } else {
            // Обычный файл
            const blob = new Blob([arrayBuffer]);
            const file = new File([blob], filename);
            return this.createDownload(file, filename);
        }
    }

    // Скачивание через API
    async downloadFromAPI(path, token, decrypt = false, password = '', onProgress) {
        const fileInfo = await gitHubUploader.getFileInfo(path, token);
        
        if (!fileInfo) {
            throw new Error('Файл не найден');
        }

        // Декодируем Base64 контент
        const content = atob(fileInfo.content);
        const filename = this.getFileNameFromPath(path);

        if (decrypt && password) {
            // Конвертируем строку в ArrayBuffer
            const encoder = new TextEncoder();
            const arrayBuffer = encoder.encode(content).buffer;
            
            // Расшифровываем
            const decryptedFile = await encryptor.decryptFile(arrayBuffer, password);
            return this.createDownload(decryptedFile, filename);
        } else {
            // Создаем файл из строки
            const blob = new Blob([content]);
            const file = new File([blob], filename);
            return this.createDownload(file, filename);
        }
    }

    // Создание ссылки для скачивания
    createDownload(file, filename) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        return {
            url: url,
            filename: filename,
            size: file.size,
            type: file.type,
            element: a,
            download: () => {
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 100);
            }
        };
    }

    // Пакетное скачивание
    async downloadMultiple(files, token, options = {}) {
        const results = [];
        
        for (const file of files) {
            try {
                const result = await this.download(file, token, options);
                results.push({
                    success: true,
                    file: file.name,
                    ...result
                });
            } catch (error) {
                results.push({
                    success: false,
                    file: file.name,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    // Получение имени файла из пути
    getFileNameFromPath(path) {
        return path.split('/').pop();
    }

    // Получение содержимого текстового файла
    async getTextFileContent(path, token) {
        try {
            const fileInfo = await gitHubUploader.getFileInfo(path, token);
            
            if (!fileInfo) {
                throw new Error('Файл не найден');
            }

            const content = atob(fileInfo.content);
            return {
                success: true,
                content: content,
                size: content.length,
                encoding: 'utf-8'
            };
        } catch (error) {
            console.error('Get text content error:', error);
            throw error;
        }
    }

    // Предпросмотр изображения
    async getImagePreview(path, token, maxSize = 1024) {
        try {
            const fileInfo = await gitHubUploader.getFileInfo(path, token);
            
            if (!fileInfo) {
                throw new Error('Изображение не найдено');
            }

            // Проверяем, что это изображение
            const filename = this.getFileNameFromPath(path);
            const ext = filename.split('.').pop().toLowerCase();
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
            
            if (!imageExts.includes(ext)) {
                throw new Error('Файл не является изображением');
            }

            // Создаем URL для изображения
            const content = atob(fileInfo.content);
            const byteCharacters = atob(fileInfo.content);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
            const url = URL.createObjectURL(blob);
            
            return {
                success: true,
                url: url,
                filename: filename,
                size: fileInfo.size,
                type: `image/${ext}`
            };
        } catch (error) {
            console.error('Get image preview error:', error);
            throw error;
        }
    }
}

// Глобальный экземпляр
const gitHubDownloader = new GitHubDownloader();
