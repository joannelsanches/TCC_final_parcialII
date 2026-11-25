# Matriz de requisitos institucionais

Data de referência das fontes: **12/10/2026**. Fontes, versões publicadas, links e hashes estão em [FONTES_INSTITUCIONAIS.md](FONTES_INSTITUCIONAIS.md). Esta matriz descreve verificações implementadas; não é certificado de conformidade institucional. “Conferência” exige decisão registrada de usuário administrativo e leitura dos documentos reais.

Abreviações: **R2023** = Regulamento/Resolução CONSUP/IFSul 256/2023; **L2008** = Lei 11.788/2008; **S2021** = Portaria IFSul 19/2021; **TCE** = modelo TCE + Plano, download 31658; **PA** = Plano, 31648; **RA** = Relatório de acompanhamento, 31655; **RI** = Avaliação das instalações, 31647. Artigos são localizadores do documento, e não transcrições.

| Requisito | Fonte / trecho | Validação ou conferência implementada | Arquivo responsável |
|---|---|---|---|
| Campus Bagé | Escopo institucional do sistema; catálogo de Bagé | Campus canônico no servidor; seletores e CRUD removidos; outros vínculos históricos preservados | `utils/campus.js`, `services/migracaoBage.js`, `routes/AdminRoutes.js` |
| Modalidade prevista | R2023 arts.2–3; PPC de cada curso | Bloqueia modalidade desabilitada; PPCs conhecidos associados por nomes exatos; desconhecidos relatados | `utils/regrasTermo.js`, `utils/ppcsBage.js`, `controllers/VagaController.js` |
| Matrícula regular | R2023 arts.5,16; TCE | Cadastro institucional validado antes de candidatura/TCE; conferência acadêmica antes de aprovação | `controllers/CandidaturaController.js`, `controllers/TermoController.js`, `controllers/AdminController.js` |
| Idade ≥16 na assinatura | R2023 art.10 | Calcula idade pelo nascimento/data de assinatura | `utils/regrasTermo.js` |
| Responsável legal de menor | R2023 arts.4,8; TCE | Dados e assinatura adicional conforme idade na assinatura; aniversário antes do início não dispensa a assinatura do responsável | `utils/assinaturas.js`, `controllers/TermoController.js` |
| Antecedência ≥5 dias úteis | R2023 art.6 | Conta dias úteis e feriados configurados antes de análise; calendário é conferência administrativa | `utils/regrasTermo.js`, `views/admin/termos.ejs` |
| Assinaturas antes do início | R2023 arts.7,9; TCE | PDF real separado do rascunho, partes obrigatórias e datas válidas; impede início sem aprovação | `controllers/TermoController.js`, `models/TermoCompromisso.js` |
| Compatibilidade curso/atividades | R2023 arts.12–14; PA | Área/curso da oferta e plano; decisão documentada de compatibilidade com PPC | `controllers/VagaController.js`, `controllers/TermoController.js` |
| Jornada usual ≤6h/30h | R2023 art.42; L2008 art.10 | Limites do curso, dias semanais e horários compatíveis | `utils/regrasEstagio.js`, `utils/regrasTermo.js` |
| Exceção ≤8h/40h | R2023 art.42 | Todos os cursos devem permitir; exige fonte PPC e confirmação de período sem aulas na aprovação/aditivo | `controllers/AdminController.js`, `utils/regrasTermo.js` |
| Escolaridade/horários/avaliações | R2023 arts.14,59 VIII–IX; L2008 art.10 §2º; TCE | Conferência explícita de ausência de conflito; vaga e termo não podem desabilitar a redução de jornada pelo menos à metade nas avaliações | `models/TermoCompromisso.js`, `controllers/TermoController.js` |
| Atividades vedadas a menores | R2023 art.14; L2008 | Conferência administrativa de segurança/restrições antes de aprovação; conteúdo do PDF não é classificado automaticamente | `views/admin/termos.ejs`, `controllers/TermoController.js` |
| Não obrigatório: ≥1 disciplina | R2023 art.16 | Exige disciplinas em curso e matrícula regular, sujeitas à conferência acadêmica | `models/Estudante.js`, `utils/regrasTermo.js` |
| Não obrigatório: conclusão prevista | R2023 art.17 | Fim do termo até previsão de conclusão do curso | `utils/regrasTermo.js`, `views/estudante/perfil.ejs` |
| Ingresso/frequência ≥30 dias | R2023 art.20 | Data de ingresso e intervalo mínimo; frequência real é conferida, sem integração acadêmica automática | `utils/regrasTermo.js` |
| Renovação e rendimento ≥60% | R2023 arts.18,47 | Conferência registrada na aprovação e no aditivo; porcentagem não é inferida do semestre declarado | `controllers/TermoController.js`, `views/partials/aditivo-termo.ejs` |
| Concomitância | R2023 art.10 | Na aprovação: modalidades diferentes, total ≤6h/30h e vigências sobrepostas verificadas | `controllers/TermoController.js` |
| Não obrigatório: até 2 anos | R2023 art.21; L2008 art.11 | Vigência do termo/aditivo limitada a 24 meses; exceção exige documento institucional | `utils/regrasTermo.js` |
| Obrigatório: até 12/18 meses | R2023 art.28 | Oferta até 12 meses; aditivo até 18 com autorização anexada; outras exceções exigem evidência | `utils/regrasEstagio.js`, `utils/regrasTermo.js` |
| Bolsa/auxílio-transporte | R2023 art.24; L2008 art.12 | Valores positivos no não obrigatório; não exige bolsa no obrigatório | `utils/regrasEstagio.js`, `utils/regrasTermo.js` |
| Responsável pelo seguro | R2023 arts.25,32; L2008 art.9 | Concedente no não obrigatório; instituição somente no obrigatório sem remuneração; estudante não é opção válida | `utils/regrasTermo.js`, `views/estudante/termos.ejs` |
| Seguro MAC/IPA ≥R$15 mil | S2021 art.1 | Ambas coberturas e vigência completa; PDF da apólice obrigatório e nova apólice se mudar cobertura em aditivo | `models/TermoCompromisso.js`, `utils/regrasTermo.js`, `controllers/TermoController.js` |
| Supervisor/orientador | TCE; PA; L2008 arts.7,9 | Nome/contato/formação ou experiência; limite de supervisão; aptidão conferida | `controllers/TermoController.js`, `utils/regrasEstagio.js` |
| Instalações avaliadas | RI; L2008 art.7 | PDF obrigatório, análise individual e conferência institucional | `utils/documentosTermo.js`, `controllers/TermoController.js` |
| Convênio comum facultativo | R2023 art.11 | Não presume exigência universal; configuração de curso preservada até migração/revisão. PPC conhecido recebe regra conferida | `services/convenios.js`, `utils/ppcsBage.js` |
| Agente de integração | R2023 art.11 §1 | Exige convênio vigente; tipo da entidade atribuído administrativamente | `services/convenios.js`, `controllers/AdminController.js` |
| Histórico de convênio | Modelos 15451/15452/15455, cláusula VII; requisito do sistema | Revisões, novos preparados/assinaturas e arquivamento preservam processos anteriores; não atribui nova validade ao arquivo antigo | `controllers/ConvenioController.js`, `models/Convenio.js` |
| Vigência do convênio | Modelos de 2018, cláusula VII: cinco anos desde assinatura | Datas e ordem cronológica validadas; duração do instrumento e representantes são conferidos na análise. Não impõe cinco anos a convênios históricos diferentes | `services/convenios.js`, `controllers/ConvenioController.js` |
| Recesso | R2023 art.44; TCE | Conferência registrada do recesso proporcional, remunerado quando houver bolsa; PDF real é analisado pelo setor | `models/TermoCompromisso.js`, `controllers/TermoController.js`, `views/admin/termos.ejs` |
| Relatórios ≤6 meses | RA; TCE; L2008 art.7 | Periodicidade de 1–6 meses, próximo relatório e lembretes persistentes; análise do conteúdo e assinaturas é humana | `models/TermoCompromisso.js`, `services/rotinasAutomaticas.js` |
| Avaliação final do obrigatório | R2023 art.40; PPC; realização/avaliação 31651 | Requer relatório final e ficha de avaliação aprovados; carga mínima conferida no encerramento | `utils/documentosTermo.js`, `controllers/TermoController.js` |
| Não obrigatório: realização | TCE cláusula de desligamento; L2008 art.9 | Exige termo de realização aprovado ao encerrar | `utils/regrasTermo.js`, `controllers/TermoController.js` |
| Rescisão | Modelos 31654 e 31652 | Motivo, termo de rescisão e relatório de encerramento aprovados; guarda histórico | `controllers/TermoController.js` |
| Aditivo | Modelo 31656 | PDF assinado, partes/datas, conferências, validação das novas condições, snapshot e documentos originais preservados | `controllers/TermoController.js`, `models/TermoCompromisso.js` |
| IFSul como concedente | R2023 capítulo XIV, art.87 | Não obrigatório com IFSul concedente: ≤4h/20h; não impõe limite a empresas comuns | `utils/regrasTermo.js`, `models/Empresa.js` |
| Agropecuária: ≥150h/2º ano | PPC 337 §9.2.1 | Carga mínima no encerramento; disciplinas concluídas são conferência obrigatória do PPC | `utils/ppcsBage.js`, `controllers/TermoController.js` |
| Agronômica: ≥360h/80% | PPC 897 §9.2.1 | Carga mínima no encerramento; créditos concluídos exigem conferência institucional | `utils/ppcsBage.js`, `controllers/TermoController.js` |
| Informática/Meio Ambiente/ADS/Alimentos | PPCs 489/769/898/865, seções de prática profissional | Modalidade obrigatória desabilitada pela migração para nomes conhecidos; preserva processos antigos | `utils/ppcsBage.js`, `services/migracaoBage.js` |

