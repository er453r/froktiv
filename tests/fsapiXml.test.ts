import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFsapiStatus, parseFsapiValue, parseModeList } from '../src/fsapiXml.ts';

test('parses FSAPI status codes', () => {
  assert.equal(parseFsapiStatus('<fsapiResponse><status>FS_OK</status></fsapiResponse>'), 'FS_OK');
  assert.equal(parseFsapiStatus('<fsapiResponse><status> FS_PACKET_BAD </status></fsapiResponse>'), 'FS_PACKET_BAD');
  assert.equal(parseFsapiStatus(''), null);
  assert.equal(parseFsapiStatus('<status>'), null);
});

test('parses numeric and string FSAPI values', () => {
  assert.equal(parseFsapiValue('<value><u8>2</u8></value>'), 2);
  assert.equal(parseFsapiValue('<value><u32>4294967295</u32></value>'), 4294967295);
  assert.equal(parseFsapiValue('<value><s8>-3</s8></value>'), -3);
  assert.equal(parseFsapiValue('<value><c8_array> Rock &amp; Roll </c8_array></value>'), 'Rock & Roll');
  assert.equal(parseFsapiValue('<value><u8>bad</u8></value>'), null);
  assert.equal(parseFsapiValue('<broken>'), null);
});

test('parses valid modes and their selectable flags', () => {
  const xml = `<fsapiResponse><status>FS_OK</status><items>
    <item key="2"><field name="id"><c8_array>IR</c8_array></field><field name="label"><c8_array>Internet &amp; Radio</c8_array></field><field name="selectable"><u8>1</u8></field></item>
    <item key="5"><field name="id"><c8_array>OFF</c8_array></field><field name="label"><c8_array>Standby</c8_array></field><field name="selectable"><u8>0</u8></field></item>
  </items></fsapiResponse>`;

  assert.deepEqual(parseModeList(xml), [
    { key: 2, id: 'IR', label: 'Internet & Radio', selectable: true },
    { key: 5, id: 'OFF', label: 'Standby', selectable: false }
  ]);
  assert.deepEqual(parseModeList(''), []);
  assert.deepEqual(parseModeList('<items><item key="invalid"></item></items>'), []);
});