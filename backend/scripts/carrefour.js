const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

puppeteer.use(StealthPlugin());

const resultados = [];
// Caminhos dos arquivos
const produtosTempPath = path.join(__dirname, "produtos_temp.json");
const produtosFixosPath = path.join(__dirname, "produtos.json");

if (fs.existsSync(produtosTempPath)) {
  produtosJson = JSON.parse(fs.readFileSync(produtosTempPath, "utf-8"));
  console.error("[INFO] Usando produtos do arquivo temporário produtos_temp.json");
} else {
  produtosJson = JSON.parse(fs.readFileSync(produtosFixosPath, "utf-8"));
  console.error("[INFO] Usando produtos do arquivo padrão produtos.json");
}
const listaProdutos = produtosJson.produtos.map(p => p.trim());

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Carrefour...\n");

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoCarrefour(page, termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
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

  await browser.close();

  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoCarrefour(page, termo) {
  const termoBusca = encodeURIComponent(termo);
  const urlBusca = `https://www.carrefour.com.br/busca/${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, { headers: { "User-Agent": "Mozilla/5.0" } });
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

    await extrairDetalhesProdutoCarrefour(page, urlProduto, termo);

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

async function extrairDetalhesProdutoCarrefour(page, urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando página do produto");

  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const nome = await page.$eval('h2[data-testid="pdp-product-name"]', el => el.textContent.trim());

    const preco = await page.$eval('span.text-2xl.font-bold.text-default', el => el.textContent.trim()).catch(() => "Indisponível");

    const entreguePor = await page.$$eval('p', els => {
      const match = els.find(el => el.textContent.includes("Vendido e entregue por"));
      return match ? match.textContent.trim() : "";
    });
    const vendidoPorCarrefour = entreguePor.includes("Carrefour");

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${preco}`);
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
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Carrefour",
      vendido: false,
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaEmTodos()
  .then(() => {
    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null,
        vendido: item.vendido,
        link: item.link
      };
    }
    console.log(JSON.stringify(resultadoFinal));

    console.error("[INFO] Script Carrefour finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Carrefour:", err.message);
    process.exit(1);
  });
