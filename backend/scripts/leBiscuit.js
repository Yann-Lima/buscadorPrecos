const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// Caminho para o catalogoProdutos.json (apenas este será usado)
const catalogoProdutosPath = path.join(__dirname, "catalogoProdutos.json");

// Carrega o catálogo diretamente
const produtosJson = JSON.parse(fs.readFileSync(catalogoProdutosPath, "utf-8"));

// Caminho fixo para termos customizados
const termosCustomizadosPath = path.join(__dirname, "termosCustomizados.json");

// Carrega termos customizados
let termosCustomizados = {};
if (fs.existsSync(termosCustomizadosPath)) {
  termosCustomizados = JSON.parse(fs.readFileSync(termosCustomizadosPath, "utf-8"));
}

// Monta a lista de termos
const listaProdutos = produtosJson.produtos.map(p => {
  const termoBusca = termosCustomizados[p.produto]
    ? termosCustomizados[p.produto]
    : `${p.produto} ${p.marca}`;

  return {
    produto: p.produto,
    marca: p.marca,
    termoBusca
  };
});

// ---------- Funções de validação ----------
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

  // Marca precisa estar no título
  if (!titulo.includes(marcaNorm)) {
    console.log("❌ Marca não encontrada no título:", marca);
    return false;
  }

  // Código do produto precisa estar 100% presente
  if (!titulo.includes(produtoNorm)) {
    console.log("❌ Código não encontrado no título:", produto);
    return false;
  }

  console.log("✅ Título confere com produto:", produto);
  return true;
}
// ------------------------------------------

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Le Biscuit...\n");

  for (const item of listaProdutos) {
    try {
      await buscarPrimeiroProdutoLeBiscuit(item);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${item.termoBusca}":`, err.message);
      resultados.push({
        termo: item.termoBusca,
        nome: null,
        preco: "Indisponível",
        loja: "Le Biscuit",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_leBiscuit.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoLeBiscuit({ termoBusca, produto, marca }) {
  const termoEncoded = encodeURIComponent(termoBusca);
  const urlBusca = `https://www.lebiscuit.com.br/search?q=${termoEncoded}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termoBusca);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const primeiroLink = $("a[id^='product-card-']").first().attr("href");

    if (!primeiroLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", termoBusca);
      resultados.push({
        termo: termoBusca,
        nome: null,
        preco: "Indisponível",
        loja: "Le Biscuit",
        vendido: false,
        link: null,
      });
      return;
    }

    const urlProduto = `https://www.lebiscuit.com.br${primeiroLink}`;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoLeBiscuit(urlProduto, produto, marca, termoBusca);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termoBusca, "→", err.message);
    resultados.push({
      termo: termoBusca,
      nome: null,
      preco: "Indisponível",
      loja: "Le Biscuit",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoLeBiscuit(urlProduto, produtoEsperado, marcaEsperada, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    // ----------- Validação de título -----------
    const tituloValido = tituloConfere(nome, marcaEsperada, produtoEsperado);

    if (!tituloValido) {
      console.warn("[WARN] ❌ Marca ou código não batem com o título");
      resultados.push({
        termo: termoOriginal,
        nome,
        preco: "Indisponível",
        loja: "Le Biscuit",
        vendido: false,   // sempre false se a validação falhar
        link: urlProduto
      });
      return;
    }
    // --------------------------------------------

    const preco = $("span.h5-bold, span.md\\:h4-bold")
      .filter((_, el) => $(el).text().includes("R$"))
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const vendedor = $("p:contains('Vendido e entregue por') strong").first().text().trim();
    const vendidoPorLeBiscuit = vendedor.toUpperCase().includes("LE BISCUIT");

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço: ${preco}`);
    console.error(`[RESULTADO] Vendido por: ${vendedor}`);
    console.error(`[RESULTADO] Vendido por Le Biscuit: ${vendidoPorLeBiscuit ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Le Biscuit",
      vendido: vendidoPorLeBiscuit,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Le Biscuit",
      vendido: false,
      link: urlProduto
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaEmTodos()
  .then(() => {
    // Apenas o JSON final vai para o stdout
    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null,
        vendido: item.vendido,
        link: item.link
      };
    }
    console.log(JSON.stringify(resultadoFinal));

    console.error("[INFO] Script Le Biscuit finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Le Biscuit:", err.message);
    process.exit(1);
  });
