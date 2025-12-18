// Конфигурация OAuth
class GitHubOAuth {
    constructor() {
        // Получите эти значения из настроек вашего OAuth App
        this.config = {
            clientId: localStorage.getItem('github_client_id') || 'ВАШ_CLIENT_ID',
            clientSecret: 'ВАШ_CLIENT_SECRET', // Не используйте на клиенте!
            redirectUri: `${window.location.origin}/auth-callback.html`,
            scope: 'repo', // Права: полный доступ к репозиториям
            state: this.generateState(),
            authorizeUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token'
        };
    }

    // Генерация state для защиты от CSRF
    generateState() {
        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        sessionStorage.setItem('oauth_state', state);
        return state;
    }

    // Проверка state
    verifyState(state) {
        const savedState = sessionStorage.getItem('oauth_state');
        sessionStorage.removeItem('oauth_state');
        return state === savedState;
    }

    // Начало OAuth потока
    startOAuthFlow() {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: this.config.scope,
            state: this.config.state,
            allow_signup: 'true'
        });

        const authUrl = `${this.config.authorizeUrl}?${params.toString()}`;
        window.location.href = authUrl;
    }

    // Обработка callback
    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');

        if (!code) {
            throw new Error('Authorization code not found');
        }

        if (!this.verifyState(state)) {
            throw new Error('Invalid state parameter');
        }

        // Получаем access token
        const token = await this.exchangeCodeForToken(code);
        
        // Сохраняем токен
        localStorage.setItem('github_oauth_token', token);
        
        // Возвращаем на главную
        window.location.href = 'dashboard.html';
        
        return token;
    }

    // Обмен code на access token
    async exchangeCodeForToken(code) {
        // ВНИМАНИЕ: Этот метод требует серверной части!
        // GitHub не позволяет получать токены напрямую с клиента
        
        // Временное решение: использование Proxy Server
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const response = await fetch(proxyUrl + this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code: code,
                redirect_uri: this.config.redirectUri
            })
        });

        if (!response.ok) {
            throw new Error('Failed to exchange code for token');
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error_description || data.error);
        }

        return data.access_token;
    }

    // Получение информации о пользователе
    async getUserInfo(token) {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        return await response.json();
    }

    // Проверка валидности токена
    async validateToken(token) {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // Обновление конфигурации
    updateConfig(clientId, clientSecret) {
        this.config.clientId = clientId;
        this.config.clientSecret = clientSecret;
        
        localStorage.setItem('github_client_id', clientId);
        // Client Secret должен храниться на сервере!
    }
}

// Глобальный экземпляр
const gitHubOAuth = new GitHubOAuth();
