const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const xlsx = require("xlsx");

const inicio = Date.now();
const scriptsDir = path.join(__dirname, "scripts");
const produtosJson = require("./scripts/produtos.json");

// Pega todos os arquivos .js da pasta scripts/
const scripts = fs.readdirSync(scriptsDir)
  .filter(file => file.endsWith(".js"))
  .map(file => `node scripts/${file}`);

const resultados = {};
const produtos = produtosJson.produtos;

function rodarSequencialmente(i = 0) {
  if (i >= scripts.length) {
   const tempoTotalEmMinutos = ((Date.now() - inicio) / 1000 / 60).toFixed(2);
    console.log(`✅ Todos os scripts foram executados em ${tempoTotalEmMinutos} minutos.`);
    gerarExcel(tempoTotalEmMinutos);
    return;
  }

  const scriptName = path.basename(scripts[i].split(" ")[1], ".js");
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

  // Cabeçalho: Produto + nome dos scripts
  const header = ["Produto", ...Object.keys(resultados)];
  data.push(header);

  // Dados dos produtos
  for (const produto of produtos) {
    const row = [produto];
    for (const site of Object.keys(resultados)) {
      const dadosProduto = resultados[site][produto];

      if (dadosProduto && dadosProduto.vendido && dadosProduto.preco) {
        row.push(dadosProduto.preco);
      } else {
        row.push("Indisponível");
      }
    }
    data.push(row);
  }

  // Linha extra: tempo total
  const ultimaLinha = new Array(header.length).fill("");
  ultimaLinha[header.length - 1] = `Tempo total: ${tempoTotalEmMinutos} segundos`;
  data.push(ultimaLinha);

  const ws = xlsx.utils.aoa_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "bancodedados");
  xlsx.writeFile(wb, "bancodedados.xlsx");

  console.log("📁 Excel gerado: bancodedados.xlsx");
}

rodarSequencialmente();
