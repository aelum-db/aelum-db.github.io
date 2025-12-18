// Конфигурация GitHub
class GitHubConfig {
    constructor() {
        this.config = {
            owner: localStorage.getItem('github_owner') || '',
            repo: localStorage.getItem('github_repo') || 'aelum-bd',
            branch: 'main',
            baseUrl: 'https://api.github.com'
        };
    }

    // Проверка конфигурации
    isValid() {
        return this.config.owner && this.config.repo;
    }

    // Установка репозитория
    setRepository(owner, repo) {
        this.config.owner = owner;
        this.config.repo = repo;
        
        localStorage.setItem('github_owner', owner);
        localStorage.setItem('github_repo', repo);
        
        return true;
    }

    // Получение URL для API
    getApiUrl(path = '') {
        return `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}${path}`;
    }

    // Получение настроек для пользователя
    getUserConfig() {
        return {
            owner: this.config.owner,
            repo: this.config.repo,
            isConfigured: this.isValid()
        };
    }
}

// Глобальный экземпляр
const gitHubConfig = new GitHubConfig();
