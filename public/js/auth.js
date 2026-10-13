// ============================================================
// AUTENTICAÇÃO E CONTROLE DE ACESSO
// ============================================================
// Fluxo:
//  1) Login do dia a dia é feito com USUÁRIO + SENHA (Firebase
//     Authentication por e-mail/senha, usando um e-mail "de mentira"
//     gerado a partir do usuário escolhido - explicado abaixo).
//  2) Pra CRIAR uma conta nova, a pessoa primeiro confirma que tem uma
//     conta Google de verdade (isso é só um filtro contra gente
//     aleatória se cadastrando; a conta Google não fica guardada nem é
//     usada de novo depois).
//  3) Depois da verificação, ela escolhe um usuário e uma senha - isso
//     cria a conta real (Firebase Auth por e-mail/senha), que fica
//     "pendente" até um admin aprovar (igual antes).
//
// `db`, `auth` e `googleProvider` vêm de firebase-config.js.
// Funções como escapeHtml, showToast, abrirSheet, fecharSheet, showView
// e window.iniciarApp vêm de js/app.js (carregado antes deste arquivo).

let appJaIniciado = false;
let usuarioAtual = null;        // usuário atual do Firebase Auth (email/senha)
let perfilAtual = null;         // doc de usuarios/{uid}
let unsubPerfil = null;
let unsubListaUsuarios = null;
let todosUsuarios = [];

let modoCadastro = false;       // true enquanto o fluxo "criar conta" está em andamento
let googleEmailCapturado = "";  // guardado só pra referência do admin, não é usado pra logar

window.currentRole = null;

// O Firebase Auth por e-mail/senha exige um e-mail. Como a pessoa só
// digita um "usuário" simples, a gente monta um e-mail interno com esse
// domínio fixo - ele nunca precisa existir de verdade nem receber nada.
const DOMINIO_INTERNO = "imperadordococo.local";

// ---------- utilidades ----------

