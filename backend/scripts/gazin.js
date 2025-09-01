const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

// Caminho para o catalogoProdutos.json (apenas este será usado)
const catalogoProdutosPath = path.join(__dirname, "catalogoProdutos.json");
// NOVO: caminho para termos customizados (opcional)
const termosCustomizadosPath = path.join(__dirname, "termosCustomizados.json");

// Carrega o catálogo diretamente
const produtosJson = JSON.parse(fs.readFileSync(catalogoProdutosPath, "utf-8"));

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

// === Monta lista com termo original (para validação/JSON) e termo de busca (custom se existir) ===
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
    const descricao = await page.$eval("div#descricao", el => el.innerText.trim()).catch(() => "");
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
    const proporcao = palavrasProduto.length ? count / palavrasProduto.length : 0;

    if (proporcao >= 0.9) {
      console.log("✅ Descrição confere com produto:", produto);
      return true;
    } else {
      console.log("❌ Descrição não bate com produto:", produto);
      return false;
    }
  } catch {
    console.log("[WARN] Não foi possível validar pela descrição/ficha técnica");
    return false;
  }
}

function tituloConfere(tituloOriginal, marca, produto) {
  if (!tituloOriginal) return false;

    if (/kit/i.test(tituloOriginal)) {
    console.log("❌ Produto descartado por conter 'KIT' no título:", tituloOriginal);
    return false;
  }

  const titulo = normalizar(tituloOriginal);
  const marcaNorm = normalizar(marca);
  const produtoNorm = normalizar(produto);

  if (!titulo.includes(marcaNorm)) {
    console.log("❌ Marca não encontrada no título:", marca);
    return false;
  }
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

  for (const item of listaProdutos) {
    try {
      await buscarPrimeiroProdutoGAZIN(item);
    } catch (err) {
      console.error(`[ERRO CRÍTICO] Falha na busca do produto "${item.originalTerm}":`, err.message);
      resultados.push({
        termo: item.originalTerm,
        nome: null,
        preco: "Indisponível",
        loja: "Gazin",
        vendido: false,
        link: null,
      });
    }
    await delay(3000, 7000); // delay entre buscas
  }

  const outputPath = path.join(__dirname, "..", "results", "resultados_gazin.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
  console.error("\n[INFO] Fim da verificação.");
}

// === ALTERADO: recebe { originalTerm, searchTerm } e usa searchTerm na URL ===
async function buscarPrimeiroProdutoGAZIN(item) {
  // Remover acentos no termo de BUSCA (custom se existir)
  const termoSemAcento = removeAcentos(item.searchTerm.trim());
  const termoBusca = encodeURIComponent(termoSemAcento);
  const urlBusca = `https://www.gazin.com.br/busca/${termoBusca}`;

  console.error("\n[INFO] ========== NOVA BUSCA ==========");
  console.error("[DEBUG] Termo (original p/ validação/JSON):", item.originalTerm);
  console.error("[DEBUG] Termo (usado na BUSCA):", item.searchTerm);
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
      const a = el.closest("a");
      const href = a ? a.getAttribute("href") : null;

      const nome =
        el.querySelector("span.chakra-text.css-8cltlq")?.innerText?.trim() ||
        el.querySelector("span.chakra-text")?.innerText?.trim() ||
        (a?.getAttribute("title") || "").trim();

      const precoDireto =
        el.querySelector("span.chakra-text.css-1sgshui")?.innerText?.trim() || "";
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
      console.error("[WARN] Nenhum produto válido encontrado para:", item.originalTerm);
      resultados.push({
        termo: item.originalTerm,
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
    const produtoJson = (produtosJson.produtos || []).find(
      p => `${p.produto} ${p.marca}`.trim() === item.originalTerm.trim()
    );
    const produtoOriginal = produtoJson?.produto || "";
    const marcaOriginal = produtoJson?.marca || "";

    // === Validação pelo título (mesma regra) ===
    const valido = tituloConfere(produto.nome, marcaOriginal, produtoOriginal);

    if (!valido) {
      console.warn("[WARN] ❌ Título não confere com:", item.originalTerm);
      resultados.push({
        termo: item.originalTerm,
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
        (await page.$eval("p.chakra-text.css-1ktt7uz", el => el.textContent.trim())) || "";
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

    const precoFinal =
      precoDetalhe || (produto.preco && /^R\$\s*\d/.test(produto.preco) ? produto.preco : "Indisponível");

    console.error("[DEBUG] Vendedor:", vendedor || "(não identificado)");
    console.error("[DEBUG] Vendido por Gazin:", vendidoPorGazin ? "✅ Sim" : "❌ Não");
    console.error("[DEBUG] Preço (detalhe):", precoDetalhe || "(não encontrado)");
    console.error("[DEBUG] Preço usado:", precoFinal);

    resultados.push({
      termo: item.originalTerm,
      nome: produto.nome || null,
      preco: precoFinal,           // (mantido: aqui o JSON final não depende de vendido)
      loja: "Gazin",
      vendido: vendidoPorGazin,
      link: produto.link,
    });
  } catch (err) {
    console.error("[ERRO] Falha ao buscar:", item.originalTerm, "→", err.message);
    resultados.push({
      termo: item.originalTerm,
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
        preco: item.preco || null,   // NÃO depende de "vendido" (mantido)
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
