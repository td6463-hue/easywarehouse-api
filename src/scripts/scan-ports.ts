import net from 'net';

const ip = '202.137.130.37';

async function check(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.on('connect', () => {
      console.log(`FOUND OPEN PORT: ${port}`);
      s.destroy();
      resolve(true);
    });
    s.on('error', () => { s.destroy(); resolve(false); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.connect(port, ip);
  });
}

async function run() {
  console.log('Testing ports 8990 to 9020...');
  for (let p = 8990; p <= 9020; p++) {
    await check(p);
  }

  console.log('Testing other common custom ports...');
  const others = [8000, 8001, 8080, 8081, 8090, 8443, 9000, 9001, 9002, 9003, 9004, 9005, 9100, 9200, 9300, 9400, 9500, 9600, 9700, 9800, 9900, 10000, 19000, 19001, 29000, 29001];
  for (const p of others) {
    await check(p);
  }
  process.exit(0);
}

run();
