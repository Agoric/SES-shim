/* global issueCommand */

const encoder = new TextEncoder();
function send(s) {
  issueCommand(encoder.encode(s).buffer);
}

const c = new Compartment({ send });

const child = `
(function child(o) {
  try {
    const op = o.__proto__;
    const fo = op.constructor;
    const f = fo.constructor;
    const f2 = new f('return typeof setImmediate');
    return f2();
  } catch (err) {
    send("err was " + err);
  }
})`;

c.evaluate(child)({});
