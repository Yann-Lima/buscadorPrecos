const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// Caminho para o catalogoProdutos.json (apenas este será usado)
const catalogoProdutosPath = path.join(__dirname, "catalogoProdutos.json");

// Carrega o catálogo diretamente, ignorando os arquivos antigos
const produtosJson = JSON.parse(fs.readFileSync(catalogoProdutosPath, "utf-8"));

// Extrai o termo da descrição para buscar no Le Biscuit
const listaProdutos = produtosJson.produtos.map(p => p.produto.trim());

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Le Biscuit...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoLeBiscuit(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Le Biscuit",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_leBiscuit.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoLeBiscuit(termo) {
  const termoBusca = encodeURIComponent(termo);
  const urlBusca = `https://www.lebiscuit.com.br/search?q=${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const primeiroLink = $("a[id^='product-card-']").first().attr("href");

    if (!primeiroLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Le Biscuit",
        vendido: false,
        link: null,
      });
      return;
    }

    const urlProduto = `https://www.lebiscuit.com.br${primeiroLink}`;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoLeBiscuit(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Le Biscuit",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoLeBiscuit(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    const preco = $("span.h5-bold, span.md\\:h4-bold")
      .filter((_, el) => $(el).text().includes("R$"))
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const vendedor = $("p:contains('Vendido e entregue por') strong").first().text().trim();

    const vendidoPorLeBiscuit = vendedor.toUpperCase().includes("LE BISCUIT");

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço: ${preco}`);
    console.error(`[RESULTADO] Vendido por: ${vendedor}`);
    console.error(`[RESULTADO] Vendido por Le Biscuit: ${vendidoPorLeBiscuit ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Le Biscuit",
      vendido: vendidoPorLeBiscuit,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Le Biscuit",
      vendido: false,
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaEmTodos()
  .then(() => {
    // Apenas o JSON final deve ir para o stdout
    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null,
        vendido: item.vendido,
        link: item.link
      };
    }
    console.log(JSON.stringify(resultadoFinal));

    // Todas as outras mensagens são só informativas
    console.error("[INFO] Script Le Biscuit finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Le Biscuit:", err.message);
    process.exit(1);
  });
