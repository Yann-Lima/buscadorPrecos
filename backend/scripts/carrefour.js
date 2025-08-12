const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

const catalogoPath = path.join(__dirname, "catalogoProdutos.json");

if (!fs.existsSync(catalogoPath)) {
  console.error("[ERRO] Arquivo catalogoProdutos.json não encontrado ao lado deste script.");
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

const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();

    let termo = [produto, marca].filter(Boolean).join(" ").trim();

    if (!termo && p.descricao) {
      termo = p.descricao.toString().trim();
      console.error(`[WARN] Item ${i}: faltam 'produto'/'marca'. Usando 'descricao' como termo.`);
    }

    if (!termo) {
      console.error(`[ERRO] Item ${i}: sem dados suficientes (produto/marca/descricao). Será ignorado.`);
      return null;
    }
    return termo;
  })
  .filter(Boolean);

if (!listaProdutos.length) {
  console.error("[ERRO] Nenhum termo de busca válido encontrado no catálogo.");
  process.exit(1);
}

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Carrefour...\n");

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoCarrefour(page, termo);
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

    if (resp.status >= 400) {
      console.error(`[ERRO] Falha ao buscar: ${termo} → HTTP ${resp.status}`);
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

    const $ = cheerio.load(resp.data);
    let relativeLink = $('a[data-testid="search-product-card"]').first().attr("href");

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

    if (!relativeLink.startsWith("http")) {
      relativeLink = `https://www.carrefour.com.br${relativeLink}`;
    }
    console.error("[DEBUG] Primeiro produto encontrado:", relativeLink);

    await extrairDetalhesProdutoCarrefour(page, relativeLink, termo);
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
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));

    const nome = await page.$eval('h2[data-testid="pdp-product-name"]', (el) => el.textContent.trim());

    const preco = await page
      .$eval('span.text-2xl.font-bold.text-default', (el) => el.textContent.trim())
      .catch(() => "Indisponível");

    const entreguePor = await page
      .$$eval("p", (els) => {
        const match = els.find((el) => el.textContent.includes("Vendido e entregue por"));
        return match ? match.textContent.trim() : "";
      })
      .catch(() => "");

    const vendidoPorCarrefour = entreguePor.toLowerCase().includes("carrefour");

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
      link: urlProduto,
    });
  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Carrefour",
      vendido: false,
      link: urlProduto,
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

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

    // Só o JSON final vai para o stdout (console.log)
    console.log(JSON.stringify(resultadoFinal));

    console.error("[INFO] Script Carrefour finalizado com sucesso.");

    // Dá um tempinho para garantir o flush do stdout antes de encerrar
    await new Promise((r) => setTimeout(r, 100));

    // Não chama process.exit(), Node termina naturalmente
  } catch (err) {
    console.error("[ERRO FATAL] Falha inesperada no script Carrefour:", err.message);
    process.exit(1);
  }
})();
