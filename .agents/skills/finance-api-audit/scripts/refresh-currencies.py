#!/usr/bin/env python3
"""Обновляет публичный справочник SIX, не обращаясь к финансовым API."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

SOURCE = 'https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml'


def parse_registry(content):
    if b'<!DOCTYPE' in content.upper() or b'<!ENTITY' in content.upper():
        raise ValueError('XML с DTD или сущностями не поддерживается')
    root = ET.fromstring(content)
    codes = {}
    for item in root.findall('.//CcyNtry'):
        code = item.findtext('Ccy', '').strip()
        if not re.fullmatch(r'[A-Z]{3}', code):
            continue
        minor = item.findtext('CcyMnrUnts', '').strip()
        entry = {'minorUnits': int(minor) if minor.isdecimal() else None}
        if code in codes and codes[code] != entry:
            raise ValueError('Неоднозначная разрядность валюты')
        codes[code] = entry
    if len(codes) < 100 or codes.get('USD') != {'minorUnits': 2} or codes.get('EUR') != {'minorUnits': 2}:
        raise ValueError('Справочник пуст или имеет неожиданную схему')
    published = root.attrib.get('Pblshd')
    if not published or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', published):
        raise ValueError('Отсутствует дата публикации SIX')
    return {
        'source': SOURCE, 'publishedAt': published,
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'sha256': hashlib.sha256(content).hexdigest(), 'codes': dict(sorted(codes.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'assets/iso4217.json')
    parser.add_argument('--input', type=Path, help='Официальный XML, ранее загруженный с проверкой TLS')
    args = parser.parse_args()
    if args.input:
        content = args.input.read_bytes()
    else:
        with urlopen(Request(SOURCE, headers={'User-Agent': 'finance-api-audit/1.0'}), timeout=30) as response:
            content = response.read(1024 * 1024 + 1)
    if len(content) > 1024 * 1024:
        raise ValueError('Справочник превышает лимит 1 МБ')
    result = parse_registry(content)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(args.output)
    print(f"Справочник SIX сохранён: {len(result['codes'])} кодов, публикация {result['publishedAt']}")


if __name__ == '__main__':
    main()
