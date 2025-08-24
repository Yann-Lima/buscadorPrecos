const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
const termosCustomizadosPath = path.join(__dirname, "termosCustomizados.json");

const palavrasProibidasMagalu = ["BOTAO", "COPO", "CONJUNTO LAMINA", "BANDEJA DE ASSAR", "3 BOTÕES LIGA", "DISPLAY DO PAINEL", "AGULHA ORIGINAL", "RESERVATÓRIO ÁGUA", "FILTRO EXPRESSO"];

// Carrega termos customizados
let termosCustomizados = {};
if (fs.existsSync(termosCustomizadosPath)) {
  try {
    termosCustomizados = JSON.parse(fs.readFileSync(termosCustomizadosPath, "utf-8"));
    console.error("[INFO] termosCustomizados.json carregado.");
  } catch (e) {
    console.error("[WARN] Falha ao ler/parsear termosCustomizados.json:", e.message);
  }
}

if (!fs.existsSync(catalogoPath)) {
  console.error("[ERRO] Arquivo catalogoProdutos.json não encontrado.");
  process.exit(1);
}

let produtosJson;
try {
  produtosJson = JSON.parse(fs.readFileSync(catalogoPath, "utf-8"));
  console.error("[INFO] Usando produtos do arquivo catalogoProdutos.json");
} catch (e) {
  console.error("[ERRO] Não foi possível ler/parsear catalogoProdutos.json:", e.message);
  process.exit(1);
}

// --- Funções utilitárias ---
function normalizar(texto) {
  return texto
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function validarProdutoPorPalavras(produtoOriginal, marcaOriginal, nomeEncontrado, descricaoEncontrada, limiteAcerto = 0.9) {
  const referencia = normalizar((produtoOriginal || "") + " " + (marcaOriginal || "")).split(" ");
  const texto = normalizar((nomeEncontrado || "") + " " + (descricaoEncontrada || "")).split(" ");
  let contagem = 0;
  for (const palavra of referencia) {
    if (palavra && texto.includes(palavra)) contagem++;
  }
  const proporcao = referencia.length > 0 ? contagem / referencia.length : 0;
  return proporcao >= limiteAcerto;
}

function delay(min = 500, max = 2500) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

// --- Lista de produtos ---
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();

    let originalTerm = [produto, marca].filter(Boolean).join(" ").trim();

    if (!originalTerm && p.descricao) {
      originalTerm = p.descricao.toString().trim();
      console.error(`[WARN] Item ${i}: faltam 'produto'/'marca'. Usando 'descricao'.`);
    }

    if (!originalTerm) {
      console.error(`[ERRO] Item ${i}: sem dados suficientes. Ignorando.`);
      return null;
    }

    const searchTerm = termosCustomizados[produto] ? String(termosCustomizados[produto]).trim() : originalTerm;

    if (termosCustomizados[produto]) {
      console.error(`[INFO] Usando termo customizado para produto ${produto}: "${searchTerm}"`);
    }

    return { originalTerm, searchTerm, produto, marca };
  })
  .filter(Boolean);

if (!listaProdutos.length) {
  console.error("[ERRO] Nenhum termo de busca válido encontrado no catálogo.");
  process.exit(1);
}

// --- Execução principal ---
async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de produtos no Magazine Luiza...\n");

  let browser = await puppeteer.launch({
    headless: true, // <-- Navegador oculto
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  let page = await browser.newPage();
  await randomizarPage(page);

  let falhasConsecutivas = 0;

  for (let i = 0; i < listaProdutos.length; i++) {
    const item = listaProdutos[i];
    try {
      await buscarPrimeiroProdutoMagalu(page, item);

      const ultimoResultado = resultados[resultados.length - 1];
      if (!ultimoResultado || !ultimoResultado.vendido) falhasConsecutivas++;
      else falhasConsecutivas = 0;

      if (falhasConsecutivas >= 5) {
        console.warn("[WARN] 5 produtos consecutivos não encontrados. Reiniciando navegador...");
        await page.close();
        await browser.close();
        await delay(5000, 8000);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        page = await browser.newPage();
        await randomizarPage(page);
        falhasConsecutivas = 0;
      }

      await delay(1000, 3000);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${item.originalTerm}":`, err.message);
      resultados.push({ termo: item.originalTerm, nome: null, preco: "Indisponível", loja: "Magalu", vendido: false, link: null });
      falhasConsecutivas++;
    }
  }

  await page.close();
  await browser.close();
  console.error("\n[INFO] Fim da verificação.");
}

// --- Randomização da página ---
async function randomizarPage(page) {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0"
  ];
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 }
  ];

  const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
  const vp = viewports[Math.floor(Math.random() * viewports.length)];

  await page.setUserAgent(ua);
  await page.setViewport(vp);
}

