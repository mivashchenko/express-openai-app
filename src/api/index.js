const express = require('express');

const emojis = require('./emojis');
const OpenAI = require('openai');
const {calculatePrice} = require("./functions");
const router = express.Router();

const {OPENAI_API_KEY, ASSISTANT_ID} = process.env;

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

router.get('/', (req, res) => {
    res.json({
        message: 'API - 👋🌎🌍🌏',
    });
});

router.get('/start', async (req, res) => {
    try {
        const thread = await openai.beta.threads.create();
        console.log("New conversation started with thread ID:", thread.id);
        res.json({thread_id: thread.id});
    } catch (error) {
        console.error("Error starting conversation:", error);
        res.status(500).json({error: 'Error starting conversation'});
    }
});

router.post('/chat', async (req, res) => {
    const {thread_id, message} = req.body;
    if (!thread_id) {
        console.error("Error: Missing thread_id in /chat");
        return res.status(400).json({error: 'Missing thread_id'});
    }

    console.log("Received message for thread ID:", thread_id, "Message:", message);

    try {
        await openai.beta.threads.messages.create(thread_id, {
            role: 'user',
            content: message
        });

        const run = await openai.beta.threads.runs.create(thread_id, {
            assistant_id: ASSISTANT_ID
        });

        console.log("Run started with ID:", run.id);
        res.json({run_id: run.id});
    } catch (error) {
        console.error("Error during chat:", error);
        res.status(500).json({error: 'Error during chat'});
    }
});

// router.post('/check', async (req, res) => {
//     const {thread_id, run_id} = req.body;
//     if (!thread_id || !run_id) {
//         console.error("Error: Missing thread_id or run_id in /check");
//         return res.status(400).json({response: 'error'});
//     }
//
//     const startTime = Date.now();
//     try {
//         while (Date.now() - startTime < 9000) {  // Timeout in 9 seconds
//             const runStatus = await openai.beta.threads.runs.retrieve(thread_id, run_id);
//             console.log("Checking run status:", runStatus.status);
//
//             if (runStatus.status === 'completed') {
//                 const messages = await openai.beta.threads.messages.list(thread_id);
//                 let messageContent = messages.data[0].content[0].text;
//
//                 // Remove annotations
//                 const annotations = messageContent.annotations || [];
//                 annotations.forEach(annotation => {
//                     messageContent = messageContent.replace(annotation.text, '');
//                 });
//
//                 console.log("Run completed, returning response");
//                 return res.json({response: messageContent, status: 'completed'});
//             }
//
//             if (runStatus.status === 'requires_action') {
//                 console.log("Action in progress...");
//                 for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
//                     if (toolCall.function.name === 'getTintingPrice') {
//                         const params = JSON.parse(toolCall.function.arguments);
//                         const output = await calculatePrice(params);
//                         await openai.beta.threads.runs.submitToolOutputs(
//                             thread_id,
//                             run_id,
//                             {
//                                 tool_outputs: [{tool_call_id: toolCall.id, output: JSON.stringify(output)}]
//                             });
//                     }
//                 }
//             }
//
//             await new Promise(resolve => setTimeout(resolve, 1000)); // Sleep for 1 second
//         }
//
//         console.log("Run timed out");
//         res.json({response: 'timeout'});
//
//     } catch (error) {
//         console.error("Error checking run status:", error);
//         res.status(500).json({error: 'Error checking run status'});
//     }
// });

let pollingInterval;

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
            assistant_id: ASSISTANT_ID
        }
    );
}

async function checkingStatus(res, thread_id, run_id) {
    const runStatus = await openai.beta.threads.runs.retrieve(
        thread_id,
        run_id
    );
    console.log('Current status: ' + runStatus.status);

    if (runStatus.status === 'completed') {
        clearInterval(pollingInterval);

        const messages = await openai.beta.threads.messages.list(thread_id);
        let messageContent = messages.data[0].content[0].text;

        // Remove annotations
        const annotations = messageContent.annotations || [];
        annotations.forEach(annotation => {
            messageContent = messageContent.replace(annotation.text, '');
        });

        console.log("Run completed, returning response");
        return res.json({response: messageContent, status: 'completed'});
    } else if (runStatus.status === 'requires_action') {
        console.log("Action in progress...");
        for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
            if (toolCall.function.name === 'getTintingPrice') {
                const params = JSON.parse(toolCall.function.arguments);
                const output = await calculatePrice(params);
                await openai.beta.threads.runs.submitToolOutputs(
                    thread_id,
                    run_id,
                    {
                        tool_outputs: [{tool_call_id: toolCall.id, output: JSON.stringify(output)}]
                    });
            }
        }
    }
}

router.post('/message', (req, res) => {
    const {message, thread_id} = req.body;
    addMessage(thread_id, message).then(() => {
        // res.json({ messageId: message.id });

        // Run the assistant
        runAssistant(thread_id).then(run => {
            const runId = run.id;

            // Check the status
            pollingInterval = setInterval(() => {
                checkingStatus(res, thread_id, runId);
            }, 3000);
        });
    });
});


router.use('/emojis', emojis);

module.exports = router;
