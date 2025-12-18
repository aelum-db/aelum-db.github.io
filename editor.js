class DocumentEditor {
    constructor() {
        this.currentFile = null;
        this.isPreview = false;
        this.init();
    }

    init() {
        this.loadDocuments();
        this.setupAutoSave();
    }

    // Загрузка списка документов
    async loadDocuments() {
        const session = auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        try {
            // Загружаем документы из GitHub
            const documents = await this.fetchDocuments(session.token);
            this.displayDocuments(documents);
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }

    // Отображение документов в сайдбаре
    displayDocuments(documents) {
        const container = document.getElementById('documentList');
        container.innerHTML = '';
        
        documents.forEach(doc => {
            const div = document.createElement('div');
            div.className = `file-item ${doc.editable ? 'editable' : ''}`;
            div.innerHTML = `
                <div>
                    <strong>${doc.name}</strong><br>
                    <small>${new Date(doc.timestamp).toLocaleDateString()}</small>
                </div>
                <div>
                    <button onclick="editor.openDocument('${doc.path}')" class="toolbar-btn" style="padding: 5px;">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    // Форматирование текста
    formatText(command) {
        document.execCommand(command, false, null);
        this.updateEditorState();
    }

    formatHeading(level) {
        if (level) {
            document.execCommand('formatBlock', false, level);
        }
    }

    // Вставка ссылки
    insertLink() {
        document.getElementById('linkModal').style.display = 'flex';
    }

    confirmLink() {
        const url = document.getElementById('linkUrl').value;
        const text = document.getElementById('linkText').value;
        
        if (url) {
            const linkText = text || url;
            document.execCommand('insertHTML', false, 
                `<a href="${url}" target="_blank">${linkText}</a>`);
        }
        
        this.closeModal();
    }

    closeModal() {
        document.getElementById('linkModal').style.display = 'none';
        document.getElementById('linkUrl').value = '';
        document.getElementById('linkText').value = '';
    }

    // Вставка таблицы
    insertTable() {
        const tableHTML = `
            <table border="1" style="width: 100%; border-collapse: collapse; margin: 10px 0;">
                <tr>
                    <td style="padding: 8px;">Ячейка 1</td>
                    <td style="padding: 8px;">Ячейка 2</td>
                </tr>
                <tr>
                    <td style="padding: 8px;">Ячейка 3</td>
                    <td style="padding: 8px;">Ячейка 4</td>
                </tr>
            </table>
        `;
        document.execCommand('insertHTML', false, tableHTML);
    }

    // Переключение предпросмотра
    togglePreview() {
        const editor = document.getElementById('editorArea');
        const preview = document.getElementById('previewArea');
        
        if (this.isPreview) {
            editor.style.display = 'block';
            preview.style.display = 'none';
            this.isPreview = false;
        } else {
            preview.innerHTML = editor.innerHTML;
            editor.style.display = 'none';
            preview.style.display = 'block';
            this.isPreview = true;
        }
    }

    // Сохранение документа
    async saveDocument() {
        const content = document.getElementById('editorArea').innerHTML;
        const session = auth.getSession();
        
        if (!session) {
            showStatus('Сессия истекла', 'error');
            return;
        }

        // Запрашиваем имя файла
        const fileName = prompt('Введите имя файла:', 
            this.currentFile || `document_${Date.now()}.html`);
        
        if (!fileName) return;

        try {
            // Шифруем содержимое
            const password = prompt('Введите пароль для шифрования документа:');
            if (!password) return;
            
            const file = new File([content], fileName, { type: 'text/html' });
            const encrypted = await encryptor.encryptFile(file, password);
            
            // Загружаем на GitHub
            await this.uploadToGitHub(fileName + '.encrypted', encrypted.buffer, session.token);
            
            showStatus('Документ сохранен и зашифрован', 'success');
            this.currentFile = fileName;
            this.loadDocuments();
            
        } catch (error) {
            showStatus('Ошибка сохранения: ' + error.message, 'error');
        }
    }

    // Автосохранение
    setupAutoSave() {
        let saveTimeout;
        const editor = document.getElementById('editorArea');
        
        editor.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.autoSave();
            }, 30000); // Каждые 30 секунд
        });
    }

    async autoSave() {
        if (!this.currentFile) return;
        
        const content = document.getElementById('editorArea').innerHTML;
        localStorage.setItem(`autosave_${this.currentFile}`, content);
        
        // Показываем уведомление
        const status = document.getElementById('status');
        status.textContent = 'Автосохранение...';
        setTimeout(() => status.textContent = '', 2000);
    }

    // Создание нового документа
    newDocument() {
        if (confirm('Создать новый документ? Несохраненные изменения будут потеряны.')) {
            document.getElementById('editorArea').innerHTML = 
                '<h1>Новый документ</h1><p>Начните печатать здесь...</p>';
            this.currentFile = null;
        }
    }

    // Загрузка документов из GitHub
    async fetchDocuments(token) {
        const config = JSON.parse(localStorage.getItem('config') || '{}');
        const url = `https://api.github.com/repos/${config.repoOwner || 'your-username'}/${config.repoName || 'aelum-bd'}/contents/documents`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${token}`
                }
            });
            
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Fetch error:', error);
            return [];
        }
    }

    // Загрузка на GitHub
    async uploadToGitHub(path, content, token) {
        const config = JSON.parse(localStorage.getItem('config') || '{}');
        const url = `https://api.github.com/repos/${config.repoOwner || 'your-username'}/${config.repoName || 'aelum-bd'}/contents/documents/${path}`;
        
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
                message: `Save document: ${path}`,
                content: base64Content
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки на GitHub');
        }
        
        return response.json();
    }
}

// Инициализация редактора
const editor = new DocumentEditor();

// Глобальные функции для HTML
function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    setTimeout(() => statusEl.textContent = '', 3000);
}

// Проверка сессии при загрузке
window.addEventListener('load', async () => {
    const session = await auth.verifySession();
    if (!session) {
        window.location.href = 'index.html';
    }
});
