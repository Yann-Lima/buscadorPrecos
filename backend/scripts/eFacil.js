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

// Caminho fixo para termos customizados
const termosCustomizadosPath = path.join(__dirname, "termosCustomizados.json");

// Carrega termos customizados
let termosCustomizados = {};
if (fs.existsSync(termosCustomizadosPath)) {
  termosCustomizados = JSON.parse(fs.readFileSync(termosCustomizadosPath, "utf-8"));
}

// Carrega os produtos do catalogoProdutos.json
const produtosJson = JSON.parse(fs.readFileSync(catalogoProdutosPath, "utf-8"));

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



async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no eFácil...\n");

  for (const item of listaProdutos) {
    try {
      await buscarPrimeiroProdutoEFACIL(item);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${item.termoBusca}":`, err.message);
      resultados.push({
        termo: item.termoBusca,
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

function tituloConfere(tituloOriginal, marca, produto) {
  if (!tituloOriginal) return false;

  const titulo = normalizar(tituloOriginal);
  const marcaNorm = normalizar(marca);
  const produtoNorm = normalizar(produto);

  // Marca deve aparecer no título
  if (!titulo.includes(marcaNorm)) {
    console.log("❌ Marca não encontrada no título:", marca);
    return false;
  }

  // Produto deve aparecer no título (verifica pelo menos 50% das palavras)
  const palavrasProduto = produtoNorm.split(/\s+/).filter(Boolean);
  if (!palavrasProduto.length) return true;

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


async function buscarPrimeiroProdutoEFACIL(item) {
  const termoBuscaUrl = item.termoBusca.trim().replace(/\s+/g, '+');
  const urlBusca = `https://www.efacil.com.br/loja/busca/?searchTerm=${termoBuscaUrl}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo de busca:", item.termoBusca);
  console.error("[DEBUG] Produto original:", item.produto);
  console.error("[DEBUG] Marca original:", item.marca);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, { headers: { "User-Agent": "Mozilla/5.0" } });
    const $ = cheerio.load(resp.data);
    const linkProduto = $("a[id^='btn_skuP']").first().attr("href");

    if (!linkProduto) {
      console.warn("[WARN] Nenhum produto encontrado para:", item.termoBusca);
      resultados.push({
        termo: item.termoBusca,
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

    await extrairDetalhesProdutoEFACIL(urlProduto, item);

  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", item.termoBusca, "→", err.message);
    resultados.push({
      termo: item.termoBusca,
      nome: null,
      preco: "Indisponível",
      loja: "eFácil",
      vendido: false,
      link: null,
    });
  }
}


async function extrairDetalhesProdutoEFACIL(urlProduto, item) {
  console.error("[INFO] --- Acessando produto para:", item.termoBusca);

  try {
    const resp = await axios.get(urlProduto, { headers: { "User-Agent": "Mozilla/5.0" } });
    const $ = cheerio.load(resp.data);

    const nome = $("h1").first().text().trim();

    // validação com base na marca e produto originais
    const tituloValido = tituloConfere(nome, item.marca, item.produto);

    if (!tituloValido) {
      console.warn("[WARN] ❌ Título não confere com marca/produto:", item.produto, item.marca);
      resultados.push({
        termo: item.termoBusca,
        nome,
        preco: "Indisponível",
        loja: "eFácil",
        vendido: false,
        link: urlProduto,
      });
      return;
    }

    // ... resto igual (preço, vendido, etc.)


    // Agora pega preço
    let preco = $("div[data-testid='spot-price'] span")
      .filter((i, el) => $(el).text().includes("R$"))
      .first()
      .text()
      .trim();

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

