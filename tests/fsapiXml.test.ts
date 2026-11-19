import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFsapiStatus, parseFsapiValue, parseModeList, parsePresetList } from '../src/fsapiXml.ts';

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

test('parses the captured eight-slot preset reply from the radio', () => {
  const xml = `<fsapiResponse>
<status>FS_OK</status>
<item key="0">
<field name="name"><c8_array>Radio 357</c8_array></field>
<field name="type"><c8_array>AirableRadio</c8_array></field>
<field name="url"><c8_array>http://stream.rcs.revma.com/ye5kghkgcm0uv</c8_array></field>
</item>
<item key="1">
<field name="name"><c8_array>LiSTNR - Lofi Study Beats</c8_array></field>
<field name="type"><c8_array>AirableRadio</c8_array></field>
<field name="url"><c8_array>http://sa46.scastream.com.au/lo-fi</c8_array></field>
</item>
<item key="2">
<field name="name"><c8_array>Classic FM Movie Music Hall Of Fame</c8_array></field>
<field name="type"><c8_array>AirableRadio</c8_array></field>
<field name="url"><c8_array>http://media-the.musicradio.com/ClassicFM-M-Movies</c8_array></field>
</item>
<item key="3">
<field name="name"><c8_array>RMF Classic</c8_array></field>
<field name="type"><c8_array>AirableRadio</c8_array></field>
<field name="url"><c8_array>http://rmfstream1.interia.pl:8000/rmf_classic</c8_array></field>
</item>
<item key="4">
<field name="name"><c8_array>LiSTNR - Yacht Rock</c8_array></field>
<field name="type"><c8_array>AirableRadio</c8_array></field>
<field name="url"><c8_array>http://sa47.scastream.com.au/7yachtrock_32?sca3xx=1</c8_array></field>
</item>
<item key="5">
<field name="name"><c8_array>LiSTNR - Grunge</c8_array></field>
<field name="type"><c8_array>AirableRadio</c8_array></field>
<field name="url"><c8_array>http://sa47.scastream.com.au/grunge</c8_array></field>
</item>
<item key="6">
<field name="name"><c8_array>LiSTNR - Movie Hits</c8_array></field>
<field name="type"><c8_array>AirableRadio</c8_array></field>
<field name="url"><c8_array>http://sa47.scastream.com.au/movie-hits</c8_array></field>
</item>
<item key="7">
<field name="name"><c8_array></c8_array></field>
<field name="type"><c8_array></c8_array></field>
<field name="url"><c8_array></c8_array></field>
</item>
<listend/>
</fsapiResponse>`;

  const result = parsePresetList(xml);
  assert.equal(result.presets.length, 8);
  assert.deepEqual(result.presets[0], {
    key: 0,
    position: 1,
    name: 'Radio 357',
    type: 'AirableRadio',
    url: 'http://stream.rcs.revma.com/ye5kghkgcm0uv',
    empty: false
  });
  assert.deepEqual(result.presets[7], {
    key: 7,
    position: 8,
    name: '',
    type: '',
    url: '',
    empty: true
  });
  assert.equal(result.listEnd, true);
});

test('parses preset entities and treats malformed lists as empty', () => {
  const result = parsePresetList('<items><item key="0"><field name="name"><c8_array>Rock &amp; Roll</c8_array></field><field name="url"><c8_array>http://example.test/?a=1&amp;b=2</c8_array></field></item><listend/></items>');
  assert.equal(result.presets[0]?.name, 'Rock & Roll');
  assert.equal(result.presets[0]?.url, 'http://example.test/?a=1&b=2');
  assert.equal(result.listEnd, true);
  assert.deepEqual(parsePresetList(''), { presets: [], listEnd: false });
  assert.deepEqual(parsePresetList('<item key="bad"><field name="name"><c8_array>x</c8_array></field></item>'), {
    presets: [],
    listEnd: false
  });
});