const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// 🔍 Filtra apenas produtos Walita, Wallita ou Philips Walita
const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
const listaProdutos = produtosJson
  .filter(p => {
    const marca = (p.marca || "").trim().toUpperCase();
    return marca === "WALITA" || marca === "WALLITA" || marca === "PHILIPS WALITA";
  })
  .map(p => p.produto.trim());

async function executarBuscaWalita() {
  console.error("[INFO] Iniciando verificação de todos os produtos no site da Walita...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoWalita(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        precoParcelado: "Indisponível",
        loja: "Walita",
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_walita.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));

  console.error("\n[INFO] Fim da verificação.\n");

  const resultadoFinal = {};
  for (const item of resultados) {
    resultadoFinal[item.termo] = {
      preco: item.preco,
      precoParcelado: item.precoParcelado,
      link: item.link
    };
  }

  console.log(JSON.stringify(resultadoFinal));
  console.error("[INFO] Script Walita finalizado com sucesso.");
  process.exit(0);
}

async function buscarPrimeiroProdutoWalita(termo) {
  const termoBusca = encodeURIComponent(termo.trim());
  const urlBusca = `https://www.walita.com.br/${termoBusca}?_q=${termoBusca}&map=ft`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);

    // 🔍 Verifica se é página de "não encontrado"
    if ($(".vtex-search-result-3-x-searchNotFoundInfo").length > 0) {
      console.warn("[WARN] Produto indisponível:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        precoParcelado: "Indisponível",
        loja: "Walita",
        link: null,
      });
      return;
    }

    const linkRelativo = $("a.vtex-product-summary-2-x-clearLink").first().attr("href");

    if (!linkRelativo) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        precoParcelado: "Indisponível",
        loja: "Walita",
        link: null,
      });
      return;
    }

    const urlProduto = "https://www.walita.com.br" + linkRelativo;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoWalita(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Walita",
      link: null,
    });
  }
}

async function extrairDetalhesProdutoWalita(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    // 🟢 Preço à vista
    let preco = $(".vtex-product-price-1-x-spotPriceValue").map((i, el) => $(el).text().trim()).get().join("");
    preco = preco.replace(/\s+/g, " ").trim();
    if (!preco || !preco.includes("R$")) preco = "Indisponível";

    // 🟢 Preço parcelado
    let precoParcelado = $(".vtex-product-price-1-x-installmentsTotalValue--summary-pdp")
      .map((i, el) => $(el).text().trim())
      .get()
      .join("");
    precoParcelado = precoParcelado.replace(/\s+/g, " ").trim();
    if (!precoParcelado || !precoParcelado.includes("R$")) precoParcelado = "Indisponível";

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${preco}`);
    console.error(`[RESULTADO] Preço parcelado: ${precoParcelado}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      precoParcelado,
      loja: "Walita",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Walita",
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaWalita().catch(err => {
  console.error("[ERRO FATAL] Falha inesperada no script Walita:", err.message);
  process.exit(1);
});
