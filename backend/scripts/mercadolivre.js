const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8"));
const listaProdutos = produtosJson.produtos;

async function executarBuscaEmTodos() {
  console.log("[INFO] Iniciando verificação de todos os produtos no Mercado Livre...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoML(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Mercado Livre",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_mercado_livre.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.log("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoML(termo) {
  const termoBusca = termo.trim().replace(/\s+/g, '-');
  const urlBusca = `https://lista.mercadolivre.com.br/${termoBusca}#D[A:${termo}]`;

  console.log("\n[INFO] ========== NOVA BUSCA ==========");
  console.log("[DEBUG] Termo:", termo);
  console.log("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const linkProduto = $("li.ui-search-layout__item a").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Mercado Livre",
        vendido: false,
        link: null,
      });
      return;
    }

    console.log("[DEBUG] Primeiro produto encontrado:", linkProduto);
    await extrairDetalhesProdutoML(linkProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Mercado Livre",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoML(urlProduto, termoOriginal) {
  console.log("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);

    const nome = $("h1.ui-pdp-title").first().text().trim();

    let preco = $("meta[itemprop='price']").attr("content");
    preco = preco ? `R$ ${parseFloat(preco).toFixed(2).replace('.', ',')}` : "Indisponível";

    const infoVendedor = $(".ui-pdp-seller__label-text-with-icon").text();
    const vendidoML = infoVendedor.toLowerCase().includes("mercado livre");

    console.log(`[RESULTADO] Produto: ${nome}`);
    console.log(`[RESULTADO] Preço à vista: ${preco}`);
    console.log(`[RESULTADO] Vendido por Mercado Livre: ${vendidoML ? "✅ Sim" : "❌ Não"}`);
    console.log(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Mercado Livre",
      vendido: vendidoML,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Mercado Livre",
      vendido: false,
      link: urlProduto
    });
  }

  console.log("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaEmTodos()
  .then(() => {
    console.log("[INFO] Script Mercado Livre finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Mercado Livre:", err.message);
    process.exit(1);
  });
