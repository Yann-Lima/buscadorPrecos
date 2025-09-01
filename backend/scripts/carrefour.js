// carrefour.js (atualizado para suportar termosCustomizados APENAS na busca)

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
// NOVO: caminho fixo para termos customizados
const termosCustomizadosPath = path.join(__dirname, "termosCustomizados.json");

// Carrega termos customizados (se existir)
let termosCustomizados = {};
if (fs.existsSync(termosCustomizadosPath)) {
  try {
    termosCustomizados = JSON.parse(fs.readFileSync(termosCustomizadosPath, "utf-8"));
    console.error("[INFO] termosCustomizados.json carregado.");
  } catch (e) {
    console.error("[WARN] Falha ao ler/parsear termosCustomizados.json:", e.message);
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

// Normalização usada nas validações (mantida)
function normalizar(texto) {
  return texto
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// Validação por palavras (MANTIDA, sem alterações)
function validarProdutoPorPalavras(produtoOriginal, marcaOriginal, nomeEncontrado, descricaoEncontrada, limiteAcerto = 0.9) {
  const referencia = normalizar((produtoOriginal || "") + " " + (marcaOriginal || "")).split(" ");
  const texto = normalizar((nomeEncontrado || "") + " " + (descricaoEncontrada || "")).split(" ");

  let contagem = 0;
  for (const palavra of referencia) {
    if (palavra && texto.includes(palavra)) contagem++;
  }

  const proporcao = referencia.length > 0 ? contagem / referencia.length : 0;
  return proporcao >= limiteAcerto;
}

// --- NOVO: lista de produtos com originalTerm (JSON/validação) e searchTerm (busca) ---
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();

    // termo "original" (igual ao que já era usado antes)
    let originalTerm = [produto, marca].filter(Boolean).join(" ").trim();

    // fallback para quando não tem produto/marca: usa descrição como ANTES
    if (!originalTerm && p.descricao) {
      originalTerm = p.descricao.toString().trim();
      console.error(`[WARN] Item ${i}: faltam 'produto'/'marca'. Usando 'descricao' como termo original.`);
    }

    if (!originalTerm) {
      console.error(`[ERRO] Item ${i}: sem dados suficientes (produto/marca/descricao). Será ignorado.`);
      return null;
    }

    // termo de BUSCA: se houver termo customizado para o "produto", usa-o; senão, usa o original
    const searchTerm = termosCustomizados[produto] ? String(termosCustomizados[produto]).trim() : originalTerm;

    if (termosCustomizados[produto]) {
      console.error(`[INFO] Usando termo customizado para produto ${produto}: "${searchTerm}"`);
    } else {
      // comportamento anterior preservado
      // (log opcional para indicar fallback)
      // console.error(`[INFO] Fallback de busca para "${originalTerm}"`);
    }

    return {
      originalTerm, // usado nas validações e como chave do JSON final (mantido)
      searchTerm,   // usado APENAS para buscar no site
      produto,
      marca,
    };
  })
  .filter(Boolean);

if (!listaProdutos.length) {
  console.error("[ERRO] Nenhum termo de busca válido encontrado no catálogo.");
  process.exit(1);
}

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Carrefour...\n");

  let browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  let page = await browser.newPage();
  let userAgentBase = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
  await page.setUserAgent(userAgentBase);

  let falhasConsecutivas = 0;

  for (let i = 0; i < listaProdutos.length; i++) {
    const item = listaProdutos[i]; // { originalTerm, searchTerm, produto, marca }

    try {
      await buscarPrimeiroProdutoCarrefour(page, item);

      // checa se o último resultado foi negativo
      const ultimoResultado = resultados[resultados.length - 1];
      if (!ultimoResultado || !ultimoResultado.vendido) {
        falhasConsecutivas++;
      } else {
        falhasConsecutivas = 0;
      }

      // se atingiu 5 falhas consecutivas, reinicia navegador
      if (falhasConsecutivas >= 5) {
        console.warn("[WARN] 5 produtos consecutivos não encontrados. Reiniciando navegador e limpando cookies...");

        await page.close();
        await browser.close();

        // delay antes de reiniciar
        await new Promise(r => setTimeout(r, 5000));

        // reinicia navegador
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        page = await browser.newPage();

        // muda user-agent para simular outro navegador
        const novoUA = userAgentBase.replace(/Chrome\/\d+\./, `Chrome/${119 + Math.floor(Math.random() * 10)}.`);
        await page.setUserAgent(novoUA);

        // limpa cookies
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');

        falhasConsecutivas = 0;
        console.info("[INFO] Navegador reiniciado. Continuando as buscas...");
      }

      // pequeno delay entre buscas para reduzir risco de bloqueio
      await new Promise(r => setTimeout(r, 1500));

    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha inesperada na busca do produto "${item.originalTerm}":`, err.message);
      resultados.push({
        termo: item.originalTerm, // MANTIDO como antes
        nome: null,
        preco: "Indisponível",
        loja: "Carrefour",
        vendido: false,
        link: null,
      });
      falhasConsecutivas++;
    }
  }

  await page.close();
  await browser.close();
  console.error("\n[INFO] Fim da verificação.");
}

// --- ALTERADO: recebe { originalTerm, searchTerm } e usa searchTerm na URL ---
async function buscarPrimeiroProdutoCarrefour(page, item) {
  const termoParaBusca = encodeURIComponent(item.searchTerm); // usa o termo customizado SE existir
  const urlBusca = `https://www.carrefour.com.br/busca/${termoParaBusca}?c_vendido-e-entregue-por-=carrefour`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo (original p/ validação/JSON):", item.originalTerm);
  console.error("[DEBUG] Termo (usado na BUSCA):", item.searchTerm);
  console.error("[DEBUG] URL:", urlBusca);

  try {
    const resp = await axios.get(urlBusca, { headers: { "User-Agent": "Mozilla/5.0" } });

    if (resp.status >= 400) {
      console.error(`[ERRO] Falha ao buscar: ${item.searchTerm} → HTTP ${resp.status}`);
      resultados.push({
        termo: item.originalTerm, // mantém a chave do JSON igual ao comportamento anterior
        nome: null,
        preco: "Indisponível",
        loja: "Carrefour",
        vendido: false,
        link: null,
      });
      return;
    }

    const $ = cheerio.load(resp.data);
    let relativeLink = $('a[data-testid="search-product-card"]').first().attr("href");

    if (!relativeLink) {
      console.warn("[WARN] Nenhum produto encontrado para:", item.searchTerm);
      resultados.push({
        termo: item.originalTerm, // mantém a chave do JSON igual ao comportamento anterior
        nome: null,
        preco: "Indisponível",
        loja: "Carrefour",
        vendido: false,
        link: null,
      });
      return;
    }

    if (!relativeLink.startsWith("http")) {
      relativeLink = `https://www.carrefour.com.br${relativeLink}`;
    }
    console.error("[DEBUG] Primeiro produto encontrado:", relativeLink);

    // Mantemos a validação como era: usando o "termo original" (produto+marca ou descrição)
    await extrairDetalhesProdutoCarrefour(page, relativeLink, item.originalTerm);
  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", item.searchTerm, "→", err.message);
    resultados.push({
      termo: item.originalTerm, // mantém a chave do JSON igual ao comportamento anterior
      nome: null,
      preco: "Indisponível",
      loja: "Carrefour",
      vendido: false,
      link: null,
    });
  }
}

async function extrairDetalhesProdutoCarrefour(page, urlProduto, termoOriginal) {
  console.error("[INFO] --- Acessando produto para:", termoOriginal);

  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));

    const nome = await page.$eval('h2[data-testid="pdp-product-name"]', (el) => el.textContent.trim());

    const descricao = await page
      .$eval('div.lg\\:block.hidden.reset-styles.text-sm.text-\\[\\#666\\]', el => el.textContent.trim())
      .catch(() => "");

    const preco = await page
      .$eval('span.text-2xl.font-bold.text-default', (el) => el.textContent.trim())
      .catch(() => "Indisponível");

    const entreguePor = await page
      .$$eval("p", (els) => {
        const match = els.find((el) => el.textContent.includes("Vendido e entregue por"));
        return match ? match.textContent.trim() : "";
      })
      .catch(() => "");

    const vendidoPorCarrefour = (entreguePor || "").toLowerCase().includes("carrefour");

    // Validação MANTIDA: usa termoOriginal (produto+marca ou descrição) como referência
    const produtoValido = validarProdutoPorPalavras(
      termoOriginal,
      "", // mantido como antes
      nome,
      descricao
    );

    const vendidoFinal = vendidoPorCarrefour && produtoValido;

    resultados.push({
      termo: termoOriginal,   // mantém a chave/termo no array de resultados
      nome,
      preco,
      loja: "Carrefour",
      vendido: vendidoFinal,
      link: urlProduto,
    });

    console.error(`[RESULTADO] Produto válido: ${produtoValido ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Produto: ${nome}`);
    console.error(`[RESULTADO] Preço: ${preco}`);
    console.error(`[RESULTADO] Vendido por Carrefour: ${vendidoPorCarrefour ? "✅ Sim" : "❌ Não"}`);
    console.error(`[RESULTADO] Link: ${urlProduto}`);

  } catch (err) {
    console.error("[ERRO] Erro ao extrair produto:", err.message);
    resultados.push({
      termo: termoOriginal,   // mantém a chave/termo no array de resultados
      nome: null,
      preco: "Indisponível",
      loja: "Carrefour",
      vendido: false,
      link: urlProduto,
    });
  }

  console.error("[INFO] --- Fim da verificação do produto ---\n");
}

(async () => {
  try {
    await executarBuscaEmTodos();

    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.vendido ? item.preco : null,
        vendido: item.vendido,
        link: item.link,
      };
    }

    // Salva o JSON em arquivo (MANTIDO)
    const outputPath = path.join(__dirname, "..", "results", "resultados_carrefour.json");
    fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2));
    console.error(`[INFO] JSON salvo em: ${outputPath}`);

    // Também envia para o console (MANTIDO)
    console.log(JSON.stringify(resultadoFinal, null, 2));

    console.error("[INFO] Script Carrefour finalizado com sucesso.");
    await new Promise((r) => setTimeout(r, 100));
  } catch (err) {
    console.error("[ERRO FATAL] Falha inesperada no script Carrefour:", err.message);
    process.exit(1);
  }
})();
