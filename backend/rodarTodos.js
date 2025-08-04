const { exec } = require("child_process");
const inicio = Date.now();
const fim = Date.now();

const scripts = [
  "node casaevideo.js",
  "node leBiscuit.js",
  "node eFacil.js",
  "node carrefour.js"
];

function rodarSequencialmente(i = 0) {
  if (i >= scripts.length) {
    console.log("✅ Todos os scripts foram executados.");
    return;
  }

  console.log(`\n🔄 Rodando: ${scripts[i]}`);
  const processo = exec(scripts[i]);

  processo.stdout.on("data", data => process.stdout.write(data));
  processo.stderr.on("data", data => process.stderr.write(data));

  processo.on("close", code => {
    console.log(`\n✅ Script finalizado: ${scripts[i]} (code ${code})`);
    rodarSequencialmente(i + 1); // próximo
  });
}
console.log("Tempo total:", (fim - inicio) / 1000, "segundos");
rodarSequencialmente();
