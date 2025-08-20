const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// Lista de user agents para variar e parecer mais humano
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.133 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0"
];

// Função para esperar X milissegundos
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Delay aleatório entre min e max ms
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

  // Marca obrigatória no título
  if (!titulo.includes(marcaNorm)) {
    console.log("❌ Marca não encontrada no título:", marca);
    return false;
  }

  // Produto: pelo menos 50% das palavras precisam estar no título
  const palavrasProduto = produtoNorm.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const p of palavrasProduto) if (titulo.includes(p)) count++;
  const proporcao = count / palavrasProduto.length;

  if (proporcao >= 0.9) {
    console.log("✅ Título confere com produto:", produto);
    return true;
  } else {
    console.log("❌ Título não bate com produto:", produto);
    return false;
  }
}


// Caminho fixo para o arquivo catalogoProdutos.json
const catalogoPath = path.join(__dirname, "catalogoProdutos.json");

// Carrega o JSON direto SEM IF/ELSE
const produtosJson = JSON.parse(fs.readFileSync(catalogoPath, "utf-8"));

// Monta lista com "produto + marca"
const listaProdutos = produtosJson.produtos.map(p => `${p.produto} ${p.marca}`.trim());

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Mercado Livre...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoML(termo);

      // Delay aleatório entre buscas (2s a 5s)
      await delayAleatorio(2000, 5000);

    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Mercado Livre",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_mercado_livre.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoML(termo) {
  const termoBusca = termo.trim().replace(/\s+/g, '-');
  const urlBusca = `https://lista.mercadolivre.com.br/${termoBusca}#D[A:${termo}]`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] }
    });

    const $ = cheerio.load(resp.data);
    const linkProduto = $("li.ui-search-layout__item a").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Mercado Livre",
        vendido: false,
        link: null,
      });
      return;
    }

    console.error("[DEBUG] Primeiro produto encontrado:", linkProduto);

    // Delay aleatório antes de abrir o produto (500ms a 1500ms)
    await delayAleatorio(500, 1500);

    await extrairDetalhesProdutoML(linkProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Mercado Livre",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoML(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] }
    });

    // Simula tempo de leitura da página antes de pegar dados
    await delayAleatorio(800, 2000);

    const $ = cheerio.load(resp.data);

    const nome = $("h1.ui-pdp-title").first().text().trim();

    // Extrai marca e produto do termo original
    const [produtoOriginal, marcaOriginal] = termoOriginal.split(" ");

    // Valida título
    const tituloValido = tituloConfere(nome, marcaOriginal, produtoOriginal);

    if (!tituloValido) {
      console.warn("[WARN] ❌ Título não confere com marca/produto:", termoOriginal);
      resultados.push({
        termo: termoOriginal,
        nome,
        preco: "Indisponível",
        loja: "Mercado Livre",
        vendido: false,
        link: urlProduto,
      });
      return; // não processa mais
    }

    let preco = $("meta[itemprop='price']").attr("content");
    preco = preco ? `R$ ${parseFloat(preco).toFixed(2).replace('.', ',')}` : "Indisponível";

    const infoVendedor = $(".ui-pdp-seller__label-text-with-icon").text().toLowerCase();
    const vendidoML = infoVendedor.includes("mercado livre") || infoVendedor.includes("full") || infoVendedor.includes("vendido por") || infoVendedor.trim() !== "";

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${preco}`);
    console.error(`[RESULTADO] Vendido por Mercado Livre: ${vendidoML ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Mercado Livre",
      vendido: vendidoML,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Mercado Livre",
      vendido: false,
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
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

    console.error("[INFO] Script Mercado Livre finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Mercado Livre:", err.message);
    process.exit(1);
  });
