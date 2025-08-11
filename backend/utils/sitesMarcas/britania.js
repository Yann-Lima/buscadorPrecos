const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const resultados = [];

function normalizarMarca(marca) {
  if (!marca) return "";
  return marca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
const listaProdutos = produtosJson
  .filter(p => normalizarMarca(p.marca) === "BRITANIA")
  .map(p => p.produto.trim());

async function executarBuscaBritania() {
  console.error("[INFO] Iniciando verificação de todos os produtos no site da Britânia...\n");

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoBritania(browser, termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        precoPrazo: "Indisponível",
        precoAVista: "Indisponível",
        disponivel: false,
        loja: "Britânia",
        link: null,
      });
    }
  }

  await browser.close();

  // === SALVAR JSON COMPLETO ===
  const outputPath = path.join(__dirname, "..", "results", "resultados_britania.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));

  console.error("\n[INFO] Fim da verificação.\n");

  // === GERAR JSON SIMPLIFICADO PARA CONSOLE ===
  const resultadoFinal = {};
  for (const item of resultados) {
    resultadoFinal[item.termo] = {
      nome: item.nome,
      disponivel: item.disponivel,
      precoPrazo: item.precoPrazo,
      precoAVista: item.precoAVista,
      link: item.link
    };
  }

  console.log(JSON.stringify(resultadoFinal));

  console.error("[INFO] Script Britânia finalizado com sucesso.");
  process.exit(0);
}

async function buscarPrimeiroProdutoBritania(browser, termo) {
  const termoBusca = termo.trim();
  const urlBusca = `https://www.britania.com.br/?srsltid=AfmBOoq9u8-Bpl6PpzmZghC7n7oPR5QI_UXt0DxVYhRODjD1sfWxxEDS#&search-term=${encodeURIComponent(termoBusca)}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0");

  try {
    await page.goto(urlBusca, { waitUntil: "networkidle2" });

    await page.waitForSelector("a.vtex-product-summary-2-x-clearLink", { timeout: 15000 });

    const urlProduto = await page.$eval("a.vtex-product-summary-2-x-clearLink", el => el.href);

    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoBritania(page, urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      precoPrazo: "Indisponível",
      precoAVista: "Indisponível",
      disponivel: false,
      loja: "Britânia",
      link: null,
    });
  } finally {
    await page.close();
  }
}

async function extrairDetalhesProdutoBritania(page, urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    await page.goto(urlProduto, { waitUntil: "networkidle2" });

    // Espera o nome do produto carregar
    await page.waitForSelector("h1", { timeout: 15000 });

    // Extrai dados da página
    const detalhes = await page.evaluate(() => {
      const nome = document.querySelector("h1")?.innerText.trim() || null;

      // Verifica se tem indicação de produto indisponível
      const indisponivel = !!document.querySelector("p.lh-copy.vtex-rich-text-0-x-paragraph--text-availability")?.innerText.match(/Indisponível/i);

      const precoPrazoEl = document.querySelector("span.vtex-product-price-1-x-currencyContainer");
      let precoPrazo = precoPrazoEl ? precoPrazoEl.innerText.trim().replace(/\s+/g, " ") : null;

      const precoAVistaEl = document.querySelector("span.britania-store-theme-rnb3pOVTjMffA1l4LdqXa");
      let precoAVista = precoAVistaEl ? precoAVistaEl.innerText.trim().replace(/\s+/g, " ") : null;

      if (!precoPrazo || !precoPrazo.includes("R$")) precoPrazo = "Indisponível";
      if (!precoAVista || !precoAVista.includes("R$")) precoAVista = "Indisponível";

      return {
        nome,
        disponivel: !indisponivel,
        precoPrazo,
        precoAVista,
      };
    });

    console.error(`[RESULTADO] Produto: ${detalhes.nome}`);
    console.error(`[RESULTADO] Disponível: ${detalhes.disponivel ? "Sim" : "Não"}`);
    console.error(`[RESULTADO] Preço a prazo: ${detalhes.precoPrazo}`);
    console.error(`[RESULTADO] Preço à vista: ${detalhes.precoAVista}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome: detalhes.nome,
      precoPrazo: detalhes.precoPrazo,
      precoAVista: detalhes.precoAVista,
      disponivel: detalhes.disponivel,
      loja: "Britânia",
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      precoPrazo: "Indisponível",
      precoAVista: "Indisponível",
      disponivel: false,
      loja: "Britânia",
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaBritania().catch(err => {
  console.error("[ERRO FATAL] Falha inesperada no script Britânia:", err.message);
  process.exit(1);
});
