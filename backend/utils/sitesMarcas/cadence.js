const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
const listaProdutos = produtosJson
  .filter(p => (p.marca || "").trim().toUpperCase() === "CADENCE")
  .map(p => p.produto.trim());

async function executarBuscaCadence() {
  console.error("[INFO] Iniciando verificação de todos os produtos no site da Cadence...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoCadence(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        precoParcelado: "Indisponível",
        loja: "Cadence",
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_cadence.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));

  const resultadoFinal = {};
  for (const item of resultados) {
    resultadoFinal[item.termo] = {
      preco: item.preco,
      precoParcelado: item.precoParcelado,
      link: item.link
    };
  }

  console.log(JSON.stringify(resultadoFinal));
  console.error("[INFO] Script Cadence finalizado com sucesso.");
  process.exit(0);
}

async function buscarPrimeiroProdutoCadence(termo) {
  const termoBusca = encodeURIComponent(termo.trim());
  const urlBusca = `https://www.cadence.com.br/${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const linkProduto = $("a.product-image").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        precoParcelado: "Indisponível",
        loja: "Cadence",
        link: null,
      });
      return;
    }

    console.error("[DEBUG] Primeiro produto encontrado:", linkProduto);
    await extrairDetalhesProdutoCadence(linkProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Cadence",
      link: null,
    });
  }
}

async function extrairDetalhesProdutoCadence(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    // Preço parcelado
    let precoParcelado = $("strong.skuBestPrice").first().text().trim();
    if (!precoParcelado || !precoParcelado.includes("R$")) precoParcelado = "Indisponível";

    // Preço à vista = 10% menos
    let precoAvista = "Indisponível";
    if (precoParcelado !== "Indisponível") {
      const valor = parseFloat(precoParcelado.replace("R$", "").replace(".", "").replace(",", "."));
      precoAvista = `R$ ${ (valor * 0.9).toFixed(2).replace(".", ",") }`;
    }

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${precoAvista}`);
    console.error(`[RESULTADO] Preço parcelado: ${precoParcelado}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco: precoAvista,
      precoParcelado,
      loja: "Cadence",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Cadence",
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaCadence().catch(err => {
  console.error("[ERRO FATAL] Falha inesperada no script Cadence:", err.message);
  process.exit(1);
});
