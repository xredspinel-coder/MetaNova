import type { ExtractionDiagnostics } from "../types/index.js";

export function createDiagnostics(): ExtractionDiagnostics {
  return {
    redirects: [],
    sourcesUsed: [],
    warnings: [],
    trace: [],
    extractedAt: new Date().toISOString()
  };
}

export function addWarning(diagnostics: ExtractionDiagnostics, warning: string): ExtractionDiagnostics {
  diagnostics.warnings.push(warning);
  return diagnostics;
}
