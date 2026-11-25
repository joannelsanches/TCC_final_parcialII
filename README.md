# StartIF

Sistema de oferta e gerenciamento de estágios exclusivo do **IFSul — Campus Bagé**. A aplicação usa JavaScript, Node.js, Express, EJS, CSS, MongoDB/Mongoose e autenticação por sessões persistentes.

## Instalação

Requisitos: Node.js **22 ou superior**, npm e MongoDB com **replica set**, ou MongoDB Atlas. O cadastro e outras operações utilizam transações.

```bash
npm ci
```

Se ainda não houver configuração local, copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

No PowerShell, use `Copy-Item .env.example .env`. Preserve um `.env` existente e os arquivos privados em `uploads/` ao atualizar a aplicação.

Configure `MONGODB_URI`, `SESSION_SECRET` e `URL_BASE`. As instruções para MongoDB local e Atlas estão em [docs/BANCO.md](docs/BANCO.md). Para gerar o segredo de sessão:

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'));"
```

## Inicializar e executar

```bash
npm run inicializar:instituicao
npm run criar-admin
npm start
```

A inicialização institucional é repetível: mantém a referência única de Bagé e disponibiliza uma área de TI e o curso Técnico em Informática, preservando os ajustes existentes. Outros cursos e áreas são administrados pelo site. Ela não cria estudantes, empresas ou vagas.

Antes de criar o administrador, preencha `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_FUNCAO`. Funções permitidas: `ADMINISTRADOR`, `SETOR_ESTAGIOS` e `COORDENADOR`. Repetir o comando preserva a conta administrativa existente e sua senha.

Abra `http://localhost:3001`, ou a porta configurada. `npm run dev` reinicia a aplicação ao editar arquivos. Estudantes e empresas usam os cadastros normais; empresas continuam sujeitas à aprovação administrativa.

## Google, notificações e acessibilidade

| Recurso | Configuração e operação |
|---|---|
| Cadastro, login e vinculação Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` e `URL_BASE`; [docs/GOOGLE.md](docs/GOOGLE.md) |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`; [docs/NOTIFICACOES.md](docs/NOTIFICACOES.md) |
| Tema claro/escuro | Botão global no cabeçalho; preferência local ao navegador, sem configuração no servidor |
| Tradução para Libras | Widget oficial VLibras, carregado pela internet; [docs/ACESSIBILIDADE.md](docs/ACESSIBILIDADE.md) |

O acesso tradicional funciona enquanto Google ou SMTP não estiverem configurados. Os botões **Cadastrar com Google** estão na escolha de cadastro e nos formulários de estudante e empresa. O preenchimento complementar preserva as regras institucionais e não exige senha local para uma conta exclusivamente Google.

O servidor não mantém um processador contínuo da fila. Execute ou agende:

```bash
npm run notificacoes:processar
npm run atualizar-prazos
```

Os avisos internos são preservados quando o SMTP falha. Confirme entregas reais com um destinatário autorizado após configurar o provedor.

## Implantação e manutenção

Em produção, configure HTTPS, `NODE_ENV=production`, segredo de sessão próprio, `URL_BASE` pública e o callback Google do domínio definitivo. As sessões usam cookies seguros em HTTPS. Na Vercel, utilize `UPLOAD_STORAGE=mongo` para persistir documentos no GridFS.

Faça backup antes de qualquer migração. Execute somente a migração necessária à sua base, começando pelo modo de simulação. Consulte [docs/OPERACAO.md](docs/OPERACAO.md) para armazenamento privado, migrações, rotinas e Vercel. O `.env` e os uploads privados devem permanecer fora do Git.

A entrega contém a aplicação e seus scripts operacionais. Ferramentas, dependências e resultados de validação não fazem parte do pacote de operação.

## Estrutura

| Pasta ou entrada | Responsabilidade |
|---|---|
| `app.js` | Express, sessões, CSRF, dados das views e tratamento de erros |
| `index.js` | Inicialização local e conexão ao banco |
| `api/index.js`, `vercel.json` | Entrada e configuração da Vercel |
| `routes/`, `controllers/` | Endpoints, permissões e coordenação dos fluxos |
| `models/` | Esquemas e índices Mongoose |
| `services/` | Cadastros, autenticação, processos, notificações, armazenamento e PDF |
| `middlewares/`, `utils/` | Proteções, validações, datas e regras compartilhadas |
| `views/` | Páginas EJS e componentes compartilhados |
| `public/` | CSS, tema, acessibilidade, JavaScript e imagens públicas |
| `config/` | Conexão MongoDB e configuração de uploads |
| `assets/fonts/` | Fontes incorporadas aos PDFs e licença obrigatória |
| `scripts/` | Inicialização institucional, administrador, notificações e migrações |
| `docs/` | Configuração, operação e fontes institucionais |

## Imagem da home e relatórios

O cabeçalho usa `public/images/startif-logo-horizontal.png`, com o nome à direita do símbolo. Todo o conjunto é um link para `/`, com identificação acessível, tamanho responsivo e fundo branco para preservar a leitura em ambos os temas.

Substitua `public/images/home-fundo.png` ou ajuste `--imagem-home` em `public/css/style.css`. A sobreposição acompanha o tema para manter a leitura dos textos. Os relatórios administrativos usam PDFKit, com fontes incorporadas, acentuação e paginação. PDFs e e-mails têm apresentação independente do tema do navegador.

## Regras institucionais

As regras de estágio e o escopo de Bagé foram preservados. Consulte [docs/FONTES_INSTITUCIONAIS.md](docs/FONTES_INSTITUCIONAIS.md) e [docs/MATRIZ_REQUISITOS.md](docs/MATRIZ_REQUISITOS.md). A conferência institucional de matrícula, PPC, calendário e autenticidade dos documentos permanece necessária; a documentação registra as fontes e seus limites de verificação.
