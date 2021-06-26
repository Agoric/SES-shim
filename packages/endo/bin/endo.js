#!/usr/bin/env node
/* global process */
(async () => {
  const fs = await import('fs');
  const crypto = await import('crypto');
  const { main } = await import('../src/cli.js');
  main(process, { fs, crypto });
})();
