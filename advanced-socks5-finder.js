import axios from 'axios';
import { SocksClient } from 'socks';
import fs from 'fs';

// Dinamik import (ESM modülü kullanımı)
import('chalk').then((chalkModule) => {
  const chalk = chalkModule.default; // `chalk`'ı içeri aktardık

  // SOCKS proxy kaynakları
  const sources = [
      "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
      "https://api.proxyscrape.com/?request=getproxies&proxytype=socks5&timeout=5000&country=all"
  ];

  const testTarget = { host: "example.com", port: 80 };
  const logFile = "proxy-log.txt";
  const outputFile = "proxies.txt";

  // Proxy hızı için test süresi
  const testTimeout = 5000;

  // Proxy testini paralel yapmak için iş parçacığı sayısı
  const parallelTests = 10;

  async function fetchProxies() {
      let proxyList = [];
      for (const url of sources) {
          try {
              const res = await axios.get(url);
              const proxies = res.data.split("\n").map(p => p.trim()).filter(p => p.includes(":"));
              proxyList = proxyList.concat(proxies);
          } catch (e) {
              console.log(`❌ Kaynaktan alınamadı: ${url}`);
          }
      }
      return [...new Set(proxyList)];
  }

  async function testProxy(proxy) {
      const [ip, port] = proxy.split(":");
      try {
          const start = Date.now();
          const info = await SocksClient.createConnection({
              proxy: { ipaddress: ip, port: parseInt(port), type: 5 },
              command: 'connect',
              destination: testTarget,
              timeout: testTimeout
          });

          const latency = Date.now() - start; // Hız testini yap
          info.socket.end(); // Bağlantıyı sonlandır

          return { proxy, latency }; // Proxy ve gecikmeyi döndür
      } catch {
          return null;
      }
  }

  async function processProxies(proxies) {
      const workingProxies = [];
      const promises = [];
      let totalTests = proxies.length;

      for (let i = 0; i < totalTests; i++) {
          const proxy = proxies[i];
          promises.push(
              testProxy(proxy).then(result => {
                  if (result) {
                      workingProxies.push(result);
                      const logMessage = `[${new Date().toISOString()}] Çalışıyor: ${result.proxy} - ${result.latency}ms\n`;
                      fs.appendFileSync(logFile, logMessage);
                      console.log(chalk.green(`✅ Çalışıyor: ${result.proxy} - ${result.latency}ms`));
                  }
              })
          );

          // Parallel test limit
          if ((i + 1) % parallelTests === 0 || i === totalTests - 1) {
              await Promise.all(promises);
              promises.length = 0;
          }
      }

      return workingProxies;
  }

  async function main() {
      console.log("🧲 SOCKS5 proxyler toplanıyor...");
      const proxies = await fetchProxies();
      console.log(`🔍 ${proxies.length} proxy bulundu. Test ediliyor...`);

      const workingProxies = await processProxies(proxies);

      // Proxies.txt formatında kaydet
      const proxyText = workingProxies.map(p => p.proxy).join("\n");
      fs.writeFileSync(outputFile, proxyText);
      console.log(`\n🎉 Tamamlandı! ${workingProxies.length} SOCKS5 proxy 'proxies.txt' dosyasına kaydedildi.`);

      // Otomatik yenileme
      setTimeout(main, 60 * 60 * 1000); // 1 saat sonra yenileme yap
  }

  main();
});
