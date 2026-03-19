const pdf = require('pdf-parse');
console.log('Type of pdf:', typeof pdf);
console.log('pdf export:', pdf);
if (typeof pdf === 'object') {
    console.log('Keys:', Object.keys(pdf));
}
try {
    const fs = require('fs');
    // Create a dummy buffer
    const buffer = Buffer.from('dummy pdf content');
    // Try calling it
    pdf(buffer).then(data => console.log('Parsed:', data)).catch(err => console.error('Call failed:', err.message));
} catch (e) {
    console.error('Immediate error calling pdf():', e.message);
}
