const axios = require("axios"); 

async function chamarWebhookRoberty(nome) {
  const url = "https://api.roberty.app/prod/1/customer/robot/webhookCall";
  const token = "eJqCETr5o_nex0FSV830P";

  try {
    const response = await axios.post(url, {
      args: { nome }, // você pode adicionar mais argumentos aqui
      token
    });

    const webhookCallId = response.data.webhookCallId;
    console.log("[INFO] Webhook do Roberty chamado com sucesso. ID:", webhookCallId);

    return webhookCallId;
  } catch (error) {
    console.error("[ERRO] Falha ao chamar webhook do Roberty:", error.message);
    return null;
  }
}
async function consultarRespostaWebhookRoberty(webhookCallId) {
  const url = `https://api.roberty.app/prod/1/customer/robot/webhookResponse/${webhookCallId}`;

  try {
    const response = await axios.get(url);
    console.log("[INFO] Resposta do Robô:", response.data);
    return response.data;
  } catch (error) {
    console.error("[ERRO] Falha ao consultar resposta do Robô:", error.message);
    return null;
  }
}
module.exports = {
  chamarWebhookRoberty,
  consultarRespostaWebhookRoberty
};

