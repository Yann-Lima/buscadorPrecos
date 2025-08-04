const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const TOKEN_PATH = './token.json';

function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  const data = fs.readFileSync(TOKEN_PATH, 'utf-8');
  return JSON.parse(data);
}

function saveToken(tokenData) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
}

async function refreshAccessToken(refreshToken) {
  const { CLIENT_ID, CLIENT_SECRET } = process.env;
  const url = 'https://api.mercadolibre.com/oauth/token';

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('refresh_token', refreshToken);

  const response = await axios.post(url, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = response.data;
  saveToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000
  });

  return data.access_token;
}

async function getValidAccessToken() {
  const tokenData = loadToken();

  if (tokenData?.access_token && Date.now() < tokenData.expires_at) {
    return tokenData.access_token;
  }

  if (tokenData?.refresh_token) {
    return await refreshAccessToken(tokenData.refresh_token);
  }

  console.error('❌ Nenhum token válido encontrado. Faça o processo OAuth e salve o token.');
  process.exit(1);
}

module.exports = {
  getValidAccessToken,
  saveToken
};
