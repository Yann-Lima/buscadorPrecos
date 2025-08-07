const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const app = express();
const PORT = 4000;

let processosAtivos = [];

app.use(cors());
app.use(express.json());
app.use("/downloads", express.static(path.join(__dirname, "results")));

const pastaResultados = path.join(__dirname, "results");
if (!fs.existsSync(pastaResultados)) {
  fs.mkdirSync(pastaResultados);
}

// Função utilitária: determina turno com base na hora atual
function obterTurnoAtual() {
  const hora = new Date().getHours();
  if (hora < 12) return "MANHA";
  if (hora < 18) return "TARDE";
  return "NOITE";
}

// Rota para pegar produtos do JSON
app.get("/produtos", (req, res) => {
  try {
    const jsonPath = path.join(__dirname, "scripts", "produtos.json");
    const produtosJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    res.json(produtosJson.produtos);
  } catch (err) {
    console.error("[ERRO] Falha ao ler produtos.json:", err.message);
    res.status(500).json({ erro: "Erro ao ler produtos.json" });
  }
});

// Função para montar a tabela consolidada
function montarTabelaConsolidada(produtos, lojas, resultadosPorLoja) {
  const mapas = {};
  lojas.forEach(loja => {
    mapas[loja] = {};
    resultadosPorLoja[loja]?.forEach(prod => {
      mapas[loja][prod.termo] = {
        preco: prod.vendido ? prod.preco : "Indisponível",
        vendido: prod.vendido
      };
    });
  });

  const tabela = [];

  produtos.forEach(termo => {
    const linha = { Produto: termo };
    lojas.forEach(loja => {
      if (mapas[loja][termo]) {
        linha[loja] = mapas[loja][termo].preco;
      } else {
        linha[loja] = "Indisponível";
      }
    });
    tabela.push(linha);
  });

  return tabela;
}

app.post("/executar", async (req, res) => {
  const { lojasSelecionadas } = req.body;

  const scriptsMap = {
    casaevideo: "node scripts/casaevideo.js",
    leBiscuit: "node scripts/leBiscuit.js",
    eFacil: "node scripts/eFacil.js",
    carrefour: "node scripts/carrefour.js",
    amazon: "node scripts/amazon.js",
    gazin: "node scripts/gazin.js",
    mercadolivre: "node scripts/mercadolivre.js"
  };

  const lojasMap = {
    casaevideo: "Casa e Vídeo",
    leBiscuit: "Le Biscuit",
    eFacil: "eFácil",
    carrefour: "Carrefour",
    amazon: "Amazon",
    gazin: "Gazin",
    mercadolivre: "Mercado Livre"
  };

  const scripts = lojasSelecionadas.map(loja => scriptsMap[loja]).filter(Boolean);

  if (!scripts.length) {
    return res.status(400).json({ erro: "Nenhuma loja selecionada." });
  }

  console.log("🟢 Rodando scripts:", scripts);

  // Roda os scripts sequencialmente
  for (let i = 0; i < scripts.length; i++) {
    console.log(`🔄 Rodando: ${scripts[i]}`);
    await new Promise((resolve, reject) => {
      const processo = exec(scripts[i]);
      processosAtivos.push(processo); // guarda o processo

      processo.stdout.on("data", data => process.stdout.write(data));
      processo.stderr.on("data", data => process.stderr.write(data));

      processo.on("close", code => {
        console.log(`✅ Finalizado: ${scripts[i]} (code ${code})`);
        // Remove da lista de processos ativos
        processosAtivos = processosAtivos.filter(p => p !== processo);
        if (code === 0) resolve();
        else reject(new Error(`Erro no script ${scripts[i]}`));
      });
    });
  }

  try {
    const produtos = req.body.produtosSelecionados;

    if (!Array.isArray(produtos) || produtos.length === 0) {
      return res.status(400).json({ erro: "Lista de produtos não fornecida ou vazia." });
    }

    // (salva os produtos no JSON caso seus scripts ainda dependam disso)
    const produtosPath = path.join(__dirname, "scripts", "produtos.json");
    fs.writeFileSync(produtosPath, JSON.stringify({ produtos }, null, 2));


    const resultadosPorLoja = {};
    for (const loja of lojasSelecionadas) {
      const arquivo = path.join(pastaResultados, `resultados_${loja}.json`);
      if (fs.existsSync(arquivo)) {
        resultadosPorLoja[lojasMap[loja]] = JSON.parse(fs.readFileSync(arquivo, "utf8"));
      } else {
        resultadosPorLoja[lojasMap[loja]] = [];
      }
    }

    const tabela = montarTabelaConsolidada(produtos, lojasSelecionadas.map(l => lojasMap[l]), resultadosPorLoja);

    // Carrega arquivo modelo para manter abas existentes (incluindo imagens e formatação)
    const modeloPath = path.join(__dirname, "results", "modelo.xlsx");
    const wb = XLSX.readFile(modeloPath);

    // Cria ou substitui a aba chamada "bancodedados" com os novos dados
    const ws = XLSX.utils.json_to_sheet(tabela);
    const nomeAba = "bancodedados";
    const indexExistente = wb.SheetNames.indexOf(nomeAba);
    if (indexExistente >= 0) {
      wb.SheetNames.splice(indexExistente, 1);
      delete wb.Sheets[nomeAba];
    }
    XLSX.utils.book_append_sheet(wb, ws, nomeAba);

    // Define nome do arquivo com base no turno
    const turno = obterTurnoAtual();
    const fileName = `PLANILHA_GERAL_${turno}.xlsx`;
    const filePath = path.join(pastaResultados, fileName);

    // Salva o arquivo Excel, sobrescrevendo se já existir
    XLSX.writeFile(wb, filePath);

    console.log(`[INFO] Arquivo gerado: ${fileName}`);

    return res.json({ mensagem: "Consulta concluída", arquivo: `/downloads/${fileName}` });
  } catch (err) {
    console.error("[ERRO] Montando arquivo:", err);
    return res.status(500).json({ erro: "Erro ao gerar arquivo consolidado" });
  }
});

app.post("/cancelar", (req, res) => {
  console.log("🚨 Cancelando scripts em execução...");
  processosAtivos.forEach(proc => {
    try {
      proc.kill("SIGTERM");
    } catch (e) {
      console.warn("Falha ao encerrar processo:", e.message);
    }
  });
  processosAtivos = [];
  res.json({ mensagem: "Processos cancelados" });
});


app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
});
