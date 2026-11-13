"""Produce synthetic QA fixtures, never presented as Gemini output."""
from pathlib import Path
import sys
from dotenv import load_dotenv
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
load_dotenv(root / '.env')
from backend.documents import export

out = root / 'tmp' / 'export-qa'
out.mkdir(parents=True, exist_ok=True)
material = {
 'title':'Partes iguais e frações',
 'student':'# Atividade de verificação de formato\nEnsino Fundamental I · 3º ano\nObjetivo: representar a quarta parte de um todo.\n\n1. Desenhe um retângulo.\n2. Divida-o em quatro partes iguais.\n3. Pinte uma das partes.\n4. Explique como você verificou que as partes são iguais.\n\n# Exemplo\nUma folha foi dividida em quatro partes iguais. Cada parte representa um quarto da folha.\n\n| Representação | Partes iguais | Parte pintada |\n| --- | --- | --- |\n| Retângulo | Quatro | Uma |\n| Círculo | Duas | Uma |\n\nEscreva sua explicação: ___________________________________',
 'teacher':'# Orientações para revisão\nEste é um exemplo sintético para conferir a exportação, não uma resposta do Gemini.\nAs instruções foram divididas em etapas. O objetivo de reconhecer partes iguais foi preservado.\n\n# Critérios\nVerifique a divisão em partes iguais e a justificativa.\nNão atribua notas sem critérios definidos pelo professor.'
}
for fmt in ('docx','pdf','txt'):
    content, _ = export(material, fmt)
    (out / ('preview.' + fmt)).write_bytes(content)
print('Arquivos sintéticos de QA gerados em tmp/export-qa.')
