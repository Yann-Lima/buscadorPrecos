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

// Função para clicar no primeiro item da lista no Mercado Livre
async function clicarPrimeiroProdutoMercadoLivre(page) {
  try {
    // Espera até que os produtos estejam carregados
    await page.waitForSelector('.poly-card--list', { timeout: 10000 });

    // Clica no primeiro produto da lista
    const primeiroProduto = await page.$('.poly-card--list a');
    if (primeiroProduto) {
      console.error("[INFO] Clicando no primeiro produto...");
      await primeiroProduto.click();
      
      // Espera a página do produto carregar completamente
      await page.waitForSelector('h1[itemprop="name"]', { timeout: 10000 });

      // Extração do título e preço
      const tituloProduto = await page.$eval('h1[itemprop="name"]', el => el.innerText);
      const precoProduto = await page.$eval('.andes-money-amount', el => el.innerText);
      console.error(`[INFO] Produto: ${tituloProduto}, Preço: ${precoProduto}`);

      // Agora você pode comparar o título e o preço para garantir que é o produto correto
      // Exemplo de verificação
      if (tituloProduto && precoProduto) {
        console.log("[INFO] Produto encontrado:", tituloProduto, "Preço:", precoProduto);
      } else {
        console.error("[ERRO] Detalhes do produto não encontrados.");
      }
    } else {
      console.error("[ERRO] Não foi possível encontrar o primeiro produto na lista.");
    }
  } catch (err) {
    console.error("[ERRO] Erro ao clicar no primeiro produto:", err.message);
  }
}

async function buscarProdutoBing(item, browser, tentativas = 0) {
  const maxTentativas = 3;
  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgents[tentativas % userAgents.length]);
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");

    // Acessa o Bing
    await page.goto("https://www.bing.com", { waitUntil: "domcontentloaded", timeout: 60000 });

    const searchTerm = item.searchTerm.trim();
    console.error(`[INFO] Buscando no Bing: ${searchTerm}`);

    // Preenche a barra de pesquisa do Bing com o termo
    const searchInput = await page.$('input[name="q"]');
    await searchInput.type(searchTerm + " Mercado Livre", { delay: 100 }); // Adiciona "Mercado Livre" no final

    // Simula pressionamento de "Enter" após a digitação
    await searchInput.press('Enter');

    // Espera a página carregar e busca pelos primeiros 4 resultados
    await page.waitForSelector("li.b_algo", { timeout: 10000 });

    const links = await page.$$eval(
      "li.b_algo h2 a",
      els => els.map(el => ({
        href: el.href,
        titulo: el.innerText,
      }))
    );

    if (!links.length) throw new Error("Nenhum resultado encontrado");

    // Filtra os links que contêm "Mercado Livre" no título
    const linksFiltrados = links.filter(link => link.titulo.includes("Mercado Livre"));

    if (linksFiltrados.length === 0) throw new Error("Nenhum link com 'Mercado Livre' encontrado");

    // Acessa o primeiro link filtrado
    const linkSelecionado = linksFiltrados[0].href;

    console.error(`[INFO] Acessando link: ${linkSelecionado}`);
    await page.goto(linkSelecionado, { waitUntil: "domcontentloaded", timeout: 10000 });

    // Espera carregar a página do Mercado Livre
    await clicarPrimeiroProdutoMercadoLivre(page);  // Clica no primeiro produto

    // Extração de detalhes, como título e preço do produto
    // Você pode adicionar mais lógica aqui para comparar ou fazer outras verificações, se necessário.

    await page.close();
  } catch (err) {
    if (tentativas < maxTentativas) {
      console.warn(`[WARN] Tentativa ${tentativas + 1} falhou, retry...`);
      await delayAleatorio(2000, 5000);
      return buscarProdutoBing(item, browser, tentativas + 1);
    }
    console.error(`[ERRO] Falha definitiva ao buscar "${item.searchTerm}":`, err.message);
  }
}


// Executa a busca em todos os produtos
async function executarBuscaEmTodos() {
  const browser = await puppeteer.launch({ headless: false }); // Modo visível para acompanhar a execução

  for (const item of listaProdutos) {
    await buscarProdutoBing(item, browser);
    await delayAleatorio(2000, 5000);
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_mercado_livre.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("[INFO] Busca finalizada com sucesso.");

  await browser.close(); // Fecha o navegador após a execução da busca
}

// Início
executarBuscaEmTodos();
