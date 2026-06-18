import { defaultPersonas } from "@swarmproof/types";

const port = Number(process.env.PORT ?? 8787);

console.log(`SwarmProof browser worker scaffold ready on port ${port}.`);
console.log(`Registered personas: ${defaultPersonas.map((persona) => persona.mode).join(", ")}`);
