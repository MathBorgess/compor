---
status: accepted
---

# Organização do Compor e operação individual da v0

Em 26/10/2026, Matheus definiu em Q10 um repositório por organização, entidade do Compor para o usuário. Organização do Compor não equivale a uma Organization do GitHub. O usuário pode adicionar colaboradores diretamente no GitHub; em Q11, delimitou a v0 ao fluxo de uma pessoa utilizando o aplicativo, sem governança por escopos. A escolha mantém o compartilhamento no GitHub e evita introduzir papéis e regras de aprovação internas no Compor nesta versão.

Esta decisão complementa o [ADR 0001](0001-contexto-local-e-colaboracao-github.md) e substitui sua interpretação de governança interna para contribuições compartilhadas na v0. O salvamento local, o envio opcional ao GitHub e a preservação de versões em conflito permanecem. Os escopos de memória organizam o contexto e não representam um modelo de permissões.

Matheus também aprovou Q12: cada campanha mantém as versões da base e das skills utilizadas, e novas versões são adotadas por atualização explícita de contexto. Em Q13, definiu geração de imagens desde a v0, substituindo a proposta de adiá-la. A relação entre organização e marcas/clientes, a fronteira da memória pessoal e a comprovação de geração de imagens por cada modo de conexão ainda precisam de fechamento; este registro não presume essas respostas nem comprova implementação.

Fechamento posterior de Q14–Q17: a v0 mantém um usuário para uma organização; toda memória, inclusive pessoal, pertence ao repositório dessa organização quando o envio GitHub está habilitado, conforme [ADR 0003](0003-memoria-integral-da-organizacao.md). O modo Codex só pode ser liberado após comprovar texto e imagem nativos sem chave BYOK complementar e concluir G0. Imagens geradas são recursos visuais; texto, preço e datas continuam editáveis no compositor local. As decisões de domínio estão fechadas; a comprovação de integração continua pendente.
