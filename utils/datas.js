const FUSO_INSTITUCIONAL = 'America/Sao_Paulo';

function partesDaData(referencia, fusoHorario) {
  const formatador = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return Object.fromEntries(
    formatador
      .formatToParts(referencia)
      .filter((parte) => ['year', 'month', 'day'].includes(parte.type))
      .map((parte) => [parte.type, Number(parte.value)])
  );
}

export function inicioDoDiaInstitucional(
  referencia = new Date(),
  fusoHorario = process.env.FUSO_HORARIO || FUSO_INSTITUCIONAL
) {
  const data = referencia instanceof Date ? referencia : new Date(referencia);
  if (Number.isNaN(data.valueOf())) throw new TypeError('Data de referência inválida.');

  let partes;
  try {
    partes = partesDaData(data, fusoHorario);
  } catch {
    partes = partesDaData(data, FUSO_INSTITUCIONAL);
  }
  return new Date(Date.UTC(partes.year, partes.month - 1, partes.day));
}

export function prazoAindaValido(prazo, referencia = new Date()) {
  if (!prazo) return false;
  const dataPrazo = new Date(prazo);
  return !Number.isNaN(dataPrazo.valueOf()) && dataPrazo >= inicioDoDiaInstitucional(referencia);
}
