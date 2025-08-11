// buscar_walita_puppeteer.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const resultados = [];

function normalizeText(s = "") {
  return s
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/gi, "") // keep only alnum
    .toLowerCase();
}

async function waitForEither(page, selectors, timeout = 12000) {
  const promises = selectors.map(sel =>
    page.waitForSelector(sel, { timeout }).then(() => sel).catch(() => null)
  );
  const res = await Promise.race(promises.map(p => p.catch(() => null)));
  // If race resolved with null, try all to see if any resolved
  if (!res) {
    for (const p of promises) {
      try {
        const r = await p;
        if (r) return r;
      } catch (_) {}
    }
  }
  return res;
}

async function extrairPrecosDaPagina(page) {
  // Try common selectors first, then fallback to regex on page text
  const trySelectors = async (selectors) => {
    for (const sel of selectors) {
      const exist = await page.$(sel);
      if (exist) {
        const txt = await page.$eval(sel, el => el.innerText.trim());
        if (txt && txt.includes('R$')) return txt.replace(/\s+/g, ' ').trim();
      }
    }
    return null;
  };

  // possíveis seletores (vtex e variações)
  let precoAVista = await trySelectors([
    '.vtex-product-price-1-x-spotPriceValue',
    '.vtex-product-price-1-x-spotPrice',
    '.vtex-price-spot',
    '.vtex-product-price-1-x-sellingPrice' // fallback
  ]);

  let precoParcelado = await trySelectors([
    '.vtex-product-price-1-x-installmentsTotalValue--summary-pdp',
    '.vtex-product-price-1-x-installmentsTotalValue',
    '.vtex-product-price-1-x-installments',
    '.installments' // fallback
  ]);

  // fallback geral: pega primeiro "R$ ..." na página
  if ((!precoAVista || !precoAVista.includes('R$')) || (!precoParcelado || !precoParcelado.includes('R$'))) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    // encontra todas as ocorrências de preços R$ 1.234,56
    const matches = bodyText.match(/R\$\s*\d{1,3}(?:[.\s]\d{3})*,\d{2}/g);
    if (matches && matches.length > 0) {
      // assume primeiro é à vista, segundo (se existir) parcelado
      if (!precoAVista) precoAVista = matches[0].trim();
      if (!precoParcelado) precoParcelado = matches[1] ? matches[1].trim() : matches[0].trim();
    }
  }

  if (!precoAVista || !precoAVista.includes('R$')) precoAVista = "Indisponível";
  if (!precoParcelado || !precoParcelado.includes('R$')) precoParcelado = "Indisponível";

  return { precoAVista, precoParcelado };
}

