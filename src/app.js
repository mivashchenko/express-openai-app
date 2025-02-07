const express = require("express");
const {createServer} = require("http");
const {Server} = require("socket.io");
const morgan = require("morgan");
const helmet = require("helmet");
const cors = require("cors");
const jsonServer = require("json-server");
require("dotenv").config();

const middlewares = require("./middlewares");
const api = require("./api");
const dbJSON = require("./api/json/db.json"); // Import db.json

const OpenAI = require('openai');

const {OPENAI_API_KEY, ASSISTANT_ID} = process.env;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Initialize Express app
const app = express();

// Apply middlewares
app.use(morgan("dev"));
app.use(helmet());
app.use(cors());
app.use(express.json());

// JSON Server middleware
const jsonRouter = jsonServer.router(dbJSON); // Use the dbJSON object directly
const jsonMiddleware = jsonServer.defaults();
app.use("/api/json", jsonMiddleware, jsonRouter);

// Define routes
app.get("/", (req, res) => {
  res.json({
    message: "🦄🌈✨👋🌎🌍🌏✨🌈🦄",
  });
});

app.use("/api/v1", api);

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

// Create HTTP server
const server = createServer(app);

// Attach Socket.io to the same HTTP server
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const getThread = async () => {
  try {
    const thread = await openai.beta.threads.create();
    console.log("New conversation started with thread ID:", thread.id);
    return thread;
  } catch (error) {
    console.error("Error starting conversation:", error);
    return null;
  }
}

const sendMessage = async (threadId, message) => {
  try {
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: `Analyze the message: ${message}`
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID
    });

    console.log("Run started with ID:", run.id);
    return {run_id: run.id};
  } catch (error) {
    console.error("Error during chat:", error);
    return ({error: 'Error during chat'});
  }
}

const getComplianceViolationType = ({violation_type}) => {
  return {violation_type, flagged: true}
}

const _messages = dbJSON.messages;

const mainFunction = async ({
                              thread,
                              socket,
                            }) => {
  const content = _messages[Math.floor(Math.random() * _messages.length)].content;
  const res = await sendMessage(thread.id, content);
  const runId = res.run_id;

  const startTime = Date.now();

  try {
    while (Date.now() - startTime < 10000) {
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, runId);

      if (runStatus.status === 'completed') {
        await new Promise(resolve => setTimeout(resolve, 500)); // Sleep for 1 second

        await mainFunction({
          thread,
          socket
        });
      }

      if (runStatus.status === 'requires_action') {
        console.log("Action in progress...");

        for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
          if (toolCall.function.name === 'compliance_violation_type') {
            const params = JSON.parse(toolCall.function.arguments);
            const output = getComplianceViolationType(params);

            const randomMessage = {
              ..._messages[Math.floor(Math.random() * _messages.length)],
              id: new Date().valueOf(),
              flagged: Math.random() < 0.5,
              violationType: output.violation_type,
              timestamp: new Date().toISOString(),
            };

            await openai.beta.threads.runs.submitToolOutputs(
              thread.id,
              runId,
              {
                tool_outputs: [{tool_call_id: toolCall.id, output: JSON.stringify(output)}]
              });

            socket.emit("newMessage", randomMessage);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));

    }

  } catch (error) {
    console.error("Error checking run status:", error);
  }
}

// Socket.io logic
io.on("connection", async (socket) => {
  console.log("A user connected");

  const thread = await getThread();

  if (!thread.id) {
    console.error("Error: Missing thread_id or run_id in ");
  }

  await mainFunction({
    thread,
    socket,
  });

  socket.on("disconnect", () => {
      console.log("A user disconnected");
    }
  );
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});