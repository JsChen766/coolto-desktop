import type { ApplicationCreateInput } from "@desktop/types";
import type { JobRepositoryNavigationState } from "../job-assets/job-repository-navigation";

export interface TrackerAssetTarget {
  kind: "jd" | "resume";
  id: string;
  title: string;
}

export interface TrackerNavigationContext {
  asset?: TrackerAssetTarget;
  create?: Partial<ApplicationCreateInput>;
  returnToRepository?: JobRepositoryNavigationState;
}
