import axios from 'axios';

async function main() {
  const queries = [
    'What is the current AQI in Anand Vihar?',
    'What is the current AQI in Punjabi Bagh?',
    'What is the air quality in Dwarka Sec 8?',
  ];

  for (const q of queries) {
    console.log(`\n========================================`);
    console.log(`USER: ${q}`);
    const res = await axios.post('http://localhost:5000/api/chat', { message: q });
    console.log(`STATUS: ${res.status}`);
    console.log(`REPLY:\n${res.data.reply}`);
    if (res.data.groundedData) {
      console.log(`GROUNDED DATA:`, JSON.stringify(res.data.groundedData, null, 2));
    }
  }
}

main().catch(console.error);

