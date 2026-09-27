import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceHub } from '../src/deviceHub.js';

const DEV = { deviceId: 'H-01', workerId: 'W-01', toolId: 'T-01', helmetTopic: 'helmet/pin7', tempTopic: 'helmet/temp', relayTopic: null };

function setup(cfg = DEV) {
  let t = 1_000_000;
  const hub = new DeviceHub([cfg], { linkTimeoutMs: 3000, heartbeatPushMs: 500, relayConfirmMs: 5000, now: () => t });
  const out = { status: [], violation: [], update: [], invalid: [] };
  hub.on('status', (s) => out.status.push(s));
  hub.on('violation', (v) => out.violation.push(v));
  hub.on('violation-update', (v) => out.update.push(v));
  hub.on('invalid', (e) => out.invalid.push(e));
  const msg = (topic, s) => hub.handle(topic, Buffer.from(s));
  const advance = (ms) => {
    t += ms;
    hub.tick();
  };
  return { hub, out, msg, advance };
}

test('first message pushes status; unchanged heartbeats are throttled', () => {
  const { out, msg, advance } = setup();
  msg('helmet/pin7', '1');
  assert.equal(out.status.length, 1);
  assert.equal(out.status[0].helmetState, 'WORN');
  assert.equal(out.status[0].deviceTs, null);
  advance(100);
  msg('helmet/pin7', '1');
  assert.equal(out.status.length, 1, 'heartbeat within 500 ms is not pushed');
  advance(500);
  msg('helmet/pin7', '1');
  assert.equal(out.status.length, 2);
  assert.ok(out.status[1].seq > out.status[0].seq, 'seq increases');
});

test('state change is pushed immediately and WORN → REMOVED is a violation', () => {
  const { out, msg, advance } = setup();
  msg('helmet/pin7', '1');
  advance(50);
  msg('helmet/pin7', '0');
  assert.equal(out.status.at(-1).helmetState, 'REMOVED');
  assert.equal(out.violation.length, 1);
  assert.equal(out.violation[0].eventType, 'HELMET_REMOVED');
  assert.equal(out.violation[0].action, 'UNKNOWN', 'no relay feedback configured → action not claimed');
});

test('first message REMOVED (from UNKNOWN) is not a removal violation', () => {
  const { out, msg } = setup();
  msg('helmet/pin7', '0');
  assert.equal(out.violation.length, 0);
});

test('silence longer than the link timeout → LINK_LOST + violation', () => {
  const { out, msg, advance } = setup();
  msg('helmet/pin7', '1');
  advance(2900);
  assert.equal(out.violation.length, 0);
  advance(200);
  assert.equal(out.status.at(-1).helmetState, 'LINK_LOST');
  assert.equal(out.violation.at(-1).eventType, 'LINK_LOST');
  advance(5000);
  assert.equal(out.violation.length, 1, 'LINK_LOST is recorded once');
});

test('temperature keeps the link alive when state is only sent on change', () => {
  const { out, msg, advance } = setup();
  msg('helmet/pin7', '1');
  for (let i = 0; i < 10; i++) {
    advance(1000);
    msg('helmet/temp', '34.8');
  }
  assert.equal(out.status.at(-1).helmetState, 'WORN');
  assert.equal(out.status.at(-1).tempC, 34.8);
  assert.equal(out.violation.length, 0);
});

test('after LINK_LOST, a temperature message restores the link as UNKNOWN (state not known yet)', () => {
  const { out, msg, advance } = setup();
  msg('helmet/pin7', '1');
  advance(3500);
  msg('helmet/temp', '35.0');
  assert.equal(out.status.at(-1).helmetState, 'UNKNOWN');
  msg('helmet/pin7', '1');
  assert.equal(out.status.at(-1).helmetState, 'WORN');
});

test('invalid payloads are rejected and do not count as liveness', () => {
  const { out, msg, advance } = setup();
  msg('helmet/pin7', '1');
  for (let i = 0; i < 4; i++) {
    advance(1000);
    msg('helmet/pin7', 'garbage');
  }
  assert.equal(out.invalid.length, 4);
  assert.equal(out.status.at(-1).helmetState, 'LINK_LOST');
});

test('relay OFF within the window confirms TOOL_DISABLED on the removal violation', () => {
  const { out, msg, advance } = setup({ ...DEV, relayTopic: 'tool/relay' });
  msg('helmet/pin7', '1');
  msg('tool/relay', '1');
  assert.equal(out.status.at(-1).toolState, 'ENABLED');
  advance(100);
  msg('helmet/pin7', '0');
  assert.equal(out.violation[0].action, 'UNKNOWN');
  advance(300);
  msg('tool/relay', '0');
  assert.equal(out.update.length, 1);
  assert.equal(out.update[0].id, out.violation[0].id);
  assert.equal(out.update[0].action, 'TOOL_DISABLED');
  assert.equal(out.status.at(-1).toolState, 'DISABLED');
});

test('relay OFF after the window does not confirm', () => {
  const { out, msg, advance } = setup({ ...DEV, relayTopic: 'tool/relay' });
  msg('helmet/pin7', '1');
  msg('tool/relay', '1');
  msg('helmet/pin7', '0');
  for (let i = 0; i < 6; i++) {
    advance(1000);
    msg('helmet/pin7', '0');
    msg('tool/relay', '1');
  }
  msg('tool/relay', '0');
  assert.equal(out.update.length, 0);
});

test('unknown topic is ignored', () => {
  const { hub } = setup();
  assert.equal(hub.handle('other/topic', Buffer.from('1')), false);
});
