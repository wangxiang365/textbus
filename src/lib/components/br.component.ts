import { LeafAbstractComponent, ComponentLoader, ViewData, VElement, Component } from '../core/_api';

class BrComponentLoader implements ComponentLoader {
  match(component: HTMLElement): boolean {
    return component.nodeName.toLowerCase() === 'br';
  }

  read(): ViewData {
    const component = new BrComponent();
    return {
      component: component,
      slotsMap: []
    };
  }
}
@Component({
  loader: new BrComponentLoader()
})
export class BrComponent extends LeafAbstractComponent {
  block = false;
  constructor() {
    super('br');
  }
  clone() {
    return new BrComponent();
  }

  render() {
    return new VElement(this.tagName);
  }
}
