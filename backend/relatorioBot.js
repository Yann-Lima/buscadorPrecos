const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const sites = [
  { nome: "Magazine Luiza", dominio: "https://www.magazineluiza.com.br" },
  { nome: "Gazin", dominio: "https://www.gazin.com.br" },
  { nome: "eFacil", dominio: "https://www.efacil.com.br" },
  { nome: "Casas Bahia", dominio: "https://www.casasbahia.com.br" },
  { nome: "Amazon", dominio: "https://www.amazon.com.br" },
  { nome: "Mercado Livre", dominio: "https://www.mercadolivre.com.br" },
  { nome: "Le Biscuit", dominio: "https://www.lebiscuit.com.br" },
  { nome: "Casa e Vídeo", dominio: "https://www.casaevideo.com.br" }
];

const palavrasProibicao = [
  "web scraping", "crawler", "spider", "bot",
  "automated data", "coleta automatizada",
  "extração de dados", "automação"
];

async function verificarSite(site) {
  const resultado = { nome: site.nome, dominio: site.dominio, robotsBloqueia: false, termosProibem: false };

  // 1. Verificar robots.txt
  try {
    const robotsURL = `${site.dominio}/robots.txt`;
    const { data } = await axios.get(robotsURL);
    if (data.toLowerCase().includes("disallow: /") || data.toLowerCase().includes("disallow: /search")) {
      resultado.robotsBloqueia = true;
    }
  } catch {
    resultado.robotsBloqueia = null; // não encontrado
  }

  // 2. Procurar link de termos de uso
  try {
    const { data: homeHTML } = await axios.get(site.dominio);
    const $ = cheerio.load(homeHTML);
    let linkTermos = null;

    $("a").each((_, el) => {
      const texto = $(el).text().toLowerCase();
      if (texto.includes("termo") || texto.includes("condição") || texto.includes("uso") || texto.includes("política")) {
        let href = $(el).attr("href");
        if (href && !href.startsWith("http")) href = site.dominio + href;
        if (href && href.includes("termo")) {
          linkTermos = href;
          return false; // parar
        }
      }
    });

    if (linkTermos) {
      const { data: termosHTML } = await axios.get(linkTermos);
      const termosTexto = termosHTML.toLowerCase();
      resultado.termosProibem = palavrasProibicao.some(p => termosTexto.includes(p));
    } else {
      resultado.termosProibem = null; // não achou termos
    }
  } catch {
    resultado.termosProibem = null;
  }

  return resultado;
}

(async () => {
  const resultados = [];
  for (const site of sites) {
    console.log(`[INFO] Verificando: ${site.nome}`);
    resultados.push(await verificarSite(site));
  }

  fs.writeFileSync("relatorio_sites.json", JSON.stringify(resultados, null, 2));
  console.log("\n✅ Relatório gerado: relatorio_sites.json");
})();
