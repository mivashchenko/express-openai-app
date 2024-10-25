require("dotenv").config();
const OpenAI = require('openai');
const express = require('express');
const {OPENAI_API_KEY, ASSISTANT_ID} = process.env;


// Setup Express
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// Set up OpenAI Client
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// Assistant can be created via API or UI
const assistantId = ASSISTANT_ID;
let pollingInterval;

// Set up a Thread
async function createThread() {
    console.log('Creating a new thread...');
    return openai.beta.threads.create();
}

async function addMessage(threadId, message) {
    console.log('Adding a new message to thread: ' + threadId);

    return openai.beta.threads.messages.create(
        threadId,
        {
            role: "user",
            content: message
        }
    );
}

async function runAssistant(threadId) {
    console.log('Running assistant for thread: ' + threadId)
    return openai.beta.threads.runs.create(
        threadId,
        {
            assistant_id: assistantId
            // Make sure to not overwrite the original instruction, unless you want to
        }
    );
}

function calculatePrice({
                            // make,
                            // model,
                            // year,
                            count,
                            category
                        }) {
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

async function checkingStatus(res, threadId, runId) {
    const runObject = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
    );

    const status = runObject.status;
    console.log('Current status: ' + status);

    if (status === 'completed') {
        clearInterval(pollingInterval);

        const messagesList = await openai.beta.threads.messages.list(threadId);
        let messages = []

        messagesList.body.data.forEach(message => {
            messages.push(message.content);
        });

        res.json({
            message: messages[0][0].text.value
        });
    }

    // + Addition for function calling
    else if (status === 'requires_action') {
        console.log('requires_action.. looking for a function')

        if (runObject.required_action.type === 'submit_tool_outputs') {
            console.log('submit tool outputs ... ')
            const tool_calls = runObject.required_action.submit_tool_outputs.tool_calls

            const params = JSON.parse(tool_calls[0].function.arguments)

            const price = calculatePrice(params)

            const run = await openai.beta.threads.runs.submitToolOutputs(
                threadId,
                runId,
                {
                    tool_outputs: [
                        {
                            tool_call_id: tool_calls[0].id,
                            output: JSON.stringify(price ? `$${price}` : 'The price for this type of car is not available.')
                        },
                    ],
                }
            )

            console.log('Run after submit tool outputs: ' + run.status)
        }
    }
}

//=========================================================
//============== ROUTE SERVER =============================
//=========================================================

// Open a new thread
app.get('/thread', (req, res) => {
    createThread().then(thread => {
        res.json({threadId: thread.id});
    });
})

app.post('/message', (req, res) => {
    const {message, threadId} = req.body;
    addMessage(threadId, message).then(() => {
        // res.json({ messageId: message.id });

        // Run the assistant
        runAssistant(threadId).then(run => {
            const runId = run.id;

            // Check the status
            pollingInterval = setInterval(() => {
                checkingStatus(res, threadId, runId);
            }, 3000);
        });
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

