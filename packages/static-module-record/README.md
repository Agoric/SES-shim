# StaticModuleRecord

This package provides a shim for the `StaticModuleRecord` constructor, suitable
for use with the SES shim `importHook`.
The static module record accepts a JavaScript module and converts it into
a form that SES can use to securely emulate JavaScript modules (ESMs, the `mjs`
file format) with compartments.

```js
import 'ses';
import { StaticModuleRecord } from '@endo/static-module-record`;

const c1 = new Compartment({}, {}, {
  name: "first compartment",
  resolveHook: (moduleSpecifier, moduleReferrer) => {
    return resolve(moduleSpecifier, moduleReferrer);
  },
  importHook: async moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    const moduleText = await retrieve(moduleLocation);
    return new StaticModuleRecord(moduleText, moduleLocation);
  },
});
```

## Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in
[SECURITY.md](https://github.com/endojs/endo/blob/master/packages/ses/SECURITY.md)
to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/endojs/endo/issues).
