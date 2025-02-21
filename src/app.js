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


const activeSockets = new Set();
const activeIntervals = new Map();

const mainFunction = async ({ thread, socket }) => {
  activeSockets.add(socket.id); // Mark socket as active

  while (activeSockets.has(socket.id) && socket.connected) {
    try {
      const content = _messages[Math.floor(Math.random() * _messages.length)].content;
      const res = await sendMessage(thread.id, content);
      const runId = res.run_id;

      while (activeSockets.has(socket.id) && socket.connected) {
        const runStatus = await openai.beta.threads.runs.retrieve(thread.id, runId);

        if (!activeSockets.has(socket.id) || !socket.connected) {
          console.log(`🛑 Stopping execution for disconnected socket: ${socket.id}`);
          return;
        }

        if (runStatus.status === "completed") {
          console.log("✅ Run completed with status:", runStatus.status);

          await new Promise(resolve => setTimeout(resolve, 500));

          if (activeSockets.has(socket.id) && socket.connected) {
            await mainFunction({ thread, socket }); // Restart only if still connected
          }
          return;
        }

        if (runStatus.status === "requires_action") {
          console.log("⚡ Action in progress...");

          for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
            console.log("Tool call:", toolCall.function.name);

            if (toolCall.function.name === "compliance_violation_type") {
              const params = JSON.parse(toolCall.function.arguments);
              const output = getComplianceViolationType(params);

              const randomMessage = {
                ..._messages[Math.floor(Math.random() * _messages.length)],
                id: new Date().valueOf(),
                flagged: Math.random() < 0.5,
                violationType: output.violation_type,
                timestamp: new Date().toISOString(),
              };

              await openai.beta.threads.runs.submitToolOutputs(thread.id, runId, {
                tool_outputs: [{ tool_call_id: toolCall.id, output: JSON.stringify(output) }],
              });

              console.log("🆕 New message added to the thread:", randomMessage);

              if (activeSockets.has(socket.id) && socket.connected) {
                socket.emit("newMessage", randomMessage);
              }
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay before next check
      }
    } catch (error) {
      console.error("❌ Error checking run status:", error);
      return;
    }
  }

  console.log(`🛑 Execution stopped for socket: ${socket.id}`);
};

// 🟢 Handle socket connection
io.on("connection", async (socket) => {
  console.log(`🔌 A user connected: ${socket.id}`);

  const thread = await getThread();
  if (!thread?.id) {
    console.error("🚨 Error: Missing thread_id or run_id");
    return;
  }

  await mainFunction({ thread, socket });

  socket.on("disconnect", () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);

    // Remove from active sockets
    activeSockets.delete(socket.id);

    // Clear any running intervals
    if (activeIntervals.has(socket.id)) {
      clearInterval(activeIntervals.get(socket.id));
      activeIntervals.delete(socket.id);
    }

    console.log(`🛑 Cleaned up all processes for socket: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});