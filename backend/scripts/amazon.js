const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];
const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8"));
const listaProdutos = produtosJson.produtos.map(p => p.trim());

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos na Amazon...\n");

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoAmazon(page, termo);
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

  await browser.close();

  const outputPath = path.join(__dirname, "..", "results", "resultados_amazon.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoAmazon(page, termo) {
  const termoBusca = termo.replace(/\s+/g, "+");
  const urlBusca = `https://www.amazon.com.br/s?k=${termoBusca}&rh=p_6%3AA1ZZFT5FULY4LN`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    await page.goto(urlBusca, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000)); // simula comportamento humano

    const links = await page.$$eval("a.a-link-normal.s-no-outline", els =>
      els.map(el => el.getAttribute("href")).filter(href => href)
    );

    if (!links.length) {
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

    const urlProduto = `https://www.amazon.com.br${links[0]}`;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoAmazon(page, urlProduto, termo);

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

async function extrairDetalhesProdutoAmazon(page, urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando página do produto");

  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const nome = await page.$eval("#productTitle", el => el.textContent.trim());

    let precoInteiro = await page.$eval("span.a-price span.a-price-whole", el => el.textContent.trim()).catch(() => null);
    let centavos = await page.$eval("span.a-price span.a-price-fraction", el => el.textContent.trim()).catch(() => null);
    let preco = precoInteiro && centavos ? `R$ ${precoInteiro},${centavos}` : "Indisponível";

    const vendidoPor = await page.$$eval("span", els => {
      const encontrado = els.find(el => el.textContent.includes("Vendido por Amazon.com.br"));
      return encontrado ? encontrado.textContent.trim() : "";
    });
    const vendidoAmazon = vendidoPor.includes("Amazon.com.br");

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${preco}`);
    console.error(`[RESULTADO] Vendido por Amazon: ${vendidoAmazon ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

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

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaEmTodos()
  .then(() => {
    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null,
        vendido: item.vendido
      };
    }
    console.log(JSON.stringify(resultadoFinal));

    console.log("[INFO] Script Amazon finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Amazon:", err.message);
    process.exit(1);
  });
