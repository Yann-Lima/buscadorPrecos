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

// --- Monta lista de produtos ---
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

    const termoBase = termosCustomizados[produto];
    const searchTerm = (termoBase !== undefined && termoBase !== null && termoBase !== "")
      ? String(termoBase).trim()
      : originalTerm;

    if (termoBase !== undefined) {
      console.error(`[INFO] Usando termo customizado para produto ${produto}: "${searchTerm}"`);
    }

    if (!searchTerm) {
      console.error(`[DEBUG] Produto sem searchTerm válido:`, { produto, marca, originalTerm });
    }

    return { originalTerm, searchTerm, produto, marca };
  })
  .filter(Boolean);

if (!listaProdutos.length) {
  console.error("[ERRO] Nenhum termo de busca válido encontrado no catálogo.");
  process.exit(1);
}

// Lista de user-agents
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/114.0.1823.67",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15"
];

// Função principal para buscar produto
async function buscarProdutoML(page, item, tentativas = 0) {
  const maxTentativas = 3;
  try {
    await page.setUserAgent(userAgents[tentativas % userAgents.length]);
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");

    if (!item.searchTerm) {
      throw new Error(`Item sem searchTerm válido: ${JSON.stringify(item)}`);
    }
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

    // Palavras proibidas
    const palavrasProibidas = ["BOTAO", "COPO", "CONJUNTO LAMINA", "BANDEJA DE ASSAR", "3 BOTÕES LIGA", "DISPLAY DO PAINEL", "AGULHA ORIGINAL", "RESERVATÓRIO ÁGUA", "FILTRO EXPRESSO"];

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

    // Filtro: remove patrocinados e palavras proibidas
    const linksFiltrados = links.filter(l => {
      const tituloNorm = l.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      if (l.patrocinado) return false;
      for (const palavra of palavrasProibidas) {
        if (tituloNorm.includes(palavra)) return false;
      }
      return true;
    });

    if (!links.length) throw new Error("Nenhum produto encontrado");

    let linkSelecionado = null;
    const produtoNorm = normalizar(item.produto);
    for (const l of linksFiltrados) {
      if (normalizar(l.titulo).includes(produtoNorm)) {
        linkSelecionado = l.href;
        break;
      }
    }
    if (!linkSelecionado && linksFiltrados.length > 0) {
      linkSelecionado = linksFiltrados[0].href;
    }

    await delayAleatorio(500, 1500);
    await extrairDetalhesProdutoML(page, linkSelecionado, item);

  } catch (err) {
    if (tentativas < maxTentativas) {
      console.warn(`[WARN] Tentativa ${tentativas + 1} falhou, retry...`);
      await delayAleatorio(2000, 5000);
      return buscarProdutoML(page, item, tentativas + 1);
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
  const batchSize = 50;
  resultados.length = 0;

  const outputPath = path.join(__dirname, "..", "results", "resultados_mercado_livre.json");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();

  for (let i = 0; i < listaProdutos.length; i++) {
    const item = listaProdutos[i];
    await buscarProdutoML(page, item);
    await delayAleatorio(2000, 5000);

    if ((i + 1) % batchSize === 0 || i === listaProdutos.length - 1) {
      fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
      console.error(`[INFO] Progresso salvo (${i + 1}/${listaProdutos.length}).`);
    }
  }

  await browser.close();
  console.error("[INFO] Busca finalizada com sucesso. Arquivo sobrescrito.");
}

// Início
executarBuscaEmTodos();
