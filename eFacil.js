const axios = require("axios");
const cheerio = require("cheerio");

// ✅ Lista de produtos: só adicionar aqui
const listaProdutos = [
  "AFN-40-BI",
  "BFR11PG",
  "BFR38",
  "PFR15PI",
  "OFRT520",
  "EAF15",
  "BFR2100",
  "EAF90",
  "AFON-12L-BI",
  "OFRT780",
  "PFR2200",
  "FW009547"
];

async function executarBuscaEmTodos() {
  console.log("[INFO] Iniciando verificação de todos os produtos...\n");

  for (const termo of listaProdutos) {
    await buscarPrimeiroProdutoEFACIL(termo);
  }

  console.log("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoEFACIL(termo) {
  const termoBusca = termo.trim().replace(/\s+/g, '+');
  const urlBusca = `https://www.efacil.com.br/loja/busca/?searchTerm=${termoBusca}`;

  console.log("\n[INFO] ========== NOVA BUSCA ==========");
  console.log("[DEBUG] Termo:", termo);
  console.log("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const linkProduto = $("a[id^='btn_skuP']").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      return;
    }

    const urlProduto = "https://www.efacil.com.br" + linkProduto;
    console.log("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProduto(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
  }
}

async function extrairDetalhesProduto(urlProduto, termoOriginal) {
  console.log("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    const preco = $("span")
      .filter((_, el) => $(el).text().includes("R$"))
      .first()
      .text()
      .trim();

    const entreguePor = $("span")
      .filter((_, el) => $(el).text().includes("Vendido e entregue por"))
      .first()
      .text()
      .trim();

    const vendidoEfácil = entreguePor.includes("eFácil");

    console.log(`[RESULTADO] Produto: ${nome}`);
    console.log(`[RESULTADO] Preço: ${preco}`);
    console.log(`[RESULTADO] Vendido por eFácil: ${vendidoEfácil ? "✅ Sim" : "❌ Não"}`);
    console.log(`[RESULTADO] Link: ${urlProduto}`);
  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
  }

  console.log("[INFO] --- Fim da verificação do produto ---\n");
}

// 🚀 Executa tudo
executarBuscaEmTodos();
