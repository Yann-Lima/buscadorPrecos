// casasbahia-multi-categorias-human-full.js
// Humanizado + múltiplas categorias + espera por grid estabilizar + refresh automático
// Navegador fica ABERTO, ultra-humanizado

import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ====== CATEGORIAS ======
const CATEGORIAS = [
  {
    nome: "fritadeiras",
    url: "https://www.casasbahia.com.br/c/eletroportateis/fritadeiras?&filtro=lojistas^d:l10037&filtro=categoria^d:c73_c384&",
    termo: "AFN-40-BI",
    outPath: "./out/casasbahia-fritadeiras.json",
    paginas: 1
  },
  {
    nome: "liquidificador",
    url: "https://www.casasbahia.com.br/c/eletroportateis/liquidificadores-e-acessorios?&filtro=lojistas^d:l10037&filtro=categoria^d:c73_c821&",
    termo: "LIQUIDIFICADOR",
    outPath: "./out/casasbahia-liquidificador.json",
    paginas: 3
  },
  {
    nome: "sanduicheira",
    url: "https://www.casasbahia.com.br/c?filtro=lojistas^d:l10037&Ordenacao=popularidade&filtro=d86127&idLojista=10037&",
    termo: "SANDUICHEIRA",
    outPath: "./out/casasbahia-sanduicheira.json",
    paginas: 1
  }
];

// ====== helpers ======
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(1000, ms))); }

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
];

const PRODUCT_CARD_SEL = '[data-testid="product-card-desktop"], [data-testid="product-card"], .productCard-busca';

async function humanizePage(page) {
  await page.setUserAgent(UAS[rand(0, UAS.length - 1)]);
  await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7" });
  try { await page.emulateTimezone("America/Sao_Paulo"); } catch {}

  const vw = rand(1200, 1440);
  const vh = rand(800, 960);
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: [1, 1.25, 1.5][rand(0,2)] });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", { get: () => ["pt-BR", "pt", "en-US"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1,2,3,4,5] });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    const platforms = ["Win32","MacIntel","Linux x86_64"];
    Object.defineProperty(navigator, "platform", { get: () => platforms[Math.floor(Math.random()*platforms.length)] });

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if(param===37445) return "Intel Inc.";
      if(param===37446) return "Intel Iris OpenGL Engine";
      return getParameter(param);
    };
  });
}

async function gentleScroll(page) {
  const steps = rand(6,10);
  for(let i=0;i<steps;i++){
    await page.mouse.wheel({deltaY: rand(200,800)});
    await sleep(rand(900,1600));
  }
  for(let j=0;j<rand(1,3);j++){
    await page.mouse.wheel({deltaY: -rand(150,300)});
    await sleep(rand(900,1400));
  }
}

async function moveMouseJitter(page) {
  const x = rand(60,1100);
  const y = rand(80,700);
  await page.mouse.move(x,y,{steps: rand(18,36)});
  for(let i=0;i<rand(2,4);i++){
    await page.mouse.move(x+rand(-20,20),y+rand(-15,15),{steps: rand(5,10)});
    await sleep(rand(500,1200));
  }
}

async function waitForCardsStable(page, {minWaitMs=1500,maxWaitMs=12000,stableRounds=2}={}) {
  await page.waitForSelector(PRODUCT_CARD_SEL,{timeout:120000});
  const start = Date.now();
  let lastCount=-1, stable=0;
  while(Date.now()-start<maxWaitMs){
    const count = await page.$$eval(PRODUCT_CARD_SEL,els=>els.length).catch(()=>0);
    if(count===lastCount && count>0){
      stable+=1;
      if(stable>=stableRounds && Date.now()-start>=minWaitMs) break;
    }else stable=0;
    lastCount=count;
    await sleep(rand(600,1200));
  }
}

