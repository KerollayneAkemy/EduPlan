"""Read-only local/remote readiness checks. Never print credentials or user records."""
import json
import sys
from pathlib import Path
import httpx
from dotenv import load_dotenv
import os

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / '.env')
from backend.documents import pdf_ready
from backend.services import cipher

def check():
    result = {"local": {key: bool(os.getenv(key)) for key in (
        'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
        'GEMINI_API_KEY', 'GEMINI_MODEL', 'KEY_ENCRYPTION_SECRET')}}
    try:
        cipher()
        result['encryption_valid'] = True
    except Exception:
        result['encryption_valid'] = False
    result['pdf_ready'] = pdf_ready()
    url, key = os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_ANON_KEY')
    if url and key:
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get(url+'/auth/v1/settings', headers={'apikey': key})
                result['auth_http'] = r.status_code
                if r.is_success:
                    result['google_enabled'] = bool(r.json().get('external', {}).get('google'))
                r = client.get(url+'/rest/v1/profiles', params={'select':'user_id', 'limit':'1'}, headers={'apikey':key})
                result['anonymous_profiles_http'] = r.status_code
                result['anonymous_profiles_hidden'] = r.status_code in (401,403) or (r.is_success and r.json()==[])
                r = client.get(url+'/rest/v1/ai_secrets', params={'select':'user_id', 'limit':'1'}, headers={'apikey':key})
                result['anonymous_secrets_blocked'] = r.status_code in (401,403)
        except httpx.HTTPError:
            result['connection_error'] = 'Não foi possível conectar ao Supabase.'
    return result

if __name__ == '__main__':
    print(json.dumps(check(), ensure_ascii=False, indent=2))
