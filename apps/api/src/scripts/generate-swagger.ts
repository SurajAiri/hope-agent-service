import { swaggerSpec } from "../configs/swagger";
import fs from "fs";
import path from "path";

const outputPath = path.join(__dirname, "../../swagger.json");

fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`✅ OpenAPI spec generated at: ${outputPath}`);
console.log(`📄 Total endpoints: ${Object.keys(swaggerSpec.paths).length}`);
