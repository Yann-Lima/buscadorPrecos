import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import Select from "react-select";

const lojas = [
  { label: "Casa e Vídeo", value: "casaevideo" },
  { label: "Le Biscuit", value: "leBiscuit" },
  { label: "eFácil", value: "eFacil" },
  { label: "Carrefour", value: "carrefour" }
];

function App() {
  const [produtos, setProdutos] = useState([]);
  const [lojasSelecionadas, setLojasSelecionadas] = useState([]);
  const [formato, setFormato] = useState("xlsx");
  const [carregando, setCarregando] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [tempoProcessando, setTempoProcessando] = useState(0);
  const [tempoExecucao, setTempoExecucao] = useState(null);
  const intervaloRef = useRef(null);
  const sourceRef = useRef(null);
  const [selecionarTodos, setSelecionarTodos] = useState(false);

  const [novoProduto, setNovoProduto] = useState({
    codigo: "",
    descricao1: "",
    descricao2: "",
    descricao3: "",
    imagem: null,
  });

  // Busca produtos
  useEffect(() => {
    async function carregarProdutos() {
      try {
        const res = await axios.get("http://localhost:4000/produtos");
        const formatados = res.data.map(p => ({ label: p, value: p }));
        setProdutos(formatados);
      } catch (err) {
        alert("Erro ao carregar produtos.");
      }
    }
    carregarProdutos();
  }, []);

  // Timer de progresso
  useEffect(() => {
    if (carregando) {
      setTempoProcessando(0);
      intervaloRef.current = setInterval(() => {
        setTempoProcessando(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(intervaloRef.current);
    }
    return () => clearInterval(intervaloRef.current);
  }, [carregando]);

  const handleCheckboxLoja = (value, checked) => {
    if (checked) {
      setLojasSelecionadas(prev => [...new Set([...prev, value])]);
    } else {
      setLojasSelecionadas(prev => prev.filter(v => v !== value));
      setSelecionarTodos(false);
    }
  };

  const handleSelecionarTodos = (e) => {
    const checked = e.target.checked;
    setSelecionarTodos(checked);
    if (checked) {
      setLojasSelecionadas(lojas.map(l => l.value));
    } else {
      setLojasSelecionadas([]);
    }
  };

  const handleSubmit = async () => {
    if (!lojasSelecionadas.length) {
      alert("Selecione ao menos uma loja.");
      return;
    }

    setCarregando(true);
    setArquivo(null);
    setTempoExecucao(null);
    const inicio = Date.now();

    const CancelToken = axios.CancelToken;
    sourceRef.current = CancelToken.source();

    try {
      const res = await axios.post("http://localhost:4000/executar", {
        lojasSelecionadas,
        exportarComo: formato
      }, {
        cancelToken: sourceRef.current.token,
      });

      setArquivo(res.data.arquivo);
      const duracaoSegundos = Math.floor((Date.now() - inicio) / 1000);
      setTempoExecucao(duracaoSegundos);

    } catch (err) {
      if (axios.isCancel(err)) {
        alert("Consulta cancelada pelo usuário.");
      } else {
        alert("Erro ao processar.");
      }
    } finally {
      setCarregando(false);
      setTempoProcessando(0);
    }
  };

  const cancelarProcesso = async () => {
    if (sourceRef.current) {
      sourceRef.current.cancel("Cancelado pelo usuário");
    }

    try {
      await axios.post("http://localhost:4000/cancelar");
    } catch (err) {
      console.error("Erro ao cancelar no backend:", err.message);
    }
  };
  
  const handleNovoProdutoChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "imagem") {
      setNovoProduto(prev => ({ ...prev, imagem: files[0] }));
    } else {
      setNovoProduto(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleInserirProduto = () => {
    if (!novoProduto.codigo.trim()) {
      alert("Código do produto é obrigatório.");
      return;
    }
    if (!novoProduto.descricao1.trim()) {
      alert("Descrição 1 é obrigatória.");
      return;
    }
    if (!novoProduto.imagem) {
      alert("Imagem é obrigatória.");
      return;
    }

    alert(`Produto inserido:
Código: ${novoProduto.codigo}
Descrição 1: ${novoProduto.descricao1}
Descrição 2: ${novoProduto.descricao2}
Descrição 3: ${novoProduto.descricao3}
Imagem: ${novoProduto.imagem.name}`);

    setNovoProduto({
      codigo: "",
      descricao1: "",
      descricao2: "",
      descricao3: "",
      imagem: null,
    });
  };

  const formatarTempo = (segundos) => {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "auto" }}>
      <h2>🛍️ Consulta de Preços</h2>

      <div style={{ marginBottom: 20 }}>
        <strong>Produtos do JSON:</strong>
        <Select
          isMulti
          options={produtos}
          placeholder="Pesquise ou selecione produtos..."
        />
      </div>

      <div>
        <strong>Lojas:</strong><br />
        <label style={{ display: "block", marginBottom: 5 }}>
          <input
            type="checkbox"
            checked={selecionarTodos}
            onChange={handleSelecionarTodos}
          />{" "}
          Selecionar Todos
        </label>

        {lojas.map(loja => (
          <label key={loja.value} style={{ display: "block", marginTop: 5 }}>
            <input
              type="checkbox"
              value={loja.value}
              checked={lojasSelecionadas.includes(loja.value)}
              onChange={(e) => handleCheckboxLoja(loja.value, e.target.checked)}
              disabled={carregando}
            />{" "}
            {loja.label}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 15 }}>
        <strong>Formato:</strong><br />
        <label>
          <input
            type="radio"
            name="formato"
            value="xlsx"
            checked={formato === "xlsx"}
            onChange={(e) => setFormato(e.target.value)}
            disabled={carregando}
          /> Excel (.xlsx)
        </label>{" "}
        <label>
          <input
            type="radio"
            name="formato"
            value="csv"
            checked={formato === "csv"}
            onChange={(e) => setFormato(e.target.value)}
            disabled={carregando}
          /> CSV (.csv)
        </label>
      </div>

      <div style={{ marginTop: 20 }}>
        {!carregando && (
          <button onClick={handleSubmit}>Executar Consulta</button>
        )}
        {carregando && (
          <>
            <button disabled>🔄 Processando...</button>{" "}
            <button onClick={cancelarProcesso}>Cancelar</button>
            <p>⏳ Tempo decorrido: {formatarTempo(tempoProcessando)}</p>
          </>
        )}
      </div>

      {arquivo && (
        <div style={{ marginTop: 20 }}>
          <p>
            ✅ <a href={`http://localhost:4000${arquivo}`} download>
              Clique aqui para baixar o arquivo gerado
            </a>
          </p>
          {tempoExecucao !== null && (
            <p>⏱️ Tempo de execução: {formatarTempo(tempoExecucao)}</p>
          )}
        </div>
      )}

      <hr style={{ margin: "30px 0" }} />

      <h3>➕ Inserir novo produto (exemplo offline)</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
        <input
          type="text"
          name="codigo"
          placeholder="Código do produto (obrigatório)"
          value={novoProduto.codigo}
          onChange={handleNovoProdutoChange}
          disabled={carregando}
        />
        <input
          type="text"
          name="descricao1"
          placeholder="Descrição 1 (obrigatório)"
          value={novoProduto.descricao1}
          onChange={handleNovoProdutoChange}
          disabled={carregando}
        />
        <input
          type="text"
          name="descricao2"
          placeholder="Descrição 2 (opcional)"
          value={novoProduto.descricao2}
          onChange={handleNovoProdutoChange}
          disabled={carregando}
        />
        <input
          type="text"
          name="descricao3"
          placeholder="Descrição 3 (opcional)"
          value={novoProduto.descricao3}
          onChange={handleNovoProdutoChange}
          disabled={carregando}
        />
        <input
          type="file"
          name="imagem"
          accept="image/*"
          onChange={handleNovoProdutoChange}
          disabled={carregando}
        />
        <button onClick={handleInserirProduto} disabled={carregando}>
          Inserir Produto
        </button>
      </div>
    </div>
  );
}

export default App;
