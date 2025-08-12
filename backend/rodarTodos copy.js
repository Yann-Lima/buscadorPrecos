const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const xlsx = require("xlsx");

const inicio = Date.now();
const produtosJson = require("./scripts/produtos.json");

const resultados = {};
const produtos = produtosJson.produtos;

// Aqui todos os scripts que você terá
const scriptsFixos = [
  /*"amazon.js",
  "carrefour.js",
  "casaevideo.js",
  "efacil.js",
  "gazin.js",*/
  "lebiscuit.js"
  //"mercadolivre.js"
];

// Nomes simples para usar no cabeçalho da planilha
const nomesSites = scriptsFixos.map(f => path.basename(f, ".js"));

const scripts = scriptsFixos.map(file => `node scripts/${file}`);

function rodarSequencialmente(i = 0) {
  if (i >= scripts.length) {
    const tempoTotalEmMinutos = ((Date.now() - inicio) / 1000 / 60).toFixed(2);
    console.log(`✅ Todos os scripts foram executados em ${tempoTotalEmMinutos} minutos.`);
    gerarExcel(tempoTotalEmMinutos);
    return;
  }

  const scriptName = nomesSites[i];
  console.log(`\n🔄 Rodando: ${scripts[i]}`);

  const processo = exec(scripts[i]);

  let output = "";

  processo.stdout.on("data", data => {
    output += data;
    process.stdout.write(data);
  });

  processo.stderr.on("data", data => process.stderr.write(data));

  processo.on("close", code => {
    console.log(`\n✅ Script finalizado: ${scriptName} (code ${code})`);

    try {
      const parsed = JSON.parse(output);
      resultados[scriptName] = parsed;
    } catch (e) {
      console.error(`❌ Erro ao parsear output de ${scriptName}:`, e);
    }

    rodarSequencialmente(i + 1);
  });
}

function gerarExcel(tempoTotalEmMinutos) {
  const data = [];

  // Cabeçalho: Produto + nomes dos sites (mesmo que só tenha um rodando)
  const header = [
    "Produto",
    ...nomesSites
  ];

  data.push(header);

  for (const produto of produtos) {
    // Termo usado para busca e chave dos resultados:
    const termoChave = `${produto.produto} ${produto.marca}`.trim();

    const row = [termoChave];

    for (const site of nomesSites) {
      const dados = resultados[site]?.[termoChave];
      if (dados && dados.vendido && dados.preco) {
        row.push(dados.preco);
      } else {
        row.push("Indisponível");
      }
    }
    data.push(row);
  }

  // Linha extra: tempo total
  const ultimaLinha = new Array(header.length).fill("");
  ultimaLinha[header.length - 1] = `Tempo total: ${tempoTotalEmMinutos} minutos`;
  data.push(ultimaLinha);

  const ws = xlsx.utils.aoa_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "bancodedados");

  const nomeArquivo = `planilhaAtualizada.xlsx`;
  const caminhoCompleto = path.join("C:", "Roberty", "P3", "v2", nomeArquivo);

  const pastaDestino = path.dirname(caminhoCompleto);
  if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true });
  }

  xlsx.writeFile(wb, caminhoCompleto);

  console.log(`📁 Excel gerado automaticamente em: ${caminhoCompleto}`);
}

rodarSequencialmente();
