# Coco da Praia 🥥

App web (PWA) para controlar entregas, preços por cliente e pagamentos de coco verde.

## Estrutura

```
coco-app/
├── firebase.json          # configuração do Firebase Hosting
├── firestore.rules        # regras de segurança do banco
├── firestore.indexes.json
├── .firebaserc             # id do projeto Firebase (preenchido pelo `firebase init`)
└── public/                 # tudo que vai para o ar (Firebase Hosting)
    ├── index.html
    ├── manifest.json       # torna o app instalável no celular
    ├── service-worker.js   # cache para abrir rápido / offline
    ├── css/style.css
    ├── js/
    │   ├── firebase-config.js   # <-- coloque aqui as chaves do SEU projeto Firebase
    │   └── app.js               # toda a lógica do app
    └── icons/
```

## Como rodar e publicar

Veja o passo a passo completo enviado junto com este projeto (configurar o
Firebase, testar no VS Code e publicar com `firebase deploy`).

Resumo rápido, depois de configurar `js/firebase-config.js`:

```bash
npm install -g firebase-tools
firebase login
firebase init        # Hosting + Firestore, escolha seu projeto, pasta "public"
firebase deploy
```

## Login e controle de acesso

O login do dia a dia é feito com **usuário e senha** (não precisa de conta
Google toda vez). O Google só aparece **uma vez**, na hora de criar uma
conta nova — é uma verificação rápida pra evitar cadastros de gente
aleatória. Depois disso, ninguém precisa do Google de novo: só usuário
e senha, e a senha fica protegida pelo próprio Firebase Authentication
(a mesma tecnologia por trás do login do Google), não por algo que eu
inventei.

Toda conta nova entra como **"pendente"** — sem acesso nenhum — até um
admin liberar.

**Configuração necessária no Firebase Console (uma vez só):**
1. Authentication > Sign-in method > ative **Google** (usado só na
   verificação de quem está criando conta) e também **E-mail/senha**
   (usado no login do dia a dia).
2. Crie sua própria conta pelo app (toque em "Criar uma agora" na tela
   de login, confirme com o Google, escolha seu usuário e senha). Você
   vai cair na tela "Cadastro enviado! Aguardando aprovação".
3. Vá em Firestore Database > coleção `usuarios` > abra o seu
   documento > mude o campo `role` de `"pendente"` para `"admin"`
   (manualmente, direto no console). Esse é o único passo manual —
   depois disso, você já pode aprovar qualquer outra pessoa direto pela
   aba **Usuários** dentro do app.

**Papéis:**
- `pendente`: acabou de se cadastrar, sem nenhum acesso ainda.
- `padrao`: só visualiza (não pode cadastrar entrega, cliente ou pagamento).
- `admin`: acesso completo, e também vê a aba "Usuários" para aprovar/promover outras pessoas.

**Limitação a saber:** como o "usuário" não é um e-mail de verdade, não
existe "esqueci minha senha" automático. Se alguém esquecer a senha, um
admin precisa apagar o cadastro dela (Firestore > `usuarios` e
Authentication > Users) e pedir pra ela se cadastrar de novo.

## Regras de negócio importantes

- Cada cliente tem seu **próprio preço por coco** (`precoUnitario`), definido no cadastro.
- Cada entrega guarda o preço praticado **no momento da entrega**, então mudar o preço
  de um cliente no futuro não altera o valor de entregas antigas.
- O saldo de cada cliente é sempre **acumulado**: total entregue − total pago.
  Pagamentos parciais são permitidos e o restante fica pendente para a próxima cobrança.
- Excluir um cliente não apaga o histórico de entregas/pagamentos dele, só o tira
  da lista de clientes ativos.
