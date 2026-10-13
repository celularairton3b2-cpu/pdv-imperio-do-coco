// ============================================================
// COCO DA PRAIA - lógica do app
// ============================================================

let clientes = [];
let entregas = [];
let pagamentos = [];
let compras = [];    
let despesas = [];   
let pagFornecedor = []; 
let fornecedores = [];
let ajustesEstoque = [];

let unsubFornecedores = null;
let unsubCompras = null;
let unsubDespesas = null;
let unsubPagFornecedor = null;

let currentView = "entregar";
let pagamentosFiltro = "pendentes";
let historicoClienteId = "todos";
let historicoPeriodo = "30";
let gastosPeriodo = "30";
let drePeriodo = "30";
let relatorioFinanceiro = "dre";

const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DIAS_SEMANA = ["dom","seg","ter","qua","qui","sex","sáb"];

function pad2(n) { return String(n).padStart(2, "0"); }

// FUNÇÃO DE AUDITORIA (LOGS)
async function registrarLog(acao, detalhes) {
  const user = firebase.auth().currentUser;
  if (!user) return;
  try {
    await db.collection("logs").add({
      acao: acao,
      detalhes: detalhes,
      usuarioEmail: user.email || "Desconhecido",
      dataHora: new Date().toLocaleString("pt-BR"),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Erro ao registrar log", err);
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateBR(key, comAno) {
  const d = parseDateKey(key);
  return comAno
    ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
    : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function formatMoney(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMoneyShort(v) {
  const val = v || 0;
  return "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

function waLink(telefone, mensagem) {
  let digits = String(telefone || "").replace(/\D/g, "");
  if (digits.length > 0 && !digits.startsWith("55")) digits = "55" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(mensagem)}`;
}

function clienteById(id) {
  return clientes.find((c) => c.id === id);
}

function totalEntregueCliente(clienteId) {
  return entregas.filter((e) => e.clienteId === clienteId).reduce((s, e) => s + e.quantidade, 0);
}

function totalEntregueValorCliente(clienteId) {
  return entregas.filter((e) => e.clienteId === clienteId).reduce((s, e) => s + e.valorTotal, 0);
}

function totalPagoValorCliente(clienteId) {
  return pagamentos.filter((p) => p.clienteId === clienteId).reduce((s, p) => s + p.valorPago, 0);
}

function saldoValorCliente(clienteId) {
  return totalEntregueValorCliente(clienteId) - totalPagoValorCliente(clienteId);
}

function iniciarListeners() {
  db.collection("clientes").orderBy("nome").onSnapshot((snap) => {
    clientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    popularSelectClientes();
    renderView();
  }, (err) => console.error("Erro ao carregar clientes:", err));

  db.collection("entregas").orderBy("data", "desc").onSnapshot((snap) => {
    entregas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderView();
  }, (err) => console.error("Erro ao carregar entregas:", err));

  db.collection("pagamentos").orderBy("data", "desc").onSnapshot((snap) => {
    pagamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderView();
  }, (err) => console.error("Erro ao carregar pagamentos:", err));

  db.collection("ajustes_estoque").orderBy("data", "desc").onSnapshot((snap) => {
    ajustesEstoque = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (currentView === "estoque") renderEstoque();
    if (currentView === "entregar") renderEntregar();
  }, (err) => console.error("Erro ao carregar ajustes:", err));
}

function showView(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  
  const targetView = document.getElementById("view-" + view);
  if (targetView) targetView.classList.add("active");
  
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  
  const btnFab = document.getElementById("fab-add-cliente");
  if (btnFab) btnFab.style.display = window.currentRole === "admin" ? "flex" : "none";
  
  renderView();
}

function renderView() {
  document.getElementById("topbar-date").textContent = formatDateBR(todayKey(), true);
  if (currentView === "entregar") renderEntregar();
  else if (currentView === "clientes") renderClientes();
  else if (currentView === "pagamentos") renderPagamentos();
  else if (currentView === "historico") renderHistorico();
  else if (currentView === "gastos") renderGastos();
  else if (currentView === "dre") renderRelatorioFinanceiro();
  else if (currentView === "estoque") renderEstoque();
}

function popularSelectClientes() {
  const select = document.getElementById("entrega-cliente");
  if (!select) return;
  const anterior = select.value;
  select.innerHTML = clientes.map((c) =>
    `<option value="${c.id}">${escapeHtml(c.nome)} — ${escapeHtml(c.empresa || "sem local")} (${formatMoney(c.precoUnitario)})</option>`
  ).join("");
  if (clientes.some((c) => c.id === anterior)) select.value = anterior;

  const isAdmin = window.currentRole === "admin";
  document.getElementById("entrega-sem-clientes").style.display = (clientes.length === 0 && isAdmin) ? "block" : "none";
  document.getElementById("entrega-form-card").style.display = (clientes.length > 0 && isAdmin) ? "block" : "none";
  document.getElementById("entrega-view-only").style.display = !isAdmin ? "block" : "none";

  const selectHist = document.getElementById("historico-cliente");
  const anteriorHist = selectHist.value || "todos";
  selectHist.innerHTML = `<option value="todos">Todos os clientes</option>` +
    clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  selectHist.value = clientes.some((c) => c.id === anteriorHist) ? anteriorHist : "todos";

  atualizarPreviewEntrega();
}

function precoClienteSelecionado() {
  const id = document.getElementById("entrega-cliente").value;
  const c = clienteById(id);
  return c ? c.precoUnitario : 0;
}

function atualizarPreviewEntrega() {
  const qtd = parseFloat(document.getElementById("entrega-qtd").value) || 0;
  const total = qtd * precoClienteSelecionado();
  document.getElementById("entrega-total-preview").textContent = formatMoney(total);
}

async function salvarEntrega() {
  const clienteId = document.getElementById("entrega-cliente").value;
  const qtd = parseFloat(document.getElementById("entrega-qtd").value);
  const data = document.getElementById("entrega-data").value || todayKey();
  const cliente = clienteById(clienteId);

  if (!cliente) { showToast("Cadastre um cliente primeiro"); return; }
  if (!qtd || qtd <= 0) { showToast("Digite a quantidade de cocos"); return; }

  const valorTotal = qtd * cliente.precoUnitario;
  const saldoAntes = saldoValorCliente(clienteId);
  if (!confirm(`Confirma a entrega de ${qtd} cocos (${formatMoney(valorTotal)}) para ${cliente.nome}?`)) return;

  const btn = document.getElementById("btn-salvar-entrega");
  btn.disabled = true;
  try {
    await db.collection("entregas").add({
      clienteId,
      clienteNome: cliente.nome,
      data,
      quantidade: qtd,
      precoUnitario: cliente.precoUnitario,
      valorTotal: valorTotal,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("entrega-qtd").value = "";
    atualizarPreviewEntrega();
    showToast(`Entrega de ${qtd} cocos registrada!`);
    if (cliente.telefone) {
      abrirSheetAvisoEntrega(cliente, qtd, valorTotal, saldoAntes + valorTotal);
    }
    atualizarExtratoCliente(clienteId, saldoAntes + valorTotal, totalEntregueCliente(clienteId) + qtd);
  } catch (err) {
    showToast("Não foi possível salvar. Tente de novo.");
  }
  btn.disabled = false;
}

function abrirSheetAvisoEntrega(cliente, qtd, valorEntrega, saldoAtual) {
  const msg = saldoAtual > 0.01
    ? `Oi ${cliente.nome}! Entregamos ${qtd} cocos hoje (${formatMoney(valorEntrega)}). Seu saldo agora é ${formatMoney(saldoAtual)}. 🥥`
    : `Oi ${cliente.nome}! Entregamos ${qtd} cocos hoje (${formatMoney(valorEntrega)}). Está tudo certo, sem saldo pendente! 🥥`;

  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>Avisar ${escapeHtml(cliente.nome)}</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="helper-text" style="margin-bottom:14px">Mande uma mensagem rápida confirmando a entrega de hoje.</div>
    <button class="btn btn-secondary" id="btn-avisar-entrega-whatsapp">Avisar no WhatsApp</button>
    <button class="btn btn-outline" id="btn-pular-aviso-entrega" style="margin-top:10px">Agora não</button>
  `;

  document.getElementById("btn-avisar-entrega-whatsapp").addEventListener("click", () => {
    window.open(waLink(cliente.telefone, msg), "_blank");
    fecharSheet();
  });
  document.getElementById("btn-pular-aviso-entrega").addEventListener("click", fecharSheet);
  abrirSheet();
}

async function excluirEntrega(id) {
  if (!confirm("Excluir esta entrega?")) return;
  const entrega = entregas.find(e => e.id === id);
  const detalhesLog = entrega ? `${entrega.quantidade} cocos do cliente ${entrega.clienteNome}` : `ID: ${id}`;
  try { 
    await db.collection("entregas").doc(id).delete(); 
    await registrarLog("EXCLUSÃO DE ENTREGA", `Excluiu a entrega de ${detalhesLog}`);
  } catch (e) {}
}

function renderEntregar() {
  const hoje = todayKey();
  const entregasHoje = entregas.filter((e) => e.data === hoje)
    .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));

  const totalCocos = entregasHoje.reduce((s, e) => s + e.quantidade, 0);
  const totalValor = entregasHoje.reduce((s, e) => s + e.valorTotal, 0);

  document.getElementById("hoje-cocos").textContent = totalCocos;
  document.getElementById("hoje-valor").textContent = formatMoneyShort(totalValor);

  const totalComprado = compras.reduce((s, c) => s + c.quantidade, 0);
  const totalEntregue = entregas.reduce((s, e) => s + e.quantidade, 0);
  const totalAjustes = ajustesEstoque.reduce((s, a) => s + (parseFloat(a.quantidade) || 0), 0);
  const saldoEstoque = totalComprado + totalAjustes - totalEntregue;
  
  const elEstoque = document.getElementById("entrega-estoque-atual");
  if (elEstoque) {
    elEstoque.textContent = `${saldoEstoque} cocos`;
    elEstoque.style.color = saldoEstoque <= 0 ? "#FF8A80" : "#FFFFFF";
  }

  const lista = document.getElementById("hoje-lista");
  if (entregasHoje.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">☀️</span><div class="title">Nenhuma entrega hoje ainda</div><div class="desc">Registre a primeira entrega do dia acima.</div></div>`;
  } else {
    lista.innerHTML = entregasHoje.map((e) => `
      <div class="list-item">
        <div class="info">
          <div class="name">📦  ${escapeHtml(e.clienteNome)}</div>
          <div class="meta">${e.quantidade} cocos</div>
        </div>
        <div class="right">
          <div class="amount">${formatMoney(e.valorTotal)}</div>
        </div>
        ${window.currentRole === "admin" ? `<button style="background:none; border:none; box-shadow:none; font-size:16px; padding:8px; cursor:pointer;" data-del-entrega="${e.id}">❌</button>` : ""}
      </div>
    `).join("");
  }
}

function renderClientes() {
  const termo = (document.getElementById("busca-cliente").value || "").toLowerCase();
  const filtrados = clientes.filter((c) => c.nome.toLowerCase().includes(termo));

  const lista = document.getElementById("clientes-lista");
  if (clientes.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">👤</span><div class="title">Nenhum cliente cadastrado</div><div class="desc">Toque no botão + para cadastrar o primeiro cliente.</div></div>`;
    return;
  }
  if (filtrados.length === 0) {
    lista.innerHTML = `<div class="empty-state"><div class="desc">Nenhum cliente encontrado com esse nome.</div></div>`;
    return;
  }
  lista.innerHTML = filtrados.map((c) => `
    <div class="list-item" data-editar-cliente="${c.id}" style="cursor:pointer">
      <div class="info">
        <div class="name">${escapeHtml(c.nome)}</div>
        <div class="meta">${escapeHtml(c.empresa || "sem local")}${c.telefone ? " · " + escapeHtml(c.telefone) : ""}</div>
      </div>
      <div class="right">
        <div class="amount">${formatMoney(c.precoUnitario)}</div>
        <div class="meta">por coco</div>
      </div>
    </div>
  `).join("");
}

function abrirSheetCliente(clienteId) {
  const isAdmin = window.currentRole === "admin";
  if (!clienteId && !isAdmin) return; 

  const c = clienteId ? clienteById(clienteId) : null;
  const titulo = c ? (isAdmin ? "Editar cliente" : "Detalhes do cliente") : "Novo cliente";
  const ro = isAdmin ? "" : "disabled";

  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>${titulo}</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="field">
      <label>Nome do cliente</label>
      <input type="text" id="f-nome" placeholder="Ex: Seu João" value="${c ? escapeHtml(c.nome) : ""}" ${ro}>
    </div>
    <div class="field">
      <label>Telefone (com DDD)</label>
      <input type="tel" id="f-telefone" placeholder="Ex: (86) 99999-0000" value="${c ? escapeHtml(c.telefone || "") : ""}" ${ro}>
    </div>
    <div class="field">
      <label>Local / empresa</label>
      <input type="text" id="f-empresa" placeholder="Ex: Barraca 12 - Praia do Coqueiro" value="${c ? escapeHtml(c.empresa || "") : ""}" ${ro}>
    </div>
    <div class="field">
      <label>Preço por coco (R$)</label>
      <input type="number" id="f-preco" inputmode="decimal" min="0" step="0.10" placeholder="Ex: 3.00" value="${c ? c.precoUnitario : ""}" ${ro}>
    </div>
    ${isAdmin ? `<div class="helper-text">Esse preço é usado automaticamente sempre que você registrar uma entrega para este cliente.</div>
    <button class="btn btn-primary" id="btn-salvar-cliente">Salvar cliente</button>
    ${c ? `<button class="btn btn-danger" id="btn-excluir-cliente" style="margin-top:10px">Excluir cliente</button>` : ""}` : `<div class="helper-text">Seu acesso é só para consulta.</div>`}
    ${(isAdmin && c) ? `<button class="btn btn-outline" id="btn-compartilhar-extrato" style="margin-top:10px">Compartilhar extrato do cliente</button>` : ""}
  `;

  if (isAdmin) {
    document.getElementById("btn-salvar-cliente").addEventListener("click", () => salvarCliente(clienteId));
    if (c) {
      document.getElementById("btn-excluir-cliente").addEventListener("click", () => excluirCliente(clienteId));
      document.getElementById("btn-compartilhar-extrato").addEventListener("click", () => compartilharExtrato(clienteId));
    }
  }
  abrirSheet();
}

async function salvarCliente(clienteId) {
  const nome = document.getElementById("f-nome").value.trim();
  const telefone = document.getElementById("f-telefone").value.trim();
  const empresa = document.getElementById("f-empresa").value.trim();
  const preco = parseFloat(document.getElementById("f-preco").value);

  if (!nome) { showToast("Digite o nome do cliente"); return; }
  if (isNaN(preco) || preco < 0) { showToast("Digite um preço válido"); return; }

  const acao = clienteId ? "atualizar os dados do" : "cadastrar o novo";
  if (!confirm(`Deseja ${acao} cliente ${nome}?`)) return;

  const dados = { nome, telefone, empresa, precoUnitario: preco };

  try {
    if (clienteId) {
      await db.collection("clientes").doc(clienteId).update(dados);
      await registrarLog("EDIÇÃO CLIENTE", `Atualizou dados do cliente: ${nome}`);
      showToast("Cliente atualizado!");
    } else {
      dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("clientes").add(dados);
      await registrarLog("NOVO CLIENTE", `Cadastrou o cliente: ${nome}`);
      showToast("Cliente cadastrado!");
    }
    fecharSheet();
  } catch (err) {
    showToast("Não foi possível salvar o cliente.");
  }
}

async function excluirCliente(clienteId) {
  const totalHistorico = totalEntregueCliente(clienteId);
  const aviso = totalHistorico > 0
    ? "Este cliente já tem entregas registradas. O histórico dele NÃO será apagado, mas ele sairá da lista de clientes ativos. Deseja continuar?"
    : "Excluir este cliente?";
  if (!confirm(aviso)) return;
  try {
    await db.collection("clientes").doc(clienteId).delete();
    await registrarLog("EXCLUSÃO CLIENTE", `Excluiu o cliente ID: ${clienteId}`);
    fecharSheet();
    showToast("Cliente removido.");
  } catch (err) {}
}

function gerarToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

async function atualizarExtratoCliente(clienteId, novoSaldo, novoTotalCocos) {
  const c = clienteById(clienteId);
  if (!c || !c.tokenExtrato) return;
  try {
    await db.collection("extratos").doc(c.tokenExtrato).set({
      clienteId,
      clienteNome: c.nome,
      saldo: novoSaldo,
      totalCocos: novoTotalCocos,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Erro ao atualizar extrato:", err);
  }
}

async function compartilharExtrato(clienteId) {
  const c = clienteById(clienteId);
  if (!c) return;

  let token = c.tokenExtrato;
  if (!token) {
    token = gerarToken();
    try {
      await db.collection("clientes").doc(clienteId).update({ tokenExtrato: token });
      c.tokenExtrato = token;
    } catch (err) {
      showToast("Não foi possível gerar o link.");
      return;
    }
  }

  await atualizarExtratoCliente(clienteId, saldoValorCliente(clienteId), totalEntregueCliente(clienteId));

  const url = `${window.location.origin}/extrato.html?t=${token}`;

  if (c.telefone) {
    const msg = `Oi ${c.nome}! Aqui está o link do seu extrato de cocos, sempre atualizado: ${url}`;
    window.open(waLink(c.telefone, msg), "_blank");
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    showToast("Link copiado!");
  } else {
    showToast(url);
  }
}

function renderPagamentos() {
  const linhas = clientes.map((c) => {
    const entregueCocos = totalEntregueCliente(c.id);
    const saldoValor = saldoValorCliente(c.id);
    return { cliente: c, entregueCocos, saldoValor };
  }).filter((l) => l.entregueCocos > 0 || pagamentosFiltro === "todos");

  const visiveis = pagamentosFiltro === "pendentes" ? linhas.filter((l) => l.saldoValor > 0.01) : linhas;
  visiveis.sort((a, b) => b.saldoValor - a.saldoValor);

  const totalPendValor = linhas.reduce((s, l) => s + Math.max(l.saldoValor, 0), 0);
  const totalClientesComSaldo = linhas.filter((l) => l.saldoValor > 0.01).length;

  document.getElementById("pend-total-cocos").textContent = totalClientesComSaldo;
  document.getElementById("pend-total-valor").textContent = formatMoneyShort(totalPendValor);
  
  const lista = document.getElementById("pagamentos-lista");
  if (visiveis.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">✅</span><div class="title">Tudo em dia</div><div class="desc">Nenhum cliente com saldo pendente nesse filtro.</div></div>`;
    return;
  }
  lista.innerHTML = visiveis.map((l) => {
    const badge = l.saldoValor > 0.01
      ? `<span class="badge pending">Com saldo</span>`
      : `<span class="badge positive">Em dia</span>`;
    return `
      <div class="list-item" data-registrar-pagamento="${l.cliente.id}" style="cursor:pointer">
        <div class="info">
          <div class="name">${escapeHtml(l.cliente.nome)}</div>
          <div class="meta">${l.entregueCocos} cocos entregues</div>
        </div>
        <div class="right">
          <div class="amount">${formatMoney(Math.max(l.saldoValor, 0))}</div>
          ${badge}
        </div>
      </div>
    `;
  }).join("");
}

function abrirSheetPagamento(clienteId) {
  const c = clienteById(clienteId);
  if (!c) return;
  const saldo = saldoValorCliente(clienteId);
  const isAdmin = window.currentRole === "admin";

  const formularioPagamento = `
    <div class="field">
      <label>Valor pago agora (R$)</label>
      <input type="number" id="pg-valor" inputmode="decimal" min="0" step="0.01" value="${saldo > 0 ? saldo.toFixed(2) : ""}" placeholder="Ex: 100.00">
    </div>
    <div class="field">
      <label>Data do pagamento</label>
      <input type="date" id="pg-data" value="${todayKey()}">
    </div>
    <button class="btn btn-primary" id="btn-salvar-pagamento">Registrar pagamento</button>
  `;

  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>${escapeHtml(c.nome)}</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="total-preview">
      <span class="label">Saldo devedor</span>
      <span class="value" style="color: var(--danger)">${formatMoney(saldo)}</span>
    </div>
    ${isAdmin ? formularioPagamento : `<div class="helper-text">Seu acesso é só para consulta. Fale com um administrador para registrar pagamentos.</div>`}
    ${c.telefone ? `<button class="btn btn-secondary" id="btn-cobrar-whatsapp" style="margin-top:10px">Cobrar no WhatsApp</button>` : ""}
  `;

  if (isAdmin) {
    document.getElementById("btn-salvar-pagamento").addEventListener("click", () => salvarPagamento(clienteId));
  }

  const btnWpp = document.getElementById("btn-cobrar-whatsapp");
  if (btnWpp) {
    btnWpp.addEventListener("click", () => {
      const msg = saldo > 0.01
        ? `Oi ${c.nome}! Passando pra lembrar que está pendente um saldo de ${formatMoney(saldo)}. Qualquer coisa me chama por aqui 🥥`
        : `Oi ${c.nome}! Só confirmando que está tudo certo com os pagamentos dos cocos, obrigado! 🥥`;
      window.open(waLink(c.telefone, msg), "_blank");
    });
  }
  abrirSheet();
}

// FUNÇÃO DE SALVAR PAGAMENTO (Versão limpa e correta com rastreamento de usuário)
async function salvarPagamento(clienteId) {
  const c = clienteById(clienteId);
  const valorInput = document.getElementById("pg-valor").value.replace(",", ".");
  const valorPago = parseFloat(valorInput);
  const data = document.getElementById("pg-data").value || todayKey();

  if (!valorPago || valorPago <= 0) { showToast("Digite um valor válido"); return; }
  const saldoAntes = saldoValorCliente(clienteId);
  if (!confirm(`Confirma o recebimento de ${formatMoney(valorPago)} de ${c.nome}?`)) return;

  const btn = document.getElementById("btn-salvar-pagamento");
  if (btn) btn.disabled = true;

  const user = firebase.auth().currentUser;
  const emailUsuario = user ? user.email : "Desconhecido";

  try {
    const qtdEquivalente = c.precoUnitario > 0 ? valorPago / c.precoUnitario : 0;
    
    await db.collection("pagamentos").add({
      clienteId,
      clienteNome: c.nome,
      data,
      quantidadePaga: qtdEquivalente,
      valorPago: valorPago,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      registradoPor: emailUsuario
    });
    
    await registrarLog("PAGAMENTO RECEBIDO", `Baixou ${formatMoney(valorPago)} do cliente ${c.nome}`);
    fecharSheet();
    showToast(`Pagamento de ${formatMoney(valorPago)} registrado!`);
    
    if (c.telefone) {
      abrirSheetReciboPagamento(c, valorPago, saldoAntes - valorPago);
      atualizarExtratoCliente(clienteId, saldoAntes - valorPago, totalEntregueCliente(clienteId));
    }
  } catch (err) {
    showToast("Não foi possível registrar o pagamento.");
    if (btn) btn.disabled = false;
  }
}

async function excluirPagamento(id) {
  if (!confirm("Excluir este pagamento? O saldo devedor do cliente irá aumentar novamente.")) return;
  const pag = pagamentos.find(p => p.id === id);
  const detalhesLog = pag ? `${formatMoney(pag.valorPago)} do cliente ${pag.clienteNome}` : `ID: ${id}`;

  try {
    await db.collection("pagamentos").doc(id).delete();
    await registrarLog("EXCLUSÃO DE PAGAMENTO", `Excluiu o pagamento de ${detalhesLog}`);
    showToast("Pagamento excluído com sucesso.");
  } catch (e) {
    showToast("Erro ao excluir pagamento.");
  }
}

function abrirSheetReciboPagamento(cliente, valorPago, saldoRestante) {
  const msg = saldoRestante > 0.01
    ? `Oi ${cliente.nome}! Recebemos seu pagamento de ${formatMoney(valorPago)}, obrigado! Ainda fica um saldo de ${formatMoney(saldoRestante)}. 🥥`
    : `Oi ${cliente.nome}! Recebemos seu pagamento de ${formatMoney(valorPago)}, obrigado! Está tudo certo, sem saldo pendente. 🥥`;

  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>Avisar ${escapeHtml(cliente.nome)}</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="helper-text" style="margin-bottom:14px">Mande o recibo desse pagamento pelo WhatsApp.</div>
    <button class="btn btn-secondary" id="btn-recibo-whatsapp">Enviar recibo no WhatsApp</button>
    <button class="btn btn-outline" id="btn-pular-recibo" style="margin-top:10px">Agora não</button>
  `;

  document.getElementById("btn-recibo-whatsapp").addEventListener("click", () => {
    window.open(waLink(cliente.telefone, msg), "_blank");
    fecharSheet();
  });
  document.getElementById("btn-pular-recibo").addEventListener("click", fecharSheet);
  abrirSheet();
}

function periodoStartKey(periodo) {
  const hoje = new Date();
  if (periodo === "7") {
    const d = new Date(hoje); d.setDate(d.getDate() - 6);
    return toDateKey(d);
  }
  if (periodo === "30") {
    return toDateKey(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  }
  return null;
}

function renderHistorico() {
  const filtraBase = (r) => {
    if (historicoClienteId !== "todos" && r.clienteId !== historicoClienteId) return false;
    if (historicoPeriodo === "exata") {
      const dataExata = document.getElementById("historico-data-exata").value;
      return !!dataExata && r.data === dataExata;
    }
    const startKey = periodoStartKey(historicoPeriodo);
    if (startKey && r.data < startKey) return false;
    return true;
  };

  const entregasFiltradas = entregas.filter(filtraBase);
  const pagamentosFiltrados = pagamentos.filter(filtraBase);

  const totalCocos = entregasFiltradas.reduce((s, e) => s + e.quantidade, 0);
  const totalValor = entregasFiltradas.reduce((s, e) => s + e.valorTotal, 0);
  document.getElementById("hist-cocos").textContent = totalCocos;
  document.getElementById("hist-valor").textContent = formatMoneyShort(totalValor);

  desenharGrafico(entregasFiltradas);

  const timeline = [
    ...entregasFiltradas.map((e) => ({ tipo: "entrega", data: e.data, ts: e.criadoEm?.seconds || 0, item: e })),
    ...pagamentosFiltrados.map((p) => ({ tipo: "pagamento", data: p.data, ts: p.criadoEm?.seconds || 0, item: p }))
  ].sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : b.ts - a.ts));

  const lista = document.getElementById("historico-lista");
  if (timeline.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">📭</span><div class="title">Nada por aqui ainda</div><div class="desc">Ajuste o período ou o cliente selecionado.</div></div>`;
    return;
  }
  
  lista.innerHTML = timeline.map((t) => {
    if (t.tipo === "entrega") {
      return `
        <div class="list-item">
          <div class="info">
            <div class="name">🥥 ${historicoClienteId === "todos" ? escapeHtml(t.item.clienteNome) : "Entrega"}</div>
            <div class="meta">${formatDateBR(t.data)} · ${t.item.quantidade} cocos</div>
          </div>
          <div class="right"><div class="amount">${formatMoney(t.item.valorTotal)}</div></div>
        </div>
      `;
    }
    if (t.tipo === "pagamento") {
      return `
        <div class="list-item">
          <div class="info">
            <div class="name">💸 ${historicoClienteId === "todos" ? escapeHtml(t.item.clienteNome) : "Pagamento recebido"}</div>
            <div class="meta">${formatDateBR(t.data)}</div>
          </div>
          <div class="right"><div class="amount" style="color:var(--positive)">${formatMoney(t.item.valorPago)}</div></div>
          ${window.currentRole === "admin" ? `<button style="background:none; border:none; box-shadow:none; font-size:16px; margin-left:10px; padding:8px; cursor:pointer;" data-del-pagamento="${t.item.id}">❌</button>` : ""}
        </div>
      `;
    }
    return "";
  }).join("");
}

function desenharGrafico(entregasFiltradas) {
  let buckets;
  if (historicoPeriodo === "exata") {
    const dataExata = document.getElementById("historico-data-exata").value;
    const total = entregasFiltradas.reduce((s, e) => s + e.quantidade, 0);
    buckets = [{ key: dataExata || "-", label: dataExata ? formatDateBR(dataExata) : "-", value: total }];
  } else if (historicoPeriodo === "tudo") {
    const hoje = new Date();
    buckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MESES[d.getMonth()], value: 0 });
    }
    entregasFiltradas.forEach((e) => {
      const d = parseDateKey(e.data);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const b = buckets.find((b) => b.key === key);
      if (b) b.value += e.quantidade;
    });
  } else {
    const hoje = new Date();
    const dias = historicoPeriodo === "7" ? 7 : hoje.getDate();
    buckets = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoje); d.setDate(hoje.getDate() - i);
      buckets.push({ key: toDateKey(d), label: historicoPeriodo === "7" ? DIAS_SEMANA[d.getDay()] : String(d.getDate()), value: 0 });
    }
    entregasFiltradas.forEach((e) => {
      const b = buckets.find((b) => b.key === e.data);
      if (b) b.value += e.quantidade;
    });
  }
  drawBarChart(document.getElementById("chart-canvas"), buckets);
}

