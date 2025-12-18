// server.js - Простой прокси сервер для GitHub OAuth
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// OAuth callback endpoint
app.post('/api/oauth/token', async (req, res) => {
    try {
        const { client_id, client_secret, code, redirect_uri } = req.body;
        
        const response = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: client_id || process.env.GITHUB_CLIENT_ID,
            client_secret: client_secret || process.env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri
        }, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('OAuth error:', error);
        res.status(500).json({ error: 'Failed to get access token' });
    }
});

// Proxy для GitHub API (обход CORS)
app.all('/api/github/*', async (req, res) => {
    try {
        const githubUrl = req.url.replace('/api/github', 'https://api.github.com');
        
        const response = await axios({
            method: req.method,
            url: githubUrl,
            data: req.body,
            headers: {
                'Authorization': req.headers.authorization,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Aelum-BD'
            }
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(error.response?.status || 500).json({ 
            error: error.response?.data?.message || 'Proxy error' 
        });
    }
});

// Статические файлы для GitHub Pages
app.use(express.static('public'));

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});
