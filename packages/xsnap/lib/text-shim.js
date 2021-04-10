/* global globalThis */
/* eslint-disable max-classes-per-file */
/* eslint-disable class-methods-use-this */

// Save this XS extension before SES shim deletes it.
const { fromString } = ArrayBuffer;
const { fromArrayBuffer } = String;

class TextEncoder {
  encode(s) {
    return new Uint8Array(fromString(s));
  }
}

class TextDecoder {
  decode(bs) {
    return fromArrayBuffer(bs);
  }
}

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
