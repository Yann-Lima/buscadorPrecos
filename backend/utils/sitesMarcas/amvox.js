const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
const listaProdutos = produtosJson
  .filter(p => (p.marca || "").trim().toUpperCase().includes("AMVOX")) // aceita AMVOX ou AMVOXX
  .map(p => p.produto.trim());

async function executarBuscaAmvox() {
  console.error("[INFO] Iniciando verificação de todos os produtos no site da Amvox...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoAmvox(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        precoParcelado: "Indisponível",
        loja: "Amvox",
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_amvox.json");
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
  console.error("[INFO] Script Amvox finalizado com sucesso.");
  process.exit(0);
}

async function buscarPrimeiroProdutoAmvox(termo) {
  const termoBusca = encodeURIComponent(termo.trim());
  const urlBusca = `https://www.amvox.com.br/search?q=${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const linkRelativo = $('a[aria-label="Imagem do produto"]').first().attr("href");

    if (!linkRelativo) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        precoParcelado: "Indisponível",
        loja: "Amvox",
        link: null,
      });
      return;
    }

    const urlProduto = "https://www.amvox.com.br" + linkRelativo;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoAmvox(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Amvox",
      link: null,
    });
  }
}

async function extrairDetalhesProdutoAmvox(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    // Preço parcelado
    let precoParcelado = $("h3.price").first().text().replace(/\s+/g, " ").trim();

    let preco = "Indisponível";

    if (precoParcelado.includes("R$")) {
      // Calcula 10% de desconto
      const valorNum = parseFloat(precoParcelado.replace(/[R$\s\.]/g, "").replace(",", "."));
      const valorComDesconto = valorNum * 0.90;
      preco = `R$ ${valorComDesconto.toFixed(2).replace(".", ",")}`;
    } else {
      precoParcelado = "Indisponível";
    }

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${preco}`);
    console.error(`[RESULTADO] Preço parcelado: ${precoParcelado}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      precoParcelado,
      loja: "Amvox",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Amvox",
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaAmvox().catch(err => {
  console.error("[ERRO FATAL] Falha inesperada no script Amvox:", err.message);
  process.exit(1);
});
