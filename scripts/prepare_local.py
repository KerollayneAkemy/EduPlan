"""Prepare local configuration without printing or replacing existing secrets."""
from pathlib import Path
import sys
from cryptography.fernet import Fernet
from dotenv import dotenv_values, set_key

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / '.env'
if not path.exists():
    path.write_text((ROOT / '.env.example').read_text(encoding='utf-8'), encoding='utf-8')
values = dotenv_values(path)
if not values.get('KEY_ENCRYPTION_SECRET'):
    set_key(path, 'KEY_ENCRYPTION_SECRET', Fernet.generate_key().decode())
if len(sys.argv) == 3:
    url, public_key = sys.argv[1:]
    if not public_key.startswith('sb_publishable_'):
        raise SystemExit('Forneça somente a chave pública, nunca um segredo, como argumento.')
    if not values.get('SUPABASE_URL') or 'SEU-PROJETO' in values['SUPABASE_URL']:
        set_key(path, 'SUPABASE_URL', url)
    if not values.get('SUPABASE_ANON_KEY'):
        set_key(path, 'SUPABASE_ANON_KEY', public_key)
print('Configuração local preparada. Segredos existentes preservados; nenhum valor sensível exibido.')
