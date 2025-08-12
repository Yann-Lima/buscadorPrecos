const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

// Tratamento para erros não capturados
process.on('uncaughtException', (err) => {
  console.error('[ERRO FATAL] Exceção não capturada:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[ERRO FATAL] Rejeição não capturada:', err);
  process.exit(1);
});

// Caminho fixo para o catalogoProdutos.json
const catalogoProdutosPath = path.join(__dirname, "catalogoProdutos.json");

// Carrega os produtos do catalogoProdutos.json
const produtosJson = JSON.parse(fs.readFileSync(catalogoProdutosPath, "utf-8"));
const listaProdutos = produtosJson.produtos.map(p => `${p.produto} ${p.marca}`.trim());


async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no eFácil...\n");

  for (const termo of listaProdutos) {
    try {
      await buscarPrimeiroProdutoEFACIL(termo);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "eFácil",
        vendido: false,
        link: null,
      });
    }
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_eFacil.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoEFACIL(termo) {
  const termoBusca = termo.trim().replace(/\s+/g, '+');
  const urlBusca = `https://www.efacil.com.br/loja/busca/?searchTerm=${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo:", termo);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const linkProduto = $("a[id^='btn_skuP']").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", termo);
      resultados.push({
        termo,
        nome: null,
        preco: "Indisponível",
        loja: "eFácil",
        vendido: false,
        link: null,
      });
      return;
    }

    const urlProduto = "https://www.efacil.com.br" + linkProduto;
    console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

    await extrairDetalhesProdutoEFACIL(urlProduto, termo);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
    resultados.push({
      termo,
      nome: null,
      preco: "Indisponível",
      loja: "eFácil",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoEFACIL(urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    const resp = await axios.get(urlProduto, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(resp.data);
    const nome = $("h1").first().text().trim();

    // Preço à vista vindo do elemento com data-testid="spot-price"
    let preco = null;

    // Primeiro, tenta pegar o preço visível
    preco = $("div[data-testid='spot-price'] span")
      .filter((i, el) => $(el).text().includes("R$"))
      .first()
      .text()
      .trim();

    // Se ainda estiver vazio, tenta via JSON-LD
    if (!preco) {
      const ldJsonScript = $("script[type='application/ld+json']").html();
      if (ldJsonScript) {
        try {
          const ldJson = JSON.parse(ldJsonScript);
          if (ldJson.offers && ldJson.offers.price) {
            preco = `R$ ${ldJson.offers.price}`;
          }
        } catch (e) {
          console.warn("[WARN] JSON-LD inválido:", e.message);
        }
      }
    }

    const entreguePor = $("span")
      .filter((_, el) => $(el).text().includes("Vendido e entregue por"))
      .first()
      .text()
      .trim();

    const vendidoEFACIL = entreguePor.toLowerCase().includes("efácil");

    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço à vista: ${preco}`);
    console.error(`[RESULTADO] Vendido por eFácil: ${vendidoEFACIL ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

    resultados.push({
      termo: termoOriginal,
      nome,
      preco,
      loja: "eFácil",
      vendido: vendidoEFACIL,
      link: urlProduto
    });

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "eFácil",
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


    // Só imprimimos o JSON final no stdout, logs em stderr
    console.error("[DEBUG] Imprimindo JSON final no stdout");

    // Imprime JSON final no stdout
    const jsonString = JSON.stringify(resultadoFinal) + '\n';

    // Usa write e espera o flush com drain event para garantir a saída completa
    if (!process.stdout.write(jsonString)) {
      process.stdout.once('drain', () => {
        console.error("[INFO] Script eFacil finalizado com sucesso.");
        // Não chama exit aqui para evitar matar o processo antes do pai ler tudo
        // Apenas termina normalmente
      });
    } else {
      // Se escreveu tudo de primeira, aguarda um tick para logar e sair
      setImmediate(() => {
        console.error("[INFO] Script eFacil finalizado com sucesso.");
        // Não chama exit aqui para evitar truncamento
      });
    }
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script eFacil:", err.message);
    process.exit(1);
  });

