export type FsapiStatusCode =
  | 'FS_OK'
  | 'FS_FAIL'
  | 'FS_PACKET_BAD'
  | 'FS_NODE_DOES_NOT_EXIST'
  | 'FS_NODE_BLOCKED'
  | 'FS_TIMEOUT'
  | 'FS_LIST_END'
  | string;

export interface RadioMode {
  readonly key: number;
  readonly id: string;
  readonly label: string;
  readonly selectable: boolean;
}

type FsapiValue = string | number;

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    switch (token.toLowerCase()) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const codePoint = token.startsWith('#x') || token.startsWith('#X')
          ? Number.parseInt(token.slice(2), 16)
          : Number.parseInt(token.slice(1), 10);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
          return entity;
        }
        return String.fromCodePoint(codePoint);
      }
    }
  });
}

function parseTypedValue(content: string): FsapiValue | null {
  const match = /<(u8|u16|u32|s8|s16|s32|c8_array)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/i.exec(content);
  const type = match?.[1]?.toLowerCase();
  const rawValue = match?.[2];
  if (type === undefined || rawValue === undefined) {
    return null;
  }

  const value = decodeXml(rawValue).trim();
  if (type === 'c8_array') {
    return value;
  }

  if (!/^[+-]?\d+$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function parseFsapiStatus(xml: string): FsapiStatusCode | null {
  const match = /<status(?:\s[^>]*)?>([\s\S]*?)<\/status\s*>/i.exec(xml);
  const status = match?.[1];
  return status === undefined ? null : decodeXml(status).trim() || null;
}

export function parseFsapiValue(xml: string): string | number | null {
  const match = /<value(?:\s[^>]*)?>([\s\S]*?)<\/value\s*>/i.exec(xml);
  const content = match?.[1];
  return content === undefined ? null : parseTypedValue(content);
}

function parseField(item: string, name: string): FsapiValue | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const field = new RegExp(`<field\\b(?=[^>]*\\bname\\s*=\\s*["']${escapedName}["'])[^>]*>([\\s\\S]*?)<\\/field\\s*>`, 'i').exec(item);
  const content = field?.[1];
  return content === undefined ? null : parseTypedValue(content);
}

export function parseModeList(xml: string): RadioMode[] {
  const modes: RadioMode[] = [];
  const itemPattern = /<item\b([^>]*)>([\s\S]*?)<\/item\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null) {
    const attributes = match[1] ?? '';
    const content = match[2] ?? '';
    const keyMatch = /\bkey\s*=\s*(?:"(-?\d+)"|'(-?\d+)')/i.exec(attributes);
    const rawKey = keyMatch?.[1] ?? keyMatch?.[2];
    if (rawKey === undefined) {
      continue;
    }

    const key = Number(rawKey);
    if (!Number.isSafeInteger(key)) {
      continue;
    }

    const idValue = parseField(content, 'id');
    const labelValue = parseField(content, 'label');
    const selectableValue = parseField(content, 'selectable');
    const id = idValue === null ? String(key) : String(idValue).trim();
    const label = labelValue === null ? id : String(labelValue).trim();
    const selectable = selectableValue === null
      || selectableValue === 1
      || String(selectableValue).toLowerCase() === 'true';

    modes.push({ key, id, label, selectable });
  }

  return modes;
}