const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

puppeteer.use(StealthPlugin());

const resultados = [];

const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
if (!fs.existsSync(catalogoPath)) {
  console.error("[ERRO] catalogoProdutos.json não encontrado.");
  process.exit(1);
}
const produtosJson = JSON.parse(fs.readFileSync(catalogoPath, "utf-8"));
const listaProdutos = produtosJson.produtos;

// Funções auxiliares
function delay(min, max) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

// =================== NOVA FUNÇÃO ===================
async function buscarProdutoCasasBahia(termoObj) {
  let linkProduto = null;

  try {
    console.error("[LOG 1] Abrindo Bing...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");

    const termoBusca = `${termoObj.produto} ${termoObj.marca} casas bahia`;
    console.error("[LOG 2] Buscando produto no Bing:", termoBusca);
    await page.goto("https://www.bing.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.type('textarea[name="q"]', termoBusca);
    await page.keyboard.press("Enter");
    await page.waitForSelector('li.b_algo h2 a', { timeout: 10000 });
    await delay(2000, 4000);

    const resultadosBusca = await page.$$('li.b_algo');
    for (const resultado of resultadosBusca) {
      const titulo = await resultado.$eval('h2', el => el.textContent.trim()).catch(() => "");
      if (titulo.toLowerCase().includes("casas bahia")) {
        linkProduto = await resultado.$eval('h2 a', el => el.href);
        console.error("[LOG 3] Link Casas Bahia encontrado:", linkProduto);
        break;
      }
    }

    await browser.close();

    if (!linkProduto) throw new Error("Nenhum link do Casas Bahia encontrado");

    // =================== SCRAPE HTML DIRETO ===================
    console.error("[LOG 4] Acessando HTML do produto via axios...");
    const { data: html } = await axios.get(linkProduto, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "pt-BR,pt;q=0.9"
      },
      timeout: 15000
    });

    const $ = cheerio.load(html);
    const nome = $('h1[data-testid="product-name"]').text().trim() || null;
    const preco = $('[data-testid="product-price-value"] span').first().text().trim().replace(/\s+/g, " ") || "Indisponível";
    const vendedorTexto = $("span").filter((i, el) => $(el).text().includes("Vendido e entregue por")).text().trim();
    const vendidoPorCasasBahia = vendedorTexto.toUpperCase().includes("CASAS BAHIA");

    resultados.push({
      termo: `${termoObj.produto} ${termoObj.marca}`,
      nome,
      preco,
      loja: "Casas Bahia",
      vendido: vendidoPorCasasBahia,
      link: linkProduto,
    });

    console.error("[LOG 5] Resultado extraído:", { nome, preco, vendidoPorCasasBahia, link: linkProduto });

  } catch (err) {
    console.error(`[ERRO] Produto (${termoObj.produto} ${termoObj.marca}):`, err.message);
  }
}

// =================== EXECUÇÃO ===================
async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarProdutoCasasBahia(termo);
      await delay(3000, 7000);
    } catch (err) {
      console.error(`[ERRO] Produto ${termo.produto} ${termo.marca}:`, err.message);
    }
  }

  const resultadoFinal = {};
  for (const item of resultados) {
    resultadoFinal[item.termo] = {
      preco: item.vendido ? item.preco : null,
      vendido: item.vendido,
      link: item.link,
    };
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_casasbahia.json");
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2));
  } catch (e) {
    console.error("[WARN] Não foi possível salvar resultados:", e.message);
  }

  console.log(JSON.stringify(resultadoFinal, null, 2));
  console.error("[INFO] Script Casas Bahia finalizado.");
  process.exit(0);
}

executarBuscaEmTodos().catch(err => {
  console.error("[ERRO FATAL] Script falhou:", err.message);
  process.exit(1);
});
