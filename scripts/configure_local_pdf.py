"""Enable document embedding using this Windows installation's Arial only.

Does not copy, redistribute or provision the font on a remote server.
Microsoft's Windows font FAQ permits document embedding according to fsType.
"""
import os
import struct
import sys
from pathlib import Path
from dotenv import set_key
from reportlab.pdfbase.ttfonts import TTFont

root = Path(__file__).resolve().parents[1]
if sys.platform != 'win32':
    raise SystemExit('Configuração automática restrita à fonte instalada no Windows local.')
font = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'arial.ttf'
data = font.read_bytes()
count = struct.unpack_from('>H', data, 4)[0]
tables = {data[p:p+4]: struct.unpack_from('>II', data, p+8) for p in range(12, 12+16*count, 16)}
offset, _ = tables[b'OS/2']
flags = struct.unpack_from('>H', data, offset+8)[0]
family = TTFont('ArialVerification', str(font)).face.familyName
if b'Arial' not in family or flags & (2 | 256 | 512) or (flags != 0 and not flags & 8):
    raise SystemExit('A fonte não permite a incorporação editável com subconjunto usada pelo aplicativo.')
set_key(root / '.env', 'ARIAL_FONT_PATH', font.as_posix())
set_key(root / '.env', 'ARIAL_LICENSE_CONFIRMED', 'true')
print(f'Arial do Windows local verificada (fsType={flags}). PDF local habilitado; fonte não copiada.')
