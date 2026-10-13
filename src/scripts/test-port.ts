import net from 'net';

const ip = '202.137.130.37';
const ports = [
  9000, 9001, 9002, 9090, 8000, 8080, 8443, 80, 443, 
  12788, 12789, 12790, 19000, 19001, 29000, 39000, 9005
];

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      console.log(`✅ Port ${port} is OPEN on ${ip}!`);
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, ip);
  });
}

async function run() {
  console.log(`Scanning ports on ${ip}...`);
  for (const p of ports) {
    await checkPort(p);
  }
  console.log('Scan finished.');
  process.exit(0);
}

run();
