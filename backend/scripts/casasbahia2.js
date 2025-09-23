// ==== COMPARAÇÃO CATÁLOGO x CASAS BAHIA (somente produtos individuais) ====

const fs = require("fs");

const catalogoPath = "./catalogoProdutos.json";
const resultadosPath = "./out/casasbahia-tudo.json";
const saidaPath = "../results/resultados_casasbahia.json";

// ========== HELPERS ==========

const excecoesCodigo = {
  "gambetchd0000002791pai": ["SECADOR", "GA", "ELEGANZA", "2100W"],
  "tourmalineion2100w": ["SECA", "TOURMALINE", "ION", "2100W"],
  "easy1700w": ["SECA", "EASY", "1700W"],
  "style2000w": ["SECA", "STYLE", "2000W"],
  "gambetchd0000002793pai": ["SECADOR", "ELEGANZA", "2100W"],
  "boombox3": ["CAIXA", "BOOMBOX", "180W"],
  "xboomxg9s": ["CAIXA", "XG9S", "SOUND"],
  "black3": ["LIQUIDIFICADOR", "BLACK", "VELOCIDADES"],
  "l550b": ["EASY", "POWER", "550W"],
  "ri211090": ["LIQUIDIFICADOR", "PHILIPS", "RI2110"],
  "l97w": ["LIQUIDIFICADOR", "MONDIAL", "L97W"],
  "l900fb": ["LIQUIDIFICADOR", "MONDIAL", "TURBO", "L900"],
  "diamantepreto900w": ["LIQUIDIFICADOR", "DIAMANTE", "900W"],
  "blq970p": ["LIQUIDIFICADOR", "BLQ970V", "900W"],
  "l1100bi": ["LIQUIDIFICADOR", "MONDIAL", "L-1100"],
  "BLQ1280P": ["LIQUIDIFICADOR", "BRITANIA", "BLQ1280P"],
  "OLIQ606": ["LIQUIDIFICADOR", "OSTER", "OLIQ606"],
  "l28": ["MONDIAL", "EASY", "POWER"],
  "ri211290": ["LIQUIDIFICADOR", "DAILY", "RI2112"],
  "l1200bi": ["LIQUIDIFICADOR", "L1200", "1200W"],
  "PH900Preto": ["LIQUIDIFICADOR", "PHILCO", "PH900"],
  "ri224290": ["LIQUIDIFICADOR", "RI2242"],
  "PLQ2100PI": ["LIQUIDIFICADOR", "PLQ2100PI"],
  "ri224090": ["LIQUIDIFICADOR", "RI2242", "1200w"],
  "l1400gi": ["LIQUIDIFICADOR", "MONDIAL", "L-1400"],
  "blstmgbr8": ["LIQUIDIFICADOR", "OSTER", "SUPER", "CHEF"],
  "EBS30": ["LIQUIDIFICADOR", "ELECTROLUX", "EBS30"],
  "L98B": ["LIQUIDIFICADOR", "MONDIAL", "L-98-B"],
  "vsp40cnb": ["VENTILADOR", "MONDIAL", "VSP40C"],
  "BVT450": ["VENTILADOR", "BRITANIA", "BVT450"],
  "VTX40C8P": ["VENTILADOR", "MONDIAL", "VTX-40-8P"],
  "VSP30B": ["VENTILADOR", "MONDIAL", "VSP-30-B"],
  "BVT301": ["VENTILADOR", "BRITANIA", "BVT301"],
  "PROTECT30SIX": ["VENTILADOR", "BRITANIA", "PROTECT"],
  "VSP40B": ["VENTILADOR", "MONDIAL", "VSP-40-B"],
  "VB40": ["VENTILADOR", "ARNO", "VB40"],
  "BVT400": ["VENTILADOR", "BRITANIA", "BVT400"],
  "VTX408P": ["VENTILADOR", "MONDIAL", "VTX-40-8P"],
  "fw009218": ["VENTILADOR", "WAP", "180W"],
  "VTX508P": ["VENTILADOR", "MONDIAL", "VTX-50-8P"],
  "BVT500": ["VENTILADOR", "BRITANIA", "BVT500"],
  "VB50": ["VENTILADOR", "ARNO", "VB50"],
  "AFN80BI": ["FRITADEIRA", "MONDIAL", "AFN-80-BI"],
  "EAF50": ["FRITADEIRA", "ELECTROLUX", "EAF50"],
  "EAF40": ["FRITADEIRA", "ELECTROLUX", "EAF40"],
  "AFON12LBI": ["FRITADEIRA", "MONDIAL", "AFON-12L-BI"],
  "bfr2100":["FRITADEIRA", "BRITANIA", "BFR2100P"],
  "pfr2200":["FRITADEIRA", "PHILCO", "PFR2200P"],
  "EAF90":["FRITADEIRA", "ELECTROLUX", "EXPERIENCE"],
};

