const axios = require("axios");

const ACCESS_TOKEN = 'APP_USR-4764712489016012-080109-76b4f911af504c67789cd42ef2a7ed26-2591364765';

const SKUS = [
  "AFN-40-BI",
  "BFR11PG",
  "BFR38",
  "PFR15PI",
  "OFRT520",
  "EAF15",
  "BFR2100"
];

// Etapa 1: Buscar item_id (MLBxxxxxxx) por SKU
async function buscarItemIdPorSku(sku) {
  try {
    const response = await axios.get("https://api.mercadolibre.com/sites/MLB/search", {
      params: { q: sku, limit: 1 }
    });

    if (response.data.results.length === 0) {
      console.warn(`⚠️ SKU não encontrado: ${sku}`);
      return null;
    }

    const id = response.data.results[0].id;
    console.log(`🔎 SKU: ${sku} → ID: ${id}`);
    return id;
  } catch (error) {
    console.error(`❌ Erro ao buscar SKU: ${sku}`, error.response?.data || error.message);
    return null;
  }
}

// Etapa 2: Buscar todos os detalhes dos produtos via /items
async function buscarDetalhesPorIds(itemIds) {
  try {
    const response = await axios.get("https://api.mercadolibre.com/items", {
      params: { ids: itemIds.join(',') },
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`
      }
    });

    console.log("\n📦 Detalhes completos:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("❌ Erro ao buscar detalhes dos produtos:", error.response?.data || error.message);
  }
}

// Execução principal
(async () => {
  const itemIds = [];

  for (const sku of SKUS) {
    const id = await buscarItemIdPorSku(sku);
    if (id) itemIds.push(id);
  }

  if (itemIds.length === 0) {
    console.log("❌ Nenhum ID encontrado para os SKUs fornecidos.");
    return;
  }

  await buscarDetalhesPorIds(itemIds);
})();
