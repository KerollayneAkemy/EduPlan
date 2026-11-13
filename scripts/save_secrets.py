"""Interactive local-only secret entry; values are never echoed or logged."""
import base64
import json
from getpass import getpass
from pathlib import Path
from dotenv import set_key

path = Path(__file__).resolve().parents[1] / '.env'
if not path.exists():
    raise SystemExit('Execute a preparação local primeiro; o arquivo .env não foi encontrado.')

print('EduPlan — configuração local de chaves')
print('O texto colado fica oculto. Enter em branco mantém a configuração atual.')
secret = getpass('Chave SECRET do Supabase (sb_secret_...): ').strip()
if secret:
    valid = secret.startswith('sb_secret_')
    if not valid:
        try:
            payload = secret.split('.')[1]
            valid = json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))['role']=='service_role'
        except Exception:
            valid = False
    if not valid:
        raise SystemExit('Formato incorreto. Use a SECRET key ou service_role, não a chave pública.')
    set_key(path, 'SUPABASE_SERVICE_ROLE_KEY', secret)

gemini = getpass('Chave da API Gemini: ').strip()
if gemini:
    if len(gemini)<10 or any(c.isspace() for c in gemini):
        raise SystemExit('Formato de chave Gemini inválido. Copie a chave inteira, sem espaços.')
    set_key(path, 'GEMINI_API_KEY', gemini)
print('Configuração salva localmente, sem exibir chaves. Reinicie o EduPlan.')
print('As chaves ainda precisam ser verificadas nos serviços reais.')
