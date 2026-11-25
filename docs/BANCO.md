# Preparação e diagnóstico do MongoDB

O StartIF lê somente `MONGODB_URI` para sua conexão normal. A URI pode apontar para um MongoDB local ou para um serviço remoto. Não há base de demonstração. Preserve seu banco existente e faça backup antes de alterar a instalação ou executar migrações.

O servidor precisa ser um **replica set** ou um cluster compatível com transações. O MongoDB Compass é um cliente de acesso; sua instalação não inicia o servidor `mongod`.

## Opção 1: MongoDB Atlas

1. Utilize um cluster Atlas, crie um usuário de banco e conceda acesso à base do StartIF. O usuário do banco é diferente da conta de acesso ao portal Atlas.
2. Em Network Access, autorize o IP ou a rede do ambiente que executará a aplicação. Autorize também a infraestrutura de implantação quando aplicável. Evite liberação ampla desnecessária.
3. Em Connect, selecione Drivers e copie a conexão para Node.js. Informe usuário, senha e nome da base. Preserve os parâmetros fornecidos pelo provedor. Caracteres reservados da senha precisam de codificação na URI.
4. Configure no `.env`, com os valores reais do seu ambiente:

```dotenv
MONGODB_URI=mongodb+srv://USUARIO:SENHA@SEU-CLUSTER.mongodb.net/startif?retryWrites=true&w=majority
MONGODB_TIMEOUT_MS=15000
```

O exemplo não é uma conexão utilizável até substituir os campos. Uma conexão já funcional pode ser mantida exatamente como está; o sistema não troca o servidor nem o nome da base automaticamente.

## Opção 2: MongoDB local para desenvolvimento

Instale MongoDB Community Server e `mongosh` pelos pacotes oficiais do seu sistema. Garanta que os executáveis estejam disponíveis no terminal. Os comandos abaixo são para uma instalação nova de desenvolvimento, com dados próprios. Para converter uma instalação existente, preserve seu diretório e configuração, faça backup e siga a documentação oficial de conversão.

No Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path C:\dados\startif-mongo
mongod --dbpath C:\dados\startif-mongo --replSet rs0 --bind_ip localhost --port 27017
```

No Linux ou macOS:

```bash
mkdir -p "$PWD/dados-mongo"
mongod --dbpath "$PWD/dados-mongo" --replSet rs0 --bind_ip localhost --port 27017
```

Mantenha esse terminal aberto. Se já existe um serviço MongoDB usando a porta 27017, escolha qual instalação utilizar antes de iniciar outro processo. Não configure dois processos para acessar o mesmo diretório de dados.

Em outro terminal, abra o shell:

```bash
mongosh "mongodb://localhost:27017"
```

Inicialize o replica set **uma única vez**:

```javascript
rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })
rs.status()
```

Espere o membro assumir o estado `PRIMARY`. Configure o `.env`:

```dotenv
MONGODB_URI=mongodb://localhost:27017/startif?replicaSet=rs0
MONGODB_TIMEOUT_MS=15000
```

Essa configuração fica restrita ao computador local. Um serviço público precisa de autenticação, TLS e controle de rede apropriados à implantação. Não exponha o banco local na internet.

## Validar e iniciar

Na pasta do projeto:

```bash
npm run inicializar:instituicao
npm run criar-admin
npm start
```

Preencha também `SESSION_SECRET`, `URL_BASE` e as variáveis administrativas antes dos comandos correspondentes. A inicialização institucional e o servidor conferem a conexão e o suporte a transações. Esses comandos são independentes de Google e SMTP.

A conexão informa o início e o sucesso. `MONGODB_TIMEOUT_MS` limita a seleção/conexão ao servidor; aceita inteiros de 1000 a 60000, com padrão de 15000 milissegundos. Resolução DNS e outros serviços de rede também dependem do ambiente. Mensagens públicas não incluem a URI, usuário ou senha.

| Mensagem | Conferência necessária |
|---|---|
| Conexão recusada | Servidor local `mongod` iniciado; URI aponta para o destino pretendido |
| Servidor não localizado | Nome do cluster, conexão fornecida pelo provedor e DNS |
| Autenticação recusada | Usuário de banco, senha codificada e permissões da base |
| Limite de conexão | Disponibilidade do servidor, replica set, firewall e autorização da rede no provedor |
| Modo standalone | Inicialização/configuração de replica set ou uso de Atlas |
| Falha de TLS | Certificados, data do computador e requisitos do provedor; não desative a verificação de certificados |

Referências oficiais: [instalação MongoDB Community](https://www.mongodb.com/docs/manual/installation/), [replica set](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/), [conversão de instalação existente](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/), [conexão Atlas](https://www.mongodb.com/docs/atlas/connect-your-application/).
