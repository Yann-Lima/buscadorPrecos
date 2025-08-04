const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// Lê o JSON com os produtos
const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8"));
const listaProdutos = produtosJson.produtos;

async function executarBuscaEmTodos() {
  console.log("[INFO] Iniciando verificação de todos os produtos...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoCasaEV(termo);
    } catch (err) {
      // Loga o erro, mas não para o loop
      console.error(`[ERRO CRÍTICO] Falha inesperada na busca do produto "${termo}":`, err.message);
      // Opcional: pode adicionar no resultados como indisponível
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: null,
      });
    }
  }

  // 💾 Escreve o arquivo JSON só depois de tudo
  const outputPath = path.join(__dirname, "..", "results", "resultados_casaevideo.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));

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
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: null,
      });
      return;
    }

    const urlProduto = `https://www.casaevideo.com.br${linkProduto}`;
    console.log("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoCasaEV(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Casa e Vídeo",
      vendido: false,
      link: null,
    });
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

    const entreguePor = $("p:contains('Vendido e entregue por')").first().text().trim();

    const vendidoCasaEV = entreguePor.includes("CASA E VIDEO") || entreguePor.includes("MERCADO FÁCIL");

    console.log(`[RESULTADO] Produto: ${nome}`);
    console.log(`[RESULTADO] Preço: ${preco}`);
    console.log(`[RESULTADO] Vendido por Casa e Vídeo: ${vendidoCasaEV ? "✅ Sim" : "❌ Não"}`);
    console.log(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Casa e Vídeo",
      vendido: vendidoCasaEV,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Casa e Vídeo",
      vendido: false,
      link: urlProduto
    });
  }

  console.log("[INFO] --- Fim da verificação do produto ---\n");
}

// 🚀 Executa tudo
executarBuscaEmTodos()
  .then(() => {
    console.log("[INFO] Script finalizado com sucesso.");
    process.exit(0); // encerra com sucesso
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada:", err.message);
    process.exit(1); // encerra com erro, só se algo crítico ocorrer fora dos try/catch
  });