async function waitForCardsRobusto(page){
  for(let tent=0;tent<5;tent++){
    try{
      await waitForCardsStable(page,{minWaitMs:2000,maxWaitMs:18000});
      return true;
    }catch{
      console.warn("⚠️ Nenhum card detectado, F5...");
      try{ await page.keyboard.press("F5"); await page.waitForTimeout(rand(4000,8000)); }catch{}
      await sleep(rand(2000,4000));
    }
  }
  return false;
}

async function extrairCards(page){
  await waitForCardsRobusto(page);
  await sleep(rand(800,2000));
  const lista = await page.evaluate((SEL)=>{
    const cards = Array.from(document.querySelectorAll(SEL));
    return cards.map(card=>{
      const a = card.querySelector("h3.product-card__title a");
      const nome = a?.getAttribute("title")?.trim() || a?.textContent?.trim() || null;
      const link = a?.href || card.querySelector('a[data-testid="product-card-link-overlay"]')?.href || null;
      const highlight = card.querySelector(".product-card__highlight-price")?.textContent?.trim() || null;
      let preco = highlight || null;
      if(!preco){
        const t = card.querySelector('[data-testid="product-card-installment"]')?.textContent || "";
        const m = t.match(/por\s*R\$\s*[\d\.\,]+/i);
        if(m) preco = m[0].replace(/^por\s*/i,"").trim();
      }
      return {nome,preco,link};
    });
  }, PRODUCT_CARD_SEL);
  let filtrados = lista.filter(x=>x && x.nome && x.preco && x.link);
  if(filtrados.length===0){ await sleep(rand(1200,2500)); return extrairCards(page); }
  return filtrados;
}

// ====== MAIN ======
(async()=>{
  if(!fs.existsSync("./out")) fs.mkdirSync("./out",{recursive:true});

  const PROFILE_DIR="./.profile-casasbahia";
  const browser = await puppeteer.launch({
    headless:false,
    userDataDir:PROFILE_DIR,
    slowMo:rand(30,120),
    args:[
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--lang=pt-BR,pt",
      `--window-size=${rand(1240,1400)},${rand(820,960)}`
    ],
    defaultViewport:null
  });

  const page = await browser.newPage();
  await humanizePage(page);

  // liberar cookies
  await page.setCookie({name:"_cookiesAccepted", value:"true", domain:".casasbahia.com.br"});

  // bloquear imagens/fonts
  await page.setRequestInterception(true);
  page.on("request",(req)=>{
    const type=req.resourceType();
    if(["image","stylesheet","font"].includes(type)) req.abort();
    else req.continue();
  });

  for(const cat of CATEGORIAS){
    console.log(`\n=========== Categoria: ${cat.nome} ===========`);
    const resultados=[];
    for(let p=1;p<=cat.paginas;p++){
      let urlPag = cat.url;
      if(p>1) urlPag = cat.url+"&page="+p;
      console.log(`Abrindo página ${p}: ${urlPag}`);
      const pageTemp = await browser.newPage();
      await humanizePage(pageTemp);
      await pageTemp.goto(urlPag,{waitUntil:"domcontentloaded",timeout:120000});
      await waitForCardsRobusto(pageTemp);
      await moveMouseJitter(pageTemp);
      await gentleScroll(pageTemp);

      const itens = await extrairCards(pageTemp).catch(()=>[]);
      for(const it of itens){
        resultados.push({
          termo:cat.termo,
          nome:it.nome,
          preco:it.preco,
          loja:"casasbahia",
          vendido:true,
          link:it.link
        });
      }
      console.log(`Cards coletados nesta página: ${itens.length} | Total: ${resultados.length}`);
      await pageTemp.close();
      console.log("Aguardando 1 minuto antes da próxima página...");
      await sleep(60000);
    }
    fs.writeFileSync(cat.outPath,JSON.stringify(resultados,null,2),"utf-8");
    console.log(`💾 Salvo: ${cat.outPath} (total itens: ${resultados.length})`);
    await sleep(rand(3000,7000));
  }

  console.log("\n✅ Todas as categorias processadas. O navegador permanecerá ABERTO para inspeção.");
})();
