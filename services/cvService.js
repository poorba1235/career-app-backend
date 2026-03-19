const fs = require('fs');
const pdf = require('pdf-parse');
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: (process.env.OPENAI_API_KEY || "").trim(),
});

if (!process.env.OPENAI_API_KEY) {
    console.error("CRITICAL: OPENAI_API_KEY is missing from environment variables!");
}

const extractTextFromPDF = async (buffer) => {
    try {
        const data = await pdf(buffer);
        return data.text;
    } catch (error) {
        console.error("Error extracting text from PDF:", error);
        throw new Error("Failed to extract text from PDF");
    }
};

const analyzeCV = async (fileBuffer) => {
    try {
        // 1. Extract text from PDF
        const text = await extractTextFromPDF(fileBuffer);

        if (!text || text.trim().length === 0) {
            throw new Error("Could not extract text from the CV. Please ensure it's a text-based PDF.");
        }

        // 2. Send to OpenAI for analysis
        const prompt = `
        You are an expert ATS (Applicant Tracking System) and Senior Technical Recruiter. 
        Analyze the following CV text. Be EXTREMELY CRITICAL AND STRICT with your scoring. 
        Most CVs should score between 40-70. Only truly exceptional, perfectly optimized CVs should score above 80.
        Scores above 90 should be almost impossible to achieve.
        
        Focus on:
        1. ATS Compatibility (Is it readable? Key sections present?)
        2. Content Quality (Action verbs, metrics, clarity - penalize vague statements)
        3. Visual/Formatting (Inferred from structure, though limited for text-only)
        4. Typos/Grammar (Heavily penalize errors)
        5. Keyword Optimization (Compare against general industry standards for the role implied)

        CV TEXT:
        ${text.substring(0, 3500)} // Limit to ~3500 chars to save tokens if needed, or adjust model limits
        
        Return ONLY a JSON object with this EXACT structure:
        {
          "score": <number 0-100, be strict!>,
          "summary": "<short summary paragraph>",
          "strengths": [
            { "title": "<short title>", "description": "<description>", "icon": "check_circle" }
          ],
          "improvements": [
             { "title": "<short title>", "description": "<description>", "icon": "warning" }
          ],
          "missingKeywords": ["<keyword1>", "<keyword2>", ...], // List at least 5-10 critical keywords missing for this role
          "formattingIssues": [
            { "title": "<short title>", "description": "<description>", "icon": "format_shapes" }
          ],
          "atsMatch": "High" | "Moderate" | "Low"
        }
        `;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "You are a helpful career assistant." }, { role: "user", content: prompt }],
            model: "gpt-4o-mini", // Upgraded for better performance and reliability
            response_format: { type: "json_object" },
        });

        const analysisResult = JSON.parse(completion.choices[0].message.content);
        return analysisResult;

    } catch (error) {
        console.error("Error analyzing CV:", error);
        throw error;
    }
};

module.exports = {
    analyzeCV
};
