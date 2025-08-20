const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
const outputPath = path.join(__dirname, "resultados_casasbahia.json");

if (!fs.existsSync(catalogoPath)) {
  console.error("[ERRO] catalogoProdutos.json não encontrado.");
  process.exit(1);
}

const listaProdutos = JSON.parse(fs.readFileSync(catalogoPath, 'utf-8')).produtos;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, // modo não-headless evita bloqueio
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");

  const resultados = [];

  for (const produto of listaProdutos) {
    const termo = `${produto.produto} ${produto.marca}`;
    console.log("[INFO] Pesquisando produto:", termo);

    try {
      // Abrir busca
      await page.goto(`https://www.casasbahia.com.br/busca?q=${encodeURIComponent(termo)}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(2000 + Math.random() * 2000);

      // Selecionar o primeiro produto da lista
      const linkProduto = await page.$eval('a[data-testid="product-link"]', el => el.href).catch(() => null);
      if (!linkProduto) {
        console.log("[WARN] Nenhum resultado encontrado para:", termo);
        resultados.push({ termo, nome: null, preco: null, link: null, vendido: false });
        continue;
      }

      // Abrir página do produto
      await page.goto(linkProduto, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(2000 + Math.random() * 2000);

      // Extrair informações
      const nome = await page.$eval('h1[data-testid="product-name"]', el => el.textContent.trim()).catch(() => null);
      const preco = await page.$eval('[data-testid="product-price-value"] span', el => el.textContent.trim()).catch(() => "Indisponível");
      const vendedorTexto = await page.$eval('span', el => el.textContent).catch(() => "");
      const vendido = vendedorTexto.toUpperCase().includes("CASAS BAHIA");

      resultados.push({
        termo,
        nome,
        preco,
        link: linkProduto,
        vendido
      });

      console.log("[OK] Produto extraído:", { termo, nome, preco });

      await delay(2000 + Math.random() * 3000); // delay entre produtos

    } catch (err) {
      console.error("[ERRO] Produto:", termo, err.message);
      resultados.push({ termo, nome: null, preco: null, link: null, vendido: false });
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.log("[INFO] Resultados salvos em:", outputPath);

  await browser.close();
})();
