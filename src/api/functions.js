const fs = require('fs');

const {OpenAI} = require('openai');
// import { assistantInstructions } from 'src/api/assistantInstructions.js';


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

// Initialize OpenAI Client
const client = new OpenAI({apiKey: OPENAI_API_KEY});

// Create or load assistant
// async function createAssistant(client) {
//     const assistantFilePath = 'assistant.json';
//
//     let assistantId;
//
//     if (fs.existsSync(assistantFilePath)) {
//         const assistantData = JSON.parse(fs.readFileSync(assistantFilePath, 'utf-8'));
//         assistantId = assistantData.assistant_id;
//         console.log("Loaded existing assistant ID.");
//     } else {
//         try {
//             const fileResponse = await client.files.create({
//                 file: fs.createReadStream("knowledge.docx"),
//                 purpose: 'assistants'
//             });
//
//             const assistant = await client.beta.assistants.create({
//                 instructions: assistantInstructions,
//                 model: "gpt-4-1106-preview",
//                 tools: [
//                     {
//                         type: "retrieval"
//                     },
//                     {
//                         type: "function",
//                         function: {
//                             name: "create_lead",
//                             description: "Capture lead details and save to Airtable.",
//                             parameters: {
//                                 type: "object",
//                                 properties: {
//                                     name: {type: "string", description: "Full name of the lead."},
//                                     phone: {
//                                         type: "string",
//                                         description: "Phone number of the lead including country code."
//                                     }
//                                 },
//                                 required: ["name", "phone"]
//                             }
//                         }
//                     }
//                 ],
//                 file_ids: [fileResponse.id]
//             });
//
//             assistantId = assistant.id;
//
//             fs.writeFileSync(assistantFilePath, JSON.stringify({assistant_id: assistantId}, null, 2));
//             console.log("Created a new assistant and saved the ID.");
//         } catch (error) {
//             console.error("Error creating assistant:", error);
//         }
//     }
//
//     return assistantId;
// }


const calculatePrice = async ({
                                  // make,
                                  // model,
                                  // year,
                                  count,
                                  category
                              }) => {
    const basePrice = 75

    // year < 2007 = Coefficient = 1.3


    const categoriesCoefficient = {
        pickup: 1,
        sedan: 1.2,
        suv: 1.3,
        coupe: 1.4,
        hatchback: 1.5,
        wagon: 1.6,
        minivan: 1.7,
        van: 1.8,
        convertible: 1.9,
    }

    if (!categoriesCoefficient[category]) return null;

    return categoriesCoefficient[category] * basePrice * count
}

module.exports = {calculatePrice};
