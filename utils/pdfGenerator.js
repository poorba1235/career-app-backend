const PDFDocument = require('pdfkit');
const fs = require('fs');

const generateAnalysisPDF = (analysisResult) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });
        doc.on('error', reject);

        // Header
        doc.fontSize(25).fillColor('#1e463a').text('CV Analysis Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).fillColor('#333').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(2);

        // Overall Score
        doc.rect(50, 150, 500, 80).fill('#f9fafb').stroke('#e5e7eb');
        doc.fillColor('#1e463a').fontSize(16).text('Overall Score', 70, 170);
        doc.fontSize(24).font('Helvetica-Bold').text(`${analysisResult.score}/100`, 70, 195);

        // ATS Match
        doc.fillColor('#1e463a').fontSize(16).text('ATS Match', 350, 170);
        let matchColor = 'black';
        if (analysisResult.atsMatch === 'High') matchColor = 'green';
        else if (analysisResult.atsMatch === 'Moderate') matchColor = 'orange';
        else matchColor = 'red';

        doc.fillColor(matchColor).fontSize(20).text(analysisResult.atsMatch || 'N/A', 350, 195);

        doc.moveDown(5);

        // Summary
        doc.fillColor('#1e463a').fontSize(18).font('Helvetica-Bold').text('AI Summary', 50, 260);
        doc.moveDown(0.5);
        doc.fillColor('#374151').fontSize(12).font('Helvetica').text(analysisResult.summary, { align: 'justify' });
        doc.moveDown(2);

        // Strengths
        doc.fillColor('#1e463a').fontSize(18).font('Helvetica-Bold').text('Key Strengths');
        doc.moveDown(0.5);
        if (analysisResult.strengths) {
            analysisResult.strengths.forEach(s => {
                doc.fillColor('#059669').fontSize(14).font('Helvetica-Bold').text(`• ${s.title}`);
                doc.fillColor('#374151').fontSize(12).font('Helvetica').text(s.description);
                doc.moveDown(0.5);
            });
        }
        doc.moveDown(1);

        // Improvements
        doc.fillColor('#dc2626').fontSize(18).font('Helvetica-Bold').text('Improvements Needed');
        doc.moveDown(0.5);
        if (analysisResult.improvements) {
            analysisResult.improvements.forEach(imp => {
                doc.fillColor('#b91c1c').fontSize(14).font('Helvetica-Bold').text(`• ${imp.title}`);
                doc.fillColor('#374151').fontSize(12).font('Helvetica').text(imp.description);
                doc.moveDown(0.5);
            });
        }
        doc.moveDown(1);

        // Missing Keywords
        if (analysisResult.missingKeywords && analysisResult.missingKeywords.length > 0) {
            doc.fillColor('#d97706').fontSize(18).font('Helvetica-Bold').text('Missing Keywords');
            doc.moveDown(0.5);
            doc.fillColor('#374151').fontSize(12).font('Helvetica').text(analysisResult.missingKeywords.join(', '));
        }

        doc.moveDown(1);

        // Formatting Issues
        if (analysisResult.formattingIssues && analysisResult.formattingIssues.length > 0) {
            doc.fillColor('#7c3aed').fontSize(18).font('Helvetica-Bold').text('Formatting Issues');
            doc.moveDown(0.5);
            analysisResult.formattingIssues.forEach(issue => {
                doc.fillColor('#6d28d9').fontSize(14).font('Helvetica-Bold').text(`• ${issue.title}`);
                doc.fillColor('#374151').fontSize(12).font('Helvetica').text(issue.description);
                doc.moveDown(0.5);
            });
        }

        doc.end();
    });
};

module.exports = { generateAnalysisPDF };
