const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const readline = require("readline");
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType } = require("docx");

const scriptsFixos = [
    "amazon.js",
    "carrefour.js",
    "casaevideo.js",
    "efacil.js",
    "gazin.js",
    "lebiscuit.js",
    "mercadolivre.js"
];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function pergunta(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    try {
        const produtosInput = await pergunta("Digite os codigos dos produtos separados por vírgula (ex: AWS-SP-07-B,XG5S,BHC010/81): ");
        let produtos = produtosInput.split(",").map(p => p.trim()).filter(p => p);
        if (produtos.length === 0) {
            console.log("Nenhum produto informado. Encerrando.");
            process.exit(1);
        }

        console.log("\nSites disponíveis:");
        scriptsFixos.forEach((s, i) => console.log(`${i + 1}. ${s.replace(".js", "")}`));
        console.log("0. Todos os sites");

        const sitesInput = await pergunta("Digite os números dos sites que quer buscar separados por vírgula (ex: 1,3,5) ou 0 para todos: ");
        let sitesIndices = sitesInput.split(",").map(n => parseInt(n.trim()));
        if (sitesIndices.includes(0)) sitesIndices = scriptsFixos.map((_, i) => i + 1);
        else sitesIndices = sitesIndices.filter(n => n >= 1 && n <= scriptsFixos.length);

        if (sitesIndices.length === 0) {
            console.log("Nenhum site válido selecionado. Encerrando.");
            process.exit(1);
        }

        const scriptsSelecionados = sitesIndices.map(i => scriptsFixos[i - 1]);

        const tmpProdutosPath = path.join(__dirname, "scripts", "produtos_temp.json");
        fs.writeFileSync(tmpProdutosPath, JSON.stringify({ produtos }, null, 2), "utf-8");
        console.log("\nProdutos temporários salvos para os scripts.");

        const resultados = {};

        for (const script of scriptsSelecionados) {
            console.log(`\nRodando script: ${script} ...`);
            const scriptPath = path.join(__dirname, "scripts", script);
            const execCommand = `node "${scriptPath}"`;
            const env = { ...process.env, FROM_GENERATOR_WORD: "true" };
            const output = await executarScript(execCommand, env);
            try {
                resultados[script.replace(".js", "")] = JSON.parse(output);
                console.log(`Script ${script} finalizado.`);
            } catch {
                console.error(`Erro ao parsear saída do script ${script}. Saída:\n${output}`);
            }
        }

        fs.unlinkSync(tmpProdutosPath);

        await gerarWord(produtos, resultados);

        rl.close();
    } catch (err) {
        console.error("Erro inesperado:", err);
        rl.close();
    }
}

function executarScript(cmd, envVars = process.env) {
    return new Promise((resolve, reject) => {
        exec(cmd, { maxBuffer: 1024 * 1024 * 10, env: envVars }, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve(stdout);
        });
    });
}

async function gerarWord(produtos, resultados) {
    console.log("\nGerando arquivo Word com resultados...");

    const sections = [];

    // Cabeçalho do documento
    sections.push({
        children: [
            new Paragraph({
                text: "Relatório de Busca de Produtos",
                heading: "Heading1",
                spacing: { after: 300 },
            }),
        ],
    });

    for (const produto of produtos) {
        // Cabeçalho da tabela
        const headerRow = new TableRow({
            children: [
                criarCelulaTabela("Site", true),
                criarCelulaTabela("Preço", true),
                criarCelulaTabela("Vendido?", true),
                criarCelulaTabela("Link", true),
            ],
        });

        // Linhas de dados
        const dataRows = [];
        for (const site in resultados) {
            const dado = resultados[site][produto];
            dataRows.push(new TableRow({
                children: [
                    criarCelulaTabela(site),
                    criarCelulaTabela(dado?.preco || "Indisponível"),
                    criarCelulaTabela(dado?.vendido ? "Sim" : "Não"),
                    criarCelulaTabela(dado?.link || "-"),
                ],
            }));
        }

        const table = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
        });

        sections.push({
            children: [
                new Paragraph({
                    text: `Produto: ${produto}`,
                    heading: "Heading2",
                    spacing: { before: 300, after: 100 },
                }),
                table,
            ],
        });
    }

    const doc = new Document({
        sections: sections,
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = path.join(__dirname, "resultados_busca_produtos.docx");
    fs.writeFileSync(outputPath, buffer);
    console.log(`Arquivo Word salvo em: ${outputPath}`);
}

// Função auxiliar para criar célula formatada
function criarCelulaTabela(texto, isHeader = false) {
    return new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: [
            new Paragraph({
                text: texto,
                bold: isHeader,
            }),
        ],
        borders: {
            top: { style: "single", size: 1, color: "000000" },
            bottom: { style: "single", size: 1, color: "000000" },
            left: { style: "single", size: 1, color: "000000" },
            right: { style: "single", size: 1, color: "000000" },
        },
        shading: isHeader
            ? { fill: "D9D9D9" } // cinza claro para cabeçalho
            : undefined,
    });
}


main();