// --- Busca e extração ---
async function buscarPrimeiroProdutoMagalu(page, item) {
  const termoParaBusca = encodeURIComponent(item.searchTerm);
  const urlBusca = `https://www.magazineluiza.com.br/busca/${termoParaBusca}/?seller_id=magazineluiza`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo (original):", item.originalTerm);
  console.error("[DEBUG] Termo (busca):", item.searchTerm);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    await page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 90000 });
    await delay(1500, 2500);

    const html = await page.content();
    const $ = cheerio.load(html);
    let relativeLink = $('li a[data-testid="product-card-container"]').first().attr("href");

    if (!relativeLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", item.searchTerm);
      resultados.push({ termo: item.originalTerm, nome: null, preco: "Indisponível", loja: "Magalu", vendido: false, link: null });
      return;
    }

    if (!relativeLink.startsWith("http")) relativeLink = `https://www.magazineluiza.com.br${relativeLink}`;
    console.error("[DEBUG] Primeiro produto encontrado:", relativeLink);

    await extrairDetalhesProdutoMagalu(page, relativeLink, item.originalTerm);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", item.searchTerm, "→", err.message);
    resultados.push({ termo: item.originalTerm, nome: null, preco: "Indisponível", loja: "Magalu", vendido: false, link: null });
  }
}

async function extrairDetalhesProdutoMagalu(page, urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });

    // aguarda o header do produto ou o bloco do lojista
    await page.waitForSelector('h1[data-testid="heading-product-title"]', { timeout: 30000 }).catch(()=>{});
    await page.waitForSelector('div[href="/lojista/"], p[data-testid="label"], svg[data-testid="magalogo"]', { timeout: 10000 }).catch(()=>{});

    const nome = await page.$eval('h1[data-testid="heading-product-title"]', el => el.textContent.trim());

    // 🔎 Filtro de palavras proibidas Magalu
    const contemProibida = palavrasProibidasMagalu.some(p => nome.toUpperCase().includes(p));
    if (contemProibida) {
      console.warn(`[FILTRADO - Magalu] Produto contém palavra proibida: ${nome}`);
      resultados.push({ termo: termoOriginal, nome, preco: null, loja: "Magalu", vendido: false, link: urlProduto });
      return;
    }

    const precoRaw = await page.$eval('p[data-testid="price-value"]', el => el.textContent.replace(/\s/g, ''))
      .catch(() => null);

    const preco = precoRaw
      ? 'R$ ' + (precoRaw.replace(/\D/g, '') / 100).toFixed(2).replace('.', ',')
      : "Indisponível";

    // 🔎 Detector robusto de "Vendido e entregue por Magalu"
    const vendidoPorMagalu = await page.evaluate(() => {
      const hasMagaluLogo = !!document.querySelector('svg[data-testid="magalogo"]');
      const sellerBlock = document.querySelector('div[href="/lojista/"]') || document.querySelector('p[data-testid="label"]');
      const sellerText = (sellerBlock?.textContent || "").toLowerCase();
      const pageText = document.body.innerText.toLowerCase();
      const hasMagaluText = /magalu|magazineluiza/.test(sellerText) || /magalu|magazineluiza/.test(pageText);
      let hasSellerJsonLd = false;
      try {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .map(s => s.textContent)
          .filter(Boolean);
        const joined = `[${scripts.join(',')}]`;
        const jsons = JSON.parse(joined);
        const flat = (Array.isArray(jsons) ? jsons : [jsons]).flat(Infinity);
        const names = JSON.stringify(flat).toLowerCase();
        if (names.includes('"seller"') && (names.includes('magalu') || names.includes('magazineluiza'))) {
          hasSellerJsonLd = true;
        }
      } catch (e) {}
      return hasMagaluLogo || hasSellerJsonLd || (sellerText.includes('vendido') && sellerText.includes('entregue') && hasMagaluText);
    });

    const produtoValido = validarProdutoPorPalavras(termoOriginal, "", nome, "");

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Magalu",
      vendido: vendidoPorMagalu && produtoValido,
      link: urlProduto,
    });

    console.error(`[RESULTADO] Produto válido: ${produtoValido ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Nome: ${nome}`);
    console.error(`[RESULTADO] Preço: ${preco}`);
    console.error(`[RESULTADO] Vendido por Magalu: ${vendidoPorMagalu ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({ termo: termoOriginal, nome: null, preco: "Indisponível", loja: "Magalu", vendido: false, link: urlProduto });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

// --- Execução final ---
(async () => {
  try {
    await executarBuscaEmTodos();

    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null,
        vendido: item.vendido,
        link: item.link,
      };
    }

    const outputPath = path.join(__dirname, "..", "results", "resultados_magalu.json");
    fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2));
    console.error(`[INFO] JSON salvo em: ${outputPath}`);
    console.log(JSON.stringify(resultadoFinal, null, 2));

    console.error("[INFO] Script Magalu finalizado com sucesso.");
    await delay(100, 300);

  } catch (err) {
    console.error("[ERRO FATAL] Falha inesperada no script Magalu:", err.message);
    process.exit(1);
  }
})();