function paraEmailInterno(usuario) {
  const limpo = String(usuario || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // tira acento
    .replace(/[^a-z0-9._-]/g, "");
  return `${limpo}@${DOMINIO_INTERNO}`;
}

function usuarioValido(usuario) {
  return /^[a-z0-9._-]{3,20}$/i.test(usuario || "");
}

function mostrarTela(id) {
  ["screen-login", "screen-criar-google", "screen-completar", "screen-aguardando", "app"].forEach((t) => {
    document.getElementById(t).style.display = t === id ? "flex" : "none";
  });
}

function mostrarErro(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = "block";
}

function logout() {
  appJaIniciado = false;
  modoCadastro = false;
  auth.signOut();
}

// ---------- perfil (usuarios/{uid}) em tempo real ----------

function escutarPerfil(uid) {
  if (unsubPerfil) { unsubPerfil(); unsubPerfil = null; }
  unsubPerfil = db.collection("usuarios").doc(uid).onSnapshot((doc) => {
    if (!doc.exists) {
      // não deveria acontecer no fluxo novo (o perfil é criado junto com
      // a conta), mas por segurança volta pro login.
      mostrarTela("screen-login");
      return;
    }
    perfilAtual = { id: doc.id, ...doc.data() };
    rotearPorRole();
  }, (err) => console.error("Erro ao carregar perfil:", err));
}

function rotearPorRole() {
  if (perfilAtual.role === "pendente") {
    window.currentRole = null;
    document.getElementById("aguardando-texto").textContent =
      `Oi, ${perfilAtual.nome}! Seu cadastro foi enviado. Peça para um administrador liberar seu acesso no app.`;
    mostrarTela("screen-aguardando");
    return;
  }

  window.currentRole = perfilAtual.role; // "padrao" ou "admin"
  mostrarTela("app");

  const inicial = document.getElementById("topbar-user-inicial");
  inicial.textContent = (perfilAtual.nome || "?").trim().charAt(0).toUpperCase();
  
  // O botão de usuários saiu, controlamos apenas a aba de gastos
  document.getElementById("tab-gastos").style.display = perfilAtual.role === "admin" ? "flex" : "none";

  if (!appJaIniciado) {
    appJaIniciado = true;
    window.iniciarApp();
  } else {
    showView(typeof currentView !== "undefined" ? currentView : "entregar");
  }

  if (perfilAtual.role === "admin") {
    iniciarListaUsuarios();
    if (typeof iniciarListenersGastos === "function") iniciarListenersGastos();
  }
}

// ---------- estado de login (Firebase Auth) ----------

function iniciarAuth() {
  auth.onAuthStateChanged((user) => {
    usuarioAtual = user;

    if (modoCadastro) return; // o fluxo de criação de conta comanda as telas sozinho

    if (unsubListaUsuarios) { unsubListaUsuarios(); unsubListaUsuarios = null; }

    if (!user) {
      if (unsubPerfil) { unsubPerfil(); unsubPerfil = null; }
      perfilAtual = null;
      window.currentRole = null;
      mostrarTela("screen-login");
      return;
    }

    escutarPerfil(user.uid);
  });
}

// ---------- login (usuário + senha) ----------

function conectarLogin() {
  document.getElementById("btn-login-entrar").addEventListener("click", async () => {
    const usuario = document.getElementById("login-usuario").value.trim();
    const senha = document.getElementById("login-senha").value;
    document.getElementById("login-erro").style.display = "none";

    if (!usuario || !senha) {
      mostrarErro("login-erro", "Preencha usuário e senha.");
      return;
    }

    const btn = document.getElementById("btn-login-entrar");
    btn.disabled = true;
    try {
      await auth.signInWithEmailAndPassword(paraEmailInterno(usuario), senha);
      // onAuthStateChanged cuida do resto
    } catch (err) {
      console.error(err);
      mostrarErro("login-erro", "Usuário ou senha incorretos.");
    }
    btn.disabled = false;
  });

  document.getElementById("link-ir-criar-conta").addEventListener("click", (ev) => {
    ev.preventDefault();
    mostrarTela("screen-criar-google");
  });

  document.getElementById("btn-voltar-login-1").addEventListener("click", () => {
    mostrarTela("screen-login");
  });
}

// ---------- criar conta: passo 1 (verificar com Google) ----------

function conectarCriarConta() {
  document.getElementById("btn-google-verificar").addEventListener("click", async () => {
    modoCadastro = true;
    const btn = document.getElementById("btn-google-verificar");
    btn.disabled = true;
    try {
      const resultado = await auth.signInWithPopup(googleProvider);
      googleEmailCapturado = resultado.user.email || "";
      await resultado.user.delete(); // só confirmamos a identidade, não guardamos essa conta
    } catch (err) {
      console.error(err);
      modoCadastro = false;
      btn.disabled = false;
      if (err.code !== "auth/popup-closed-by-user") {
        alert("Não foi possível confirmar com o Google. Tente de novo.");
      }
      return;
    }
    btn.disabled = false;
    document.getElementById("c-nome").value = "";
    document.getElementById("c-usuario").value = "";
    document.getElementById("c-senha").value = "";
    document.getElementById("c-senha2").value = "";
    document.getElementById("completar-erro").style.display = "none";
    mostrarTela("screen-completar");
  });

  // ---------- criar conta: passo 2 (usuário e senha) ----------

  document.getElementById("btn-completar-cadastro").addEventListener("click", async () => {
    document.getElementById("completar-erro").style.display = "none";
    const nome = document.getElementById("c-nome").value.trim();
    const usuario = document.getElementById("c-usuario").value.trim();
    const senha = document.getElementById("c-senha").value;
    const senha2 = document.getElementById("c-senha2").value;

    if (!nome) return mostrarErro("completar-erro", "Digite seu nome.");
    if (!usuarioValido(usuario)) return mostrarErro("completar-erro", "Usuário deve ter de 3 a 20 letras/números, sem espaço ou acento.");
    if (senha.length < 6) return mostrarErro("completar-erro", "A senha precisa ter pelo menos 6 caracteres.");
    if (senha !== senha2) return mostrarErro("completar-erro", "As senhas não são iguais.");

    const btn = document.getElementById("btn-completar-cadastro");
    btn.disabled = true;
    try {
      const emailInterno = paraEmailInterno(usuario);
      const cred = await auth.createUserWithEmailAndPassword(emailInterno, senha);
      await db.collection("usuarios").doc(cred.user.uid).set({
        uid: cred.user.uid,
        usuario: usuario.toLowerCase(),
        nome,
        emailInterno,
        googleEmailVerificado: googleEmailCapturado,
        role: "pendente",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
      googleEmailCapturado = "";
      modoCadastro = false;
      usuarioAtual = cred.user;
      escutarPerfil(cred.user.uid);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        mostrarErro("completar-erro", "Esse usuário já está em uso. Escolha outro.");
      } else if (err.code === "auth/weak-password") {
        mostrarErro("completar-erro", "Senha muito fraca. Use pelo menos 6 caracteres.");
      } else {
        mostrarErro("completar-erro", `Não foi possível concluir o cadastro (${err.code || err.message || "erro desconhecido"}). Tente de novo.`);
      }
    }
    btn.disabled = false;
  });

  document.getElementById("btn-cancelar-completar").addEventListener("click", () => {
    modoCadastro = false;
    googleEmailCapturado = "";
    mostrarTela("screen-login");
  });
}

// ---------- painel de usuários (só admin) ----------

function iniciarListaUsuarios() {
  if (unsubListaUsuarios) return;
  unsubListaUsuarios = db.collection("usuarios").orderBy("criadoEm", "asc").onSnapshot((snap) => {
    todosUsuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Verifica se o ID novo está aberto no menu
    if (document.getElementById("modal-usuarios-lista")) {
      renderUsuarios();
    }
  }, (err) => console.error("Erro ao carregar usuários:", err));
}

function renderUsuarios() {
  // Alterado para procurar o novo ID exclusivo do menu da conta
  const lista = document.getElementById("modal-usuarios-lista");
  if (!lista) return;
  if (todosUsuarios.length === 0) {
    lista.innerHTML = `<div class="empty-state"><div class="desc">Ainda não há ninguém cadastrado.</div></div>`;
    return;
  }
  const rotulos = { pendente: "Aguardando aprovação", padrao: "Padrão (visualização)", admin: "Administrador" };
  lista.innerHTML = todosUsuarios.map((u) => {
    const badgeClass = u.role === "admin" ? "positive" : u.role === "pendente" ? "pending" : "zero";
    const souEu = usuarioAtual && u.id === usuarioAtual.uid;
    return `
      <div class="list-item">
        <div class="info">
          <div class="name">${escapeHtml(u.nome)}${souEu ? " (você)" : ""}</div>
          <div class="meta">usuário: ${escapeHtml(u.usuario || "")}${u.googleEmailVerificado ? " · verificado: " + escapeHtml(u.googleEmailVerificado) : ""}</div>
          <span class="badge ${badgeClass}" style="margin-top:6px;display:inline-block">${rotulos[u.role] || u.role}</span>
        </div>
        <div class="right">
          <select data-mudar-role="${u.id}" ${souEu ? "disabled" : ""}>
            <option value="pendente" ${u.role === "pendente" ? "selected" : ""}>Aguardando</option>
            <option value="padrao" ${u.role === "padrao" ? "selected" : ""}>Padrão</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </div>
      </div>
    `;
  }).join("");
}

async function mudarRoleUsuario(uid, novaRole) {
  try {
    await db.collection("usuarios").doc(uid).update({ role: novaRole });
    showToast("Acesso atualizado!");
  } catch (err) {
    console.error(err);
    showToast("Não foi possível atualizar. Tente de novo.");
  }
}

// ---------- "Minha conta" (menu no topo) ----------

function abrirMenuConta() {
  const rotulos = { padrao: "Padrão (visualização)", admin: "Administrador" };
  
  let painelAdminHTML = "";
  if (perfilAtual.role === "admin") {
    painelAdminHTML = `
      <hr class="divider">
      <div class="section-title" style="margin-top: 16px; margin-bottom: 8px;">Quem tem acesso ao app</div>
      <div class="card" style="padding: 0; box-shadow: none; border: 1px solid var(--border); margin-bottom: 16px;">
        <div id="modal-usuarios-lista"></div>
      </div>
    `;
  }

  document.getElementById("sheet-content").innerHTML = `
    <div class="sheet-header">
      <h2>Minha conta</h2>
      <button class="sheet-close" data-close-sheet>✕</button>
    </div>
    <div class="field">
      <div class="name" style="font-size:17px">${escapeHtml(perfilAtual.nome)}</div>
      <div class="meta">usuário: ${escapeHtml(perfilAtual.usuario || "")}</div>
      <span class="badge ${perfilAtual.role === "admin" ? "positive" : "zero"}" style="margin-top:8px;display:inline-block">${rotulos[perfilAtual.role] || perfilAtual.role}</span>
    </div>
    
    ${painelAdminHTML}
    
    <hr class="divider">
    <div class="field">
      <label for="np-senha">Nova senha</label>
      <input type="password" id="np-senha" placeholder="Mínimo 6 caracteres">
    </div>
    <div class="field">
      <label for="np-senha2">Confirmar nova senha</label>
      <input type="password" id="np-senha2" placeholder="Repita a senha">
    </div>
    <div class="helper-text" id="trocar-senha-erro" style="display:none;color:var(--danger)"></div>
    <button class="btn btn-secondary" id="btn-trocar-senha">Trocar senha</button>
    <button class="btn btn-outline" id="btn-sair-conta" style="margin-top:10px">Sair da conta</button>
  `;
  
  document.getElementById("btn-trocar-senha").addEventListener("click", trocarSenha);
  document.getElementById("btn-sair-conta").addEventListener("click", () => { fecharSheet(); logout(); });
  
  if (perfilAtual.role === "admin") {
    renderUsuarios();
    
    const listaEl = document.getElementById("modal-usuarios-lista");
    if(listaEl) {
      listaEl.addEventListener("change", (ev) => {
        const sel = ev.target.closest("[data-mudar-role]");
        if (sel) mudarRoleUsuario(sel.dataset.mudarRole, sel.value);
      });
    }
  }

  abrirSheet();
}

async function trocarSenha() {
  const s1 = document.getElementById("np-senha").value;
  const s2 = document.getElementById("np-senha2").value;
  document.getElementById("trocar-senha-erro").style.display = "none";
  if (s1.length < 6) return mostrarErro("trocar-senha-erro", "A senha precisa ter pelo menos 6 caracteres.");
  if (s1 !== s2) return mostrarErro("trocar-senha-erro", "As senhas não coincidem.");
  try {
    await usuarioAtual.updatePassword(s1);
    showToast("Senha atualizada!");
    fecharSheet();
  } catch (err) {
    console.error(err);
    if (err.code === "auth/requires-recent-login") {
      mostrarErro("trocar-senha-erro", "Por segurança, saia e entre de novo antes de trocar a senha.");
    } else {
      mostrarErro("trocar-senha-erro", "Não foi possível trocar a senha.");
    }
  }
}

// ---------- eventos gerais ----------

function conectarEventosAuth() {
  conectarLogin();
  conectarCriarConta();

  document.getElementById("btn-sair-aguardando").addEventListener("click", logout);
  document.getElementById("btn-menu-usuario").addEventListener("click", abrirMenuConta);
  
  // Retirámos daqui o event listener do "usuarios-lista", pois agora
  // ele é injetado diretamente ao abrir o menu da conta.
}

document.addEventListener("DOMContentLoaded", () => {
  conectarEventosAuth();
  iniciarAuth();
});
