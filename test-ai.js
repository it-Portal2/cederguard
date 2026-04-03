import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyCHFp8X0hMfbLdDzqRZaDmSkHLD9O8XwPY';
const modelName = 'gemini-flash-latest';

async function test() {
    console.log(`Testing model: ${modelName} with API Key: ${apiKey.substring(0, 10)}...`);
    try {
        const ai = new GoogleGenAI({ apiKey });
        console.log('AI initialized. Calling models.generateContent...');
        
        const result = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: 'Say "AI is working" if you can hear me.' }] }]
        });
        
        console.log('Result received:');
        console.log(JSON.stringify(result, null, 2));
        
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('Extracted text:', text);
    } catch (error) {
        console.error('Test failed with error:');
        console.error(error);
    }
}

test();
