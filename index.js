const express = require("express");
const axios = require("axios");
const app = express();
const PORT = 3000;

const SKUS = ["AFN-40-BI", "BFR11PG", "BFR38", "PFR15PI", "OFRT520", "EAF15", "BFR2100"];

async function buscarPorCodigo(codigo) {
  try {
    const response = await axios.get("https://api.mercadolibre.com/sites/MLB/search", {
      params: { q: codigo, limit: 1 }
    });

    const resultados = response.data.results;
    if (resultados.length === 0) {
      return { codigo, error: "Produto não encontrado" };
    }

    const r = resultados[0];
    return {
      codigo,
      id: r.id,
      title: r.title,
      price: r.price,
      permalink: r.permalink,
      thumbnail: r.thumbnail
    };
  } catch (error) {
    return {
      codigo,
      error: "Falha na busca",
      detail: error.response?.data || error.message
    };
  }
}

app.get("/produtos", async (req, res) => {
  const codigos = req.query.q ? req.query.q.split(",").map(c => c.trim()) : SKUS;
  const resultados = [];

  for (const codigo of codigos) {
    resultados.push(await buscarPorCodigo(codigo));
  }

  res.json({ produtos: resultados });
});

app.listen(PORT, () => {
  console.log(`✅ API rodando em: http://localhost:${PORT}/produtos`);
});
