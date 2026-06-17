import express from "express";
import cors from "cors";
import { db } from "./db/index";
import { UserTable } from "./db/schema";

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_, res) => {
  res.json({
    message: "API running",
  });
});

import { errorHandler } from "./middlewares/error.middleware";

// Global Error Handler should be the last middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
