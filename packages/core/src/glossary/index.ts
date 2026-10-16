export { GLOSSARY_LEVELS, glossaryFileSchema, glossaryTermSchema, type GlossaryLevel, type GlossaryTerm } from './schema';
export { mergeGlossaries } from './merge';
export { findTerms } from './match';
export { checkGlossary, type GlossaryIssue } from './check';
export { validateGlossaryFile, type GlossaryFileResult } from './validateGlossary';
export { countViolations, findCandidates, renderMineReport, type Candidate, type MineEntry, type TermViolations, type Variant } from './mine';
