import axios from 'axios';
import { SocksClient } from 'socks';
import fs from 'fs/promises'; // Async dosya işlemleri için
import chalk from 'chalk'; // Dinamik import kaldırıldı, direkt import

// SOCKS proxy kaynakları
const sources = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
  'https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=5000&country=all',
];

// Test hedefi
const testTarget = { host: 'example.com', port: 80 };

// Dosya yolları
const logFile = 'proxy-log.txt';
const outputFile = 'proxies.txt';

// Test ayarları
const testTimeout = 5000; // Test süresi (ms)
const parallelTests = 10; // Paralel test sayısı

// Hata günlüğü için yardımcı fonksiyon
async function logError(message) {
  const errorMessage = `[${new Date().toISOString()}] Hata: ${message}\n`;
  await fs.appendFile(logFile, errorMessage);
  console.error(chalk.red(errorMessage));
}

// Proxy listesini çeken fonksiyon
async function fetchProxies() {
  let proxyList = [];
  for (const url of sources) {
    try {
      const res = await axios.get(url, { timeout: 10000 }); // Timeout eklendi
      const proxies = res.data
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p && /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/.test(p)); // Geçerli IP:port
      proxyList = proxyList.concat(proxies);
      console.log(chalk.blue(`🌐 ${url} kaynağından ${proxies.length} proxy alındı`));
    } catch (e) {
      await logError(`Kaynaktan alınamadı: ${url} - ${e.message}`);
    }
  }
  return [...new Set(proxyList)]; // Tekrarları kaldır
}

// Tek proxy testi
async function testProxy(proxy) {
  const [ip, port] = proxy.split(':');
  try {
    const start = Date.now();
    const { socket } = await SocksClient.createConnection({
      proxy: { host: ip, port: parseInt(port), type: 5 }, // ipaddress yerine host
      command: 'connect',
      destination: testTarget,
      timeout: testTimeout,
    });

    const latency = Date.now() - start;
    socket.destroy(); // Güvenli kapatma
    return { proxy, latency };
  } catch (e) {
    await logError(`Proxy testi sırasında hata: ${proxy} - ${e.message}`);
    return null;
  }
}

// Proxy'leri toplu test etme
async function processProxies(proxies) {
  const workingProxies = [];
  const totalTests = proxies.length;
  let completedTests = 0;

  console.log(chalk.yellow(`🧪 ${totalTests} proxy test ediliyor...`));

  for (let i = 0; i < totalTests; i += parallelTests) {
    const batch = proxies.slice(i, i + parallelTests);
    const results = await Promise.all(
      batch.map(async (proxy) => {
        const result = await testProxy(proxy);
        completedTests++;
        process.stdout.write(
          chalk.gray(`\rİlerleme: ${completedTests}/${totalTests} (${Math.round((completedTests / totalTests) * 100)}%)`)
        );
        return result;
      })
    );

    for (const result of results) {
      if (result) {
        workingProxies.push(result);
        const logMessage = `[${new Date().toISOString()}] Çalışıyor: ${result.proxy} - ${result.latency}ms\n`;
        await fs.appendFile(logFile, logMessage);
        console.log(chalk.green(`✅ Çalışıyor: ${result.proxy} - ${result.latency}ms`));
      }
    }
  }
  return workingProxies.sort((a, b) => a.latency - b.latency); // Hızlı proxy'ler önce
}

// Ana fonksiyon
async function main() {
  try {
    console.log(chalk.cyan('🧲 SOCKS5 proxyler toplanıyor...'));
    const proxies = await fetchProxies();
    console.log(chalk.cyan(`🔍 ${proxies.length} proxy bulundu.`));

    if (proxies.length === 0) {
      await logError('Hiç proxy bulunamadı. İşlem sonlandırılıyor.');
      return;
    }

    const workingProxies = await processProxies(proxies);

    // Çıktıyı kaydet
    const proxyText = workingProxies.map((p) => p.proxy).join('\n');
    await fs.writeFile(outputFile, proxyText);
    console.log(
      chalk.magenta(`\n🎉 Tamamlandı! ${workingProxies.length} SOCKS5 proxy '${outputFile}' dosyasına kaydedildi.`)
    );
  } catch (e) {
    await logError(`Genel hata: ${e.message}`);
  }

  // 1 saat sonra tekrar çalıştır
  console.log(chalk.gray('⏰ 1 saat sonra tekrar kontrol edilecek...'));
  setTimeout(main, 60 * 60 * 1000);
}

// Programı başlat
main().catch(async (e) => {
  await logError(`Kritik hata: ${e.message}`);
  process.exit(1);
});
