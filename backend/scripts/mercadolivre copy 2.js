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

// Função para iniciar o navegador com login manual
async function iniciarLoginManual() {
  const browser = await puppeteer.launch({ headless: false }); // Modo visível para login
  const page = await browser.newPage();
  await page.goto("https://www.mercadolivre.com.br", { waitUntil: "domcontentloaded" });

  console.error("[INFO] Navegador aberto. Por favor, faça o login manual.");

  // Espera 25 minutos para você completar o login
  await delay(25 * 60 * 1000); // 25 minutos de delay

  console.error("[INFO] 25 minutos passaram. Continuando com o navegador fechado.");

  await browser.close(); // Fecha o navegador após o tempo de login
}

// Função principal para buscar produto
async function buscarProdutoML(item, tentativas = 0) {
  const maxTentativas = 3;
  try {
    const browser = await puppeteer.launch({ headless: true }); // Modo headless para continuar sem abrir o navegador
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

    // Filtro de produtos
    const links = await page.$$eval(
      "div.ui-search-result__wrapper div.poly-card",
      els => els.map(el => {
        const tituloEl = el.querySelector("a.poly-component__title");
        const patrocinado = !!el.querySelector(".poly-component__ads-promotions");
        return tituloEl
          ? { href: tituloEl.href, titulo: tituloEl.innerText, patrocinado }
          : null;
      }).filter(Boolean)
    );

    if (!links.length) throw new Error("Nenhum produto encontrado");

    let linkSelecionado = links[0].href;

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
  }
}

// Executa a busca e depois do login
async function executarBuscaEmTodos() {
  await iniciarLoginManual(); // Primeiro executa o login manual

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
