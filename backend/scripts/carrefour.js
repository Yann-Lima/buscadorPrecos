const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8"));
const listaProdutos = produtosJson.produtos.map(p => p.trim());

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Carrefour...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoCarrefour(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha inesperada na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Carrefour",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_carrefour.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoCarrefour(termo) {
  const termoBusca = encodeURIComponent(termo);
  const urlBusca = `https://www.carrefour.com.br/busca/${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const relativeLink = $('a[data-testid="search-product-card"]').first().attr("href");

    if (!relativeLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Carrefour",
        vendido: false,
        link: null,
      });
      return;
    }

    const urlProduto = `https://www.carrefour.com.br${relativeLink}`;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoCarrefour(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Carrefour",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoCarrefour(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto via navegador real (Puppeteer)");

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  try {
    await page.goto(urlProduto, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    const nome = await page.$eval('h2[data-testid="pdp-product-name"]', el =>
      el.textContent.trim()
    );

    const preco = await page.$eval('span.text-2xl.font-bold.text-default', el =>
      el.textContent.trim()
    );

    const entreguePor = await page.$$eval('p', els => {
      const match = els.find(el =>
        el.textContent.includes("Vendido e entregue por")
      );
      return match ? match.textContent.trim() : "";
    });

    const vendidoPorCarrefour = entreguePor.includes("Carrefour");

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço: ${preco}`);
    console.error(`[RESULTADO] Vendido por Carrefour: ${vendidoPorCarrefour ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Carrefour",
      vendido: vendidoPorCarrefour,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto com Puppeteer:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Carrefour",
      vendido: false,
      link: urlProduto
    });
  } finally {
    await browser.close();
    console.error("[INFO] --- Fim da verificação do produto ---\n");
  }
}
executarBuscaEmTodos()
  .then(() => {
    // Apenas o JSON final deve ir para o stdoutF
    const resultadoFinal = {};
for (const item of resultados) {
  resultadoFinal[item.termo] = {
    preco: item.vendido ? item.preco : null,
    vendido: item.vendido
  };
}
console.log(JSON.stringify(resultadoFinal));
F // <-- único console.log permitido

    // Todas as outras mensagens são só informativas
    console.error("[INFO] Script Carreffour finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Carrefour:", err.message);
    process.exit(1);
  });

/*executarBuscaEmTodos()
  .then(() => {
    console.error("[INFO] Script finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada:", err.message);
    process.exit(1);
  });*/
