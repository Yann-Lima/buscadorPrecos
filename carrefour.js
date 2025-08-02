const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const fs = require("fs");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync("produtos.json", "utf-8"));
const listaProdutos = produtosJson.produtos;

async function executarBuscaEmTodos() {
  console.log("[INFO] Iniciando verificação de todos os produtos no Carrefour...\n");

  for (const termo of listaProdutos) {
    await buscarPrimeiroProdutoCarrefour(termo);
  }

  fs.writeFileSync("resultados_carrefour.json", JSON.stringify(resultados, null, 2));
  console.log("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoCarrefour(termo) {
  const termoBusca = encodeURIComponent(termo);
  const urlBusca = `https://www.carrefour.com.br/busca/${termoBusca}`;

  console.log("\n[INFO] ========== NOVA BUSCA ==========");
  console.log("[DEBUG] Termo:", termo);
  console.log("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const relativeLink = $('a[data-testid="search-product-card"]').first().attr("href");

    if (!relativeLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      return;
    }

    const urlProduto = `https://www.carrefour.com.br${relativeLink}`;
    console.log("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoCarrefour(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
  }
}

async function extrairDetalhesProdutoCarrefour(urlProduto, termoOriginal) {
  console.log("[INFO] --- Acessando produto via navegador real (Puppeteer)");

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

    console.log(`[RESULTADO] Produto: ${nome}`);
    console.log(`[RESULTADO] Preço: ${preco}`);
    console.log(`[RESULTADO] Vendido por Carrefour: ${vendidoPorCarrefour ? "✅ Sim" : "❌ Não"}`);
    console.log(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Carrefour",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto com Puppeteer:", err.message);
  } finally {
    await browser.close();
    console.log("[INFO] --- Fim da verificação do produto ---\n");
  }
}

executarBuscaEmTodos();
