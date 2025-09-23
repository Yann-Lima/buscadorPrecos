const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const resultados = [];

// Caminhos de arquivos
const catalogoPath = path.join(__dirname, "catalogoProdutos.json");
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

// Funções utilitárias
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
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
  if (!titulo.includes(marcaNorm)) return false;
  const palavrasProduto = produtoNorm.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const p of palavrasProduto) if (titulo.includes(p)) count++;
  return count / palavrasProduto.length >= 0.9;
}


// === Customizações exclusivas para meli ===
const termosMeli = {
  "RI2110/90": "liquidificador philips walita ri2110",
};

// --- Monta lista de produtos ---
const listaProdutos = (produtosJson.produtos || [])
  .map((p, i) => {
    const produto = (p.produto ?? p.codigo ?? p.id ?? "").toString().trim();
    const marca = (p.marca ?? p.brand ?? "").toString().trim();

    let originalTerm = [produto, marca].filter(Boolean).join(" ").trim();

    if (!originalTerm && p.descricao) {
      originalTerm = p.descricao.toString().trim();
      console.error(`[WARN] Item ${i}: faltam 'produto'/'marca'. Usando 'descricao'.`);
    }

    if (!originalTerm) {
      console.error(`[ERRO] Item ${i}: sem dados suficientes. Ignorando.`);
      return null;
    }
    // Primeiro tenta Meli exclusivo
    const termoMeli = termosMeli[produto];

    // Depois tenta termo customizado genérico
    const termoCustom = termosCustomizados[produto];

    // Decide a prioridade: Meli > Customizado > Normal
    let searchTerm = "";
    if (termoMeli) {
      searchTerm = String(termoMeli).trim();
      console.error(`[INFO] Usando termo exclusivo Meli para produto ${produto}: "${searchTerm}"`);
    } else if (termoCustom) {
      searchTerm = String(termoCustom).trim();
      console.error(`[INFO] Usando termo customizado para produto ${produto}: "${searchTerm}"`);
    } else {
      searchTerm = originalTerm;
      console.error(`[INFO] Usando termo padrão para produto ${produto}: "${searchTerm}"`);
    }

    /*if (termoBase !== undefined) {
      console.error(`[INFO] Usando termo customizado para produto ${produto}: "${searchTerm}"`);
    }*/

    if (!searchTerm) {
      console.error(`[DEBUG] Produto sem searchTerm válido:`, { produto, marca, originalTerm });
    }

    return { originalTerm, searchTerm, produto, marca };
  })
  .filter(Boolean);

if (!listaProdutos.length) {
  console.error("[ERRO] Nenhum termo de busca válido encontrado no catálogo.");
  process.exit(1);
}