async function buscarProduto(page, termo) {
  const termoBusca = encodeURIComponent(termo.trim());
  const urlBusca = `https://www.walita.com.br/${termoBusca}?_q=${termoBusca}&map=ft`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  await page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 45000 });
  page.setDefaultNavigationTimeout(45000);

  // espera por qualquer um: mensagem de não encontrado ou lista de produtos
  const resolved = await waitForEither(page, [
    '.vtex-search-result-3-x-searchNotFoundInfo',
    'a.vtex-product-summary-2-x-clearLink'
  ], 15000);

  if (!resolved) {
    console.warn("[WARN] Timeout aguardando resultados para:", termo);
    return {
      termo,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Walita",
      link: null
    };
  }

  // se existir o bloco de "não encontrado"
  const isNotFound = await page.$('.vtex-search-result-3-x-searchNotFoundInfo') !== null;
  if (isNotFound) {
    console.warn("[WARN] Produto indisponível (search not found):", termo);
    return {
      termo,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Walita",
      link: null
    };
  }

  // coleta todos os links de produto visíveis
  const produtos = await page.$$eval('a.vtex-product-summary-2-x-clearLink', els => {
    return els.map(a => {
      const href = a.getAttribute('href') || '';
      // tenta extrair nome a partir do conteúdo textual do cartão
      const nome = (a.innerText || '').replace(/\s+/g,' ').trim();
      // algumas estruturas possuem aria-label no article interno
      const article = a.querySelector('article[aria-label]');
      const aria = article ? article.getAttribute('aria-label') : null;
      return { href, nome: aria || nome };
    });
  });

  if (!produtos || produtos.length === 0) {
    console.warn("[WARN] Nenhum produto visível encontrado na página para:", termo);
    return {
      termo,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Walita",
      link: null
    };
  }

  // normaliza o termo para buscar correspondência
  const termoNorm = normalizeText(termo);

  // tenta encontrar um produto cujo href ou nome contenha o termo normalizado
  let candidato = null;
  for (const p of produtos) {
    const hrefNorm = normalizeText(p.href || '');
    const nomeNorm = normalizeText(p.nome || '');
    if ((hrefNorm && hrefNorm.includes(termoNorm)) || (nomeNorm && nomeNorm.includes(termoNorm))) {
      candidato = p;
      break;
    }
  }

  // se nenhum candidato direto, podemos tentar correspondência parcial (ex.: apenas numeros do código)
  if (!candidato) {
    for (const p of produtos) {
      const hrefNorm = normalizeText(p.href || '');
      const nomeNorm = normalizeText(p.nome || '');
      // tenta buscar apenas os dígitos do termo
      const termoDigits = (termo || '').replace(/\D/g, '');
      if (termoDigits && ((hrefNorm && hrefNorm.includes(termoDigits)) || (nomeNorm && nomeNorm.includes(termoDigits)))) {
        candidato = p;
        break;
      }
    }
  }

  // se ainda não existe candidato, NÃO pegar o primeiro automaticamente — marca indisponível.
  if (!candidato) {
    console.warn(`[WARN] Nenhum produto correspondente ao termo encontrado entre os resultados (evitando falso-positivo). Termo: ${termo}`);
    return {
      termo,
      nome: null,
      preco: "Indisponível",
      precoParcelado: "Indisponível",
      loja: "Walita",
      link: null
    };
  }

  // monta URL absoluta
  let urlProduto = candidato.href;
  if (urlProduto.startsWith('/')) urlProduto = 'https://www.walita.com.br' + urlProduto;
  if (!urlProduto.startsWith('http')) urlProduto = 'https://www.walita.com.br/' + urlProduto;

  console.error("[DEBUG] Primeiro produto correspondente encontrado:", urlProduto);

  // abre a página do produto
  await page.goto(urlProduto, { waitUntil: 'networkidle2', timeout: 45000 });

  const nomeProduto = await page.$eval('h1', el => el.innerText.trim()).catch(() => null);
  const precos = await extrairPrecosDaPagina(page);

  console.error(`[RESULTADO] Produto: ${nomeProduto || candidato.nome}`);
  console.error(`[RESULTADO] Preço à vista: ${precos.precoAVista}`);
  console.error(`[RESULTADO] Preço parcelado: ${precos.precoParcelado}`);
  console.error(`[RESULTADO] Link: ${urlProduto}`);

  return {
    termo,
    nome: nomeProduto || candidato.nome,
    preco: precos.precoAVista,
    precoParcelado: precos.precoParcelado,
    loja: "Walita",
    link: urlProduto
  };
}

(async () => {
  const catalogPath = path.join(__dirname, 'catalogoProdutos.json');
  if (!fs.existsSync(catalogPath)) {
    console.error("[ERRO] Arquivo catalogoProdutos.json não encontrado em:", catalogPath);
    process.exit(1);
  }

  const produtosJson = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const listaProdutos = produtosJson
    .filter(p => {
      const marca = (p.marca || '').trim().toUpperCase();
      return marca === 'WALITA' || marca === 'WALLITA' || marca === 'PHILIPS WALITA';
    })
    .map(p => p.produto.trim());

  if (listaProdutos.length === 0) {
    console.error("[INFO] Nenhum produto Walita encontrado no catalogoProdutos.json (marcas filtradas).");
    process.exit(0);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 768 }
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36');
    await page.setJavaScriptEnabled(true);

    for (const termo of listaProdutos) {
      try {
        const res = await buscarProduto(page, termo);
        resultados.push(res);
        // pequeno delay entre buscas para reduzir risco de bloqueio
        await page.waitForTimeout(600);
      } catch (err) {
        console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
        resultados.push({
          termo,
          nome: null,
          preco: "Indisponível",
          precoParcelado: "Indisponível",
          loja: "Walita",
          link: null
        });
      }
    }

    const outputPath = path.join(__dirname, '..', 'results', 'resultados_walita_puppeteer.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
    console.error("\n[INFO] Fim da verificação. Resultados salvos em:", outputPath);
    console.log(JSON.stringify(resultados.reduce((acc, it) => {
      acc[it.termo] = { preco: it.preco, precoParcelado: it.precoParcelado, link: it.link };
      return acc;
    }, {})));
  } finally {
    await browser.close();
  }
})();
