const puppeteer = require("puppeteer");

async function buscarProduto(descricao) {
  const query = descricao.replace(/-/g, ' ').replace(/\s+/g, '+').toLowerCase();
  const url = `https://www.magazineluiza.com.br/busca/${query}/`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  try {
    console.log(`Acessando: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Aguarda manualmente o container principal de produtos (isso ajuda bastante)
    await page.waitForSelector("li[data-testid='product-card-container']", { timeout: 15000 });

    const produtos = await page.evaluate(() => {
      const itens = [];
      const cards = document.querySelectorAll("li[data-testid='product-card-container']");
      cards.forEach(el => {
        const nome = el.querySelector("h2")?.innerText;
        const preco = el.querySelector("p[data-testid='price-value']")?.innerText;
        const link = el.querySelector("a")?.href;
        if (nome && preco) {
          itens.push({ nome, preco, link });
        }
      });
      return itens;
    });

    console.log(`\n🟢 Resultados para "${descricao}":`);
    if (produtos.length === 0) {
      console.log("❌ Nenhum produto encontrado.");
    } else {
      console.table(produtos.slice(0, 3));
    }

  } catch (err) {
    console.error(`Erro ao buscar "${descricao}":`, err.message);
  } finally {
    await browser.close();
  }
}

const produtos = [
  "AFN-40-BI",
  "Air Fryer Britânia 4,4L 1500W BFR11PG",
  "PFR15PI",
  "EAF15",
  "BFR2100"
];

(async () => {
  for (const desc of produtos) {
    await buscarProduto(desc);
  }
})();
