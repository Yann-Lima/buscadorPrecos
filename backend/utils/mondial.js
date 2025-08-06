const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
const listaProdutos = produtosJson
  .filter(p => (p.marca || "").trim().toUpperCase() === "MONDIAL")
  .map(p => p.produto.trim());

async function executarBuscaMondial() {
  console.error("[INFO] Iniciando verificação de todos os produtos no site da Mondial...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoMondial(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Mondial",
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_mondial.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.\n");

  // Mostra JSON simplificado no stdout para uso em planilhas
  const resultadoFinal = {};
  for (const item of resultados) {
    resultadoFinal[item.termo] = {
      preco: item.preco,
      link: item.link
    };
  }

  console.log(JSON.stringify(resultadoFinal));

  console.error("[INFO] Script Mondial finalizado com sucesso.");
  process.exit(0);
}

async function buscarPrimeiroProdutoMondial(termo) {
  const termoBusca = encodeURIComponent(termo.trim());
  const urlBusca = `https://www.mondial.com.br/${termoBusca}?_q=${termoBusca}&map=ft`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const linkRelativo = $("a.vtex-product-summary-2-x-clearLink").first().attr("href");

    if (!linkRelativo) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Mondial",
        link: null,
      });
      return;
    }

    const urlProduto = "https://www.mondial.com.br" + linkRelativo;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoMondial(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Mondial",
      link: null,
    });
  }
}

async function extrairDetalhesProdutoMondial(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    let preco = $("div.vtex-price-percent-vitrine span.vtex-price-percent-text")
      .first()
      .text()
      .trim();

    if (!preco || !preco.includes("R$")) preco = "Indisponível";

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${preco}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Mondial",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Mondial",
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaMondial().catch(err => {
  console.error("[ERRO FATAL] Falha inesperada no script Mondial:", err.message);
  process.exit(1);
});