function drawBarChart(canvas, buckets) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
  const cssHeight = 160;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.height = cssHeight + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const max = Math.max(1, ...buckets.map((b) => b.value));
  const padLeft = 4, padRight = 4, padBottom = 20, padTop = 8;
  const chartH = cssHeight - padBottom - padTop;
  const n = buckets.length;
  const gap = 6;
  const barW = Math.max(4, (cssWidth - padLeft - padRight - gap * (n - 1)) / n);

  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";

  buckets.forEach((b, i) => {
    const x = padLeft + i * (barW + gap);
    const h = (b.value / max) * chartH;
    const y = padTop + (chartH - h);

    ctx.fillStyle = b.value > 0 ? "#FF7A30" : "#E8DCC5";
    const r = Math.min(6, barW / 2);
    roundRect(ctx, x, y, barW, Math.max(h, 3), r);
    ctx.fill();

    ctx.fillStyle = "#4B6461";
    ctx.fillText(b.label, x + barW / 2, cssHeight - 5);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function popularSelectFornecedores() {
  const select = document.getElementById("compra-fornecedor");
  if (!select) return;
  const anterior = select.value;
  select.innerHTML = fornecedores.map((f) =>
    `<option value="${f.id}">${escapeHtml(f.nome)} (${formatMoney(f.precoUnitario)})</option>`
  ).join("");
  if (fornecedores.some((f) => f.id === anterior)) select.value = anterior;

  const temForn = fornecedores.length > 0;
  const formCard = document.getElementById("form-compra-card");
  const avisoSem = document.getElementById("aviso-sem-fornecedor");
  
  if (formCard) formCard.style.display = temForn ? "block" : "none";
  if (avisoSem) avisoSem.style.display = temForn ? "none" : "block";

  aoMudarQtdCompra();
}

function abrirSheetFornecedor(id) {
  const f = id ? fornecedores.find(x => x.id === id) : null;
  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>${f ? "Editar fornecedor" : "Novo fornecedor"}</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="field">
      <label>Nome do fornecedor</label>
      <input type="text" id="forn-nome" placeholder="Ex: Fazenda São João" value="${f ? escapeHtml(f.nome) : ""}">
    </div>
    <div class="field">
      <label>Telefone / WhatsApp (opcional)</label>
      <input type="tel" id="forn-telefone" placeholder="Ex: (86) 99999-0000" value="${f ? escapeHtml(f.telefone || "") : ""}">
    </div>
    <div class="field">
      <label>Preço de compra por coco (R$)</label>
      <input type="number" id="forn-preco" inputmode="decimal" min="0" step="0.01" placeholder="Ex: 1.50" value="${f ? f.precoUnitario : ""}">
    </div>
    <div class="helper-text">Ao digitar a quantidade na compra, o valor total será calculado automaticamente usando este preço.</div>
    <button class="btn btn-primary" id="btn-salvar-fornecedor">Salvar fornecedor</button>
    ${f ? `<button class="btn btn-danger" id="btn-excluir-fornecedor" style="margin-top:10px">Excluir fornecedor</button>` : ""}
  `;

  document.getElementById("btn-salvar-fornecedor").addEventListener("click", () => salvarFornecedor(id));
  if (f) document.getElementById("btn-excluir-fornecedor").addEventListener("click", () => excluirFornecedor(id));
  abrirSheet();
}

async function salvarFornecedor(id) {
  const nome = document.getElementById("forn-nome").value.trim();
  const telefone = document.getElementById("forn-telefone").value.trim();
  const precoInput = document.getElementById("forn-preco").value.replace(",", ".");
  const preco = parseFloat(precoInput);

  if (!nome) { showToast("Digite o nome"); return; }
  if (isNaN(preco) || preco <= 0) { showToast("Digite um preço válido"); return; }

  const btn = document.getElementById("btn-salvar-fornecedor");
  btn.disabled = true;

  try {
    if (id) {
      await db.collection("fornecedores").doc(id).update({ nome, telefone, precoUnitario: preco });
      await registrarLog("EDIÇÃO FORNECEDOR", `Atualizou fornecedor: ${nome}`);
    } else {
      await db.collection("fornecedores").add({ nome, telefone, precoUnitario: preco, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
      await registrarLog("NOVO FORNECEDOR", `Cadastrou fornecedor: ${nome}`);
    }
    fecharSheet();
    showToast("Fornecedor salvo!");
  } catch (err) {
    showToast("Erro ao salvar.");
    btn.disabled = false;
  }
}

async function excluirFornecedor(id) {
  if (!confirm("Excluir fornecedor? O histórico financeiro será mantido intacto.")) return;
  try { 
    await db.collection("fornecedores").doc(id).delete(); 
    await registrarLog("EXCLUSÃO FORNECEDOR", `Excluiu o fornecedor ID: ${id}`);
    fecharSheet(); 
  } catch (e) {}
}

function aoMudarQtdCompra() {
  const qtd = parseFloat(document.getElementById("compra-qtd").value) || 0;
  const selectForn = document.getElementById("compra-fornecedor");
  const f = selectForn ? fornecedores.find(x => x.id === selectForn.value) : null;
  
  let total = 0;
  if (f && qtd > 0) {
    total = qtd * f.precoUnitario;
  }
  
  const elTotal = document.getElementById("compra-total-preview");
  if (elTotal) elTotal.textContent = formatMoney(total);
}

async function salvarCompra() {
  const fornId = document.getElementById("compra-fornecedor").value;
  const f = fornecedores.find(x => x.id === fornId);
  if (!f) { showToast("Cadastre um fornecedor primeiro"); return; }

  const qtd = parseFloat(document.getElementById("compra-qtd").value);
  const data = document.getElementById("compra-data").value || todayKey();

  if (!qtd || qtd <= 0) { showToast("Digite a quantidade comprada"); return; }

  const valorTotal = qtd * f.precoUnitario;

  if (!confirm(`Confirma a compra de ${qtd} cocos por ${formatMoney(valorTotal)} de ${f.nome}?`)) return;

  const btn = document.getElementById("btn-salvar-compra");
  btn.disabled = true;
  try {
    await db.collection("compras").add({
      fornecedorId: f.id,
      fornecedorNome: f.nome,
      data,
      quantidade: qtd,
      valorTotal: valorTotal,
      valorUnitario: f.precoUnitario,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("compra-qtd").value = "";
    aoMudarQtdCompra();
    showToast("Compra registrada!");
  } catch (err) {
    showToast("Não foi possível salvar.");
    btn.disabled = false;
  }
}

async function excluirCompra(id) {
  if (!confirm("Excluir esta compra?")) return;
  try { await db.collection("compras").doc(id).delete(); } catch (e) {}
}

async function salvarDespesa() {
  const categoria = document.getElementById("despesa-categoria").value;
  const descricao = document.getElementById("despesa-descricao").value.trim();
  const valor = parseFloat(document.getElementById("despesa-valor").value);
  const data = document.getElementById("despesa-data").value || todayKey();

  if (!valor || valor <= 0) { showToast("Digite o valor do gasto"); return; }

  const msgExtra = descricao ? ` (${descricao})` : "";
  if (!confirm(`Confirma o lançamento do gasto de ${formatMoney(valor)} na categoria ${categoria}${msgExtra}?`)) return;

  const btn = document.getElementById("btn-salvar-despesa");
  btn.disabled = true;
  try {
    await db.collection("despesas").add({
      data,
      categoria,
      descricao,
      valor,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("despesa-descricao").value = "";
    document.getElementById("despesa-valor").value = "";
    showToast("Gasto registrado!");
  } catch (err) {
    showToast("Não foi possível salvar. Tente de novo.");
  }
  btn.disabled = false;
}

async function excluirDespesa(id) {
  if (!confirm("Excluir este gasto?")) return;
  try { await db.collection("despesas").doc(id).delete(); } catch (e) {}
}

function renderGastos() {
  const startKey = periodoStartKey(gastosPeriodo);
  const comprasFiltradas = compras.filter((c) => !startKey || c.data >= startKey);
  const despesasFiltradas = despesas.filter((d) => !startKey || d.data >= startKey);
  const pagamentosFiltrados = pagFornecedor.filter((p) => !startKey || p.data >= startKey);

  const totalCocosComprados = comprasFiltradas.reduce((s, c) => s + c.quantidade, 0);
  const totalGasto = comprasFiltradas.reduce((s, c) => s + c.valorTotal, 0) + 
  despesasFiltradas.reduce((s, d) => s + d.valor, 0);

  const elCocos = document.getElementById("gastos-cocos-comprados");
  if (elCocos) elCocos.textContent = totalCocosComprados;

  const elGasto = document.getElementById("gastos-total");
  if (elGasto) elGasto.textContent = formatMoneyShort(totalGasto);

  // Lógica de Saldo de Fornecedores
  const totalDividaGlobal = compras.reduce((s, c) => s + c.valorTotal, 0);
  const totalPagoGlobal = pagFornecedor.reduce((s, p) => s + p.valorPago, 0);
  const saldoFornecedor = totalDividaGlobal - totalPagoGlobal;
  
  const saldoEl = document.getElementById("fornecedor-saldo");
  if(saldoEl) {
    saldoEl.textContent = formatMoney(Math.max(0, saldoFornecedor));
    saldoEl.style.color = saldoFornecedor > 0 ? "var(--danger)" : "var(--positive)";
  }

  // NOVA LÓGICA: Detalhar quem você deve
  const listaSaldosFornecedores = document.getElementById("lista-saldos-fornecedores");
  if (listaSaldosFornecedores) {
    const saldosHtml = fornecedores.map(f => {
       const dev = compras.filter(c => c.fornecedorId === f.id).reduce((s,c)=>s+c.valorTotal,0) - pagFornecedor.filter(p => p.fornecedorId === f.id).reduce((s,p)=>s+p.valorPago,0);
       if (dev <= 0.01) return ""; // Só mostra quem você deve
       return `<div style="display:flex; justify-content:space-between; margin-top:8px; font-size:14px; border-bottom: 1px dashed rgba(0,0,0,0.1); padding-bottom: 4px;">
                 <span>${escapeHtml(f.nome)}</span>
                 <span style="color:var(--danger); font-weight:600">${formatMoney(dev)}</span>
               </div>`;
    }).join("");
    
    listaSaldosFornecedores.innerHTML = saldosHtml ? `<div style="margin-top:12px; font-weight: 500; font-size: 12px; color: #666; text-transform: uppercase;">Detalhes pendentes:</div>${saldosHtml}` : "";
  }

  const timeline = [
    ...comprasFiltradas.map((c) => ({ tipo: "compra", data: c.data, ts: c.criadoEm?.seconds || 0, item: c })),
    ...despesasFiltradas.map((d) => ({ tipo: "despesa", data: d.data, ts: d.criadoEm?.seconds || 0, item: d })),
    ...pagamentosFiltrados.map((p) => ({ tipo: "pag_fornecedor", data: p.data, ts: p.criadoEm?.seconds || 0, item: p }))
  ].sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : b.ts - a.ts));

  const lista = document.getElementById("gastos-lista");
  if (timeline.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">🧾</span><div class="title">Nada registrado</div></div>`;
    return;
  }
  
  lista.innerHTML = timeline.map((t) => {
    if (t.tipo === "compra") {
      const nomeTag = t.item.fornecedorNome ? ` (${escapeHtml(t.item.fornecedorNome)})` : "";
      return `
        <div class="list-item">
          <div class="info">
            <div class="name">🥥 Compra${nomeTag}</div>
            <div class="meta">${formatDateBR(t.item.data)} · ${t.item.quantidade} cocos</div>
          </div>
          <div class="right"><div class="amount" style="color:var(--danger)">${formatMoney(t.item.valorTotal)}</div></div>
          <button style="background:none; border:none; box-shadow:none; font-size:16px; margin-left:10px; padding:8px; cursor:pointer;" data-del-compra="${t.item.id}">❌</button>
        </div>`;
    }
    if (t.tipo === "pag_fornecedor") {
      const nomeTag = t.item.fornecedorNome ? ` (${escapeHtml(t.item.fornecedorNome)})` : "";
      return `
        <div class="list-item">
          <div class="info">
            <div class="name">💸 Pgto Fornecedor${nomeTag}</div>
            <div class="meta">${formatDateBR(t.item.data)}</div>
          </div>
          <div class="right"><div class="amount" style="color:var(--positive)">${formatMoney(t.item.valorPago)}</div></div>
          <button style="background:none; border:none; box-shadow:none; font-size:16px; margin-left:10px; padding:8px; cursor:pointer;" data-del-pagforn="${t.item.id}">❌</button>
        </div>`;
    }
    return `
      <div class="list-item">
        <div class="info">
          <div class="name">🧾 ${escapeHtml(t.item.categoria)}</div>
          <div class="meta">${formatDateBR(t.item.data)}${t.item.descricao ? " · " + escapeHtml(t.item.descricao) : ""}</div>
        </div>
        <div class="right"><div class="amount" style="color:var(--danger)">${formatMoney(t.item.valor)}</div></div>
        <button style="background:none; border:none; box-shadow:none; font-size:16px; margin-left:10px; padding:8px; cursor:pointer;" data-del-despesa="${t.item.id}">❌</button>
      </div>`;
  }).join("");
}
// NOVA FUNÇÃO DE CÁLCULO
function calcularSaldoFornecedor(fornId) {
    const comprado = compras.filter(c => c.fornecedorId === fornId).reduce((s,c) => s + c.valorTotal, 0);
    const pago = pagFornecedor.filter(p => p.fornecedorId === fornId).reduce((s,p) => s + p.valorPago, 0);
    return comprado - pago;
}
function abrirSheetPagamentoFornecedor() {
  if (!fornecedores || fornecedores.length === 0) {
     showToast("Não há fornecedores registados.");
     return;
  }

  const saldos = fornecedores.map(f => {
     const comprado = compras.filter(c => c.fornecedorId === f.id).reduce((s,c) => s + c.valorTotal, 0);
     const pago = pagFornecedor.filter(p => p.fornecedorId === f.id).reduce((s,p) => s + p.valorPago, 0);
     return { id: f.id, nome: f.nome, saldo: comprado - pago };
  });
  
  const compradoAntigo = compras.filter(c => !c.fornecedorId).reduce((s,c) => s + c.valorTotal, 0);
  const pagoAntigo = pagFornecedor.filter(p => !p.fornecedorId).reduce((s,p) => s + p.valorPago, 0);
  const saldoAntigo = compradoAntigo - pagoAntigo;
  
  if (saldoAntigo > 0 || compradoAntigo > 0) {
     saldos.push({ id: "antigo", nome: "Fornecedor Antigo / Desconhecido", saldo: saldoAntigo });
  }

  const optionsHTML = saldos.map(s => {
     const valorExibicao = s.saldo > 0 ? `(Deve: ${formatMoney(s.saldo)})` : "(Quitado)";
     return `<option value="${s.id}">${escapeHtml(s.nome)} ${valorExibicao}</option>`;
  }).join("");

  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>Pagar Fornecedor</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="field">
      <label>Para quem é o pagamento?</label>
      <select id="pf-fornecedor">${optionsHTML}</select>
    </div>
    <div class="field">
      <label>Valor do Pagamento (R$)</label>
      <input type="number" id="pf-valor" inputmode="decimal" min="0" step="0.01" placeholder="Ex: 500.00">
    </div>
    <div class="field">
      <label>Data</label>
      <input type="date" id="pf-data" value="${todayKey()}">
    </div>
    <button class="btn btn-primary" id="btn-salvar-pf">Confirmar Pagamento</button>
  `;
  document.getElementById("btn-salvar-pf").addEventListener("click", salvarPagamentoFornecedor);
  abrirSheet();
}

async function salvarPagamentoFornecedor() {
  const fornId = document.getElementById("pf-fornecedor").value;
  const valorInput = document.getElementById("pf-valor").value.replace(",", ".");
  const valorPago = parseFloat(valorInput);
  const data = document.getElementById("pf-data").value || todayKey();

  if (!valorPago || valorPago <= 0) { 
    showToast("Digite um valor válido"); 
    return; 
  }

  let fornecedorNome = "Fornecedor Antigo / Desconhecido";
  if (fornId !== "antigo") {
    const f = fornecedores.find(x => x.id === fornId);
    if (f) fornecedorNome = f.nome;
  }

  if (!confirm(`Confirma o pagamento de ${formatMoney(valorPago)} para ${fornecedorNome}?`)) return;

  const btn = document.getElementById("btn-salvar-pf");
  if (btn) btn.disabled = true;

  const user = firebase.auth().currentUser;
  const emailUsuario = user ? user.email : "Desconhecido";

  try {
    await db.collection("pagamentos_fornecedor").add({
      fornecedorId: fornId === "antigo" ? null : fornId,
      fornecedorNome: fornecedorNome,
      data: data,
      valorPago: valorPago,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      registradoPor: emailUsuario
    });

    await registrarLog("PAGAMENTO A FORNECEDOR", `Pagou ${formatMoney(valorPago)} para ${fornecedorNome}`);

    fecharSheet();
    showToast("Pagamento ao fornecedor registrado!");
  } catch (err) {
    showToast("Não foi possível registrar o pagamento.");
    if (btn) btn.disabled = false;
  }
}
// NOVA FUNÇÃO DO WHATSAPP PARA FORNECEDORES
function abrirSheetReciboPagamentoFornecedor(fornecedor, valorPago, saldoRestante) {
  const msg = saldoRestante > 0.01
    ? `Olá ${fornecedor.nome}! Realizamos um pagamento de ${formatMoney(valorPago)} referente às compras de coco. Ainda temos um saldo pendente de ${formatMoney(saldoRestante)}. Muito obrigado! 🥥`
    : `Olá ${fornecedor.nome}! Realizamos o pagamento de ${formatMoney(valorPago)}. Com isso, quitamos o nosso saldo pendente. Muito obrigado! 🥥`;

  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>Avisar ${escapeHtml(fornecedor.nome)}</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="helper-text" style="margin-bottom:14px">Mande o comprovativo de pagamento e o saldo atualizado pelo WhatsApp.</div>
    <button class="btn btn-secondary" id="btn-recibo-forn-whatsapp">Enviar mensagem no WhatsApp</button>
    <button class="btn btn-outline" id="btn-pular-recibo-forn" style="margin-top:10px">Agora não</button>
  `;

  document.getElementById("btn-recibo-forn-whatsapp").addEventListener("click", () => {
    window.open(waLink(fornecedor.telefone, msg), "_blank");
    fecharSheet();
  });
  document.getElementById("btn-pular-recibo-forn").addEventListener("click", fecharSheet);
}
async function excluirPagamentoFornecedor(id) {
  if (!confirm("Excluir este pagamento ao fornecedor? O saldo devedor irá aumentar.")) return;
  try { await db.collection("pagamentos_fornecedor").doc(id).delete(); } catch (e) {}
}

function abrirSheet() {
  document.getElementById("sheet-backdrop").classList.add("open");
}

function fecharSheet() {
  document.getElementById("sheet-backdrop").classList.remove("open");
  document.getElementById("sheet-content").innerHTML = "";
}

function renderDre() {
  const filtraData = (r) => {
    if (drePeriodo === "personalizado") {
      const inicio = document.getElementById("dre-data-inicio").value;
      const fim = document.getElementById("dre-data-fim").value;
      if (inicio && r.data < inicio) return false;
      if (fim && r.data > fim) return false;
      return true;
    }
    const startKey = periodoStartKey(drePeriodo);
    return !startKey || r.data >= startKey;
  };

  const pagFiltrados = pagamentos.filter(filtraData); 
  const compFiltradas = compras.filter(filtraData);
  const despFiltradas = despesas.filter(filtraData);

  const receita = pagFiltrados.reduce((s, p) => s + p.valorPago, 0);
  const custoCocos = compFiltradas.reduce((s, c) => s + c.valorTotal, 0);
  const outrosGastos = despFiltradas.reduce((s, d) => s + d.valor, 0);
  const custosTotais = custoCocos + outrosGastos;
  const lucroLiquido = receita - custosTotais;

  document.getElementById("dre-receita").textContent = formatMoneyShort(receita);
  document.getElementById("dre-custos").textContent = formatMoneyShort(custosTotais);
  
  const lucroEl = document.getElementById("dre-lucro");
  lucroEl.textContent = formatMoney(lucroLiquido);
  lucroEl.style.color = lucroLiquido >= 0 ? "var(--positive)" : "var(--danger)";
  lucroEl.parentElement.style.background = lucroLiquido >= 0 ? "var(--positive-bg)" : "var(--danger-bg)";

  const diasMap = {};
  [...pagFiltrados, ...compFiltradas, ...despFiltradas].forEach(item => {
    if (!diasMap[item.data]) diasMap[item.data] = { receita: 0, custo: 0 };
    
    if (item.clienteId) diasMap[item.data].receita += item.valorPago; 
    else if (item.quantidade) diasMap[item.data].custo += item.valorTotal; 
    else diasMap[item.data].custo += item.valor; 
  });

  const diasSorted = Object.keys(diasMap).sort((a, b) => b.localeCompare(a));
  
  const lista = document.getElementById("dre-lista");
  if (diasSorted.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">📉</span><div class="title">Sem movimento</div></div>`;
    return;
  }

  lista.innerHTML = diasSorted.map(data => {
    const d = diasMap[data];
    const lucroDia = d.receita - d.custo;
    const color = lucroDia >= 0 ? "var(--positive)" : "var(--danger)";
    return `
      <div class="list-item">
        <div class="info">
          <div class="name">${formatDateBR(data)}</div>
          <div class="meta">Receita: ${formatMoney(d.receita)} · Custo: ${formatMoney(d.custo)}</div>
        </div>
        <div class="right">
          <div class="amount" style="color:${color}">${formatMoney(lucroDia)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRelatorioFinanceiro() {
  if (relatorioFinanceiro === "caixa") renderFluxoCaixa();
  else renderDre();
}

function renderFluxoCaixa() {
  const filtraData = (r) => {
    if (drePeriodo === "personalizado") {
      const inicio = document.getElementById("dre-data-inicio").value;
      const fim = document.getElementById("dre-data-fim").value;
      if (inicio && r.data < inicio) return false;
      if (fim && r.data > fim) return false;
      return true;
    }
    const startKey = periodoStartKey(drePeriodo);
    return !startKey || r.data >= startKey;
  };

  const pagamentosFiltrados = pagamentos.filter(filtraData);
  const pagFornFiltrados = pagFornecedor.filter(filtraData);
  const despesasFiltradas = despesas.filter(filtraData);

  const entradas = pagamentosFiltrados.reduce((s, p) => s + p.valorPago, 0);
  const saidas = pagFornFiltrados.reduce((s, p) => s + p.valorPago, 0)
               + despesasFiltradas.reduce((s, d) => s + d.valor, 0);
  const saldo = entradas - saidas;

  document.getElementById("caixa-entradas").textContent = formatMoneyShort(entradas);
  document.getElementById("caixa-saidas").textContent = formatMoneyShort(saidas);

  const saldoEl = document.getElementById("caixa-saldo");
  saldoEl.textContent = formatMoney(saldo);
  saldoEl.style.color = saldo >= 0 ? "var(--positive)" : "var(--danger)";
  saldoEl.parentElement.style.background = saldo >= 0 ? "var(--positive-bg)" : "var(--danger-bg)";

  const diasMap = {};
  const diaDe = (data) => (diasMap[data] || (diasMap[data] = { entrada: 0, saida: 0 }));
  pagamentosFiltrados.forEach((p) => { diaDe(p.data).entrada += p.valorPago; });
  pagFornFiltrados.forEach((p) => { diaDe(p.data).saida += p.valorPago; });
  despesasFiltradas.forEach((d) => { diaDe(d.data).saida += d.valor; });

  const dias = Object.keys(diasMap).sort((a, b) => b.localeCompare(a));
  const lista = document.getElementById("caixa-lista");
  if (dias.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">💵</span><div class="title">Sem movimento de caixa nesse período</div></div>`;
    return;
  }
  lista.innerHTML = dias.map((k) => {
    const d = diasMap[k];
    const saldoDia = d.entrada - d.saida;
    const cor = saldoDia >= 0 ? "var(--positive)" : "var(--danger)";
    return `
      <div class="list-item">
        <div class="info">
          <div class="name">${formatDateBR(k, true)}</div>
          <div class="meta">Entrou ${formatMoney(d.entrada)} · Saiu ${formatMoney(d.saida)}</div>
        </div>
        <div class="right">
          <div class="amount" style="color:${cor}">${formatMoney(saldoDia)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderEstoque() {
  const totalComprado = compras.reduce((s, c) => s + c.quantidade, 0);
  const totalEntregue = entregas.reduce((s, e) => s + e.quantidade, 0);
  const totalAjustes = ajustesEstoque.reduce((s, a) => s + (parseFloat(a.quantidade) || 0), 0);
  const saldoEstoque = totalComprado + totalAjustes - totalEntregue;

  document.getElementById("estoque-atual").textContent = saldoEstoque;
  document.getElementById("estoque-entradas").textContent = totalComprado;
  document.getElementById("estoque-ajustes").textContent = totalAjustes > 0 ? `+${totalAjustes}` : totalAjustes;
  document.getElementById("estoque-saidas").textContent = totalEntregue;

  const timeline = [
    ...compras.map(c => ({ tipo: "entrada", data: c.data, ts: c.criadoEm?.seconds || 0, qtd: c.quantidade, id: c.id })),
    ...entregas.map(e => ({ tipo: "saida", data: e.data, ts: e.criadoEm?.seconds || 0, qtd: e.quantidade, cliente: e.clienteNome, id: e.id })),
    ...ajustesEstoque.map(a => ({ tipo: "ajuste", data: a.data, ts: a.criadoEm?.seconds || 0, qtd: parseFloat(a.quantidade), motivo: a.motivo, id: a.id }))
  ].sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : b.ts - a.ts));

  const lista = document.getElementById("estoque-lista");
  if (timeline.length === 0) {
    lista.innerHTML = `<div class="empty-state"><span class="emoji">📦</span><div class="title">Estoque vazio</div></div>`;
    return;
  }

  lista.innerHTML = timeline.map(t => {
    if (t.tipo === "entrada") {
      return `
        <div class="list-item">
          <div class="info">
            <div class="name">📥 Compra de Fornecedor</div>
            <div class="meta">${formatDateBR(t.data)}</div>
          </div>
          <div class="right"><div class="amount" style="color:var(--positive)">+ ${t.qtd}</div></div>
        </div>`;
    } else if (t.tipo === "saida") {
      return `
        <div class="list-item">
          <div class="info">
            <div class="name">📤 Entrega: ${escapeHtml(t.cliente)}</div>
            <div class="meta">${formatDateBR(t.data)}</div>
          </div>
          <div class="right"><div class="amount" style="color:var(--danger)">- ${t.qtd}</div></div>
        </div>`;
    } else {
      const cor = t.qtd > 0 ? "var(--positive)" : "var(--danger)";
      const sinal = t.qtd > 0 ? "+" : "";
      return `
        <div class="list-item">
          <div class="info">
            <div class="name">⚖️ Ajuste: ${escapeHtml(t.motivo)}</div>
            <div class="meta">${formatDateBR(t.data)}</div>
          </div>
          <div class="right"><div class="amount" style="color:${cor}">${sinal}${t.qtd}</div></div>
          <button style="background:none; border:none; box-shadow:none; font-size:16px; margin-left:10px; padding:8px; cursor:pointer;" data-del-ajuste="${t.id}">❌</button>
        </div>`;
    }
  }).join("");
}

function conectarEventos() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  document.getElementById("historico-data-exata").addEventListener("input", () => {
    if (historicoPeriodo === "exata") renderHistorico();
  });

  document.getElementById("historico-data-exata").addEventListener("change", () => {
    if (historicoPeriodo === "exata") renderHistorico();
  });

  document.getElementById("btn-ir-cadastrar").addEventListener("click", () => {
    showView("clientes");
    abrirSheetCliente(null);
  });

  document.getElementById("entrega-cliente").addEventListener("change", atualizarPreviewEntrega);
  document.getElementById("entrega-qtd").addEventListener("input", atualizarPreviewEntrega);
  
  document.getElementById("qtd-menos").addEventListener("click", () => {
    const el = document.getElementById("entrega-qtd");
    el.value = Math.max(0, (parseFloat(el.value) || 0) - 1);
    atualizarPreviewEntrega();
  });
  
  document.getElementById("qtd-mais").addEventListener("click", () => {
    const el = document.getElementById("entrega-qtd");
    el.value = (parseFloat(el.value) || 0) + 1;
    atualizarPreviewEntrega();
  });
  
  document.getElementById("btn-salvar-entrega").addEventListener("click", salvarEntrega);
  document.getElementById("entrega-data").value = todayKey();

  document.getElementById("hoje-lista").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-del-entrega]");
    if (btn) excluirEntrega(btn.dataset.delEntrega);
  });

  document.getElementById("busca-cliente").addEventListener("input", renderClientes);
  document.getElementById("fab-add-cliente").addEventListener("click", () => abrirSheetCliente(null));
  
  document.getElementById("clientes-lista").addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-editar-cliente]");
    if (row) abrirSheetCliente(row.dataset.editarCliente);
  });

  document.querySelectorAll("[data-filter-pag]").forEach((chip) => {
    chip.addEventListener("click", () => {
      pagamentosFiltro = chip.dataset.filterPag;
      document.querySelectorAll("[data-filter-pag]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderPagamentos();
    });
  });
  
  document.getElementById("pagamentos-lista").addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-registrar-pagamento]");
    if (row) abrirSheetPagamento(row.dataset.registrarPagamento);
  });

  document.getElementById("historico-cliente").addEventListener("change", (ev) => {
    historicoClienteId = ev.target.value;
    renderHistorico();
  });
  
  document.querySelectorAll("[data-periodo]").forEach((chip) => {
    chip.addEventListener("click", () => {
      historicoPeriodo = chip.dataset.periodo;
      document.querySelectorAll("[data-periodo]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const campoData = document.getElementById("campo-historico-data");
      campoData.style.display = historicoPeriodo === "exata" ? "block" : "none";
      if (historicoPeriodo === "exata" && !document.getElementById("historico-data-exata").value) {
        document.getElementById("historico-data-exata").value = todayKey();
      }
      renderHistorico();
    });
  });
  
  document.getElementById("historico-lista-card").addEventListener("click", (ev) => {
    const delPagamento = ev.target.closest("[data-del-pagamento]");
    if (delPagamento) excluirPagamento(delPagamento.dataset.delPagamento);
  });
  
  document.getElementById("compra-qtd").addEventListener("input", aoMudarQtdCompra);
  document.getElementById("compra-fornecedor").addEventListener("change", aoMudarQtdCompra);
  
  document.getElementById("btn-add-fornecedor").addEventListener("click", () => abrirSheetFornecedor(null));
  document.getElementById("btn-cadastrar-primeiro-forn").addEventListener("click", () => abrirSheetFornecedor(null));
  document.getElementById("btn-edit-fornecedor").addEventListener("click", () => {
    const id = document.getElementById("compra-fornecedor").value;
    if(id) abrirSheetFornecedor(id);
  });

  document.getElementById("compra-data").value = todayKey();
  document.getElementById("btn-salvar-compra").addEventListener("click", salvarCompra);
  document.getElementById("btn-salvar-despesa").addEventListener("click", salvarDespesa);

  document.getElementById("gastos-lista").addEventListener("click", (ev) => {
    const delCompra = ev.target.closest("[data-del-compra]");
    if (delCompra) excluirCompra(delCompra.dataset.delCompra);

    const delDespesa = ev.target.closest("[data-del-despesa]");
    if (delDespesa) excluirDespesa(delDespesa.dataset.delDespesa);

    const delPagForn = ev.target.closest("[data-del-pagforn]");
    if (delPagForn) excluirPagamentoFornecedor(delPagForn.dataset.delPagforn);
  });

  document.querySelectorAll("[data-periodo-gastos]").forEach((chip) => {
    chip.addEventListener("click", () => {
      gastosPeriodo = chip.dataset.periodoGastos;
      document.querySelectorAll("[data-periodo-gastos]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderGastos();
    });
  });

  // --- NOVOS EVENTOS DO ESTOQUE AQUI ---
  const btnAjustarEstoque = document.getElementById("btn-ajustar-estoque");
  if (btnAjustarEstoque) btnAjustarEstoque.addEventListener("click", abrirSheetAjusteEstoque);

  const listaEstoqueCard = document.getElementById("estoque-lista-card");
  if (listaEstoqueCard) {
    listaEstoqueCard.addEventListener("click", (ev) => {
      const btnDel = ev.target.closest("[data-del-ajuste]");
      if (btnDel) excluirAjusteEstoque(btnDel.dataset.delAjuste);
    });
  }
  // -------------------------------------

  document.getElementById("sheet-backdrop").addEventListener("click", (ev) => {});
  document.getElementById("sheet-content").addEventListener("click", (ev) => {
    if (ev.target.closest("[data-close-sheet]")) fecharSheet();
  });

  const syncDot = document.getElementById("sync-dot");
  const atualizarStatus = () => {
    syncDot.classList.toggle("online", navigator.onLine);
    syncDot.title = navigator.onLine ? "online" : "offline - salvando localmente";
  };
  window.addEventListener("online", atualizarStatus);
  window.addEventListener("offline", atualizarStatus);
  atualizarStatus();
}

function iniciarListenersGastos() {
  if (!unsubFornecedores) {
    unsubFornecedores = db.collection("fornecedores").orderBy("nome").onSnapshot((snap) => {
      fornecedores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (typeof popularSelectFornecedores === "function") popularSelectFornecedores();
    });
  }

  if (unsubCompras) return; 

  unsubCompras = db.collection("compras").orderBy("data", "desc").onSnapshot((snap) => {
    compras = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (currentView === "gastos") renderGastos();
    if (currentView === "dre") renderRelatorioFinanceiro();
    if (currentView === "estoque") renderEstoque();
    if (currentView === "entregar") renderEntregar(); 
  });

  unsubDespesas = db.collection("despesas").orderBy("data", "desc").onSnapshot((snap) => {
    despesas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (currentView === "gastos") renderGastos();
    if (currentView === "dre") renderRelatorioFinanceiro();
  });

  unsubPagFornecedor = db.collection("pagamentos_fornecedor").orderBy("data", "desc").onSnapshot((snap) => {
    pagFornecedor = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (currentView === "gastos") renderGastos();
    if (currentView === "dre") renderRelatorioFinanceiro();
  });
}
function abrirSheetAjusteEstoque() {
  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>Ajustar Estoque</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="helper-text" style="margin-bottom:14px">Adicione cocos de brinde ou remova cocos estragados. O financeiro (DRE e caixa) não será afetado.</div>
    <div class="field">
      <label>Quantidade (use o sinal de - para remover)</label>
      <input type="number" id="ajuste-qtd" placeholder="Ex: 9 (para brinde) ou -5 (para perda)">
    </div>
    <div class="field">
      <label>Motivo do ajuste</label>
      <input type="text" id="ajuste-motivo" placeholder="Ex: Brinde do fornecedor X">
    </div>
    <div class="field">
      <label>Data</label>
      <input type="date" id="ajuste-data" value="${todayKey()}">
    </div>
    <button class="btn btn-primary" id="btn-salvar-ajuste">Salvar Ajuste</button>
  `;
  document.getElementById("btn-salvar-ajuste").addEventListener("click", salvarAjusteEstoque);
  abrirSheet();
}

async function salvarAjusteEstoque() {
  const qtd = parseFloat(document.getElementById("ajuste-qtd").value);
  const motivo = document.getElementById("ajuste-motivo").value.trim() || "Ajuste manual";
  const data = document.getElementById("ajuste-data").value || todayKey();

  if (!qtd || qtd === 0) { showToast("Digite uma quantidade válida."); return; }

  const acao = qtd > 0 ? "adicionar" : "remover";
  if (!confirm(`Confirma ${acao} ${Math.abs(qtd)} cocos no estoque?`)) return;

  const btn = document.getElementById("btn-salvar-ajuste");
  btn.disabled = true;

  try {
    await db.collection("ajustes_estoque").add({
      quantidade: qtd,
      motivo: motivo,
      data: data,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    await registrarLog("AJUSTE DE ESTOQUE", `${qtd > 0 ? '+' : ''}${qtd} cocos (${motivo})`);
    fecharSheet();
    showToast("Estoque atualizado!");
  } catch (err) {
    showToast("Erro ao salvar ajuste.");
    btn.disabled = false;
  }
}

async function excluirAjusteEstoque(id) {
  if (!confirm("Excluir este ajuste de estoque?")) return;
  try { await db.collection("ajustes_estoque").doc(id).delete(); } catch (e) {}
}
window.iniciarApp = function () {
  conectarEventos();
  
  if (window.currentRole === "admin") {
    const tabGastos = document.getElementById("tab-gastos");
    const tabDre = document.getElementById("tab-dre");
    const tabEstoque = document.getElementById("tab-estoque"); 
    if (tabGastos) tabGastos.style.display = "flex";
    if (tabDre) tabDre.style.display = "flex";
    if (tabEstoque) tabEstoque.style.display = "flex"; 
  }

  const btnPagarForn = document.getElementById("btn-pagar-fornecedor");
  if(btnPagarForn) btnPagarForn.addEventListener("click", abrirSheetPagamentoFornecedor);

  document.querySelectorAll("[data-periodo-dre]").forEach((chip) => {
    chip.addEventListener("click", () => {
      drePeriodo = chip.dataset.periodoDre;
      document.querySelectorAll("[data-periodo-dre]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      
      const campoPeriodo = document.getElementById("campo-dre-periodo");
      if (campoPeriodo) {
        campoPeriodo.style.display = drePeriodo === "personalizado" ? "flex" : "none";
        if (drePeriodo === "personalizado") {
          const hoje = todayKey();
          if (!document.getElementById("dre-data-inicio").value) document.getElementById("dre-data-inicio").value = hoje;
          if (!document.getElementById("dre-data-fim").value) document.getElementById("dre-data-fim").value = hoje;
        }
      }
      renderRelatorioFinanceiro();
    });
  });

  ["dre-data-inicio", "dre-data-fim"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", renderRelatorioFinanceiro);
      el.addEventListener("input", renderRelatorioFinanceiro);
    }
  });

  iniciarListeners();
  showView("entregar");
  
  document.querySelectorAll("[data-relatorio]").forEach((chip) => {
    chip.addEventListener("click", () => {
      relatorioFinanceiro = chip.dataset.relatorio;
      document.querySelectorAll("[data-relatorio]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      document.getElementById("bloco-dre").style.display = relatorioFinanceiro === "dre" ? "block" : "none";
      document.getElementById("bloco-caixa").style.display = relatorioFinanceiro === "caixa" ? "block" : "none";
      renderRelatorioFinanceiro();
    });
  });
};