// --- Links fixos para alguns produtos específicos ---
const linksFixos = {
  "L-97-W": "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/preparacao-bebidas/liquidificadores/liquidificador-l-97-w-pratic-power-550w-branco-mondial-branco_Loja_all_NoIndex_True#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D10%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D17%26is_custom%3Dfalse",
  "DIAMANTE PRETO 900W": "https://lista.mercadolivre.com.br/liquidificador-diamante-800-pt-brit%C3%A2nia-4-velocidades-cor-preto_Loja_all_NoIndex_True#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D3%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D38%26is_custom%3Dfalse",
  "LN61": "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/arno-liquidificador-power-max-700-ln61_Loja_all_NoIndex_True?sb=all_mercadolibre#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D11%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D21%26is_custom%3Dfalse",
  "OLIQ606" :"https://lista.mercadolivre.com.br/eletrodomesticos/oliq606-liquidificador-oster_Loja_all_NoIndex_True#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D11%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D15%26is_custom%3Dfalse",
  "L-28": "https://lista.mercadolivre.com.br/liquidificador-mondial-l28_Loja_all_NoIndex_True?sb=all_mercadolibre#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D3%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D40%26is_custom%3Dfalse",
  "RI2112/90": "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/preparacao-bebidas/liquidificadores/liquidificador-daily-jarra-san-600w-ri2112-2l-cor-preto-philips-walita_Loja_all_NoIndex_True#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D7%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D2%26is_custom%3Dfalse",
  "L-1200-BI": "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/liquidificador-mondial-l1200-bi_Loja_all_NoIndex_True?sb=all_mercadolibre#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D12%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D30%26is_custom%3Dfalse",
  "PH900 Preto" : "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/preparacao-bebidas/liquidificadores/philco/12-velocidades/liquidificador-ph900-com-12-velocidades-1200w-cor-preto-philco_Loja_all_NoIndex_True_POWER_1200W-1200W#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D9%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D33%26is_custom%3Dfalse",
  "RI2242_90" : "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/preparacao-bebidas/liquidificadores/philips-walita/ri2242-phillips-walita_Loja_all_NoIndex_True?sb=all_mercadolibre#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D10%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D37%26is_custom%3Dfalse",
  "PLQ2100PI" : "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/preparacao-bebidas/liquidificadores/philco/liquidificador-philco-plq2100pi_Loja_all_NoIndex_True?sb=all_mercadolibre#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D9%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D25%26is_custom%3Dfalse",
  "L-1400-GI" : "https://lista.mercadolivre.com.br/liquidificador-l-1400-gi-mondial-preto-mercado-livre_OrderId_PRICE_Loja_all_NoIndex_True?sb=category",
  "BLSTMG-BR8" : "https://lista.mercadolivre.com.br/eletrodomesticos/pequenos-eletrodomesticos/cozinha/liquidificador-super-chef-rr8-1%2C5-litros-oster-750w_OrderId_PRICE_Loja_all_BestSellers_YES_NoIndex_True?sb=all_mercadolibre#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D10%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D17%26is_custom%3Dfalse",
  "L-77" : "https://lista.mercadolivre.com.br/loja/mercado-livre/mondial-l-77-power-red-filter_NoIndex_True?sb=storefront_url#D[A:mondial%20l%2077%20power%20red%20filter]",
  "L-98-B" : "https://lista.mercadolivre.com.br/liquidificador-mondial-l-98-b_Loja_all_NoIndex_True?sb=all_mercadolibre#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D4%26applied_value_id%3Dall%26applied_value_name%3DSomente+lojas+oficiais%26applied_value_order%3D1%26applied_value_results%3D42%26is_custom%3Dfalse",
  "VSP-40C-NB" : "https://lista.mercadolivre.com.br/loja/mercado-livre/lista/eletrodomesticos/ar-ventilacao/ventiladores/mondial/ventilador-coluna-40cm-super-power-mondial-140w-vsp-40c-nb_OrderId_PRICE_NoIndex_True_POWER_140W-140W#applied_filter_id%3Dofficial_store%26applied_filter_name%3DLojas+oficiais%26applied_filter_order%3D10%26applied_value_id%3D2707%26applied_value_name%3DMercado+Livre%26applied_value_order%3D6%26applied_value_results%3D6%26is_custom%3Dfalse",
  "BVT450" : "https://lista.mercadolivre.com.br/loja/mercado-livre/bvt450-britania_NoIndex_True?sb=storefront_url#D[A:bvt450%20britania]",
  "VTX-40C-8P" : "https://lista.mercadolivre.com.br/loja/mercado-livre/vtx-40c-8p_OrderId_PRICE_NoIndex_True?sb=storefront_url",
  "NVT-40C-8P-B" : "https://lista.mercadolivre.com.br/loja/mercado-livre/nvt-40c-8p-b_OrderId_PRICE*DESC_NoIndex_True?sb=storefront_url",
  "Coluna 30cm" : "https://lista.mercadolivre.com.br/loja/mercado-livre/ventilador-de-coluna-turbo-6-p%C3%A1s-oscilante-30cm-ventisol-preto-preto_OrderId_PRICE_NoIndex_True?sb=storefront_url",
  "VSP-40-B":"https://lista.mercadolivre.com.br/loja/mercado-livre/vsp-40-mondial?sb=storefront_url#D[A:VSP-40%20MONDIAL]",
  "VTX-40-8P":"https://lista.mercadolivre.com.br/loja/mercado-livre/vtx-40-8p-mondial_NoIndex_True?sb=storefront_url#D[A:vtx%2040%208p%20MONDIAL]",
  "FW009218":"https://lista.mercadolivre.com.br/loja/mercado-livre/fw009218-wap_NoIndex_True?sb=storefront_url#D[A:FW009218%20wap]",
  "VTX-50-8P":"https://lista.mercadolivre.com.br/loja/mercado-livre/vtx-50-8p_NoIndex_True?sb=storefront_url#D[A:vtx-50-8p]",
  "BVT500":"https://lista.mercadolivre.com.br/loja/mercado-livre/bvt500-britania_NoIndex_True?sb=storefront_url#D[A:BVT500%20BRITANIA]",
  "TURBO 6":"https://lista.mercadolivre.com.br/loja/mercado-livre/ventilador-turbo-6-50cm-ventisol_OrderId_PRICE_NoIndex_True?sb=storefront_url",
  //"BVT510":"https://lista.mercadolivre.com.br/loja/mercado-livre/ventilador-bvt500-2-em-1-maxx-force-6-p%C3%A1s_NoIndex_True?sb=storefront_url#D[A:Ventilador%20Bvt500%202%20Em%201%20Maxx%20Force%206%20P%C3%A1s]",
  "AFDO-25L-FD":"https://lista.mercadolivre.com.br/loja/mercado-livre/afdo-25l-fd_NoIndex_True?sb=storefront_url#D[A:AFDO-25L-FD]",
  "AFN-80-BI": "https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-sem-%C3%B3leo-air-fryer-8-litros-afn-80-bi-mondial_OrderId_PRICE*DESC_NoIndex_True?sb=storefront_url",
  "AFN-80-RI" : "https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-sem-%C3%B3leo-air-fryer-8-litros-afn-80-bi-mondial_OrderId_PRICE_NoIndex_True?sb=storefront_url",
  "AFN-80-FB":"https://lista.mercadolivre.com.br/loja/mercado-livre/afn-80-fb-mondial_NoIndex_True?sb=storefront_url#D[A:AFN-80-FB%20MONDIAL]",
  "Chrome Fry":"https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-air-fryer-chrome-fry---8l-air-circuit-1.900w_NoIndex_True?sb=storefront_url#D[A:Fritadeira%20Air%20Fryer%20Chrome%20Fry%20-%208L%20Air%20Circuit%201.900W]",
  "Gran Fry":"https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-air-fryer-gran-fry-8-litros-1.750w_NoIndex_True?sb=storefront_url#D[A:Fritadeira%20Air%20fryer%20Gran%20Fry%208%20Litros%201.750W]",
  "FWM85P1": "https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-air-fryer-8%2C5l-wide-max-cyclone-preto-midea_NoIndex_True?sb=storefront_url#D[A:Fritadeira%20Air%20Fryer%208,5L%20Wide%20Max%20Cyclone%20Preto%20Midea]",
  "PFR67PI": "https://lista.mercadolivre.com.br/loja/mercado-livre/air-fryer-philco-pfr67pi-antiaderente-6l-1800w_NoIndex_True?sb=storefront_url#D[A:Air%20Fryer%20Philco%20PFR67PI%20Antiaderente%206L%201800W]",
  "MAD600010APKW1": "https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-6l-smart-chef-plus-midea_NoIndex_True?sb=storefront_url#D[A:Fritadeira%206L%20Smart%20Chef%20Plus%20Midea]",
  "BFR51": "https://lista.mercadolivre.com.br/loja/mercado-livre/air-fryer-brit%C3%A2nia-5%2C5l-antiaderente-gold-1500w-bfr51?sb=storefront_url#D[A:Air%20Fryer%20Brit%C3%A2nia%205,5L%20Antiaderente%20Gold%201500W%20BFR51]",
  "PAF55A":"https://lista.mercadolivre.com.br/loja/mercado-livre/air-fryer-philco-5%2C5l-cesto-quadrado-1500w-paf55a_NoIndex_True?sb=storefront_url#D[A:Air%20Fryer%20Philco%205,5L%20Cesto%20Quadrado%201500W%20PAF55A]",
  "EAF40":"https://lista.mercadolivre.com.br/loja/mercado-livre/air-fryer-electrolux-5%2C6l-efficient-por-rita-lobo-(eaf40)_NoIndex_True?sb=storefront_url#D[A:Air%20Fryer%20Electrolux%205,6L%20Efficient%20por%20Rita%20Lobo%20(EAF40)]",
  "BFR38": "https://lista.mercadolivre.com.br/loja/mercado-livre/air-fryer-brit%C3%A2nia-4%2C2l-1500w-bfr38-dura-mais_NoIndex_True?sb=storefront_url#D[A:Air%20Fryer%20Brit%C3%A2nia%204,2L%201500W%20BFR38%20Dura%20Mais]",
  "OFRT520":"https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-inox-compact-4%2C6l-oster_NoIndex_True?sb=storefront_url#D[A:Fritadeira%20Inox%20Compact%204,6L%20Oster]",
  "AFON-12L-BI":"https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-el%C3%A9trica-forno-oven-12l-mondial-afon-12l-bi_NoIndex_True?sb=storefront_url#D[A:Fritadeira%20El%C3%A9trica%20Forno%20Oven%2012L%20Mondial%20AFON-12L-BI%20%20%20%20%20]",
  "BFR2100":"https://lista.mercadolivre.com.br/loja/mercado-livre/air-fryer-oven-brit%C3%A2nia-12l-4-em-1-1800w-bfr2100_NoIndex_True?sb=storefront_url#D[A:Air%20Fryer%20Oven%20Brit%C3%A2nia%2012L%204%20em%201%201800W%20BFR2100]",
  "PFR2200":"https://lista.mercadolivre.com.br/loja/mercado-livre/fritadeira-air-fryer-oven-philco-pfr2200-4-em-1-12l-1800w_NoIndex_True?sb=storefront_url#D[A:Fritadeira%20Air%20Fryer%20Oven%20Philco%20PFR2200%204%20em%201%2012L%201800W]",
  "EAF90":"https://lista.mercadolivre.com.br/loja/mercado-livre/air-fryer-oven-electrolux-por-rita-lobo-12l-digital-grafite-experience-1700w_NoIndex_True?sb=storefront_url#D[A:Air%20Fryer%20Oven%20Electrolux%20por%20Rita%20Lobo%2012L%20Digital%20Grafite%20Experience%201700W]"
};