## Regras com limites de automação ou pendentes

- Permanência em concedente **ao longo de contratos anteriores**: o limite de um termo/aditivo é validado. Soma de períodos de contratos distintos, vínculos externos e intervalos deve ser conferida na renovação. Não há base acadêmica/externa integrada que comprove todos os vínculos.
- Art.45 (prazo após conclusão teórica) e art.46 (prazo de relatório final): continuam dependentes da informação acadêmica e decisão do campus. A ausência de informação acadêmica exige revisão institucional antes de uma decisão definitiva. Relatórios periódicos e pendências continuam acompanhados.
- Licenciatura EaD/polos: PPC lido nos trechos de estágio, mas etapas docentes, visitas, reduções por exercício docente e regras do polo requerem modelagem/revisão específica; a migração não aplica uma regra técnica comum automaticamente.
- Seguro excepcional, aproveitamento profissional, estudantes com necessidades específicas e condições de jornada especiais requerem autorização e evidências. O fluxo não reconhece automaticamente documentos/assinaturas por OCR, certificado digital ou consulta ao sistema acadêmico.
- Os modelos DOC de 2018 foram extraídos e lidos. Sua utilização atual, representantes e duração específica do instrumento devem ser conferidos pelo campus. PPCs/regulamentos com remissão a 2014 precisam de resolução institucional de eventual conflito de turma/matriz.

Essas pendências estão separadas das validações implementadas. A UI exige conferências humanas nos pontos de decisão; calendário, representantes e dados acadêmicos devem ser confirmados na operação institucional.
