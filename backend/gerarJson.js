const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Caminho do arquivo e da aba
const filePath = path.join(__dirname, "results", "modelo.xlsx");
const outputPath = path.join(__dirname, "results", "produtos_com_descricao.json");
const sheetName = "bancodedados";

try {
  // Carrega a planilha
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    console.error(`A aba "${sheetName}" não foi encontrada.`);
    process.exit(1);
  }

  const result = [];
  let row = 2;

  while (true) {
    const marcaCell = worksheet[`B${row}`];
    const produtoCell = worksheet[`C${row}`];
    const descricaoCell = worksheet[`D${row}`];

    // Para se não houver mais marca
    if (!marcaCell || !marcaCell.v) break;

    const marca = marcaCell.v.toString().trim();
    const produto = produtoCell?.v?.toString().trim() || "";
    const descricao = descricaoCell?.v?.toString().trim() || "";

    result.push({
      produto,
      marca,
      descricao
    });

    row++;
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(`✅ Arquivo gerado com sucesso: ${outputPath}`);
} catch (error) {
  console.error("❌ Erro ao processar a planilha:", error.message);
}
