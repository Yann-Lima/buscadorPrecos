const axios = require("axios");

async function chamarWebhookRoberty() {
  const url = "https://api.roberty.app/main/public/webhook/request";
  const token = "H0xSW9RE2hlthQ2Q602FL";

  try {
    const response = await axios.post(
      url,
      { name: "inicio" }, // body
      {
        headers: {
          "x-roberty-token": token,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("[INFO] Webhook do Roberty chamado com sucesso:", response.data);
    return response.data;
  } catch (error) {
    console.error("[ERRO] Falha ao chamar webhook do Roberty:", error.message);
    return null;
  }
}

module.exports = { chamarWebhookRoberty };

if (require.main === module) {
  chamarWebhookRoberty();
}
