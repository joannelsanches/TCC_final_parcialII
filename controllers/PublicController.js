import { filtroVagasPublicas } from '../services/vagas.js';
import Vaga from '../models/Vaga.js';
import Estudante from '../models/Estudante.js';
import Empresa from '../models/Empresa.js';
import { campusBageId } from '../utils/campus.js';
import { inicioDoDiaInstitucional } from '../utils/datas.js';

export default class PublicController {
  static async inicio(req, res) {
    const hoje = inicioDoDiaInstitucional();
    const [vagas, estudantes, empresas] = await Promise.all([
      Vaga.find(filtroVagasPublicas())
        .populate('empresa areaAtuacao')
        .sort('-dataPublicacao')
        .limit(8),
      Estudante.countDocuments({ campus: campusBageId() }),
      Empresa.countDocuments()
    ]);
    res.render('public/inicio', { vagas, estudantes, empresas });
  }
}
