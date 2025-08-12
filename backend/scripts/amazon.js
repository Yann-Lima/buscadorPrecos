const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
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

// Função para remover acentos e normalizar string
function removerAcentos(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

// Monta lista com "produto + marca" com marca sem acento
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marcaRaw = (p.marca ?? p.brand ?? "").toString().trim();
    const marca = removerAcentos(marcaRaw);

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayAleatorio(min, max) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function scrollLento(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos na Amazon...\n");

  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();

  for (const termo of listaProdutos) {
    try {
      // Troca de User-Agent a cada busca
      const userAgentBase = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
      const chromeVersion = `Chrome/${100 + Math.floor(Math.random() * 20)}.0.0.0 Safari/537.36`;
      await page.setUserAgent(`${userAgentBase} ${chromeVersion}`);

      await buscarPrimeiroProdutoAmazon(page, termo);

      // Limpa cookies e cache para reduzir rastreamento
      const client = await page.target().createCDPSession();
      await client.send("Network.clearBrowserCookies");
      await client.send("Network.clearBrowserCache");

      // Delay humano aleatório entre buscas (3-7s)
      await delayAleatorio(3000, 7000);
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
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  } catch (e) {
    console.error("[WARN] Não foi possível salvar resultados_amazon.json:", e.message);
  }

  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoAmazon(page, termo) {
  // Substitui espaços por '+' para URL
  const termoBusca = termo.replace(/\s+/g, "+");
  // Usando o parâmetro fixo para vendedor Amazon (p_6:A1ZZFT5FULY4LN) como no seu original
  const urlBusca = `https://www.amazon.com.br/s?k=${termoBusca}&rh=p_6%3AA1ZZFT5FULY4LN`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    await page.goto(urlBusca, { waitUntil: "domcontentloaded", timeout: 60000 });
    await scrollLento(page);
    await delayAleatorio(2000, 5000); // espera extra

    const links = await page.$$eval("a.a-link-normal.s-no-outline", (els) =>
      els.map((el) => el.getAttribute("href")).filter(Boolean)
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

function normalizar(txt) {
  return (txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function isAmazonSeller(texto) {
  const t = normalizar(texto);
  // Casos comuns na Amazon BR
  return (
    t.includes("AMAZON.COM.BR") ||
    t.includes("AMAZON SERVICOS DE VAREJO DO BRASIL") ||
    // fallback amplo (cuidado, mas útil quando a Amazon mostra apenas "Amazon")
    /\bAMAZON\b/.test(t)
  );
}

async function obterVendedorAmazon(page) {
  // 1) Container ODF (mais confiável)
  const odfSel = '[offer-display-feature-name="desktop-merchant-info"] .offer-display-feature-text-message';
  let vendedor = await page.$eval(odfSel, el => el.textContent.trim()).catch(() => null);

  // 2) Fallback: bloco clássico
  if (!vendedor) {
    vendedor = await page.$eval("#merchantInfo", el => el.textContent.trim()).catch(() => null);
  }

  // 3) Fallback: procura “Vendido por” ou “Sold by” em elementos de texto
  if (!vendedor) {
    vendedor = await page.$$eval("div,span", els => {
      const alvo = els.find(el => /Vendido por|Vendido e entregue por|Sold by/i.test(el.textContent));
      return alvo ? alvo.textContent.trim() : "";
    }).catch(() => "");
  }

  return vendedor || "";
}

async function extrairDetalhesProdutoAmazon(page, urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando página do produto");

  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
    await scrollLento(page);
    await delayAleatorio(2000, 5000);

    const nome = await page.$eval("#productTitle", (el) => el.textContent.trim());

    let precoInteiro = await page.$eval("span.a-price span.a-price-whole", (el) => el.textContent.trim()).catch(() => null);
    let centavos = await page.$eval("span.a-price span.a-price-fraction", (el) => el.textContent.trim()).catch(() => null);
    let preco = precoInteiro && centavos ? `R$ ${precoInteiro},${centavos}` : "Indisponível";

    const vendidoPor = await obterVendedorAmazon(page);
    const vendidoAmazon = isAmazonSeller(vendidoPor);

    console.error(`[DEBUG] Vendedor bruto: ${vendidoPor || "(não encontrado)"}`);

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
      link: urlProduto,
    });
  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Amazon",
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
    console.log(JSON.stringify(resultadoFinal));

    console.error("[INFO] Script Amazon finalizado com sucesso.");

    await new Promise((r) => setTimeout(r, 100));

    // Não chama process.exit(), deixa o Node finalizar naturalmente
  } catch (err) {
    console.error("[ERRO FATAL] Falha inesperada no script Amazon:", err.message);
    process.exit(1);
  }
})();
