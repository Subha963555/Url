const { exec } = require('child_process');

const url = 'https://www.google.com';

exec(`open "${url}"`, (err) => {
  if (err) {
    console.error('❌ Failed to open browser:', err.message);
  } else {
    console.log('✅ Browser opened successfully!');
  }
});
