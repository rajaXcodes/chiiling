require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.OPENAI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const run = async (questions = [], context = '') => {
    if (!Array.isArray(questions) || questions.length === 0) return [];

    try {
        const combinedQuestions = questions.map(q => q + " " + context);

        const answers = await Promise.all(
            combinedQuestions.map(async (question) => {
                const result = await model.generateContent({
                    contents: [{ role: "user", parts: [{ text: question }] }],
                });

                const rawText = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
                return rawText
                    .replace(/\*\*.*?\*\*/g, '')
                    .replace(/\n+/g, ' ')
                    .trim();
            })
        );
        return answers;
    } catch (error) {
        console.error("Error:", error.message);
        return [];
    }
};

const questions = [
    'Why should you be hired for this role?',
    'Are you open to relocate to Surat, Gujarat?',
    'You will have to continue as a full-time employee after the internship. Are you okay with that?'
];

const additionalContext = `
    Answer the following questions directly and positively as a candidate. 
    If asked about relocation, say "yes." Use the provided letter for context. 
    Respond without explanations or formatting — just the plain text answers.
    Letter start here: I am a passionate software developer with 6 months of experience, 
    specializing in full-stack development. I have built multiple projects and won hackathons. 
    I am open to remote work or relocation. 
`;

(async () => {
    const answers = await run(questions, additionalContext);
    console.log(answers);
})();

module.exports = run;
