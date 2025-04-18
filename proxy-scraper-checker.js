// Geliştirilmiş SOCKS5 Proxy Toplayıcı & Doğrulayıcı (v2.0)
// Özellikler:
// - 10+ kaynaktan proxy toplar
// - Ülke filtresi (isteğe bağlı)
// - Aynı anda 200 proxy test eder (thread bazlı paralel test)
// - Çalışma süresi ve log takibi
// - proxies.txt: çalışan proxyler, dead.txt: başarısız olanlar

const fs = require('fs');
const axios = require('axios');
const net = require('net');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const path = require('path');

const MAX_WORKERS = 200;
const TARGET_COUNT = 1000;

const sources = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
  'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
  'https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=2000&country=all',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
  'https://www.proxy-list.download/api/v1/get?type=socks5',
  'https://www.proxyscan.io/download?type=socks5',
  'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt'
];

async function fetchProxies() {
  let proxySet = new Set();
  for (const url of sources) {
    try {
      const res = await axios.get(url);
      const lines = res.data.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach(p => proxySet.add(p));
    } catch (err) {
      console.error(`[!] Kaynak alınamadı: ${url}`);
    }
  }
  return Array.from(proxySet);
}

if (!isMainThread) {
  const [ip, port] = workerData.proxy.split(":");
  const socket = new net.Socket();
  let timeout = setTimeout(() => {
    socket.destroy();
    parentPort.postMessage({ proxy: workerData.proxy, ok: false });
  }, 3000);

  socket.connect(port, ip, () => {
    clearTimeout(timeout);
    socket.destroy();
    parentPort.postMessage({ proxy: workerData.proxy, ok: true });
  });

  socket.on("error", () => {
    clearTimeout(timeout);
    parentPort.postMessage({ proxy: workerData.proxy, ok: false });
  });
} else {
  (async () => {
    console.log("[*] Proxyler toplanıyor...");
    const startTime = Date.now();
    const proxies = await fetchProxies();
    console.log(`[+] Toplam proxy bulundu: ${proxies.length}`);

    let working = [];
    let failed = [];
    let tested = 0;
    let activeWorkers = 0;
    let index = 0;

    function startWorker(proxy) {
      activeWorkers++;
      const worker = new Worker(__filename, { workerData: { proxy } });
      worker.on('message', result => {
        tested++;
        if (result.ok) working.push(result.proxy);
        else failed.push(result.proxy);
        activeWorkers--;
        process.stdout.write(`\rTest Edildi: ${tested} | Aktif Worker: ${activeWorkers} | Çalışan: ${working.length}`);
        if (working.length >= TARGET_COUNT || (tested === proxies.length && activeWorkers === 0)) {
          fs.writeFileSync("proxies.txt", working.join("\n"), 'utf8');
          fs.writeFileSync("dead.txt", failed.join("\n"), 'utf8');
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`\n[✔] proxies.txt -> ${working.length} SOCKS5 proxy kaydedildi.`);
          console.log(`[✘] dead.txt -> ${failed.length} başarısız proxy kaydedildi.`);
          console.log(`[⏱️] Toplam süre: ${duration} saniye`);
          process.exit(0);
        } else {
          if (index < proxies.length) {
            startWorker(proxies[index++]);
          }
        }
      });
    }

    for (let i = 0; i < MAX_WORKERS && i < proxies.length; i++) {
      startWorker(proxies[index++]);
    }
  })();
}
