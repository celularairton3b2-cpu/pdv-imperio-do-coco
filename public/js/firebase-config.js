// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================
// Troque os valores abaixo pelos do SEU projeto Firebase.
// Onde encontrar: Firebase Console > Configurações do projeto
// (ícone de engrenagem) > geral > "Seus apps" > app Web > SDK setup.
// ============================================================

const firebaseConfig = {
  apiKey: "XXXXXXXXXXXXXXXXXXX",
  authDomain: "XXXXXXXXXXXXXXXXXX",
  projectId: "XXXXXXXXXXXXXXX",
  storageBucket: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  messagingSenderId: "XXXXXXXXXXXXX",
  appId: "XXXXXXXXXXXXXXXXXXX"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Ativa cache offline: se a internet cair na praia, o app continua
// mostrando os últimos dados carregados e guarda as ações para
// sincronizar quando a conexão voltar.
try {
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
} catch (e) {
  // navegador não suporta - segue sem cache offline avançado
}

// OBS: o login agora é feito com conta Google (veja js/auth.js).
// Cada pessoa aprovada também cadastra um nome + senha de identificação
// dentro do app, guardados na coleção "usuarios" do Firestore.
