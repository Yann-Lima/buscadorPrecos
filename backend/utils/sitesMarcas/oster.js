const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const resultados = [];

(async () => {
    const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
    const listaProdutos = produtosJson
        .filter(p => (p.marca || "").trim().toUpperCase() === "OSTER")
        .map(p => p.produto.trim());

    console.error("[INFO] Iniciando verificação de todos os produtos no site da Oster...\n");

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    for (const termo of listaProdutos) {
        console.error("\n[INFO] ========== NOVA BUSCA ==========");
        console.error("[DEBUG] Termo:", termo);

        try {
            console.error("[INFO] Acessando página inicial da Oster...");
            await page.goto("https://www.oster.com.br/", { waitUntil: "domcontentloaded" });

            console.error("[INFO] Clicando no campo de busca...");
await page.click('input.fulltext-search-box', { clickCount: 3 });

console.error("[INFO] Digitando termo de busca...");
await page.type('input.fulltext-search-box', termo, { delay: 100 });

console.error("[INFO] Clicando fora do campo para disparar eventos...");
await page.click('body', { delay: 200 });

console.error("[INFO] Tentando clicar no botão de busca via evaluate...");
await page.evaluate(() => {
  const btn = document.querySelector('input.btn-buscar');
  if (btn) btn.click();
});

console.error("[INFO] Aguardando mudança de página...");
await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });

console.error("[DEBUG] URL após busca:", page.url());


            // Aguarda aparecer algo relevante (produto ou lista de resultados)
            try {
                await page.waitForSelector("div.fn.productName, li h3 a", { timeout: 10000 });
                console.error("[INFO] Página de produto ou lista detectada.");
            } catch {
                console.warn("[WARN] Nenhum produto ou lista detectada após a busca.");
            }

            const nome = await page.$eval("div.fn.productName", el => el.innerText.trim());

            console.error("[DEBUG] Nome do produto encontrado:", nome);

            let precoParcelado = "Indisponível";
            try {
                precoParcelado = await page.$eval("strong.skuBestPrice", el =>
                    el.innerText.replace(/[^\d,]/g, "").trim()
                );
                console.error("[DEBUG] Preço parcelado encontrado:", precoParcelado);
            } catch (err) {
                console.warn("[WARN] Preço parcelado não encontrado.");
            }

            let precoAVista = "Indisponível";
            try {
                precoAVista = await page.$eval("p.preco-a-vista strong.skuPrice", el =>
                    el.innerText.replace(/[^\d,]/g, "").trim()
                );
                console.error("[DEBUG] Preço à vista encontrado:", precoAVista);
            } catch (err) {
                console.warn("[WARN] Preço à vista não encontrado.");
            }

            console.error("[RESULTADO] Nome:", nome);
            console.error("[RESULTADO] Parcelado:", precoParcelado);
            console.error("[RESULTADO] À vista:", precoAVista);
            console.error("[RESULTADO] Link:", page.url());

            resultados.push({
                termo,
                nome,
                preco: precoAVista,
                precoParcelado,
                loja: "Oster",
                link: page.url()
            });

        } catch (err) {
            console.error(`[ERRO] Falha ao buscar "${termo}":`, err.message);
            resultados.push({
                termo,
                nome: null,
                preco: "Indisponível",
                precoParcelado: "Indisponível",
                loja: "Oster",
                link: null
            });
        }

        console.error("[INFO] --- Fim da verificação do produto ---\n");
    }

    await browser.close();

    const outputPath = path.join(__dirname, "..", "results", "resultados_oster.json");
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2), "utf-8");

    console.error("\n[INFO] Fim da verificação.");
    console.error("[INFO] Resultados salvos em:", outputPath);
})();
