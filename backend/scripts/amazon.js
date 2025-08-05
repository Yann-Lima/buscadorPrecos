const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8"));
const listaProdutos = produtosJson.produtos;

async function executarBuscaEmTodos() {
  console.log("[INFO] Iniciando verificação de todos os produtos na Amazon...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoAmazon(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Amazon",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_amazon.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.log("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoAmazon(termo) {
  const termoBusca = termo.trim().replace(/\s+/g, '+');
  const urlBusca = `https://www.amazon.com.br/s?k=${termoBusca}&rh=p_6%3AA1ZZFT5FULY4LN`;

  console.log("\n[INFO] ========== NOVA BUSCA ==========");
  console.log("[DEBUG] Termo:", termo);
  console.log("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);

    const primeiroLink = $("div[data-cy='image-container'] a.a-link-normal").first().attr("href");
    if (!primeiroLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Amazon",
        vendido: false,
        link: null,
      });
      return;
    }

    const urlProduto = `https://www.amazon.com.br${primeiroLink}`;
    console.log("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoAmazon(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Amazon",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoAmazon(urlProduto, termoOriginal) {
  console.log("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);

    const nome = $("#productTitle").text().trim();

    let preco = $("span.a-price span.a-price-whole").first().text().trim();
    const centavos = $("span.a-price span.a-price-fraction").first().text().trim();
    if (preco && centavos) {
      preco = `R$ ${preco},${centavos}`;
    } else {
      preco = "Indisponível";
    }

    const vendidoPor = $("span:contains('Amazon.com.br')").first().text().trim();
    const vendidoAmazon = vendidoPor.includes("Amazon.com.br");

    console.log(`[RESULTADO] Produto: ${nome}`);
    console.log(`[RESULTADO] Preço à vista: ${preco}`);
    console.log(`[RESULTADO] Vendido por Amazon: ${vendidoAmazon ? "✅ Sim" : "❌ Não"}`);
    console.log(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Amazon",
      vendido: vendidoAmazon,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Amazon",
      vendido: false,
      link: urlProduto
    });
  }

  console.log("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaEmTodos()
  .then(() => {
    console.log("[INFO] Script Amazon finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Amazon:", err.message);
    process.exit(1);
  });
