const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const axios = require("axios"); // 🔹 para chamar o webhook

const SRC_XLSX = "C:\\Roberty\\P3\\v2\\planilhaAtualizada.xlsx"; // origem (bancodedados)
const DEST_XLSX = "C:\\Roberty\\P3\\COMPARATIVO_GERAL.xlsx";    // destino (Aux)
const SRC_SHEET = "bancodedados";
const DEST_SHEET = "Aux";

if (!fs.existsSync(SRC_XLSX)) {
  console.error("❌ Não encontrei:", SRC_XLSX);
  process.exit(1);
}
if (!fs.existsSync(DEST_XLSX)) {
  console.error("❌ Não encontrei:", DEST_XLSX);
  process.exit(1);
}

const psScript = `
$ErrorActionPreference = "Stop"

function Close-Excel([ref]$excel, [ref]$wbList) {
  try {
    if ($wbList.Value) {
      foreach ($wb in $wbList.Value) {
        try { $wb.Close($false) } catch {}
      }
    }
  } catch {}
  try { $excel.Value.Quit() } catch {}
}

$srcPath = "${SRC_XLSX}"
$destPath = "${DEST_XLSX}"
$srcSheetName = "${SRC_SHEET}"
$destSheetName = "${DEST_SHEET}"

Write-Host "[INFO] Abrindo Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$workbooks = @()

try {
  Write-Host "[INFO] Lendo valores de" $srcPath
  $wbSrc = $excel.Workbooks.Open($srcPath)
  $workbooks += $wbSrc

  try {
    $wsSrc = $wbSrc.Worksheets.Item($srcSheetName)
  } catch {
    throw "A aba '$srcSheetName' não existe na planilha origem"
  }

  $used = $wsSrc.UsedRange
  $rows = $used.Rows.Count
  $cols = $used.Columns.Count
  $vals = $used.Value2

  $wbSrc.Close($false)
  $workbooks = $workbooks | Where-Object { $_ -ne $wbSrc }

  Write-Host "[INFO] Abrindo destino" $destPath
  $wbDest = $excel.Workbooks.Open($destPath)
  $workbooks += $wbDest

  try {
    $wsExisting = $wbDest.Worksheets.Item($destSheetName)
    if ($wsExisting) {
      Write-Host "[INFO] Removendo aba existente '$destSheetName'"
      $wsExisting.Delete()
    }
  } catch {}

  $wsAux = $wbDest.Worksheets.Add()
  $wsAux.Name = $destSheetName

  if ($rows -gt 0 -and $cols -gt 0) {
    $destRange = $wsAux.Range("A1").Resize($rows, $cols)
    $destRange.Value2 = $vals
  }

  Write-Host "[INFO] Salvando alterações no destino"
  $wbDest.Save()
  $wbDest.Close($true)
  $workbooks = $workbooks | Where-Object { $_ -ne $wbDest }

  Write-Host "✅ Concluído!"
}
catch {
  Write-Error ("❌ Erro: " + $_.Exception.Message)
}
finally {
  Close-Excel ([ref]$excel) ([ref]([ref]$workbooks))
}
`;

async function chamarWebhookRoberty() {
  const url = "https://api.roberty.app/main/public/webhook/request";
  const token = "H0xSW9RE2hlthQ2Q602FL";

  try {
    const response = await axios.post(
      url,
      { name: "inicio" },
      {
        headers: {
          "x-roberty-token": token,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("[INFO] Webhook do Roberty chamado com sucesso:", response.data);
  } catch (error) {
    console.error("[ERRO] Falha ao chamar webhook do Roberty:", error.message);
  }
}

(async () => {
  const psPath = path.join(os.tmpdir(), `atualizarAux_${Date.now()}.ps1`);
  fs.writeFileSync(psPath, psScript, "utf8");

  console.log("[INFO] Executando PowerShell...");
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", psPath
  ], { stdio: "inherit" });

  child.on("exit", async (code) => {
    try { fs.unlinkSync(psPath); } catch {}
    if (code === 0) {
      console.log("🎉 Finalizado. Verifique:", DEST_XLSX);

      // 🔹 Chama o webhook aqui no final de tudo
      await chamarWebhookRoberty();
    } else {
      console.error("⚠️ PowerShell retornou código", code);
    }
  });
})();
