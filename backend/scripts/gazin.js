const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

// Caminho para o catalogoProdutos.json (apenas este será usado)
const catalogoProdutosPath = path.join(__dirname, "catalogoProdutos.json");

// Carrega o catálogo diretamente
const produtosJson = JSON.parse(fs.readFileSync(catalogoProdutosPath, "utf-8"));

// Monta lista com "produto + marca"
const listaProdutos = produtosJson.produtos.map(p => `${p.produto} ${p.marca}`.trim());

// === Utilitários ===
function removeAcentos(str = "") {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}


function normalizar(txt) {
  return (txt || "")
    .normalize("NFD") // remove acentos
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "E")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// === Nova função: valida usando descrição/ficha técnica ===
async function descricaoConfere(page, marca, produto) {
  try {
    // Pega descrição (se existir)
    const descricao = await page.$eval("div#descricao", el => el.innerText.trim()).catch(() => "");
    // Pega ficha técnica inteira (se existir)
    const fichaTecnica = await page.$eval("div#ficha-tecnica", el => el.innerText.trim()).catch(() => "");

    const texto = normalizar(`${descricao} ${fichaTecnica}`);

    const marcaNorm = normalizar(marca);
    const produtoNorm = normalizar(produto);

    if (!texto.includes(marcaNorm)) {
      console.log("❌ Marca não encontrada na descrição/ficha técnica:", marca);
      return false;
    }

    const palavrasProduto = produtoNorm.split(/\s+/).filter(Boolean);
    let count = 0;
    for (const p of palavrasProduto) if (texto.includes(p)) count++;
    const proporcao = count / palavrasProduto.length;

    if (proporcao >= 0.9) {
      console.log("✅ Descrição confere com produto:", produto);
      return true;
    } else {
      console.log("❌ Descrição não bate com produto:", produto);
      return false;
    }
  } catch (e) {
    console.log("[WARN] Não foi possível validar pela descrição/ficha técnica");
    return false;
  }
}


function tituloConfere(tituloOriginal, marca, produto) {
  if (!tituloOriginal) return false;

  const titulo = normalizar(tituloOriginal);
  const marcaNorm = normalizar(marca);
  const produtoNorm = normalizar(produto);

  // Marca tem que estar presente no título
  if (!titulo.includes(marcaNorm)) {
    console.log("❌ Marca não encontrada no título:", marca);
    return false;
  }

  // Código do produto precisa ser 100% igual (case-insensitive e sem acento)
  if (!titulo.includes(produtoNorm)) {
    console.log("❌ Código não encontrado no título:", produto);
    return false;
  }

  console.log("✅ Título confere com produto:", produto);
  return true;
}


async function delay(minMs, maxMs) {
  const tempo = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise(r => setTimeout(r, tempo));
}

async function rolarPagina(page) {
  await page.evaluate(() => {
    window.scrollBy(0, Math.floor(Math.random() * 500) + 200);
  });
}

async function moverMouseAleatorio(page) {
  const x = Math.floor(Math.random() * 800) + 100;
  const y = Math.floor(Math.random() * 600) + 100;
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 5) + 1 });
}

async function executarBuscaEmTodos() {
  console.error("[INFO] Iniciando verificação de todos os produtos no Gazin...\n");

  for (const termoOriginal of listaProdutos) {
    try {
      await buscarPrimeiroProdutoGAZIN(termoOriginal);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termoOriginal}":`, err.message);
      resultados.push({
        termo: termoOriginal,
        nome: null,
        preco: "Indisponível",
        loja: "Gazin",
        vendido: false,
        link: null,
      });
    }
    // Delay aleatório entre buscas para evitar padrão
    await delay(3000, 7000);
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_gazin.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

async function buscarPrimeiroProdutoGAZIN(termoOriginal) {
  // Remover acentos antes de montar a URL de busca
  const termoSemAcento = removeAcentos(termoOriginal.trim());
  const termoBusca = encodeURIComponent(termoSemAcento);
  const urlBusca = `https://www.gazin.com.br/busca/${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo original:", termoOriginal);
  console.error("[DEBUG] Termo sem acento:", termoSemAcento);
  console.error("[DEBUG] URL:", urlBusca);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(urlBusca, { waitUntil: "networkidle2", timeout: 60000 });

    // Simulação de humano
    await delay(1000, 2500);
    await moverMouseAleatorio(page);
    await rolarPagina(page);

    // Garante que há pelo menos um card dentro de <a> (o primeiro resultado)
    await page.waitForSelector("a .chakra-stack", { timeout: 15000 });

    // Pega exatamente o primeiro card e extrai dados a partir do <a> pai
    const produto = await page.$eval("a .chakra-stack", el => {
      // Sobe até o <a> mais próximo
      const a = el.closest("a");
      const href = a ? a.getAttribute("href") : null;

      // Tenta pegar o nome pelo seletor mais específico; fallback genérico
      const nome =
        el.querySelector("span.chakra-text.css-8cltlq")?.innerText?.trim() ||
        el.querySelector("span.chakra-text")?.innerText?.trim() ||
        (a?.getAttribute("title") || "").trim();

      // Tenta capturar preço do card (No Pix / preço principal)
      const precoDireto =
        el.querySelector("span.chakra-text.css-1sgshui")?.innerText?.trim() || "";
      // Fallback: algum span com “R$”
      const precoFallback =
        Array.from(el.querySelectorAll("span.chakra-text"))
          .map(s => (s.innerText || "").trim())
          .find(t => /^R\$\s*\d/.test(t)) || "";

      const precoCard = precoDireto || precoFallback || "";

      return {
        nome: nome || "",
        preco: precoCard || "",
        link: href ? `https://www.gazin.com.br${href}` : null,
      };
    });

    

    if (!produto || !produto.link) {
      console.error("[WARN] Nenhum produto válido encontrado para:", termoOriginal);
      resultados.push({
        termo: termoOriginal,
        nome: null,
        preco: "Indisponível",
        loja: "Gazin",
        vendido: false,
        link: null,
      });
      await browser.close();
      return;
    }

    console.error("[INFO] Produto escolhido (primeiro da busca):");
    console.error("       Nome:", produto.nome || "(sem título)");
    console.error("       Preço (card):", produto.preco || "(não encontrado no card)");
    console.error("       Link:", produto.link);

   // Extrai marca e produto do JSON original
