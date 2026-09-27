import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHelmet, parseRelay, parseTemperature } from '../src/payload.js';

const b = (s) => Buffer.from(s);

test('helmet payload: firmware chars', () => {
  assert.equal(parseHelmet(b('1')), 'WORN');
  assert.equal(parseHelmet(b('0')), 'REMOVED');
  assert.equal(parseHelmet(b(' 1\n')), 'WORN');
});

test('helmet payload: anything else is rejected', () => {
  for (const s of ['', '2', '10', 'true', 'on', '\x01']) assert.equal(parseHelmet(b(s)), null, JSON.stringify(s));
});

test('relay payload', () => {
  assert.equal(parseRelay(b('1')), 'ENABLED');
  assert.equal(parseRelay(b('0')), 'DISABLED');
  assert.equal(parseRelay(b('x')), null);
});

test('temperature payload', () => {
  assert.equal(parseTemperature(b('34.6')), 34.6);
  assert.equal(parseTemperature(b('35')), 35);
  assert.equal(parseTemperature(b('34.66')), 34.7);
  for (const s of ['', 'nan', '1e3', '-5', '120', '34,6']) assert.equal(parseTemperature(b(s)), null, s);
});
