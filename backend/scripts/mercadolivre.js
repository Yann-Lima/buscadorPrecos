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

  // Produto: pelo menos 90% das palavras precisam estar no título (mantido)
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

// Caminhos de arquivos
const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
// NOVO: termos customizados (opcional)
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

// === NOVO: Monta lista com termo original (validação/JSON) e termo de busca (custom se houver) ===
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();

    const originalTerm = `${produto} ${marca}`.trim();
    if (!originalTerm) {
      console.error(`[ERRO] Item ${i}: sem dados suficientes (produto/marca). Será ignorado.`);
      return null;
    }

    const searchTerm = termosCustomizados[produto]
      ? String(termosCustomizados[produto]).trim()
      : originalTerm;

    if (termosCustomizados[produto]) {
      console.error(`[INFO] Usando termo customizado para produto ${produto}: "${searchTerm}"`);
    }

    return { originalTerm, searchTerm, produto, marca };
  })
  .filter(Boolean);

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Mercado Livre...\n");

  for (const item of listaProdutos) {
    try {
      await buscarPrimeiroProdutoML(item);

      // Delay aleatório entre buscas (2s a 5s)
      await delayAleatorio(2000, 5000);

    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${item.originalTerm}":`, err.message);
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

  const outputPath = path.join(__dirname, "..", "results", "resultados_mercado_livre.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

// === ALTERADO: recebe { originalTerm, searchTerm } e usa searchTerm na URL ===
// dentro de buscarPrimeiroProdutoML
async function buscarPrimeiroProdutoML(item) {
  const termoEncoded = encodeURIComponent(item.searchTerm.trim());
  const urlBusca = `https://lista.mercadolivre.com.br/${termoEncoded}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo (original p/ validação/JSON):", item.originalTerm);
  console.error("[DEBUG] Termo (usado na BUSCA):", item.searchTerm);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] },
      // 🔹 Forçar "modo incógnito" (sem cache/cookies)
      cache: "no-store"
    });

    const $ = cheerio.load(resp.data);

    // pega até os 3 primeiros links de produtos reais
    const linksProdutos = $("div.ui-search-result__wrapper div.poly-card a.poly-component__title")
      .filter(function() { return !($(this).attr("href") || "").includes("brand_ads"); })
      .slice(0, 3);

    if (!linksProdutos.length) {
      console.warn("[WARN] Nenhum produto encontrado para:", item.searchTerm);

      resultados.push({
        termo: item.originalTerm,
        nome: null,
        preco: "Indisponível",
        loja: "Mercado Livre",
        vendido: false,
        link: null,
      });
      return;
    }

    // ... resto igual
    const produtoNorm = normalizar(item.produto);
    let linkSelecionado = null;
    linksProdutos.each(function() {
      const titulo = normalizar($(this).text());
      if (titulo.includes(produtoNorm) && !linkSelecionado) {
        linkSelecionado = $(this).attr("href");
      }
    });

    if (!linkSelecionado) {
      linkSelecionado = linksProdutos.first().attr("href");
      console.warn("[WARN] Nenhum título bateu com o produto, usando o primeiro link disponível.");
    } else {
      console.log("[INFO] Produto encontrado pelo código:", linkSelecionado);
    }

    await delayAleatorio(500, 1500);
    await extrairDetalhesProdutoML(linkSelecionado, item.originalTerm);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", item.searchTerm, "→", err.message);

    // 🔎 salva HTML também em caso de erro
    if (err.response && err.response.data) {
      const debugPath = path.join(__dirname, `debug_ml_error_${normalizar(item.searchTerm)}.html`);
      try {
        fs.writeFileSync(debugPath, err.response.data);
        console.error(`[DEBUG] HTML de erro salvo em: ${debugPath}`);
      } catch (e) {
        console.error("[DEBUG] Falha ao salvar HTML de erro:", e.message);
      }
    }

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

async function extrairDetalhesProdutoML(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] },
      // 🔹 idem aqui: "modo incógnito"
      cache: "no-store"
    });

    // Simula tempo de leitura da página antes de pegar dados
    await delayAleatorio(800, 2000);

    const $ = cheerio.load(resp.data);

    const nome = $("h1.ui-pdp-title").first().text().trim();

    // Extrai marca e produto do termo original (mantido)
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
