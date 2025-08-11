const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const resultados = [];

const produtosJson = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogoProdutos.json"), "utf-8"));
const listaProdutos = produtosJson
    .filter(p => (p.marca || "").trim().toUpperCase() === "ELECTROLUX")
    .map(p => p.produto.trim());

async function executarBuscaElectrolux() {
    console.error("[INFO] Iniciando verificação de todos os produtos no site da Electrolux...\n");

    for (const termo of listaProdutos) {
        try {
            await buscarPrimeiroProdutoElectrolux(termo);
        } catch (err) {
            console.error(`[ERRO CRÍTICO] Falha na busca do produto "${termo}":`, err.message);
            resultados.push({
                termo,
                nome: null,
                preco: "Indisponível",
                precoParcelado: "Indisponível",
                loja: "Electrolux",
                link: null,
            });
        }
    }

    const outputPath = path.join(__dirname, "..", "results", "resultados_electrolux.json");
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));

    console.error("\n[INFO] Fim da verificação.\n");

    const resultadoFinal = {};
    for (const item of resultados) {
        resultadoFinal[item.termo] = {
            preco: item.preco,
            precoParcelado: item.precoParcelado,
            link: item.link
        };
    }

    console.log(JSON.stringify(resultadoFinal));
    console.error("[INFO] Script Electrolux finalizado com sucesso.");
    process.exit(0);
}

async function buscarPrimeiroProdutoElectrolux(termo) {
    const termoBusca = encodeURIComponent(termo.trim());
    const urlBusca = `https://loja.electrolux.com.br/${termoBusca}?_q=${termoBusca}&map=ft`;

    console.error("\n[INFO] ========== NOVA BUSCA ==========");
    console.error("[DEBUG] Termo:", termo);
    console.error("[DEBUG] URL:", urlBusca);

    try {
        const resp = await axios.get(urlBusca, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const $ = cheerio.load(resp.data);
        const linkRelativo = $("a.vtex-product-summary-2-x-clearLink").first().attr("href");

        if (!linkRelativo) {
            console.warn("[WARN] Nenhum produto encontrado para:", termo);
            resultados.push({
                termo,
                nome: null,
                preco: "Indisponível",
                precoParcelado: "Indisponível",
                loja: "Electrolux",
                link: null,
            });
            return;
        }

        const urlProduto = "https://loja.electrolux.com.br" + linkRelativo;
        console.error("[DEBUG] Primeiro produto encontrado:", urlProduto);

        await extrairDetalhesProdutoElectrolux(urlProduto, termo);

    } catch (err) {
        console.error("[ERRO] Falha ao buscar:", termo, "→", err.message);
        resultados.push({
            termo,
            nome: null,
            preco: "Indisponível",
            precoParcelado: "Indisponível",
            loja: "Electrolux",
            link: null,
        });
    }
}

async function extrairDetalhesProdutoElectrolux(urlProduto, termoOriginal) {
    console.error("[INFO] --- Acessando produto para:", termoOriginal);

    try {
        const resp = await axios.get(urlProduto, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const $ = cheerio.load(resp.data);
        const nome = $("h1").first().text().trim();

        // 🟢 Preço parcelado
        let precoParcelado = $(".electrolux-product-prices-4-x-sellingPriceValue--pdp")
            .first() // pega apenas o primeiro
            .text()
            .replace(/\s+/g, " ")
            .trim();


        precoParcelado = precoParcelado.replace(/\s+/g, " ").trim();

        let preco = "Indisponível";

        if (precoParcelado.includes("R$")) {
            // Extrai número e calcula 8% de desconto
            const valorNum = parseFloat(precoParcelado.replace(/[R$\s\.]/g, "").replace(",", "."));
            const valorComDesconto = valorNum * 0.92;
            preco = `R$ ${valorComDesconto.toFixed(2).replace(".", ",")}`;
        } else {
            precoParcelado = "Indisponível";
        }

        console.error(`[RESULTADO] Produto: ${nome}`);
        console.error(`[RESULTADO] Preço à vista: ${preco}`);
        console.error(`[RESULTADO] Preço parcelado: ${precoParcelado}`);
        console.error(`[RESULTADO] Link: ${urlProduto}`);

        resultados.push({
            termo: termoOriginal,
            nome,
            preco,
            precoParcelado,
            loja: "Electrolux",
            link: urlProduto
        });

    } catch (err) {
        console.error("[ERRO] Erro ao extrair produto:", err.message);
        resultados.push({
            termo: termoOriginal,
            nome: null,
            preco: "Indisponível",
            precoParcelado: "Indisponível",
            loja: "Electrolux",
            link: urlProduto
        });
    }

    console.error("[INFO] --- Fim da verificação do produto ---\n");
}

executarBuscaElectrolux().catch(err => {
    console.error("[ERRO FATAL] Falha inesperada no script Electrolux:", err.message);
    process.exit(1);
});
