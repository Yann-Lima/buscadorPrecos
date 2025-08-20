const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// === Arquivo único de catálogo ===
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

function descricaoConfere(descricaoOriginal, marca, produto) {
  if (!descricaoOriginal) return false;

  const descricao = normalizar(descricaoOriginal); // Remove acentos, maiúsc/minúsc
  const marcaNorm = normalizar(marca);
  const produtoNorm = normalizar(produto);

  // 1️⃣ Verifica se a marca aparece na descrição
  if (!descricao.includes(marcaNorm)) {
    console.log("❌ Marca não encontrada na descrição:", marca);
    return false;
  }

  // 2️⃣ Verifica se a maioria das palavras do produto aparece na descrição
  const palavrasProduto = produtoNorm.split(/\s+/).filter(Boolean);
  if (!palavrasProduto.length) return true; // sem palavras, apenas marca já valida

  let count = 0;
  for (const p of palavrasProduto) {
    if (descricao.includes(p)) count++;
  }

  const proporcao = count / palavrasProduto.length;
  if (proporcao >= 0.9) {
    console.log("✅ Descrição confere com produto:", produto);
    return true;
  } else {
    console.log("❌ Descrição não bate com produto:", produto);
    return false;
  }
}

// === Montagem da lista de termos (robusta a variações) ===
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();

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

if (!listaProdutos.length) {
  console.error("[ERRO] Nenhum termo de busca válido encontrado no catálogo.");
  process.exit(1);
}

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoCasaEV(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha inesperada na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: null,
      });
    }
  }

  // 💾 Salva um espelho com todos os resultados detalhados (opcional)
  const outputPath = path.join(__dirname, "..", "results", "resultados_casaevideo.json");
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  } catch (e) {
    console.error("[WARN] Não foi possível salvar resultados_casaevideo.json:", e.message);
  }

  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoCasaEV(termo) {
  const termoBusca = encodeURIComponent(termo);
  const urlBusca = `https://www.casaevideo.com.br/search?q=${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      // timeout opcional:
      timeout: 20000,
      validateStatus: (s) => s >= 200 && s < 500, // para logar 404/410 etc
    });

    if (resp.status >= 400) {
      console.error(`[ERRO] Falha ao buscar: ${termo} → HTTP ${resp.status}`);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: null,
      });
      return;
    }

    const $ = cheerio.load(resp.data);

    // Seletores mais comuns para o primeiro card de produto (deixe múltiplos fallbacks)
    let linkProduto =
      $("a[id^='product-card']").first().attr("href") ||
      $("a[data-testid='product-card']").first().attr("href") ||
      $("a[href^='/produto/']").first().attr("href") ||
      $("a[href^='/p/']").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: null,
      });
      return;
    }

    if (!linkProduto.startsWith("http")) {
      linkProduto = `https://www.casaevideo.com.br${linkProduto}`;
    }
    console.error("[DEBUG] Primeiro produto encontrado:", linkProduto);

    await extrairDetalhesProdutoCasaEV(linkProduto, termo);
  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "Casa e Vídeo",
      vendido: false,
      link: null,
    });
  }
}

function normalizar(txt) {
  return (txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/&/g, "E")
    .replace(/[^\w\s]/g, " ") // remove pontuação
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function ehCasaEVendedor(texto) {
  const t = normalizar(texto);
  // Casos comuns: "Vendido e entregue por CASA & VIDEO", "CASA E VIDEO", "CASA E VÍDEO"
  // às vezes aparece "Vendido por" / "Loja oficial Casa & Video"
  return (
    /CASA E VIDEO/.test(t) ||
    /CASA VIDEO/.test(t) // fallback mais solto
  );
}

async function extrairDetalhesProdutoCasaEV(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  let nome = null;
  let preco = null;
  let entreguePor = "";

  try {
    const resp = await axios.get(urlProduto, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      timeout: 20000,
    });

    const $ = cheerio.load(resp.data);

    // Nome do produto
    nome = ($("h1").first().text() || "").trim();

    // Pega a descrição resumida
    const descricao = $('span.small-regular.hidden.md\\:block > div.h-14').text().trim();

    // Aqui você já pode verificar se a descrição bate com a marca e produto
    const [produtoOriginal, marcaOriginal] = termoOriginal.split(" "); // Ajuste conforme seu termo
    const descricaoValida = descricaoConfere(descricao, marcaOriginal, produtoOriginal);

    if (!descricaoValida) {
      console.warn("[WARN] ❌ Descrição não confere com marca/produto:", termoOriginal);
      resultados.push({
        termo: termoOriginal,
        nome,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: urlProduto,
      });
      return; // ignora produto
    }
    // Preço (múltiplos seletores comuns)
    preco =
      $("span.h5-bold, span.md\\:h4-bold")
        .filter((_, el) => $(el).text().includes("R$"))
        .first()
        .text()
        .trim() ||
      $("span:contains('R$')").first().text().trim();

    // "Vendido e entregue por ..."
    // Procura textos que contenham "Vendido" e "entregue"
    entreguePor =
      $("p:contains('Vendido')").first().text().trim() ||
      $("div:contains('Vendido')").first().text().trim() ||
      "";

    const vendidoCasaEV = ehCasaEVendedor(entreguePor);

    console.error(`[RESULTADO] Produto: ${nome || "(sem título)"}`);
    console.error(`[RESULTADO] Preço: ${preco || "(não encontrado)"}`);
    console.error(
      `[RESULTADO] Vendido por Casa e Vídeo: ${vendidoCasaEV ? "✅ Sim" : "❌ Não"}`
    );
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "Casa e Vídeo",
      vendido: vendidoCasaEV,
      link: urlProduto,
    });
  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome,
      preco: "Indisponível",
      loja: "Casa e Vídeo",
      vendido: false,
      link: urlProduto,
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

// 🚀 Executa tudo
executarBuscaEmTodos()
  .then(() => {
    // Apenas o JSON final deve ir para o stdout (mapeado por termo)
    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null, // só retorna preço se for vendido pela loja oficial
        vendido: item.vendido,
        link: item.link,
      };
    }
    console.log(JSON.stringify(resultadoFinal));
    console.error("[INFO] Script Casa e Vídeo finalizado com sucesso.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[ERRO FATAL] Falha inesperada no script Casa e Vídeo:", err.message);
    process.exit(1);
  });
