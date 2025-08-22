const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

// Caminhos de arquivos
const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
const termosCustomizadosPath = path.join(__dirname, "termosCustomizados.json");

// Carrega catálogo
const produtosJson = JSON.parse(fs.readFileSync(catalogoPath, "utf-8"));

// Carrega termos customizados (se existir)
let termosCustomizados = {};
if (fs.existsSync(termosCustomizadosPath)) {
  try {
    termosCustomizados = JSON.parse(fs.readFileSync(termosCustomizadosPath, "utf-8"));
    console.error("[INFO] termosCustomizados.json carregado.");
  } catch (e) {
    console.error("[WARN] Não foi possível ler/parsear termosCustomizados.json:", e.message);
  }
}

// Funções utilitárias
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function delayAleatorio(min, max) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}
function normalizar(txt) {
  return (txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "E")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
function tituloConfere(tituloOriginal, marca, produto) {
  if (!tituloOriginal) return false;
  const titulo = normalizar(tituloOriginal);
  const marcaNorm = normalizar(marca);
  const produtoNorm = normalizar(produto);
  if (!titulo.includes(marcaNorm)) return false;
  const palavrasProduto = produtoNorm.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const p of palavrasProduto) if (titulo.includes(p)) count++;
  return count / palavrasProduto.length >= 0.9;
}

// Monta lista de produtos
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();
    if (!produto || !marca) return null;
    const originalTerm = `${produto} ${marca}`;
    const searchTerm = termosCustomizados[produto] ?? originalTerm;
    return { originalTerm, searchTerm, produto, marca };
  })
  .filter(Boolean);

// Lista de user-agents
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/114.0.1823.67",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15"
];

// Função principal para buscar produto
async function buscarProdutoML(item, tentativas = 0) {
  const maxTentativas = 3;
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(userAgents[tentativas % userAgents.length]);
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");

    const termoEncoded = encodeURIComponent(item.searchTerm.trim());
    const urlBusca = `https://lista.mercadolivre.com.br/${termoEncoded}`;
    console.error(`[INFO] Buscando produto: ${item.searchTerm}`);

    await page.goto(urlBusca, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Scroll para carregar resultados
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    const links = await page.$$eval(
      "div.ui-search-result__wrapper div.poly-card a.poly-component__title",
      els => els.map(a => ({ href: a.href, titulo: a.innerText }))
    );

    if (!links.length) throw new Error("Nenhum produto encontrado");

    let linkSelecionado = null;
    const produtoNorm = normalizar(item.produto);
    for (const l of links) {
      if (normalizar(l.titulo).includes(produtoNorm)) {
        linkSelecionado = l.href;
        break;
      }
    }
    if (!linkSelecionado) linkSelecionado = links[0].href;

    await delayAleatorio(500, 1500);
    await extrairDetalhesProdutoML(page, linkSelecionado, item);

    await browser.close();
  } catch (err) {
    if (tentativas < maxTentativas) {
      console.warn(`[WARN] Tentativa ${tentativas + 1} falhou, retry...`);
      await delayAleatorio(2000, 5000);
      return buscarProdutoML(item, tentativas + 1);
    }
    console.error(`[ERRO] Falha definitiva ao buscar "${item.searchTerm}":`, err.message);
    resultados.push({
      termo: item.originalTerm,
      nome: null,
      preco: "Indisponível",
      loja: "Mercado Livre",
      vendido: false,
      link: null,
    });
  }
}

// Extrair detalhes do produto
async function extrairDetalhesProdutoML(page, urlProduto, item) {
  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delayAleatorio(800, 2000);

    const nome = await page.$eval("h1.ui-pdp-title", el => el.innerText.trim());
    let preco = await page.$eval("meta[itemprop='price']", el => el.content).catch(() => "Indisponível");
    preco = preco !== "Indisponível" ? `R$ ${parseFloat(preco).toFixed(2).replace(".", ",")}` : "Indisponível";

    const infoVendedor = await page.$eval(".ui-pdp-seller__label-text-with-icon", el => el.innerText.toLowerCase()).catch(() => "");
    const vendidoML = infoVendedor.includes("mercado livre") || infoVendedor.includes("full") || infoVendedor.includes("vendido por") || infoVendedor.trim() !== "";

    resultados.push({
      termo: item.originalTerm,
      nome,
      preco,
      loja: "Mercado Livre",
      vendido: vendidoML,
      link: urlProduto
    });

    console.error(`[RESULTADO] ${nome} | ${preco} | Vendido ML: ${vendidoML ? "✅" : "❌"}`);
  } catch (err) {
    console.error("[ERRO] Falha ao extrair detalhes:", err.message);
    resultados.push({
      termo: item.originalTerm,
      nome: null,
      preco: "Indisponível",
      loja: "Mercado Livre",
      vendido: false,
      link: urlProduto
    });
  }
}

// Executa busca de todos produtos
async function executarBuscaEmTodos() {
  for (const item of listaProdutos) {
    await buscarProdutoML(item);
    await delayAleatorio(2000, 5000);
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_mercado_livre.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("[INFO] Busca finalizada com sucesso.");
}

// Início
executarBuscaEmTodos();