// Lista de user-agents
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/114.0.1823.67",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15"
];

// Função principal para buscar produto
async function buscarProdutoML(page, item, tentativas = 0) {
  const maxTentativas = 3;
  try {
    await page.setUserAgent(userAgents[tentativas % userAgents.length]);
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");
    await client.send("Network.clearBrowserCache");

    if (!item.searchTerm) {
      throw new Error(`Item sem searchTerm válido: ${JSON.stringify(item)}`);
    }
    let urlBusca;
    if (linksFixos[item.produto]) {
      urlBusca = linksFixos[item.produto];
      console.error(`[INFO] Usando link fixo para produto ${item.produto}: ${urlBusca}`);
    } else {
      const termoEncoded = encodeURIComponent(item.searchTerm.trim());
      urlBusca = `https://lista.mercadolivre.com.br/${termoEncoded}`;
      console.error(`[INFO] Buscando produto normalmente: ${item.searchTerm}`);
    }

    await page.goto(urlBusca, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Scroll para carregar resultados
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    // Palavras proibidas
    const palavrasProibidas = ["BOTAO", "FONTE", "COPO", "CONJUNTO LAMINA", "BANDEJA DE ASSAR", "3 BOTÕES LIGA", "DISPLAY DO PAINEL", "AGULHA ORIGINAL", "RESERVATÓRIO ÁGUA", "FILTRO EXPRESSO"];

    const links = await page.$$eval(
      "div.ui-search-result__wrapper div.poly-card",
      els => els.map(el => {
        const tituloEl = el.querySelector("a.poly-component__title");
        const patrocinado = !!el.querySelector(".poly-component__ads-promotions");
        return tituloEl
          ? { href: tituloEl.href, titulo: tituloEl.innerText, patrocinado }
          : null;
      }).filter(Boolean)
    );

    // Filtro: remove patrocinados e palavras proibidas
    const linksFiltrados = links.filter(l => {
      const tituloNorm = l.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      if (l.patrocinado) return false;
      for (const palavra of palavrasProibidas) {
        if (tituloNorm.includes(palavra)) return false;
      }
      return true;
    });

    if (!links.length) throw new Error("Nenhum produto encontrado");

    let linkSelecionado = null;
    const produtoNorm = normalizar(item.produto);
    for (const l of linksFiltrados) {
      if (normalizar(l.titulo).includes(produtoNorm)) {
        linkSelecionado = l.href;
        break;
      }
    }
    if (!linkSelecionado && linksFiltrados.length > 0) {
      linkSelecionado = linksFiltrados[0].href;
    }

    await delayAleatorio(500, 1500);
    await extrairDetalhesProdutoML(page, linkSelecionado, item);

  } catch (err) {
    if (tentativas < maxTentativas) {
      console.warn(`[WARN] Tentativa ${tentativas + 1} falhou, retry...`);
      await delayAleatorio(2000, 5000);
      return buscarProdutoML(page, item, tentativas + 1);
    }
    console.error(`[ERRO] Falha definitiva ao buscar "${item.searchTerm}":`, err.message);
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

// Extrair detalhes do produto
async function extrairDetalhesProdutoML(page, urlProduto, item) {
  try {
    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delayAleatorio(800, 2000);

    const nome = await page.$eval("h1.ui-pdp-title", el => el.innerText.trim());
    let preco = await page.$eval("meta[itemprop='price']", el => el.content).catch(() => "Indisponível");
    preco = preco !== "Indisponível" ? `R$ ${parseFloat(preco).toFixed(2).replace(".", ",")}` : "Indisponível";

    /* const infoVendedor = await page.$eval(".ui-pdp-seller__label-text-with-icon", el => el.innerText.toLowerCase()).catch(() => "");
     const vendidoML = infoVendedor.includes("mercado livre") || infoVendedor.includes("full") || infoVendedor.includes("vendido por") || infoVendedor.trim() !== "";*/
    // Captura o nome do vendedor
    const infoVendedor = await page.$eval(
      ".ui-pdp-seller__label-text-with-icon",
      el => el.innerText.trim().toLowerCase()
    ).catch(() => "");

    // Captura se tem "Loja oficial"
    const isLojaOficial = await page.$eval(
      ".ui-pdp-seller__label-sold",
      el => el.innerText.trim().toLowerCase().includes("loja oficial")
    ).catch(() => false);

    // Agora só considera Mercado Livre se for "mercado livre" mesmo
    const vendidoML = isLojaOficial && infoVendedor == "mercado livre";

    resultados.push({
      termo: item.originalTerm,
      nome,
      preco,
      loja: "Mercado Livre",
      vendido: vendidoML,
      link: urlProduto
    });

    console.error(`[RESULTADO] ${nome} | ${preco} | Vendido ML: ${vendidoML ? "✅" : "❌"}`);
  } catch (err) {
    console.error("[ERRO] Falha ao extrair detalhes:", err.message);
    resultados.push({
      termo: item.originalTerm,
      nome: null,
      preco: "Indisponível",
      loja: "Mercado Livre",
      vendido: false,
      link: urlProduto
    });
  }
}

// Executa busca de todos produtos
async function executarBuscaEmTodos() {
  const batchSize = 50;
  resultados.length = 0;

  const outputPath = path.join(__dirname, "..", "results", "resultados_mercado_livre.json");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();

  for (let i = 0; i < listaProdutos.length; i++) {
    const item = listaProdutos[i];
    await buscarProdutoML(page, item);
    await delayAleatorio(2000, 5000);

    if ((i + 1) % batchSize === 0 || i === listaProdutos.length - 1) {
      fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
      console.error(`[INFO] Progresso salvo (${i + 1}/${listaProdutos.length}).`);
    }
  }

  await browser.close();
  console.error("[INFO] Busca finalizada com sucesso. Arquivo sobrescrito.");
}

// Início
executarBuscaEmTodos();