const produtoJson = produtosJson.produtos.find(
  p => `${p.produto} ${p.marca}`.trim() === termoOriginal.trim()
);

const produtoOriginal = produtoJson?.produto || "";
const marcaOriginal = produtoJson?.marca || "";

// === Validação pelo título ===
const valido = tituloConfere(produto.nome, marcaOriginal, produtoOriginal);

if (!valido) {
  console.warn("[WARN] ❌ Título não confere com:", termoOriginal);
  resultados.push({
    termo: termoOriginal,
    nome: produto.nome || null,
    preco: "Indisponível",
    loja: "Gazin",
    vendido: false,
    link: produto.link,
  });
  await browser.close();
  return;
}

    // Abre a página do produto e captura preço/vendedor com seletores robustos
    await page.goto(produto.link, { waitUntil: "networkidle2", timeout: 60000 });

    await delay(1000, 2500);
    await moverMouseAleatorio(page);
    await rolarPagina(page);

    // Vendedor (classe pode mudar; usar fallback)
    let vendedor = "";
    try {
      vendedor =
        (await page.$eval("p.chakra-text.css-1ktt7uz", el => el.textContent.trim())) ||
        "";
    } catch {
      try {
        vendedor =
          (await page.$eval("p.chakra-text", el => el.textContent.trim())) || "";
      } catch {
        vendedor = "";
      }
    }
    const vendidoPorGazin = vendedor.toLowerCase().includes("gazin");

    // Preço no detalhe – múltiplos seletores/fallbacks
    let precoDetalhe = "";
    const seletoresPreco = [
      "p.chakra-text.css-3zremp",          // ex.: R$ 92,90
      "span.chakra-text.css-1sgshui",     // "No Pix"
      "div.css-py8g8m p.chakra-text",
      "span[data-testid='price']",
      "[data-testid='price'] .chakra-text",
      "p[class*='chakra-text'][class*='price']",
      "span[class*='chakra-text'][class*='price']",
    ];

    for (const sel of seletoresPreco) {
      try {
        const val = await page.$eval(sel, el => (el.textContent || "").trim());
        if (val && /^R\$\s*\d/.test(val)) {
          precoDetalhe = val;
          break;
        }
      } catch {
        // tenta próximo seletor
      }
    }

    // Se não achar no detalhe, usa o do card
    const precoFinal =
      precoDetalhe || (produto.preco && /^R\$\s*\d/.test(produto.preco) ? produto.preco : "Indisponível");

    console.error("[DEBUG] Vendedor:", vendedor || "(não identificado)");
    console.error("[DEBUG] Vendido por Gazin:", vendidoPorGazin ? "✅ Sim" : "❌ Não");
    console.error("[DEBUG] Preço (detalhe):", precoDetalhe || "(não encontrado)");
    console.error("[DEBUG] Preço usado:", precoFinal);

    resultados.push({
      termo: termoOriginal,
      nome: produto.nome || null,
      preco: precoFinal,
      loja: "Gazin",
      vendido: vendidoPorGazin,
      link: produto.link,
    });
  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", termoOriginal, "→", err.message);
    resultados.push({
      termo: termoOriginal,
      nome: null,
      preco: "Indisponível",
      loja: "Gazin",
      vendido: false,
      link: null,
    });
  } finally {
    await browser.close();
  }
}

executarBuscaEmTodos()
  .then(() => {
    const resultadoFinal = {};
    for (const item of resultados) {
      resultadoFinal[item.termo] = {
        preco: item.preco || null,   // NÃO depende de "vendido"
        vendido: item.vendido,
        link: item.link,
      };
    }
    // stdout apenas JSON; logs em stderr
    console.log(JSON.stringify(resultadoFinal));
    console.error("[INFO] Script Gazin finalizado com sucesso.");
    process.exit(0);
  })
  .catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Gazin:", err.message);
    process.exit(1);
  });
