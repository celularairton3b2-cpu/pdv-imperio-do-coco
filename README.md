# Coco da Praia / Império do Coco 🥥

App Web Progressivo (PWA) e Sistema de Gestão Empresarial (ERP de nicho) desenvolvido para controlar toda a operação de uma distribuidora de coco verde: desde o controle físico do estoque e entregas até a gestão financeira avançada com DRE e fluxo de caixa.

## Principais Funcionalidades 🚀

* **Gestão de Clientes e Entregas:** Precificação individualizada por cliente. O aplicativo trava o preço no momento da entrega, preservando o histórico mesmo se o preço do cliente mudar no futuro.
* **Controle Financeiro Avançado:** 
  * **Fluxo de Caixa:** Acompanhamento de entradas (recebimentos de clientes) e saídas (pagamentos a fornecedores e despesas extras).
  * **DRE (Demonstração do Resultado):** Cálculo automático de lucro líquido separando o custo das mercadorias vendidas das despesas operacionais.
* **Gestão de Estoque Inteligente:** Controle de entradas (compras) e saídas (entregas). Inclui um sistema isolado de **Ajuste de Estoque** para perdas ou "brindes" de fornecedores, que ajusta o inventário físico sem adulterar o custo financeiro.
* **Acerto com Fornecedores:** Controle de saldo devedor individualizado por fornecedor, permitindo pagamentos parciais e visão clara de quem a empresa deve.
* **Integração com WhatsApp e CRM:** Geração de links dinâmicos e públicos (`extrato.html`) para os clientes acompanharem as suas dívidas em tempo real. Botões de ação rápida para envio de recibos, avisos de entrega e cobranças diretamente pelo WhatsApp.
* **Auditoria Integrada:** Sistema de logs imutáveis que registra quem fez o quê e quando (ex: pagamentos, exclusões, ajustes), garantindo transparência na operação de rua.

## Estrutura do Projeto 📂

```text
coco-app/
├── firebase.json           # Configuração do Firebase Hosting
├── firestore.rules         # Regras de segurança rigorosas do banco de dados
├── firestore.indexes.json  # Índices para buscas rápidas e ordenação
├── .firebaserc             # ID do projeto Firebase (preenchido pelo `firebase init`)
└── public/                 # Diretório de produção (Firebase Hosting)
    ├── index.html          # Interface principal
    ├── extrato.html        # Página pública de saldo para o cliente final
    ├── manifest.json       # Torna o app instalável no celular (PWA)
    ├── service-worker.js   # Cache para carregamento rápido / offline
    ├── css/style.css       # Estilos globais e responsivos
    ├── js/
    │   ├── firebase-config.js   # <-- Suas credenciais do Firebase vão aqui
    │   └── app.js               # Lógica de negócio e manipulação do DOM
    └── icons/
```

## Como rodar e publicar ⚙️

Após clonar o repositório e configurar as suas chaves no `js/firebase-config.js`, execute os comandos abaixo no seu terminal:

```bash
npm install -g firebase-tools
firebase login
firebase init        # Selecione Hosting + Firestore, defina a pasta como "public"
firebase deploy      # Envia para a nuvem
```

## Login e Controle de Acesso 🔐

O login diário da operação é feito com **usuário e senha** para agilizar o acesso dos entregadores. O Google SignIn é utilizado apenas **uma vez** como validação de identidade na criação de novas contas, bloqueando o cadastro de desconhecidos.

Qualquer nova conta é criada com o status **"pendente"** e requer aprovação de um Administrador.

### Configuração Inicial no Firebase (Setup)
1. No Firebase Console, acesse **Authentication > Sign-in method**. Ative **Google** e **E-mail/senha**.
2. Crie a sua própria conta através da tela inicial do aplicativo. Você verá a mensagem "Aguardando aprovação".
3. No Firebase Console, acesse **Firestore Database > coleção `usuarios`**, abra o seu documento recém-criado e altere manualmente o campo `role` de `"pendente"` para `"admin"`.
4. A partir deste momento, você pode gerenciar, aprovar e promover novos usuários diretamente pela interface do aplicativo.

### Níveis de Acesso (Roles)
- `pendente`: Sem permissão de leitura ou escrita.
- `padrao`: Acesso operacional de rua. Pode registrar entregas e visualizar listas de clientes. Não acessa DRE, controle de compras, nem pagamentos a fornecedores.
- `admin`: Acesso gerencial completo. Pode alterar configurações, registrar pagamentos, gerir estoque, consultar relatórios financeiros e gerenciar a equipe.

*Nota técnica: Como o "usuário" de login não é um e-mail real, não há fluxo de recuperação de senha por e-mail. Se um funcionário perder a senha, o Administrador deve excluir o cadastro antigo e solicitar que ele crie um novo.*

## Regras de Negócio Importantes 💡

- O saldo financeiro de cada cliente/fornecedor é calculado em tempo real pela fórmula: `(Total Entregue/Comprado) − (Total Pago)`. Não são armazenados saldos estáticos no banco para evitar dessincronização de dados.
- Todo e qualquer pagamento (seja entrada de cliente ou saída para fornecedor) exige vínculo com a data em que ocorreu, impactando diretamente o Demonstrativo de Resultado (DRE) daquele mês específico.
- Registros de exclusão (deletar uma entrega ou pagamento) desfazem a operação financeira e geram um log automático rastreável com o e-mail do autor da ação.
