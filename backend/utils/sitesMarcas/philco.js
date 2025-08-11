const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
const listaProdutos = produtosJson
  .filter(p => (p.marca || "").trim().toUpperCase() === "PHILCO")
  .map(p => p.produto.trim());

async function executarBuscaPhilco() {
  console.error("[INFO] Iniciando verificação de todos os produtos no site da Philco...\n");

  // Abre o browser uma vez para todas as buscas
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoPhilco(browser, termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        precoNormal: "Indisponível",
        precoAVista: "Indisponível",
        loja: "Philco",
        link: null,
      });
    }
  }

  await browser.close();

  const outputPath = path.join(__dirname, "..", "results", "resultados_philco.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));

  console.error("\n[INFO] Fim da verificação.\n");

  const resultadoFinal = {};
  for (const item of resultados) {
    resultadoFinal[item.termo] = {
      precoNormal: item.precoNormal,
      precoAVista: item.precoAVista,
      link: item.link
    };
  }

  console.log(JSON.stringify(resultadoFinal));

  console.error("[INFO] Script Philco finalizado com sucesso.");
  process.exit(0);
}

async function buscarPrimeiroProdutoPhilco(browser, termo) {
  const termoBusca = termo.trim();
  const urlBusca = `https://www.philco.com.br/?srsltid=AfmBOoqjBXokhXE8SBoGW3aClWy8SyXbrrtQHzdHlcgo9qzBi3dX4p8-#&search-term=${encodeURIComponent(termoBusca)}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0");

  try {
    await page.goto(urlBusca, { waitUntil: "networkidle2" });

    // Espera o primeiro produto aparecer - pode ajustar timeout se necessário
    await page.waitForSelector("a.vtex-product-summary-2-x-clearLink", { timeout: 15000 });

    // Extrai o link do primeiro produto
    const urlProduto = await page.$eval("a.vtex-product-summary-2-x-clearLink", el => el.href);

    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoPhilco(page, urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      precoNormal: "Indisponível",
      precoAVista: "Indisponível",
      loja: "Philco",
      link: null,
    });
  } finally {
    await page.close();
  }
}

async function extrairDetalhesProdutoPhilco(page, urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    await page.goto(urlProduto, { waitUntil: "networkidle2" });
    await page.waitForSelector("h1", { timeout: 15000 });

    const detalhes = await page.evaluate(() => {
      const nome = document.querySelector("h1")?.innerText.trim() || null;

      const precoNormalEl = document.querySelector("span.vtex-product-price-1-x-currencyContainer");
      let precoNormal = precoNormalEl ? precoNormalEl.innerText.trim().replace(/\s+/g, " ") : null;

      const precoAVistaEl = document.querySelector("span.philco-store-theme-rnb3pOVTjMffA1l4LdqXa");
      let precoAVista = precoAVistaEl ? precoAVistaEl.innerText.trim().replace(/\s+/g, " ") : null;

      if (!precoNormal || !precoNormal.includes("R$")) precoNormal = "Indisponível";
      if (!precoAVista || !precoAVista.includes("R$")) precoAVista = "Indisponível";

      return { nome, precoNormal, precoAVista };
    });

    console.error(`[RESULTADO] Produto: ${detalhes.nome}`);
    console.error(`[RESULTADO] Preço normal: ${detalhes.precoNormal}`);
    console.error(`[RESULTADO] Preço à vista: ${detalhes.precoAVista}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome: detalhes.nome,
      precoNormal: detalhes.precoNormal,
      precoAVista: detalhes.precoAVista,
      loja: "Philco",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      precoNormal: "Indisponível",
      precoAVista: "Indisponível",
      loja: "Philco",
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaPhilco().catch(err => {
  console.error("[ERRO FATAL] Falha inesperada no script Philco:", err.message);
  process.exit(1);
});
