const fs = require('fs');
const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');

// Função para carregar proxies a partir do arquivo JSON
const loadProxies = () => {
    const proxies = JSON.parse(fs.readFileSync('proxies.json', 'utf8'));
    return proxies.map(proxy => `http://${proxy.ip_address}:${proxy.port}`);
};

// Função para testar cada proxy
const testProxy = async (proxy) => {
    try {
        const agent = new HttpsProxyAgent(proxy);
        const response = await axios.get('https://www.mercadolivre.com.br', {
            httpsAgent: agent,
            timeout: 5000, // Timeout de 5 segundos para não esperar muito
        });
        console.log(`Proxy funciona: ${proxy}`);
        return true;  // Proxy funciona
    } catch (error) {
        console.log(`Falha no proxy: ${proxy}`);
        return false;  // Proxy falhou
    }
};

// Função para verificar todos os proxies
const checkProxies = async () => {
    const proxies = loadProxies();
    for (const proxy of proxies) {
        await testProxy(proxy);
    }
};

// Inicia a verificação
checkProxies();
