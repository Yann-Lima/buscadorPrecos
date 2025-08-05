const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];
const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8"));
const listaProdutos = produtosJson.produtos;

const delay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

async function buscarProdutoCasasBahia(termo) {
    const browser = await puppeteer.launch({
    headless: false,
    slowMo: 80,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage(); // sem incognito


    await page.setViewport({ width: 1280 + Math.floor(Math.random() * 100), height: 800 + Math.floor(Math.random() * 100) });

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
    await page.setExtraHTTPHeaders({
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
    });

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        window.navigator.chrome = { runtime: {} };
        Object.defineProperty(navigator, "languages", { get: () => ["pt-BR", "pt"] });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    });

    try {
        console.error(`[INFO] Acessando Casas Bahia...`);
        await page.goto("https://www.casasbahia.com.br/", { waitUntil: "domcontentloaded", timeout: 60000 });
        await delay(3000, 5000);

        await page.mouse.move(100, 100, { steps: 20 });
        await delay(500, 1000);
        await page.click("#search-input");
        await delay(500, 1000);
        await page.type("#search-input", termo, { delay: 150 + Math.random() * 100 });
        await delay(1500, 3000);

        const inputValue = await page.$eval("#search-input", el => el.value);
        if (!inputValue || inputValue.trim() === "") throw new Error("Falha ao inserir termo no input.");

        console.error(`[DEBUG] Termo digitado: "${inputValue}"`);
        await page.click('[data-qa="header-search-submit"]');
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 });
        await delay(3000, 5000);

        const content = await page.content();
        if (content.includes("Ops! Algo deu errado") || content.length < 1000) {
            throw new Error("Página de busca bloqueada ou inválida.");
        }

        await page.waitForSelector('a[data-testid="product-card-link-overlay"]', { timeout: 15000 });
        const linkProduto = await page.$eval('a[data-testid="product-card-link-overlay"]', el => el.href);

        console.error("[DEBUG] Produto encontrado:", linkProduto);
        await page.goto(linkProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
        await delay(2000, 3000);

        const nome = await page.$eval('h1[data-testid="product-name"]', el => el.textContent.trim());
        const preco = await page.$eval('[data-testid="product-price-value"] span', el => el.textContent.trim().replace(/\s+/g, " "));

        const vendedor = await page.$$eval("span", spans => {
            const alvo = spans.find(s => s.textContent.includes("Vendido e entregue por"));
            return alvo ? alvo.textContent.trim() : "";
        });

        const vendidoPorCasasBahia = vendedor.toUpperCase().includes("CASAS BAHIA");

        resultados.push({
            termo,
            nome,
            preco,
            loja: "Casas Bahia",
            vendido: vendidoPorCasasBahia,
            link: linkProduto,
        });

        console.error(`[RESULTADO] Produto: ${nome}`);
        console.error(`[RESULTADO] Preço: ${preco}`);
        console.error(`[RESULTADO] Vendido por Casas Bahia: ${vendidoPorCasasBahia ? "✅ Sim" : "❌ Não"}`);
        console.error(`[RESULTADO] Link: ${linkProduto}`);

    } catch (err) {
        console.error(`[ERRO] Produto (${termo}):`, err.message);

        const logsDir = path.join(__dirname, "logs");
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
        const safeTerm = termo.replace(/[^\w\s]/gi, "_");
        const htmlPath = path.join(logsDir, `${safeTerm}_casasbahia.html`);
        const screenshotPath = path.join(logsDir, `${safeTerm}_casasbahia.png`);

        try {
            fs.writeFileSync(htmlPath, await page.content(), "utf-8");
            await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch (screenshotErr) {
            console.error("[ERRO] Salvar HTML ou screenshot:", screenshotErr.message);
        }

        resultados.push({
            termo,
            nome: null,
            preco: "Indisponível",
            loja: "Casas Bahia",
            vendido: false,
            link: null,
        });

    } finally {
        // 🧹 Limpar dados de navegação
        try {
            const client = await page.target().createCDPSession();
            await client.send("Storage.clearDataForOrigin", {
                origin: "https://www.casasbahia.com.br",
                storageTypes: "all",
            });
            console.error("[INFO] Dados de navegação limpos.");
        } catch (e) {
            console.error("[WARN] Falha ao limpar dados:", e.message);
        }

        await browser.close();
        console.error("[INFO] --- Fim da verificação do produto ---\n");
    }
}

async function executarBuscaEmTodos() {
    console.error("[INFO] Iniciando verificação de todos os produtos...\n");

    for (const termo of listaProdutos) {
        try {
            await buscarProdutoCasasBahia(termo);
        } catch (err) {
            console.error(`[ERRO] Produto ${termo}:`, err.message);
        }
    }

    const resultadoFinal = {};
    for (const item of resultados) {
        resultadoFinal[item.termo] = {
            preco: item.vendido ? item.preco : null,
            vendido: item.vendido
        };
    }

    console.log(JSON.stringify(resultadoFinal));
    console.error("[INFO] Script Casas Bahia finalizado.");
    process.exit(0);
}

executarBuscaEmTodos().catch(err => {
    console.error("[ERRO FATAL] Script falhou:", err.message);
    process.exit(1);
});
