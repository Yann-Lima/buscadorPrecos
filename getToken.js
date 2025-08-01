require('dotenv').config();
const axios = require('axios');

//https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=4764712489016012&redirect_uri=https://beaversolucoes.com.br/meli/callback.php
// Cole aqui o código recebido na URL após login com o Mercado Livre
const code = 'TG-688cbfe529969400019e322d-2591364765';

async function getTokenFromCode(code) {
  try {
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.REDIRECT_URI
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, user_id } = response.data;

    console.log('✅ Access Token:', access_token);
    console.log('🔄 Refresh Token:', refresh_token);
    console.log('👤 User ID:', user_id);

    // Salve os tokens em banco, arquivo ou .env para uso futuro
  } catch (error) {
    console.error('❌ Erro ao obter token:', error.response?.data || error.message);
  }
}

getTokenFromCode(code);
