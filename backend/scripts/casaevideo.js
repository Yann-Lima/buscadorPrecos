const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// === Arquivo único de catálogo ===
const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
// NOVO: arquivo de termos customizados (opcional)
const termosCustomizadosPath = path.join(__dirname, "termosCustomizados.json");

// Carrega termos customizados se existir
let termosCustomizados = {};
if (fs.existsSync(termosCustomizadosPath)) {
  try {
    termosCustomizados = JSON.parse(fs.readFileSync(termosCustomizadosPath, "utf-8"));
    console.error("[INFO] termosCustomizados.json carregado.");
  } catch (e) {
    console.error("[WARN] Não foi possível ler/parsear termosCustomizados.json:", e.message);
  }
}

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

// === NOVO: Montagem da lista com termo original (validação/JSON) e termo de busca (custom) ===
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();

    // termo original (igual ao comportamento anterior)
    let originalTerm = [produto, marca].filter(Boolean).join(" ").trim();

    if (!originalTerm && p.descricao) {
      originalTerm = p.descricao.toString().trim();
      console.error(`[WARN] Item ${i}: faltam 'produto'/'marca'. Usando 'descricao' como termo original.`);
    }

    if (!originalTerm) {
      console.error(`[ERRO] Item ${i}: sem dados suficientes (produto/marca/descricao). Será ignorado.`);
      return null;
    }

    // termo usado na BUSCA: se houver custom para o "produto", usa-o; senão usa o original
    const searchTerm = termosCustomizados[produto]
      ? String(termosCustomizados[produto]).trim()
      : originalTerm;

    if (termosCustomizados[produto]) {
      console.error(`[INFO] Usando termo customizado para produto ${produto}: "${searchTerm}"`);
    }

    return { originalTerm, searchTerm, produto, marca };
  })
  .filter(Boolean);

if (!listaProdutos.length) {
  console.error("[ERRO] Nenhum termo de busca válido encontrado no catálogo.");
  process.exit(1);
}

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos...\n");

  for (const item of listaProdutos) {
    try {
      await buscarPrimeiroProdutoCasaEV(item);
    } catch (err) {
      console.error(
        `[ERRO CRÍTICO] Falha inesperada na busca do produto "${item.originalTerm}":`,
        err.message
      );
      resultados.push({
        termo: item.originalTerm, // mantém chave exatamente como antes
        nome: null,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_casaevideo.json");
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  } catch (e) {
    console.error("[WARN] Não foi possível salvar resultados_casaevideo.json:", e.message);
  }

  console.error("\n[INFO] Fim da verificação.");
}

// === Customizações exclusivas para Casa & Vídeo ===
const termosCasaEV = {
  "VSP-40-B": "Ventilador de Mesa 40Cm 6 Pás Preto Mondial VSP40",
  // Futuramente: "OUTRO-CODIGO": "Outra descrição customizada"
};

async function buscarPrimeiroProdutoCasaEV(item) {
  // 🔥 Ordem de prioridade para o termo de busca:
  // 1. termosCasaEV > 2. termosCustomizados (já está em item.searchTerm) > 3. originalTerm
  const termoFinalBusca = termosCasaEV[item.produto] || item.searchTerm || item.originalTerm;

  const termoBusca = encodeURIComponent(termoFinalBusca);
  const urlBusca = `https://www.casaevideo.com.br/search?q=${termoBusca}&filter.sellername=casa---video`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo (original p/ validação/JSON):", item.originalTerm);
  console.error("[DEBUG] Termo (final usado na BUSCA - Casa&Vídeo):", termoFinalBusca);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      timeout: 20000,
      validateStatus: (s) => s >= 200 && s < 500, // para logar 404/410 etc
    });

    if (resp.status >= 400) {
      console.error(`[ERRO] Falha ao buscar: ${termoFinalBusca} → HTTP ${resp.status}`);
      resultados.push({
        termo: item.originalTerm,
        nome: null,
        preco: "Indisponível",
        loja: "Casa e Vídeo",
        vendido: false,
        link: null,
      });
      return;
    }

    const $ = cheerio.load(resp.data);

    let linkProduto =
      $("a[id^='product-card']").first().attr("href") ||
      $("a[data-testid='product-card']").first().attr("href") ||
      $("a[href^='/produto/']").first().attr("href") ||
      $("a[href^='/p/']").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termoFinalBusca);
      resultados.push({
        termo: item.originalTerm,
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

    await extrairDetalhesProdutoCasaEV(linkProduto, item.originalTerm);
  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termoFinalBusca, "→", err.message);
    resultados.push({
      termo: item.originalTerm,
      nome: null,
      preco: "Indisponível",
      loja: "Casa e Vídeo",
      vendido: false,
      link: null,
    });
  }
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
    const [produtoOriginal, marcaOriginal] = termoOriginal.split(" "); // (mantido do seu código)
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
      termo: termoOriginal, // mantém a chave/termo no array de resultados
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
