// Shared by all action-hook instances in one workspace.
export class WorkspaceRequests {
  version = 0;
  busy = false;

  invalidate(): number {
    return ++this.version;
  }

  isCurrent(version: number): boolean {
    return version === this.version;
  }

  lock(): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.invalidate();
    return true;
  }
}
