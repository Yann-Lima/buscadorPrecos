const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const resultados = [];

// Lê o JSON com os produtos
const produtosJson = JSON.parse(fs.readFileSync("produtos.json", "utf-8"));
const listaProdutos = produtosJson.produtos;

async function executarBuscaEmTodos() {
  console.log("[INFO] Iniciando verificação de todos os produtos...\n");

  for (const termo of listaProdutos) {
    await buscarPrimeiroProdutoLeBiscuit(termo);
  }

  // Salva todos os resultados no final
  fs.writeFileSync("resultados_lebiscuit.json", JSON.stringify(resultados, null, 2));

  console.log("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoLeBiscuit(termo) {
  const termoBusca = encodeURIComponent(termo);
  const urlBusca = `https://www.lebiscuit.com.br/search?q=${termoBusca}`;

  console.log("\n[INFO] ========== NOVA BUSCA ==========");
  console.log("[DEBUG] Termo:", termo);
  console.log("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const primeiroLink = $("a[id^='product-card']").first().attr("href");

    if (!primeiroLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      return;
    }

    const urlProduto = `https://www.lebiscuit.com.br${primeiroLink}`;
    console.log("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoLeBiscuit(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
  }
}

async function extrairDetalhesProdutoLeBiscuit(urlProduto, termoOriginal) {
  console.log("[INFO] --- Acessando produto para:", termoOriginal);

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
      .trim();

    const entreguePor = $("p:contains('Vendido e entregue por')")
      .first()
      .text()
      .trim();

    const vendidoPorLeBiscuit = entreguePor.includes("LE BISCUIT");

    console.log(`[RESULTADO] Produto: ${nome}`);
    console.log(`[RESULTADO] Preço: ${preco}`);
    console.log(`[RESULTADO] Vendido por Le Biscuit: ${vendidoPorLeBiscuit ? "✅ Sim" : "❌ Não"}`);
    console.log(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Le Biscuit",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
  }

  console.log("[INFO] --- Fim da verificação do produto ---\n");
}

// 🚀 Executa tudo
executarBuscaEmTodos();
