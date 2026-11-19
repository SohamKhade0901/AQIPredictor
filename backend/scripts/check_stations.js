import axios from 'axios';

async function main() {
  const res = await axios.get('http://localhost:5000/api/stations');
  console.log(`Total stations: ${res.data.stations.length}`);
  for (const s of res.data.stations) {
    const name = s.name.padEnd(20);
    const pm = s.pm25 !== null && s.pm25 !== undefined ? `${s.pm25} µg/m³`.padStart(11) : 'No Data'.padStart(11);
    const aqi = s.currentAqi !== null && s.currentAqi !== undefined ? `${s.currentAqi}`.padStart(3) : '---';
    const aqi24 = s.predictedAqi24h !== null && s.predictedAqi24h !== undefined ? `${s.predictedAqi24h}`.padStart(3) : '---';
    const aqi48 = s.predictedAqi48h !== null && s.predictedAqi48h !== undefined ? `${s.predictedAqi48h}`.padStart(3) : '---';
    const aqi72 = s.predictedAqi72h !== null && s.predictedAqi72h !== undefined ? `${s.predictedAqi72h}`.padStart(3) : '---';
    const status = (s.freshnessStatus || 'unk').padEnd(7);
    const ist = s.measurementTimeIST || 'No timestamp';
    console.log(`${name} | ${pm} | Cur AQI: ${aqi} | 24h: ${aqi24} | 48h: ${aqi48} | 72h: ${aqi72} | ${status} | ${ist}`);
  }
}

main().catch(console.error);

