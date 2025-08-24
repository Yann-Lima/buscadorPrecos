const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const xlsx = require("xlsx");

const inicio = Date.now();
const produtosJson = require("./scripts/catalogoProdutos.json");


const resultados = {};
const produtos = produtosJson.produtos;

const scriptsFixos = [
  "amazon.js",
  "carrefour.js",
  "casaevideo.js",
  "efacil.js",
  "gazin.js",
  "lebiscuit.js",
  "mercadolivre.js"
];

// Mapeamento fixo do site para índice da coluna na planilha (1-based)
const colunasFixas = {
  amazon: 2,       // coluna B
  carrefour: 3,    // coluna C
  casaevideo: 4,   // coluna D
  efacil: 5,       // coluna E
  gazin: 6,        // coluna F
  lebiscuit: 7,    // coluna G
  mercadolivre: 8, // coluna H
};

const nomesSitesFixos = Object.keys(colunasFixas);
const header = ["Produto", ...nomesSitesFixos.map(site => site.charAt(0).toUpperCase() + site.slice(1))];


const nomesSites = scriptsFixos.map(f => path.basename(f, ".js"));

const scripts = scriptsFixos.map(file => `node scripts/${file}`);

function rodarSequencialmente(i = 0, callback) {
  if (i >= scripts.length) {
    const tempoTotalEmMinutos = ((Date.now() - inicio) / 1000 / 60).toFixed(2);
    console.log(`✅ Todos os scripts foram executados em ${tempoTotalEmMinutos} minutos.`);
    gerarExcel(tempoTotalEmMinutos, callback); // passa callback para gerarExcel
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

    rodarSequencialmente(i + 1, callback);
  });
}

function gerarExcel(tempoTotalEmMinutos, callback) {
  const data = [];

  const header = [
    "Produto",
    ...nomesSitesFixos.map(site => site.charAt(0).toUpperCase() + site.slice(1))
  ];

  data.push(header);

  for (const produto of produtos) {
    const termoChave = `${produto.produto} ${produto.marca}`.trim();
    const row = new Array(header.length).fill(""); // já preenche tudo vazio

    row[0] = termoChave; // primeira coluna Produto

    for (const site of nomesSitesFixos) {
      if (resultados[site]) {
        const dados = resultados[site][termoChave];
        const colIdx = colunasFixas[site] - 1; // índice zero-based

        if (dados && dados.vendido === true && dados.preco && dados.preco !== "Indisponível") {
          row[colIdx] = dados.preco;
        } else {
          row[colIdx] = "Indisponível";
        }
      }
    }

    data.push(row);
  }

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

  // Agora que tudo terminou, roda o criarAux.js
  if (callback) callback();
}

// Início da execução
rodarSequencialmente(0, () => {
  console.log("🔄 Iniciando executar criarAux.js...");

  exec("node criarAux.js", (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erro ao executar criarAux.js: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr criarAux.js: ${stderr}`);
    }
    console.log(`✅ criarAux.js executado com sucesso:\n${stdout}`);
  });
});
