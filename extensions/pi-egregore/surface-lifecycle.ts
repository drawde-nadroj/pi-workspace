import type { Component } from "@earendil-works/pi-tui";

/** One mount generation, not a global renderer. Queued paints may outlive detachment.
 * Keep old components inert even if a new session or Composer mount starts later.
 * Mutate only suite-owned components; existing native/Vim editors have their own reversible adapter.
 */
export class SurfaceScope {
  private active = true;
  guard<T extends Component>(component: T): T {
    const render = component.render;
    component.render = width => this.active ? render.call(component, width) : [];
    return component;
  }
  dispose(): void { this.active = false; }
}
