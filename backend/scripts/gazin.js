const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

// Caminhos dos arquivos
const produtosTempPath = path.join(__dirname, "produtos_temp.json");
const produtosFixosPath = path.join(__dirname, "produtos.json");

if (fs.existsSync(produtosTempPath)) {
  produtosJson = JSON.parse(fs.readFileSync(produtosTempPath, "utf-8"));
  console.error("[INFO] Usando produtos do arquivo temporário produtos_temp.json");
} else {
  produtosJson = JSON.parse(fs.readFileSync(produtosFixosPath, "utf-8"));
  console.error("[INFO] Usando produtos do arquivo padrão produtos.json");
}
const listaProdutos = produtosJson.produtos.map(p => p.trim());

// Funções utilitárias para simular humano
async function delay(min, max) {
  const tempo = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, tempo));
}

async function rolarPagina(page) {
  await page.evaluate(() => {
    window.scrollBy(0, Math.floor(Math.random() * 500) + 200);
  });
}

async function moverMouseAleatorio(page) {
  const x = Math.floor(Math.random() * 800) + 100;
  const y = Math.floor(Math.random() * 600) + 100;
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 5) + 1 });
}

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Gazin...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoGAZIN(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Gazin",
        vendido: false,
        link: null,
      });
    }
    // Delay aleatório entre buscas para evitar padrão
    await delay(3000, 7000);
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_gazin.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoGAZIN(termo) {
  const termoBusca = encodeURIComponent(termo.trim());
  const urlBusca = `https://www.gazin.com.br/busca/${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");

  try {
    await page.goto(urlBusca, { waitUntil: "networkidle2", timeout: 60000 });

    // Simulação de humano
    await delay(1000, 3000);
    await moverMouseAleatorio(page);
    await rolarPagina(page);

    await page.waitForSelector("a[href^='/produto/']", { timeout: 10000 });

    const produtos = await page.$$eval("a[href^='/produto/']", (elements, termoOriginal) => {
      return elements.map(el => {
        const nome = el.querySelector("span.chakra-text.css-8cltlq")?.innerText || "";
        const preco = el.querySelector("span.chakra-text.css-1sgshui")?.innerText || "";
        const href = el.getAttribute("href");
        return {
          nome,
          preco,
          link: href ? `https://www.gazin.com.br${href}` : null,
          match: nome.toLowerCase().includes(termoOriginal.toLowerCase())
        };
      }).filter(p => p.link);
    }, termo);

    const produto = produtos.find(p => p.match) || produtos[12];

    if (!produto) {
      console.warn("[WARN] Nenhum produto válido encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Gazin",
        vendido: false,
        link: null,
      });
    } else {
      console.error("[INFO] Acessando página do produto:", produto.link);
      await page.goto(produto.link, { waitUntil: "networkidle2", timeout: 60000 });

      // Mais comportamento humano
      await delay(1000, 3000);
      await moverMouseAleatorio(page);
      await rolarPagina(page);

      await page.waitForSelector("p.chakra-text.css-1ktt7uz", { timeout: 10000 });

      const vendedor = await page.$eval("p.chakra-text.css-1ktt7uz", el => el.textContent.trim());
      const vendidoPorGazin = vendedor.toLowerCase().includes("gazin");

      console.error("[DEBUG] Produto encontrado:", produto.nome);
      console.error("[DEBUG] Preço:", produto.preco);
      console.error("[DEBUG] Vendido por:", vendedor);
      console.error("[DEBUG] Vendido por Gazin:", vendidoPorGazin ? "✅ Sim" : "❌ Não");

      resultados.push({
        termo,
        nome: produto.nome,
        preco: vendidoPorGazin ? produto.preco : null,
        loja: "Gazin",
        vendido: vendidoPorGazin,
        link: produto.link,
      });
    }

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Gazin",
      vendido: false,
      link: null,
    });
  } finally {
    await browser.close();
  }
}

executarBuscaEmTodos()
  .then(() => {
    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null,
        vendido: item.vendido,
        link: item.link
      };
    }
    console.log(JSON.stringify(resultadoFinal));
    console.error("[INFO] Script Gazin finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Gazin:", err.message);
    process.exit(1);
  });