// --- Normaliza strings para comparação
function normalizar(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// --- Gera variações de código
function gerarVariacoesCodigo(codigo) {
  const base = normalizar(codigo);
  return [
    base,
    base.replace(/-/g, ""),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);
}

// --- Verifica se o código confere com o título
function codigoConfere(titulo, codigo, marca) {
  const tituloNorm = normalizar(titulo);
  const tokens = titulo
    .toLowerCase()
    .split(/\s+/)             // divide por espaços
    .map(normalizar)          // normaliza cada token
    .filter(Boolean);

  const variacoes = gerarVariacoesCodigo(codigo);

  // Ignora produtos que contenham '+' (kit/conjunto)
  if (titulo.includes("+") && !excecoesCodigo[normalizar(codigo)]) {
    return false;
  }

  for (const v of variacoes) {
    if (tituloNorm.includes(v)) return true;
  }

  if (excecoesCodigo[normalizar(codigo)]) {
    const requisitos = excecoesCodigo[normalizar(codigo)].map(normalizar);
    const todasPresentes = requisitos.every(req =>
      tokens.some(tok => tok.includes(req))
    );
    if (todasPresentes) {
      console.warn(`[INFO] Exceção aplicada: "${codigo}" validado por palavras-chave.`);
      return true;
    }
  }


  return false;
}

// ========== CARREGAMENTO ==========

let catalogo = [];
if (fs.existsSync(catalogoPath)) {
  catalogo = JSON.parse(fs.readFileSync(catalogoPath, "utf-8")).produtos || [];
} else {
  console.error("❌ Catálogo não encontrado:", catalogoPath);
  process.exit(1);
}

let resultadosGlobal = [];
if (fs.existsSync(resultadosPath)) {
  resultadosGlobal = JSON.parse(fs.readFileSync(resultadosPath, "utf-8")) || [];
} else {
  console.error("❌ Resultados não encontrados:", resultadosPath);
  process.exit(1);
}

// ========== COMPARAÇÃO ==========

let resultadosComparados = [];

for (const prod of catalogo) {
  const marca = prod.marca;
  const codigo = prod.produto;

  // Procura somente produtos individuais (sem '+')
  const encontrado = resultadosGlobal.find(item =>
    codigoConfere(item.nome, codigo, marca)
  );

  // Debug opcional
  console.log({
    codigo,
    titulo: encontrado ? encontrado.nome : prod.descricao,
    requisitos: excecoesCodigo[normalizar(codigo)]
  });

  if (encontrado) {
    resultadosComparados.push({
      termo: `${codigo} ${marca}`,
      nome: encontrado.nome,
      preco: encontrado.preco,
      loja: "casas bahia",
      vendido: true,
      link: encontrado.link
    });
  } else {
    resultadosComparados.push({
      termo: `${codigo} ${marca}`,
      nome: prod.descricao,
      preco: null,
      loja: "casas bahia",
      vendido: false,
      link: null
    });
  }
}

// ========== SAÍDA ==========

fs.writeFileSync(saidaPath, JSON.stringify(resultadosComparados, null, 2), "utf-8");
console.log(`📂 Comparação salva em: ${saidaPath}`);
