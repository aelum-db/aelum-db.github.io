class FileEncryptor {
    constructor() {
        this.algorithm = {
            name: 'AES-GCM',
            length: 256
        };
    }

    // Генерация ключа из пароля
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        // Используем PBKDF2 для получения ключа
        const baseKey = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            baseKey,
            this.algorithm,
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Шифрование файла
    async encryptFile(file, password) {
        try {
            // Генерируем соль и IV
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            // Получаем ключ
            const key = await this.deriveKey(password, salt);
            
            // Читаем файл как ArrayBuffer
            const fileBuffer = await file.arrayBuffer();
            
            // Шифруем
            const encryptedContent = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                fileBuffer
            );
            
            // Создаем метаданные
            const metadata = {
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                encryptedSize: encryptedContent.byteLength,
                timestamp: Date.now(),
                salt: Array.from(salt),
                iv: Array.from(iv)
            };
            
            // Объединяем метаданные и зашифрованный контент
            const metadataJson = JSON.stringify(metadata);
            const metadataBuffer = new TextEncoder().encode(metadataJson);
            const metadataLength = metadataBuffer.length;
            
            // Создаем финальный буфер: [длина метаданных][метаданные][зашифрованный контент]
            const finalBuffer = new ArrayBuffer(4 + metadataLength + encryptedContent.byteLength);
            const finalView = new DataView(finalBuffer);
            
            // Записываем длину метаданных
            finalView.setUint32(0, metadataLength);
            
            // Записываем метаданные
            new Uint8Array(finalBuffer, 4, metadataLength).set(metadataBuffer);
            
            // Записываем зашифрованный контент
            new Uint8Array(finalBuffer, 4 + metadataLength).set(new Uint8Array(encryptedContent));
            
            return {
                buffer: finalBuffer,
                metadata: metadata,
                extension: '.encrypted'
            };
            
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Ошибка шифрования файла');
        }
    }

    // Расшифровка файла
    async decryptFile(encryptedBuffer, password) {
        try {
            const view = new DataView(encryptedBuffer);
            
            // Читаем длину метаданных
            const metadataLength = view.getUint32(0);
            
            // Читаем метаданные
            const metadataBuffer = encryptedBuffer.slice(4, 4 + metadataLength);
            const metadataJson = new TextDecoder().decode(metadataBuffer);
            const metadata = JSON.parse(metadataJson);
            
            // Читаем зашифрованный контент
            const encryptedContent = encryptedBuffer.slice(4 + metadataLength);
            
            // Восстанавливаем соль и IV
            const salt = new Uint8Array(metadata.salt);
            const iv = new Uint8Array(metadata.iv);
            
            // Получаем ключ
            const key = await this.deriveKey(password, salt);
            
            // Расшифровываем
            const decryptedBuffer = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                encryptedContent
            );
            
            // Создаем файл из буфера
            const decryptedFile = new File(
                [decryptedBuffer],
                metadata.fileName,
                { type: metadata.fileType }
            );
            
            return decryptedFile;
            
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Ошибка расшифровки. Проверьте пароль.');
        }
    }

    // Генерация безопасного пароля для файла
    generateFilePassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => chars[byte % chars.length]).join('');
    }
}

// Экспорт
const encryptor = new FileEncryptor();
