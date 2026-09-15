// Shapes of the codemap CLI's --json output, learned from real runs against
// a local codemap checkout (codemap dev, 2026-09-15). codemap has no
// stability guarantee on these fields yet; a field this mod does not read is
// left out below on purpose.

export type Coverage = 'complete' | 'partial' | 'unavailable';

export interface ImportersResult {
  root: string;
  mode: 'importers';
  file: string;
  importers: string[] | null;
  importer_count: number;
  is_hub: boolean;
  coverage_status: Coverage;
}

export interface ContextResult {
  version: number;
  project: {
    root: string;
    branch: string;
    file_count: number;
    languages: string[];
    hub_count: number;
    top_hubs: string[];
    graph_evidence?: { status: string; source: string };
  };
}

export interface BlastRadiusSummary {
  changed_files: number;
  max_direct_dependents: number;
  highest_blast_radius: { file: string; importer_count: number } | null;
  impacted_outside_diff_total: number;
}

export interface BlastRadiusResult {
  root: string;
  ref: string;
  summary: BlastRadiusSummary;
  impacted_outside_diff: Array<{
    path: string;
    via: string;
    relation: string;
    via_is_hub: boolean;
    via_importer_count: number;
  }>;
}

export interface CollidePR {
  number: number;
  title: string;
  head_ref_name?: string;
}

export interface CollideSharedFile {
  path: string;
  prs: number[];
  importer_count: number;
}

export interface CollideResult {
  schema: string;
  coverage: { status: Coverage; untracked_files: number };
  prs: CollidePR[];
  shared_files: CollideSharedFile[];
  hidden_by_min_importers: number;
}

export interface FindHit {
  path: string;
  score: number;
  importers: number;
  hub: boolean;
}

export interface DepsFile {
  path: string;
  language?: string;
}

export interface DepsResult {
  schema_version?: number;
  root: string;
  mode: 'deps';
  files: DepsFile[];
}

export interface FindResult {
  schema: string;
  query: string;
  hits: FindHit[];
  coverage: { status: Coverage };
}
