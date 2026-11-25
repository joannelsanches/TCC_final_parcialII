import AreaAtuacao from '../models/AreaAtuacao.js';
import Curso from '../models/Curso.js';
import { garantirCampusBage } from '../utils/campus.js';
import { regrasPpcConferido } from '../utils/ppcsBage.js';

export async function inicializarDadosInstitucionais() {
  const campus = await garantirCampusBage();
  const area = await AreaAtuacao.findOneAndUpdate(
    { nome: 'Tecnologia da Informação' },
    { $setOnInsert: { ativo: true } },
    { upsert: true, new: true }
  );
  const curso = await Curso.findOneAndUpdate(
    { nome: 'Técnico em Informática', campus: campus._id },
    {
      $setOnInsert: {
        nivel: 'TÉCNICO',
        areasRelacionadas: [area._id],
        ativo: true,
        regrasEstagio: {
          periodoMinimoObrigatorio: 1,
          cargaHorariaDiariaMaxima: 6,
          cargaHorariaSemanalMaxima: 30,
          permiteJornada40h: false,
          exigeConvenio: false,
          ...regrasPpcConferido('Técnico em Informática'),
          permiteEstagioObrigatorio: false,
          permiteEstagioNaoObrigatorio: true
        }
      }
    },
    { upsert: true, new: true, runValidators: true }
  );
  return { campus, area, curso };
}
