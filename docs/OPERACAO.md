# Operação e implantação

## Banco, sessões e arquivos

Use MongoDB com replica set ou Atlas e usuário com permissões restritas à base da aplicação. Mantenha backup do banco e dos arquivos antes de qualquer migração. Sessões são persistidas em `sessoes`, com índice de expiração, e usam cookie HTTP-only e SameSite Lax. Requisições que alteram dados continuam protegidas por CSRF.

`UPLOAD_STORAGE=local` mantém arquivos privados em `uploads/`, sem publicação estática direta. Preserve esse diretório em backup e use volume persistente. `UPLOAD_STORAGE=mongo` mantém os arquivos no GridFS da mesma base e é recomendado para a implantação sem disco persistente. Na Vercel, o padrão já é MongoDB. Não publique `uploads/` como diretório estático. Referências locais antigas podem conter caminhos absolutos. Ao atualizar, mantenha o projeto e seus uploads no caminho original. Antes de mover a instalação para outra pasta ou servidor, execute a migração de arquivos para GridFS enquanto os caminhos originais ainda estiverem disponíveis, começando pela simulação.

Os downloads existentes conferem usuário, perfil e relação com o processo. Fotos privadas de estudantes são exibidas pelas rotas autorizadas; o avatar usa a foto enviada, depois a foto Google permitida ou iniciais. Limites são definidos por `LIMITE_IMAGEM_MB` e `LIMITE_PDF_MB`. Nome/extensão e tipo permitido são verificados; não há serviço antivírus integrado.

## Atualizar uma base existente

Preserve o `.env` local, faça backup e execute primeiro as simulações. Cada migração tem uma finalidade; não é necessário executar todas para iniciar uma base nova.

| Comando | Finalidade |
|---|---|
| `npm run migrar:simular` / `npm run migrar` | Ajustes do esquema de dados e jornada da versão anterior |
| `npm run migrar:bage:simular` / `npm run migrar:bage` | Campus canônico de Bagé e regras dos cursos reconhecidos, preservando processos históricos |
| `npm run migrar:arquivos:simular` / `npm run migrar:arquivos` | Arquivos locais para GridFS, preservando referências necessárias |
| `npm run migrar:canais:simular` / `npm run migrar:canais` | Remoção dos campos e índices do canal descontinuado, com arquivo privado do histórico |

Examine a saída da simulação e revise cursos não reconhecidos antes de aplicar regras. A migração de canais é idempotente e usa transação para arquivar os dados removidos antes da atualização. A migração de arquivos exige acesso aos arquivos locais originais. Nenhuma dessas rotinas deve ser testada pela primeira vez na base de produção.

## Rotinas agendadas

`npm run atualizar-prazos` atualiza vencimentos e cria lembretes. `npm run notificacoes:processar` processa a fila persistente. O processamento é limitado por lote e orçamento de tempo; execute-o periodicamente para escoar novas notificações e retentativas.

Os endpoints `GET /api/rotinas/atualizar-prazos` e `GET /api/rotinas/notificacoes` exigem segredo via `Authorization: Bearer <segredo>` ou `x-cron-secret`. O primeiro aceita `CRON_SECRET` ou `SEGREDO_ROTINA_PRAZOS`; o segundo exige `CRON_SECRET`. Confirme o caminho em `routes/RotinaRoutes.js` ao configurar o agendador. Não coloque o segredo em query string.

`vercel.json` agenda a rotina de prazos diariamente às 06:00 UTC. Isso não representa processamento contínuo de e-mail. Para entregas mais rápidas, configure um agendamento compatível com o plano de hospedagem ou execute o comando da fila em serviço próprio. Limites de tempo e frequência da hospedagem precisam ser homologados no ambiente escolhido.

## Vercel

A entrada é `api/index.js`, que conecta o banco e exporta o Express. A execução local usa `index.js`. Não há entrada alternativa necessária. O bundle inclui `views/`, `public/` e `assets/`, inclusive as fontes incorporadas dos relatórios PDF.

Configure na plataforma `NODE_ENV=production`, `MONGODB_URI`, `SESSION_SECRET`, `URL_BASE`, `UPLOAD_STORAGE=mongo`, segredos de rotina e, quando usados, Google e SMTP. Autorize a conexão do ambiente ao MongoDB. Use o domínio HTTPS definitivo para o callback Google. O deploy é uma etapa externa; testes locais da entrada não equivalem à homologação da plataforma.

## Dados institucionais e assinatura

`INSTITUICAO_NOME`, `INSTITUICAO_CNPJ` e `INSTITUICAO_REPRESENTANTE` devem refletir dados confirmados pelo campus. `DOMINIOS_INSTITUCIONAIS` lista os domínios acadêmicos autorizados. `FUSO_HORARIO` usa `America/Sao_Paulo` por padrão; `FERIADOS_INSTITUCIONAIS` aceita datas `AAAA-MM-DD` separadas por vírgulas, conforme calendário confirmado.

O sistema mantém o documento preparado para assinatura separado do assinado devolvido. Upload e registro de datas não certificam autenticidade de assinaturas. As conferências administrativas de matrícula, PPC, calendário, instalações e documentos permanecem obrigatórias nos pontos indicados. Consulte a [matriz de requisitos](MATRIZ_REQUISITOS.md).
