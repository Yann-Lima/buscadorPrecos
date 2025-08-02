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
    await buscarPrimeiroProdutoCasaEV(termo);
  }

  // 💾 Escreve o arquivo JSON só depois de tudo
  fs.writeFileSync("resultados_casaevideo.json", JSON.stringify(resultados, null, 2));

  console.log("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoCasaEV(termo) {
  const termoBusca = encodeURIComponent(termo);
  const urlBusca = `https://www.casaevideo.com.br/search?q=${termoBusca}`;

  console.log("\n[INFO] ========== NOVA BUSCA ==========");
  console.log("[DEBUG] Termo:", termo);
  console.log("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const linkProduto = $("a[id^='product-card']").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      return;
    }

    const urlProduto = `https://www.casaevideo.com.br${linkProduto}`;
    console.log("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoCasaEV(urlProduto, termo);
  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
  }
}

async function extrairDetalhesProdutoCasaEV(urlProduto, termoOriginal) {
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

    const vendidoCasaEV = entreguePor.includes("CASA E VIDEO") || entreguePor.includes("MERCADO FÁCIL");

    console.log(`[RESULTADO] Produto: ${nome}`);
    console.log(`[RESULTADO] Preço: ${preco}`);
    console.log(`[RESULTADO] Vendido por Casa e Vídeo: ${vendidoCasaEV ? "✅ Sim" : "❌ Não"}`);
    console.log(`[RESULTADO] Link: ${urlProduto}`);

    // ✅ Só adiciona ao final da extração, se houver sucesso
    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Casa e Vídeo",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
  }

  console.log("[INFO] --- Fim da verificação do produto ---\n");
}

// 🚀 Executa tudo
executarBuscaEmTodos();
