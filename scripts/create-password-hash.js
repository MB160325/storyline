const { randomBytes, scryptSync } = require('node:crypto');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

function readHiddenPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    const terminal = readline.createInterface({ input: stdin, output: stdout });
    return terminal.question('Choose a private password (input may be visible): ').finally(() => terminal.close());
  }
  return new Promise((resolve) => {
    let password = '';
    stdout.write('Choose a private password (input hidden): ');
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    const finish = (value) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish('');
        if (character === '\r' || character === '\n') return finish(password);
        if (character === '\u007f' || character === '\b') password = Array.from(password).slice(0, -1).join('');
        else password += character;
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const password = await readHiddenPassword();
  if (password.length < 10) {
    console.error('Use at least 10 characters.');
    process.exitCode = 1;
    return;
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  console.log(`PASSWORD_HASH=${salt.toString('hex')}:${hash.toString('hex')}`);
})();
