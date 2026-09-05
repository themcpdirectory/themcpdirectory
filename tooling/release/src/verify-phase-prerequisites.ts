import { PhasePrerequisiteFailure, verifyPhasePrerequisites } from "./phase-prerequisites.js";

try {
  const result = await verifyPhasePrerequisites();
  console.log(`Verified ${result.verifiedCapabilities} Phase D-G prerequisite capabilities.`);
} catch (error) {
  if (error instanceof PhasePrerequisiteFailure) {
    console.error(error.message);
    for (const artefact of error.missingArtefacts) {
      console.error(`- missing: ${artefact}`);
    }
    if (error.failedCapability) {
      console.error(`- failed gate: ${error.failedCapability}`);
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
